/**
 * Execution State
 *
 * Shared state for graph workflow execution.
 */

import type { CachedActivityDeps } from "../cache/cached-activity";
import type { NodeRunStatus } from "../graph-workflow-queries";
import type { NodeStatus } from "../graph-workflow-types";

/**
 * Execution state shared between workflow function and runner
 */
export interface ExecutionState {
  currentNodes: string[];
  completedNodeIds: Set<string>;
  nodeStatuses: Map<string, NodeStatus>;
  /**
   * Phase 4 (US-135) per-node live run status surfaced through the
   * `getNodeStatusesQuery` Temporal query handler. The map shares its
   * object identity with the workflow body's `nodeStatuses` constant
   * (passed in by `graph-workflow.ts`) so the query handler returns a
   * live snapshot — mutations made here are visible to the next query.
   *
   * Distinct from `nodeStatuses` (the legacy `getStatus` map): the
   * legacy shape uses `"completed"` and has no concept of cache-hit /
   * skipped semantics. Both maps are maintained side-by-side.
   */
  nodeRunStatuses: Record<string, NodeRunStatus>;
  cancelled: () => boolean;
  cancelMode: () => "graceful" | "immediate";
  ctx: Record<string, unknown>;
  selectedEdges: Map<string, string>; // nodeId -> selected edgeId for switch nodes
  mapBranchResults: Map<string, unknown[]>; // mapNodeId -> array of branch results
  configHash: string;
  runnerVersion: string;
  requestId?: string;
  // Tenant scope: the group under which the workflow was started. Set by the
  // caller (server-side, derived from the document's group_id), never from
  // the workflow JSON. Lives outside ctx so graph-workflow authors cannot
  // forge or override it via ctx defaults.
  groupId?: string | null;
  /**
   * Phase 4 try-in-place cache scope. When both `workflowLineageId` and
   * `cacheDeps` are present, the per-node activity dispatch goes through
   * `executeCachedActivity` (US-133). When either is omitted, the
   * decorator is bypassed and activities execute uncached — preserving
   * the historical behaviour for tests / callers that don't wire the
   * cache plumbing.
   */
  workflowLineageId?: string | null;
  cacheDeps?: CachedActivityDeps;
  /**
   * Phase 6 Milestone C (US-170) — the originating run's API key, threaded
   * through to `dyn.run` for injection as `AI_DI_API_KEY` into the Deno
   * subprocess's ambient env. Sourced from the original `/api/workflows/:id/runs`
   * request's `x-api-key` header; the same key the dynamic-node script must
   * use to call back into the platform.
   */
  apiKey?: string | null;
  /**
   * Phase 6 Milestone C (US-170) — workflow-run identifier injected into
   * `dyn.run` as `AI_DI_WORKFLOW_RUN_ID`. Typically `workflowInfo().workflowId`.
   */
  workflowRunId?: string;
  lastError: {
    current?: {
      nodeId: string;
      message: string;
      type?: string;
      retryable?: boolean;
    };
  };
}
