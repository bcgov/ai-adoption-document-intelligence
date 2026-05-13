import http from "node:http";
import { createServer, isAuthorized } from "./server";
import type { Config } from "./config";
import * as ches from "./ches";

const baseConfig: Config = {
  port: 3003,
  adapterSecret: "test-secret",
  chesClientId: "client-id",
  chesClientSecret: "client-secret",
  chesAuthHost: "https://auth.example.com",
  chesHost: "https://ches.example.com",
  chesFromEmail: "alerts@example.com",
  chesToEmails: ["ops@example.com"],
};

const firingBody = JSON.stringify({
  version: "4",
  groupKey: "test-group",
  status: "firing",
  receiver: "ches-notifications",
  groupLabels: { alertname: "TestAlert" },
  commonLabels: { alertname: "TestAlert", severity: "critical", job: "backend" },
  commonAnnotations: { summary: "Test", description: "Test desc" },
  externalURL: "http://alertmanager:9093",
  alerts: [
    {
      status: "firing",
      labels: { alertname: "TestAlert", severity: "critical", job: "backend" },
      annotations: { summary: "Test", description: "Test desc" },
      startsAt: "2026-01-01T00:00:00Z",
      endsAt: "0001-01-01T00:00:00Z",
      generatorURL: "http://prometheus:9090",
    },
  ],
});

/**
 * Sends an HTTP request to the test server and returns the response.
 */
function sendRequest(
  server: http.Server,
  options: { method: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number };
    const req = http.request(
      { host: "127.0.0.1", port: addr.port, method: options.method, path: options.path, headers: options.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

describe("isAuthorized", () => {
  it("returns true with a correct Bearer token", () => {
    expect(isAuthorized("Bearer test-secret", "test-secret")).toBe(true);
  });

  it("returns false with a wrong token", () => {
    expect(isAuthorized("Bearer wrong", "test-secret")).toBe(false);
  });

  it("returns false when Authorization header is missing", () => {
    expect(isAuthorized(undefined, "test-secret")).toBe(false);
  });
});

describe("createServer", () => {
  let server: http.Server;

  beforeEach((done) => {
    jest.spyOn(ches, "getChesToken").mockResolvedValue("mock-token");
    jest.spyOn(ches, "sendEmail").mockResolvedValue(undefined);
    server = createServer(baseConfig);
    server.listen(0, "127.0.0.1", done);
  });

  afterEach((done) => {
    jest.restoreAllMocks();
    server.close(done);
  });

  it("returns 204 for a valid firing payload", async () => {
    const res = await sendRequest(server, {
      method: "POST",
      path: "/",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: firingBody,
    });
    expect(res.status).toBe(204);
  });

  it("returns 204 without calling CHES for resolved payloads", async () => {
    const resolvedBody = JSON.stringify({ ...JSON.parse(firingBody), status: "resolved" });
    const res = await sendRequest(server, {
      method: "POST",
      path: "/",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: resolvedBody,
    });
    expect(res.status).toBe(204);
    expect(ches.getChesToken).not.toHaveBeenCalled();
  });

  it("returns 403 for a wrong secret", async () => {
    const res = await sendRequest(server, {
      method: "POST",
      path: "/",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-secret",
      },
      body: firingBody,
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-POST requests", async () => {
    const res = await sendRequest(server, { method: "GET", path: "/" });
    expect(res.status).toBe(404);
  });

  it("returns 500 when CHES delivery fails", async () => {
    jest.spyOn(ches, "getChesToken").mockRejectedValue(new Error("CHES down"));
    const res = await sendRequest(server, {
      method: "POST",
      path: "/",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-secret",
      },
      body: firingBody,
    });
    expect(res.status).toBe(500);
  });
});
