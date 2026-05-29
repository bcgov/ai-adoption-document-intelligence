/**
 * Graph Runner - Core DAG Execution Engine
 *
 * Implements the main execution loop for the generic graph workflow interpreter.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5.2
 */

import type {
  GraphWorkflowExecutionInput,
  GraphWorkflowResult,
} from "../graph-workflow-types";
import { buildGraphWorkflowResult } from "./build-workflow-result";
import { initializeContext } from "./context-utils";
import { handleNodeError } from "./error-handling";
import type { ExecutionState } from "./execution-state";
import { computeReadySet, computeTopologicalOrder } from "./graph-algorithms";
import { executeNode, executeSwitchNode } from "./node-executors";

/**
 * Main graph execution function
 *
 * Runs the DAG workflow using topological sort and ready set computation.
 */
export async function runGraphExecution(
  input: GraphWorkflowExecutionInput,
  state: ExecutionState,
): Promise<GraphWorkflowResult> {
  const config = input.graph;

  state.workflowVersionId = input.workflowVersionId;
  state.configHash = input.configHash;
  state.runnerVersion = input.runnerVersion;
  state.requestId = input.requestId;
  state.groupId = input.groupId ?? null;
  state.workflowConfigOverrides = input.workflowConfigOverrides;

  // Step 1: Initialize context from defaults + initialCtx
  const initializedCtx = initializeContext(config, input.initialCtx);
  for (const key of Object.keys(state.ctx)) {
    delete state.ctx[key];
  }
  Object.assign(state.ctx, initializedCtx);

  // Step 2: Validate DAG structure (cycle detection via topological sort)
  computeTopologicalOrder(config);

  // Step 3: Main execution loop
  // Note: Not all nodes may complete (e.g., unselected switch branches)
  // Loop until no more nodes are ready
  while (true) {
    // Check for immediate cancellation
    if (state.cancelled() && state.cancelMode() === "immediate") {
      return buildGraphWorkflowResult(state, "cancelled");
    }

    // Compute ready set
    const readyNodeIds = computeReadySet(config, state);

    if (readyNodeIds.length === 0) {
      // No more nodes ready - execution complete
      break;
    }

    // Sort ready nodes alphabetically for determinism
    const sortedReadyNodeIds = readyNodeIds.sort();
    state.currentNodes.length = 0;
    state.currentNodes.push(...sortedReadyNodeIds);

    // Execute ready nodes in parallel
    await Promise.all(
      sortedReadyNodeIds.map(async (nodeId) => {
        const node = config.nodes[nodeId];
        if (!node) {
          throw new Error(`Node not found: ${nodeId}`);
        }

        // Mark node as running
        state.nodeStatuses.set(nodeId, {
          status: "running",
          startedAt: new Date().toISOString(),
        });

        try {
          // Handle switch nodes specially - they determine routing
          if (node.type === "switch") {
            const selectedEdgeId = executeSwitchNode(node, state.ctx);
            state.selectedEdges.set(nodeId, selectedEdgeId);
          } else {
            await executeNode(node, config, state);
          }

          // Mark node as completed
          state.completedNodeIds.add(nodeId);
          state.nodeStatuses.set(nodeId, {
            status: "completed",
            completedAt: new Date().toISOString(),
          });
        } catch (error) {
          handleNodeError(nodeId, node, error, state, config);
        }
      }),
    );

    // Check for graceful cancellation
    if (state.cancelled() && state.cancelMode() === "graceful") {
      return buildGraphWorkflowResult(state, "cancelled");
    }
  }

  return buildGraphWorkflowResult(state, "completed");
}
