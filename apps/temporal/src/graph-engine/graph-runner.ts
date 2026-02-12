/**
 * Graph Runner - Core DAG Execution Engine
 *
 * Implements the main execution loop for the generic graph workflow interpreter.
 *
 * See docs/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5.2
 */

import type {
  GraphWorkflowInput,
  GraphWorkflowResult,
} from '../graph-workflow-types';
import type { ExecutionState } from './execution-state';
import { initializeContext } from './context-utils';
import { computeTopologicalOrder, computeReadySet } from './graph-algorithms';
import { executeNode, executeSwitchNode } from './node-executors';
import { handleNodeError } from './error-handling';

/**
 * Main graph execution function
 *
 * Runs the DAG workflow using topological sort and ready set computation.
 */
export async function runGraphExecution(
  input: GraphWorkflowInput,
  state: ExecutionState,
): Promise<GraphWorkflowResult> {
  const config = input.graph;

  state.configHash = input.configHash;
  state.runnerVersion = input.runnerVersion;

  // Step 1: Initialize context from defaults + initialCtx
  state.ctx = initializeContext(config, input.initialCtx);

  // Step 2: Validate DAG structure (cycle detection via topological sort)
  computeTopologicalOrder(config);

  // Step 3: Main execution loop
  // Note: Not all nodes may complete (e.g., unselected switch branches)
  // Loop until no more nodes are ready
  while (true) {
    // Check for immediate cancellation
    if (state.cancelled() && state.cancelMode() === 'immediate') {
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: 'cancelled',
      };
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
          status: 'running',
          startedAt: new Date().toISOString(),
        });

        try {
          // Handle switch nodes specially - they determine routing
          if (node.type === 'switch') {
            const selectedEdgeId = executeSwitchNode(node, state.ctx);
            state.selectedEdges.set(nodeId, selectedEdgeId);
          } else {
            await executeNode(node, config, state);
          }

          // Mark node as completed
          state.completedNodeIds.add(nodeId);
          state.nodeStatuses.set(nodeId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
          });
        } catch (error) {
          handleNodeError(nodeId, node, error, state, config);
        }
      }),
    );

    // Check for graceful cancellation
    if (state.cancelled() && state.cancelMode() === 'graceful') {
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: 'cancelled',
      };
    }
  }

  // All nodes completed successfully
  return {
    ctx: state.ctx,
    completedNodes: Array.from(state.completedNodeIds),
    status: 'completed',
  };
}
