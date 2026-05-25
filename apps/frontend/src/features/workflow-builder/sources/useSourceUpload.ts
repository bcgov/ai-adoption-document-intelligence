/**
 * `useSourceUpload` — TanStack mutation hook wrapping the per-source
 * upload endpoint introduced in US-114.
 *
 *   POST /api/workflows/:workflowId/sources/:sourceNodeId/upload
 *
 * Request body is `multipart/form-data` with a single part named `"file"`.
 * The response is a `Record<string, string>` keyed by the source node's
 * configured `ctxKey` (e.g. `{ "myFile": "https://blob/.../abc" }`) — the
 * hook returns it verbatim so consumers (Run drawer, settings panel) can
 * decide how to merge it into `initialCtx` or display it.
 *
 * Auth + CSRF mirror `apps/frontend/src/data/services/api.service.ts`:
 *   - `credentials: "include"` matches axios `withCredentials: true`
 *   - `x-api-key` header injected from `VITE_TEST_API_KEY` for the
 *     backend's `ApiKeyAuthGuard` in dev/test mode
 *   - `X-CSRF-Token` pulled from the `csrf_token` cookie (NestJS CSRF
 *     guard requires it on POST)
 *   - `Content-Type` is deliberately omitted so the browser sets the
 *     correct `multipart/form-data; boundary=...` header
 *
 * On non-2xx responses the hook throws a typed `ApiError` carrying both
 * `status` (so consumers can distinguish 400 MIME-mismatch from 413
 * oversized — see US-114 Scenarios 4 + 5) and `message` (from the
 * response body's `message` field when present, otherwise the HTTP
 * status text).
 *
 * Per DOCUMENT_SOURCES_DESIGN.md §4.3 + US-114 Scenario 6 the upload
 * endpoint is intentionally decoupled from `/runs` — this hook ONLY
 * uploads; the consumer is responsible for chaining the run start.
 */

import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import { API_BASE_URL } from "../../../shared/constants";

/**
 * Wire shape of the upload endpoint's success response. The single key
 * is the source node's configured ctxKey (dynamic per source), and the
 * value is the storage URL the backend allocated for the upload.
 */
export type SourceUploadResponse = Record<string, string>;

/**
 * Typed error thrown when the upload endpoint returns a non-2xx
 * response. Consumers branch on `status` to surface tailored UX
 * (e.g. 400 → "wrong file type"; 413 → "file too large").
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Pulls the CSRF token from the `csrf_token` cookie. Mirrors the helper
 * in `api.service.ts` rather than importing it so this hook stays
 * decoupled from axios.
 */
function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

/**
 * Returns the headers to attach to the upload request. `Content-Type`
 * is intentionally omitted so the browser fills it in with the
 * multipart boundary.
 */
function buildAuthHeaders(): HeadersInit {
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

interface ErrorResponseBody {
  message?: string | string[];
}

/**
 * TanStack mutation that uploads a single file for a given source node.
 *
 * @param workflowId    Lineage id of the workflow being run.
 * @param sourceNodeId  Id of the source node within that workflow.
 *
 * Usage:
 *   const upload = useSourceUpload(workflowId, sourceNodeId);
 *   const result = await upload.mutateAsync(file);
 *   // result is `{ [ctxKey]: storageUrl }`
 */
export function useSourceUpload(
  workflowId: string,
  sourceNodeId: string,
): UseMutationResult<SourceUploadResponse, ApiError, File> {
  return useMutation<SourceUploadResponse, ApiError, File>({
    mutationFn: async (file: File): Promise<SourceUploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);

      const url = `${API_BASE_URL}/workflows/${workflowId}/sources/${sourceNodeId}/upload`;
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        let message = response.statusText || "Upload failed";
        try {
          const body = (await response.json()) as ErrorResponseBody;
          const raw = body?.message;
          if (typeof raw === "string" && raw.length > 0) {
            message = raw;
          } else if (Array.isArray(raw)) {
            message = raw.join(", ");
          }
        } catch {
          // Body wasn't JSON — fall back to statusText.
        }
        throw new ApiError(response.status, message);
      }

      return (await response.json()) as SourceUploadResponse;
    },
  });
}
