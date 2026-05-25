/**
 * Phase 4 (US-135) — Workflow query handler for live per-node run status.
 *
 * The canvas polls the running workflow via a backend proxy that issues a
 * Temporal query against `getNodeStatusesQuery`. The handler returns a
 * snapshot of the in-memory `Record<string, NodeRunStatus>` map the
 * workflow body maintains as nodes start, succeed, fail, or short-circuit
 * via the Phase 4 cache layer (US-133).
 *
 * Specs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L18.
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §3.1.
 *
 * Design notes:
 *   - `NodeRunStatus` is intentionally separate from the pre-existing
 *     `NodeStatus` (re-exported from `@ai-di/graph-workflow`) that backs
 *     the `getStatus` query: the legacy shape uses `"completed"` and has
 *     no concept of cache-hit / skipped semantics, and the canvas needs
 *     the new shape to drive badges + the active-edge animation.
 *   - Nodes the workflow never walks stay absent from the map; the
 *     canvas treats absent as `"pending"` (US-138 covers the frontend
 *     half).
 *   - The handler is registered once near the workflow body start so the
 *     map is queryable from the very first poll.
 */

import { defineQuery } from "@temporalio/workflow";

/**
 * Per-node live run status surfaced to the canvas.
 *
 * `status` values:
 *   - `"pending"` — reserved for callers that want to seed entries
 *     before execution; the workflow itself never writes "pending"
 *     (untouched nodes are absent, which the canvas treats as pending).
 *   - `"running"` — the node's underlying work has been dispatched.
 *   - `"succeeded"` — the node finished without short-circuiting through
 *     the cache (the activity actually ran, OR the node is a non-
 *     activity node type that completed normally).
 *   - `"failed"` — the node's underlying work threw; `errorMessage`
 *     carries the user-facing error string. Set BEFORE the error
 *     propagates so the canvas can pick it up even on a workflow-fatal
 *     failure.
 *   - `"skipped"` — the Phase 4 cache decorator (US-133) served the
 *     node's output from a cache row; `cacheHit` names the row.
 */
export interface NodeRunStatus {
  status: "pending" | "running" | "succeeded" | "failed" | "skipped";
  /** ISO-8601 timestamp captured the moment the node entered "running". */
  startedAt?: string;
  /**
   * ISO-8601 timestamp captured the moment the node left "running"
   * (regardless of terminal state — succeeded / failed / skipped).
   */
  endedAt?: string;
  /** Populated on `status === "failed"`. The thrown error's `.message`. */
  errorMessage?: string;
  /**
   * Populated on `status === "skipped"`. Names the cache row the Phase 4
   * decorator served the output from — the canvas surfaces these in the
   * preview pane so the user knows which inputs produced the cached
   * output.
   */
  cacheHit?: { configHash: string; inputHash: string };
}

/**
 * Temporal query handle. The workflow body calls
 * `setHandler(getNodeStatusesQuery, () => nodeStatuses)` once near
 * workflow start; the backend proxy endpoint then issues this query at
 * the polling cadence defined in TRY_IN_PLACE_DESIGN.md §3.3.
 */
export const getNodeStatusesQuery =
  defineQuery<Record<string, NodeRunStatus>>("getNodeStatuses");
