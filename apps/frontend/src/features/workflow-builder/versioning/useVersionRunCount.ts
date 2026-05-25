/**
 * `useVersionRunCount` — TanStack Query hook backing the `VersionHistoryDrawer`
 * row's run-count badge (Phase 4 / US-152).
 *
 *   GET /api/workflows/:workflowId/versions/:versionId/run-count
 *
 * Run counts change rarely (only when a new run lands), so the hook does
 * NOT poll — it relies on the backend's 60s LRU cache for staleness
 * bounds and matches that with `staleTime: 60_000`. Consumers can
 * `invalidateQueries(["version-run-count", ...])` after starting a run
 * to force a refetch.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L24 + L43
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-152-version-run-count-endpoint-and-badge.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §6.5
 */

import { useQuery } from "@tanstack/react-query";

import { API_BASE_URL } from "../../../shared/constants";
import { ApiError } from "../sources/useSourceUpload";

/** Re-exported so consumers can `instanceof`-check + branch on `status`. */
export { ApiError } from "../sources/useSourceUpload";

/**
 * Stale-time for the hook's `useQuery` config. Matches the backend's 60s
 * LRU cache TTL — within this window no network round-trip fires.
 */
export const VERSION_RUN_COUNT_STALE_TIME_MS = 60_000;

interface ErrorResponseBody {
  message?: string | string[];
}

/** Response shape from the run-count endpoint. */
export interface VersionRunCount {
  runCount: number;
}

/**
 * Pulls the CSRF token from the `csrf_token` cookie. Mirrors the
 * helper in `api.service.ts` (GET requests don't need the CSRF token
 * per the backend's CSRF guard, but we keep the helper for symmetry
 * with sibling fetch-based hooks).
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
 * Builds the headers for the run-count request. Mirrors the auth shape
 * used by other fetch-based hooks (`useNodeStatuses`, `useSourceUpload`).
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
 * Performs the GET and maps non-2xx responses to typed `ApiError`s.
 * Exported so tests can drive it directly without spinning up TanStack.
 */
export async function fetchVersionRunCount(
  workflowId: string,
  versionId: string,
): Promise<VersionRunCount> {
  const url = `${API_BASE_URL}/workflows/${workflowId}/versions/${versionId}/run-count`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    let message = response.statusText || "Failed to fetch version run count";
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

  return (await response.json()) as VersionRunCount;
}

/** Build the canonical TanStack query key. Exported for invalidation reuse. */
export function versionRunCountQueryKey(
  workflowId: string,
  versionId: string,
): readonly unknown[] {
  return ["version-run-count", workflowId, versionId] as const;
}

export interface UseVersionRunCountResult {
  /** The run-count payload, or `null` while the query has not yet resolved
   *  successfully (loading + error states both surface as `null`). */
  data: VersionRunCount | null;
  /** True while the query is in-flight (TanStack `isPending` semantics). */
  isLoading: boolean;
  /** Surfaced when the fetch fails (4xx / 5xx). `null` otherwise. */
  error: ApiError | null;
}

/**
 * TanStack hook fetching the run-count for `(workflowId, versionId)`.
 * Does NOT poll: matches the backend's 60s LRU cache with a 60s
 * `staleTime`. Explicit invalidation is the only refresh trigger
 * (e.g. after starting a new run).
 *
 * @param workflowId  Lineage id of the workflow.
 * @param versionId   `WorkflowVersion.id` within that lineage.
 */
export function useVersionRunCount(
  workflowId: string,
  versionId: string,
): UseVersionRunCountResult {
  const query = useQuery<VersionRunCount, ApiError>({
    queryKey: versionRunCountQueryKey(workflowId, versionId),
    queryFn: () => fetchVersionRunCount(workflowId, versionId),
    enabled: !!workflowId && !!versionId,
    staleTime: VERSION_RUN_COUNT_STALE_TIME_MS,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
  };
}
