/**
 * Execution State
 *
 * Shared state for graph workflow execution.
 */

import type { CachedActivityDeps } from "../cache/cached-activity";
import type { NodeStatus } from "../graph-workflow-types";

/**
 * Execution state shared between workflow function and runner
 */
export interface ExecutionState {
  currentNodes: string[];
  completedNodeIds: Set<string>;
  nodeStatuses: Map<string, NodeStatus>;
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
  lastError: {
    current?: {
      nodeId: string;
      message: string;
      type?: string;
      retryable?: boolean;
    };
  };
}
