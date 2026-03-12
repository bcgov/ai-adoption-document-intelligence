/**
 * Execution State
 *
 * Shared state for graph workflow execution.
 */

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
  lastError: {
    current?: {
      nodeId: string;
      message: string;
      type?: string;
      retryable?: boolean;
    };
  };
}
