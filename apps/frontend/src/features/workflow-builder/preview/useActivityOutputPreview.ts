/**
 * `useActivityOutputPreview` — TanStack Query hook backing the V2
 * editor's per-node preview widget while a Try (or replay) is in
 * progress.
 *
 *   GET /api/workflows/:workflowId/preview-cache?nodeId=<nodeId>[&runId=<runId>]
 *
 * The hook is driven by the per-node `useNodeRunStatus(nodeId)` lookup
 * (US-138). When the node transitions out of `pending` the hook fires
 * a debounced (`250ms`) `invalidateQueries` so the preview cache row
 * is re-fetched as soon as the worker decorator has written it — rapid
 * `running → succeeded` transitions are coalesced into a single
 * round-trip.
 *
 * 404 responses are normalised to `data: null` (not error). The
 * preview-cache endpoint returns 404 in two distinct situations the
 * UI cares about:
 *   - the node hasn't been executed yet (or the run never produced a
 *     cache row) — the consumer renders nothing
 *   - the cache row was TTL-evicted — US-155 owns the cache-evicted
 *     `<Alert>` + Re-run flow; the dispatch shell renders a
 *     placeholder until that lands.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L30
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-141-preview-hook-and-dispatch-shell.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.1 + §4.6
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { API_BASE_URL } from "../../../shared/constants";
import { useNodeRunStatus } from "../run/RunStateContext";
import { ApiError } from "../sources/useSourceUpload";
import type { ActivityOutputPreview } from "./preview.types";

/** Re-exported so consumers can `instanceof`-check + branch on `status`. */
export { ApiError } from "../sources/useSourceUpload";

/**
 * Debounce window (ms) coalescing rapid `running → succeeded/skipped/
 * failed` transitions into a single preview-cache re-fetch. Matches
 * the design doc's "debounced by 250ms" callout (§4.6).
 */
export const PREVIEW_REFETCH_DEBOUNCE_MS = 250;

interface ErrorResponseBody {
  message?: string | string[];
}

/**
 * Pulls the CSRF token from the `csrf_token` cookie. Mirrors the
 * helper in `api.service.ts` rather than importing it so this hook
 * stays decoupled from axios. (`GET` requests don't need the CSRF
 * token per the backend's CSRF guard, but we keep the helper here for
 * symmetry with sibling fetch-based hooks.)
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
 * Builds the headers for the preview-cache request. Mirrors the auth
 * shape used by other fetch-based hooks (`useNodeStatuses`,
 * `useSourceUpload`).
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
 * `404` is treated specially — returns `null` so the hook surfaces
 * `data === null` rather than `error: ApiError(404)`.
 */
export async function fetchActivityOutputPreview(
  workflowId: string,
  nodeId: string,
  runId: string | undefined,
): Promise<ActivityOutputPreview | null> {
  const params = new URLSearchParams({ nodeId });
  if (runId !== undefined && runId !== "") {
    params.set("runId", runId);
  }
  const url = `${API_BASE_URL}/workflows/${workflowId}/preview-cache?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: buildAuthHeaders(),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    let message = response.statusText || "Failed to fetch preview cache";
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

  return (await response.json()) as ActivityOutputPreview;
}

/**
 * Build the canonical TanStack query key. Exported so tests + parallel
 * Phase 4 stories (US-155's Re-run flow) can invalidate the same key
 * without duplicating the literal.
 */
export function previewCacheQueryKey(
  workflowId: string,
  nodeId: string,
  runId: string | undefined,
): readonly unknown[] {
  return ["preview-cache", workflowId, nodeId, runId ?? "latest"] as const;
}

export interface UseActivityOutputPreviewResult {
  /** The cached preview, or `null` when no fresh row exists (404). */
  data: ActivityOutputPreview | null;
  /** True while the query is in-flight (TanStack `isPending` semantics). */
  isLoading: boolean;
  /** Surfaced when the fetch fails with a non-404 status. `null` otherwise. */
  error: ApiError | null;
}

/**
 * TanStack hook fetching the preview-cache row for `(workflowId,
 * nodeId, runId?)`. Re-fetches debounced once when the node's status
 * transitions out of `pending`. Returns `null` on 404 (no fresh row)
 * without surfacing an error.
 *
 * @param workflowId  Lineage id of the workflow.
 * @param nodeId      ID of the node within the workflow's graph.
 * @param runId       Optional Temporal workflow execution id. When
 *                    omitted, the endpoint returns the most recent
 *                    fresh row for `(workflowLineageId, nodeId)`.
 */
export function useActivityOutputPreview(
  workflowId: string,
  nodeId: string,
  runId?: string,
): UseActivityOutputPreviewResult {
  const queryClient = useQueryClient();

  const query = useQuery<ActivityOutputPreview | null, ApiError>({
    queryKey: previewCacheQueryKey(workflowId, nodeId, runId),
    queryFn: () => fetchActivityOutputPreview(workflowId, nodeId, runId),
    // Only run when we have a workflowId + nodeId. `runId` is optional;
    // without it the endpoint returns the most-recent fresh row.
    enabled: !!workflowId && !!nodeId,
    // 404 normalises to `null` — TanStack's default retry-on-error
    // would otherwise hammer the backend while a node is still pending.
    retry: false,
  });

  // -----------------------------------------------------------------------
  // Scenario 2 — debounced re-fetch on status transition
  // -----------------------------------------------------------------------
  //
  // Subscribe to the node's status. When it transitions out of
  // `pending` (running, succeeded, skipped, failed, cancelled), schedule
  // a debounced cache invalidation. The 250ms window coalesces rapid
  // `running → succeeded` flips into a single round-trip.
  //
  // The previous-status ref guards against same-status re-renders (the
  // status map is rebuilt on every poll tick, but its content rarely
  // changes — only the reference). We only invalidate on an actual
  // transition.
  const { status } = useNodeRunStatus(nodeId);
  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;

    // First render: snapshot the status but don't fire — the initial
    // mount's `useQuery` already loaded the row.
    if (previous === null) {
      return;
    }
    // No transition — same value as last tick.
    if (previous === status) {
      return;
    }
    // Only fire on transition into a non-pending state. (Re-entering
    // `pending` from `running` shouldn't happen in practice; ignore.)
    if (status === "pending") {
      return;
    }

    const timer = window.setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: previewCacheQueryKey(workflowId, nodeId, runId),
      });
    }, PREVIEW_REFETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [status, queryClient, workflowId, nodeId, runId]);

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
  };
}
