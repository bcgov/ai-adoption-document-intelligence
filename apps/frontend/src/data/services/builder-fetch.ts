/**
 * Shared `fetch` wrapper for the workflow-builder / agent-chat hooks that
 * talk to the API directly with `fetch` (streaming, FormData uploads, 404
 * sentinels — things the axios `ApiService` isn't shaped for).
 *
 * §6.1: previously ~9 modules each re-implemented the same three things —
 * `csrf_token`-cookie parsing, the `VITE_TEST_API_KEY` header, and
 * `credentials: "include"` — AND skipped ApiService's 401 refresh/logout
 * interceptor, so an expired session hard-failed in the builder instead of
 * refreshing. This centralises all of that: one place builds the auth
 * headers, and a 401 is routed through the SAME single-flight session refresh
 * + logout as `ApiService`, retrying the request once after a refresh.
 *
 * Callers pass any request-specific headers (Content-Type, a group-id header)
 * via `init.headers`; they are merged over the shared auth headers.
 */

import { apiService } from "./api.service";

/** Read the `csrf_token` cookie (SSR-safe). */
export function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

/**
 * Base auth headers shared by every builder fetch: the test/dev `x-api-key`
 * (when `VITE_TEST_API_KEY` is set) and the CSRF token (when present).
 */
export function builderAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const testApiKey = import.meta.env.VITE_TEST_API_KEY;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  const csrfToken = readCsrfToken();
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  return headers;
}

/**
 * `fetch` with cookies + shared auth headers + ApiService's 401
 * refresh/logout. On a 401 it awaits the single-flight refresh and retries
 * once; if the refresh fails (logout already invoked by ApiService) it
 * returns the original 401 response so the caller's error path still runs.
 */
export async function builderFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const merged: RequestInit = {
    ...init,
    credentials: "include",
    headers: {
      ...builderAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  };

  const first = await fetch(input, merged);
  if (first.status !== 401) {
    return first;
  }

  try {
    await apiService.refreshSessionOnce();
  } catch {
    // Refresh failed; ApiService already invoked the logout callback.
    return first;
  }
  // The refresh rotated the CSRF cookie, so rebuild the auth headers —
  // the double-submit guard rejects a retry that replays the pre-refresh
  // token on state-changing calls.
  return fetch(input, {
    ...merged,
    headers: {
      ...builderAuthHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
