/**
 * `useSourceUpload` — TanStack mutation hook wrapping the per-source
 * upload endpoint introduced in US-114 and extended in US-146.
 *
 *   POST /api/workflows/:workflowId/sources/:sourceNodeId/upload
 *
 * Request body is `multipart/form-data` with a single part named `"file"`.
 * The response carries:
 *   - one dynamic `[ctxKey]: string` entry whose key matches the source
 *     node's configured `ctxKey` (e.g. `{ "myFile": "https://blob/.../abc" }`)
 *   - `runId: string` — Temporal workflow execution id of the run kicked
 *     off immediately after the upload commits (Phase 4 US-146)
 *   - `workflowVersionId: string` — `WorkflowVersion.id` used for that run
 *
 * The hook returns the body verbatim so consumers can merge ctx entries
 * and feed `runId` into canvas state (US-147's `setActiveRunId`).
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

import {
  type UseMutationResult,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { builderFetch } from "../../../data/services/builder-fetch";
import { API_BASE_URL } from "../../../shared/constants";

/**
 * Wire shape of the upload endpoint's success response. The fixed
 * `runId` + `workflowVersionId` fields were added in Phase 4 US-146 —
 * the backend now starts a Temporal run immediately after the upload
 * commits, and the frontend stores `runId` in canvas state to drive
 * the per-node status polling loop (US-147).
 *
 * The dynamic ctxKey-keyed entry (e.g. `{ "myFile": "https://blob/..." }`)
 * is modelled via an index signature; the entry key is the source
 * node's configured `ctxKey` and is unknown at compile time.
 */
export interface SourceUploadResponse {
  runId: string;
  workflowVersionId: string;
  [ctxKey: string]: string;
}

/**
 * Typed error thrown when the upload endpoint returns a non-2xx
 * response. Consumers branch on `status` to surface tailored UX
 * (e.g. 400 → "wrong file type"; 413 → "file too large").
 */
export class ApiError extends Error {
  readonly status: number;
  /**
   * Phase 6 (post-Milestone-F sweep): the raw response body, when present
   * and JSON-parseable. Lifted through so consumers can read structured
   * fields (e.g. dynamic-node publish endpoints return
   * `{ errors: ParseError[] }` on 400 — the editor's gutter markers consume
   * this without falling back to free-text re-parsing).
   */
  readonly body?: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
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
  const queryClient = useQueryClient();
  return useMutation<SourceUploadResponse, ApiError, File>({
    mutationFn: async (file: File): Promise<SourceUploadResponse> => {
      const formData = new FormData();
      formData.append("file", file);

      const url = `${API_BASE_URL}/workflows/${workflowId}/sources/${sourceNodeId}/upload`;
      // No explicit Content-Type — the browser sets the multipart boundary
      // for FormData. builderFetch adds auth headers + cookies + 401 refresh.
      const response = await builderFetch(url, {
        method: "POST",
        body: formData,
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
    onSuccess: () => {
      // The upload endpoint starts a Temporal run (US-146), so a successful
      // upload adds a run to history. Refetch the run-history list (keyed
      // `["workflow-runs", workflowId, filters]`) so it appears without a
      // manual page refresh.
      queryClient.invalidateQueries({
        queryKey: ["workflow-runs", workflowId],
      });
    },
  });
}
