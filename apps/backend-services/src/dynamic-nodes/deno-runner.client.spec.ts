import {
  DEFAULT_DENO_RUNNER_URL,
  DenoRunnerClient,
  DenoRunnerUnavailableError,
  denoRunnerUnavailableMessage,
} from "./deno-runner.client";

/**
 * Builds a fetch-shaped mock returning the supplied JSON body + status.
 */
function makeFetchMock(
  status: number,
  body: unknown,
): jest.Mock<Promise<Response>> {
  return jest.fn(async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "ERROR",
      json: async () => body,
    } as unknown as Response;
  });
}

describe("DenoRunnerClient", () => {
  it("uses DENO_RUNNER_URL env var when set", async () => {
    const fetchMock = makeFetchMock(200, { ok: true, errors: [] });
    process.env.DENO_RUNNER_URL = "http://runner.example:1234";
    const client = new DenoRunnerClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.check("const x = 1;");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://runner.example:1234/check",
      expect.any(Object),
    );
    delete process.env.DENO_RUNNER_URL;
  });

  it("falls back to default URL when env var is unset", async () => {
    const fetchMock = makeFetchMock(200, { ok: true, errors: [] });
    delete process.env.DENO_RUNNER_URL;
    const client = new DenoRunnerClient({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.check("const x = 1;");
    expect(fetchMock).toHaveBeenCalledWith(
      `${DEFAULT_DENO_RUNNER_URL}/check`,
      expect.any(Object),
    );
  });

  it("constructor option overrides the env var", async () => {
    const fetchMock = makeFetchMock(200, { ok: true, errors: [] });
    process.env.DENO_RUNNER_URL = "http://env.example:9090";
    const client = new DenoRunnerClient({
      baseUrl: "http://override.example:8080",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.check("const x = 1;");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://override.example:8080/check",
      expect.any(Object),
    );
    delete process.env.DENO_RUNNER_URL;
  });

  describe("check", () => {
    it("parses a successful check response", async () => {
      const fetchMock = makeFetchMock(200, { ok: true, errors: [] });
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const res = await client.check("const x = 1;");
      expect(res).toEqual({ ok: true, errors: [] });
    });

    it("parses a failed check response with diagnostics", async () => {
      const fetchMock = makeFetchMock(200, {
        ok: false,
        errors: [{ line: 1, column: 7, message: "TS error" }],
      });
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const res = await client.check("const x: number = '';");
      expect(res.ok).toBe(false);
      expect(res.errors).toEqual([{ line: 1, column: 7, message: "TS error" }]);
    });

    it("throws DenoRunnerUnavailableError on network failure", async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      await expect(client.check("const x = 1;")).rejects.toBeInstanceOf(
        DenoRunnerUnavailableError,
      );
    });

    it("throws DenoRunnerUnavailableError on non-2xx response", async () => {
      const fetchMock = makeFetchMock(500, { message: "internal" });
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      await expect(client.check("const x = 1;")).rejects.toBeInstanceOf(
        DenoRunnerUnavailableError,
      );
    });

    it("throws DenoRunnerUnavailableError on malformed body", async () => {
      const fetchMock = makeFetchMock(200, { unexpected: "shape" });
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      await expect(client.check("const x = 1;")).rejects.toBeInstanceOf(
        DenoRunnerUnavailableError,
      );
    });
  });

  // D3 — the message a person reads must name the thing that is down and the
  // action to take; the URL is evidence, not the headline.
  describe("unavailable message (D3)", () => {
    it("gives the local start command when the runner is on loopback", () => {
      const msg = denoRunnerUnavailableMessage("http://localhost:9099");
      expect(msg).toContain("custom-node checker is not running");
      expect(msg).toContain(
        "docker compose -f deployments/local/docker-compose.deno.yml up -d",
      );
      expect(msg).not.toContain("http://localhost:9099");
      expect(msg).not.toContain("/check");
    });

    it("gives retry-then-escalate advice for a deployed sidecar", () => {
      const msg = denoRunnerUnavailableMessage("http://deno-runner:9090");
      expect(msg).toContain("not responding");
      expect(msg).toContain("administrator");
      expect(msg).not.toContain("docker compose");
      expect(msg).not.toContain("deno-runner:9090");
    });

    it("keeps the endpoint + failure on `details` for network failures", async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = new DenoRunnerClient({
        baseUrl: "http://localhost:9099",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const err = await client.check("const x = 1;").then(
        () => null,
        (e: unknown) => e as DenoRunnerUnavailableError,
      );
      expect(err).toBeInstanceOf(DenoRunnerUnavailableError);
      expect(err?.details).toContain("POST http://localhost:9099/check");
      expect(err?.details).toContain("ECONNREFUSED");
      expect(err?.message).toBe(
        denoRunnerUnavailableMessage("http://localhost:9099"),
      );
    });

    it("keeps the HTTP status on `details` for a non-2xx response", async () => {
      const fetchMock = makeFetchMock(500, { message: "internal" });
      const client = new DenoRunnerClient({
        baseUrl: "http://localhost:9099",
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const err = await client.check("const x = 1;").then(
        () => null,
        (e: unknown) => e as DenoRunnerUnavailableError,
      );
      expect(err?.details).toContain("returned 500");
      expect(err?.message).not.toContain("500");
    });
  });

  describe("health", () => {
    it("returns the health response on success", async () => {
      const fetchMock = makeFetchMock(200, { ok: true, denoVersion: "2.1.4" });
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      const res = await client.health();
      expect(res).toEqual({ ok: true, denoVersion: "2.1.4" });
    });

    it("throws DenoRunnerUnavailableError on network failure", async () => {
      const fetchMock = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const client = new DenoRunnerClient({
        fetchImpl: fetchMock as unknown as typeof fetch,
      });
      await expect(client.health()).rejects.toBeInstanceOf(
        DenoRunnerUnavailableError,
      );
    });
  });
});
