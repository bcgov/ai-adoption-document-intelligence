/**
 * §6.1: builderFetch centralises auth headers + cookies + ApiService's 401
 * refresh/logout for the builder's fetch-based hooks.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { apiService } from "./api.service";
import { builderAuthHeaders, builderFetch } from "./builder-fetch";

function jsonResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("builderAuthHeaders", () => {
  it("includes the CSRF token from the cookie", () => {
    document.cookie = "csrf_token=tok-123";
    expect(builderAuthHeaders()["X-CSRF-Token"]).toBe("tok-123");
  });
});

describe("builderFetch", () => {
  it("sends cookies + auth headers and returns a non-401 response without refresh", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(200));
    const refreshSpy = vi.spyOn(apiService, "refreshSessionOnce");

    const res = await builderFetch("/api/thing", { method: "GET" });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe("include");
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("on 401, refreshes the session once and retries the request", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200));
    const refreshSpy = vi
      .spyOn(apiService, "refreshSessionOnce")
      .mockResolvedValue(undefined);

    const res = await builderFetch("/api/thing", { method: "GET" });

    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("retries a state-changing call with the CSRF token the refresh rotated", async () => {
    document.cookie = "csrf_token=stale-token";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(200));
    vi.spyOn(apiService, "refreshSessionOnce").mockImplementation(async () => {
      // POST /auth/refresh rotates the csrf_token cookie.
      document.cookie = "csrf_token=rotated-token";
    });

    const res = await builderFetch("/api/thing", { method: "POST" });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const firstHeaders = (fetchSpy.mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    const retryHeaders = (fetchSpy.mock.calls[1][1] as RequestInit)
      .headers as Record<string, string>;
    expect(firstHeaders["X-CSRF-Token"]).toBe("stale-token");
    expect(retryHeaders["X-CSRF-Token"]).toBe("rotated-token");
  });

  it("on 401 with a failed refresh, returns the original 401 (logout handled by ApiService)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(401));
    vi.spyOn(apiService, "refreshSessionOnce").mockRejectedValue(
      new Error("expired"),
    );

    const res = await builderFetch("/api/thing", { method: "GET" });

    expect(res.status).toBe(401);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
