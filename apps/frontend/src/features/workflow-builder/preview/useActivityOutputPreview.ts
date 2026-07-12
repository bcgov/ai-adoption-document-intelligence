/**
 * `useActivityOutputPreview` — TanStack Query hook backing the V2
 * editor's per-node preview widget while a Try (or replay) is in
 * progress.
 *
 * The editor mounts a preview widget on **every** node, so a naive
 * per-node fetch fired one `GET /preview-cache?nodeId=…` request per node
 * on every load — an O(nodes) request storm that tripped the backend rate
 * limiter. Instead this hook reads from a single shared batch query:
 *
 *   GET /api/workflows/:workflowId/preview-cache-batch[?runId=<runId>]
 *
 * All node widgets that share the same `(workflowId, runId)` observe the
 * SAME underlying query — one network round-trip — and each picks its own
 * node's row out of the returned map via a per-observer `select`. TanStack
 * de-dupes the fetch and the refetch.
 *
 * When the node transitions out of `pending` the hook fires a debounced
 * (`250ms`) `invalidateQueries` on the shared batch key so the map is
 * re-fetched as soon as the worker decorator has written the row — rapid
 * `running → succeeded` transitions across nodes are coalesced.
 *
 * A node absent from the returned map surfaces as `data: null` (the batch
 * endpoint simply omits nodes with no fresh cache row — the same "no fresh
 * row" signal the old per-node endpoint expressed as a 404). US-155 owns
 * the cache-evicted `<Alert>` + Re-run flow on top of that `null`.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L30
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-141-preview-hook-and-dispatch-shell.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.1 + §4.6
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { builderFetch } from "../../../data/services/builder-fetch";
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

/** `nodeId → cached preview row` map returned by the batch endpoint. */
export type ActivityOutputPreviewMap = Record<string, ActivityOutputPreview>;

interface ErrorResponseBody {
  message?: string | string[];
}

interface PreviewBatchResponse {
  previews: ActivityOutputPreviewMap;
}

/**
 * Fetch the whole-lineage preview map for `(workflowId, runId?)`.
 * Non-2xx responses map to a typed `ApiError`; auth headers, cookies, and
 * 401 refresh are handled by `builderFetch`. Unlike the old per-node
 * endpoint, the batch endpoint does not 404 on "no rows" — it returns an
 * empty map — so there is no 404 special-case here.
 */
export async function fetchActivityOutputPreviewsBatch(
  workflowId: string,
  runId: string | undefined,
): Promise<ActivityOutputPreviewMap> {
  const params = new URLSearchParams();
  if (runId !== undefined && runId !== "") {
    params.set("runId", runId);
  }
  const qs = params.toString();
  const url = `${API_BASE_URL}/workflows/${workflowId}/preview-cache-batch${
    qs ? `?${qs}` : ""
  }`;
  const response = await builderFetch(url, { method: "GET" });

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

  const body = (await response.json()) as PreviewBatchResponse;
  return body.previews ?? {};
}

/**
 * Build the canonical batch query key. Exported so tests + parallel
 * Phase 4 stories (US-155's Re-run flow) can invalidate the same key
 * without duplicating the literal. Keyed by `(workflowId, runId)` only —
 * NOT `nodeId` — so every node widget shares one query.
 */
export function previewCacheBatchQueryKey(
  workflowId: string,
  runId: string | undefined,
): readonly unknown[] {
  return ["preview-cache-batch", workflowId, runId ?? "latest"] as const;
}

export interface UseActivityOutputPreviewResult {
  /** The cached preview, or `null` when no fresh row exists for the node. */
  data: ActivityOutputPreview | null;
  /** True while the query is in-flight (TanStack `isPending` semantics). */
  isLoading: boolean;
  /** Surfaced when the fetch fails with a non-404 status. `null` otherwise. */
  error: ApiError | null;
}

/**
 * TanStack hook exposing the cached preview for `(workflowId, nodeId,
 * runId?)`. Reads from the shared batch query and selects this node's row,
 * so N node widgets cost ONE request. Re-fetches (debounced) once when the
 * node's status transitions out of `pending`. Returns `null` when the node
 * has no fresh row.
 *
 * @param workflowId  Lineage id of the workflow.
 * @param nodeId      ID of the node within the workflow's graph.
 * @param runId       Optional Temporal workflow execution id. When
 *                    omitted, the endpoint returns the most recent
 *                    fresh row for each node.
 */
export function useActivityOutputPreview(
  workflowId: string,
  nodeId: string,
  runId?: string,
): UseActivityOutputPreviewResult {
  const queryClient = useQueryClient();

  const query = useQuery<
    ActivityOutputPreviewMap,
    ApiError,
    ActivityOutputPreview | null
  >({
    queryKey: previewCacheBatchQueryKey(workflowId, runId),
    queryFn: () => fetchActivityOutputPreviewsBatch(workflowId, runId),
    // Only run when we have a workflowId. `runId` is optional; without it
    // the endpoint returns each node's most-recent fresh row.
    enabled: !!workflowId,
    // Per-observer projection — every node widget shares the underlying
    // fetch but selects only its own row. Absent node ⇒ `null`.
    select: (map) => map[nodeId] ?? null,
    // Rate-limits (429) and server hiccups (5xx) are transient: without a
    // retry they lock every widget into a permanent red "Preview
    // unavailable" even though the next fetch would succeed.
    retry: (failureCount, error) =>
      failureCount < 3 &&
      error instanceof ApiError &&
      (error.status === 429 || error.status >= 500),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  // -----------------------------------------------------------------------
  // Debounced re-fetch on status transition
  // -----------------------------------------------------------------------
  //
  // Subscribe to the node's status. When it transitions out of `pending`
  // (running, succeeded, skipped, failed, cancelled), schedule a debounced
  // invalidation of the SHARED batch key. The 250ms window coalesces rapid
  // `running → succeeded` flips — and near-simultaneous transitions across
  // different nodes — into a single map re-fetch.
  const { status } = useNodeRunStatus(nodeId);
  const previousStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = status;

    // First render: snapshot the status but don't fire — the initial
    // mount's `useQuery` already loaded the map.
    if (previous === null) {
      return;
    }
    // No transition — same value as last tick.
    if (previous === status) {
      return;
    }
    // Only fire on transition into a non-pending state.
    if (status === "pending") {
      return;
    }

    const timer = window.setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: previewCacheBatchQueryKey(workflowId, runId),
      });
    }, PREVIEW_REFETCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [status, queryClient, workflowId, runId]);

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error ?? null,
  };
}
