/**
 * `useWorkflowRuns` — TanStack `useInfiniteQuery` hook wrapping the
 * Phase 4 run-history endpoint (US-150):
 *
 *   GET /api/workflows/:workflowId/runs
 *
 * The hook drives the `RunHistoryDrawer` (US-153). Filter changes
 * propagate through `queryKey: ["workflow-runs", workflowId, filters]`
 * so flipping any filter resets pagination to page 1 automatically
 * (a fresh TanStack cache entry). Subsequent pages are fetched via
 * `fetchNextPage()` keyed on the previous page's `nextCursor`.
 *
 * On non-2xx responses the hook surfaces a typed `ApiError` (re-exported
 * from the sibling Phase 8 hook `useSourceUpload`) via the standard
 * TanStack `error` field, carrying both the HTTP status and the body's
 * `message` field.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L31
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-153-run-history-drawer-and-filters.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.1 + §6.2
 */

import {
  type UseInfiniteQueryResult,
  useInfiniteQuery,
} from "@tanstack/react-query";

import { API_BASE_URL } from "../../../shared/constants";
import { ApiError } from "../sources/useSourceUpload";

/** Re-exported so consumers can `instanceof`-check + branch on `status`. */
export { ApiError } from "../sources/useSourceUpload";

/**
 * Status values the visibility query supports. Mirrors the backend's
 * `RunSummaryStatus` enum on `apps/backend-services/src/workflow/dto/list-runs.dto.ts`.
 * Frozen here to avoid a cross-package import of the backend DTO.
 */
export type RunSummaryStatus = "running" | "succeeded" | "failed" | "cancelled";

/**
 * Compact summary of a historical run. Mirror of the backend's
 * `RunSummaryDto` (US-150).
 */
export interface RunSummary {
  runId: string;
  workflowVersionId: string;
  versionNumber: number;
  status: RunSummaryStatus;
  startedAt: string;
  endedAt?: string;
  inputCtxSummary?: Record<string, unknown>;
}

/** Response shape of `GET /api/workflows/:id/runs`. */
export interface ListRunsResponse {
  runs: RunSummary[];
  nextCursor: string | null;
}

/**
 * Filter set the drawer's filters component propagates into the hook.
 * All fields are optional — undefined / missing entries omit the
 * corresponding query parameter.
 */
export interface ListRunsFilters {
  status?: RunSummaryStatus;
  startedAfter?: string;
  startedBefore?: string;
  workflowVersionId?: string;
  /** Optional override for the page size (defaults to the backend's 50). */
  limit?: number;
}

interface ErrorResponseBody {
  message?: string | string[];
}

/**
 * Pulls the CSRF token from the `csrf_token` cookie. Mirrors the helper
 * in sibling fetch-based hooks (`useNodeStatuses`, `useVersionRunCount`).
 * GET requests don't strictly need it per the backend's CSRF guard, but
 * we keep the helper for symmetry.
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
 * Builds the auth headers. Mirrors the auth shape used by sibling
 * fetch-based hooks so the `ApiKeyAuthGuard` accepts the request in
 * `NODE_ENV=test` / dev mode.
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

/**
 * Builds the run-history endpoint URL with the page cursor + filter
 * query parameters appended. Empty / undefined filter entries are
 * omitted (the backend treats their absence as "no filter").
 */
function buildRunsUrl(
  workflowId: string,
  filters: ListRunsFilters,
  cursor: string | undefined,
): string {
  const params = new URLSearchParams();
  if (cursor !== undefined && cursor !== "") {
    params.append("cursor", cursor);
  }
  if (filters.limit !== undefined) {
    params.append("limit", String(filters.limit));
  }
  if (filters.status !== undefined) {
    params.append("status", filters.status);
  }
  if (filters.startedAfter !== undefined && filters.startedAfter !== "") {
    params.append("startedAfter", filters.startedAfter);
  }
  if (filters.startedBefore !== undefined && filters.startedBefore !== "") {
    params.append("startedBefore", filters.startedBefore);
  }
  if (
    filters.workflowVersionId !== undefined &&
    filters.workflowVersionId !== ""
  ) {
    params.append("workflowVersionId", filters.workflowVersionId);
  }
  const queryString = params.toString();
  const base = `${API_BASE_URL}/workflows/${workflowId}/runs`;
  return queryString.length > 0 ? `${base}?${queryString}` : base;
}

/**
 * Performs the GET and maps non-2xx responses to typed `ApiError`s.
 * Exported so tests can drive it directly without spinning up TanStack.
 */
export async function fetchWorkflowRuns(
  workflowId: string,
  filters: ListRunsFilters,
  cursor: string | undefined,
): Promise<ListRunsResponse> {
  const url = buildRunsUrl(workflowId, filters, cursor);
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    let message = response.statusText || "Failed to fetch workflow runs";
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

  return (await response.json()) as ListRunsResponse;
}

/** Build the canonical TanStack query key. Exported for invalidation reuse. */
export function workflowRunsQueryKey(
  workflowId: string,
  filters: ListRunsFilters,
): readonly unknown[] {
  return ["workflow-runs", workflowId, filters] as const;
}

/**
 * TanStack `useInfiniteQuery` hook fetching the run-history endpoint.
 *
 * @param workflowId  Lineage id of the workflow whose runs are listed.
 * @param filters     Filter set — changing any field resets pagination
 *                    automatically (the new object identity bumps the
 *                    query key).
 */
export function useWorkflowRuns(
  workflowId: string,
  filters: ListRunsFilters,
): UseInfiniteQueryResult<
  { pages: ListRunsResponse[]; pageParams: Array<string | undefined> },
  ApiError
> {
  return useInfiniteQuery<
    ListRunsResponse,
    ApiError,
    { pages: ListRunsResponse[]; pageParams: Array<string | undefined> },
    readonly unknown[],
    string | undefined
  >({
    queryKey: workflowRunsQueryKey(workflowId, filters),
    queryFn: ({ pageParam }) =>
      fetchWorkflowRuns(workflowId, filters, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!workflowId,
  });
}
