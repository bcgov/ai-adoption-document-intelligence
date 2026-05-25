/**
 * Graph Runner - Core DAG Execution Engine
 *
 * Implements the main execution loop for the generic graph workflow interpreter.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5.2
 */

import { writeSourceNodeCache } from "../cache/source-node-cache";
import type {
  GraphWorkflowInput,
  GraphWorkflowResult,
  SourceNode,
} from "../graph-workflow-types";
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
  input: GraphWorkflowInput,
  state: ExecutionState,
): Promise<GraphWorkflowResult> {
  const config = input.graph;

  state.configHash = input.configHash;
  state.runnerVersion = input.runnerVersion;
  state.requestId = input.requestId;
  state.groupId = input.groupId ?? null;
  // Phase 4 (US-133): lineage scope is set on the workflow start path; the
  // worker `cacheDeps` proxy is assigned by the workflow entry point
  // (`graph-workflow.ts`) before `runGraphExecution` is invoked.
  state.workflowLineageId = input.workflowLineageId ?? null;

  // Step 1: Initialize context from defaults + initialCtx
  state.ctx = initializeContext(config, input.initialCtx);

  // Step 2: Validate DAG structure (cycle detection via topological sort)
  computeTopologicalOrder(config);

  // Step 2.5: Phase 4 (US-133 Scenario 3) — write source-node cache rows
  // BEFORE the main execution loop. The source's ctx-merge already
  // happened during `initializeContext` (initialCtx carries the inbound
  // payload), so its "output" is the merged ctx. Downstream activities
  // pick this up automatically via the standard input-hash chain.
  //
  // Source nodes are marked complete unconditionally — their "execution"
  // is the ctx-merge that already happened in `initializeContext`. The
  // cache-write half only runs when the worker has wired the cache deps
  // (Phase 4 try-in-place path).
  const initialCtxSnapshot: Record<string, unknown> = { ...state.ctx };
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "source") {
      continue;
    }
    if (state.cacheDeps && state.workflowLineageId) {
      await writeSourceNodeCache(
        state.cacheDeps,
        node as SourceNode,
        initialCtxSnapshot,
        state.workflowLineageId,
      );
    }
    // Mark the source node as completed so it doesn't get scheduled
    // for execution by the main loop — its "execution" was the
    // ctx-merge that already happened.
    state.completedNodeIds.add(node.id);
    state.nodeStatuses.set(node.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  }

  // Step 3: Main execution loop
  // Note: Not all nodes may complete (e.g., unselected switch branches)
  // Loop until no more nodes are ready
  while (true) {
    // Check for immediate cancellation
    if (state.cancelled() && state.cancelMode() === "immediate") {
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: "cancelled",
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
      return {
        ctx: state.ctx,
        completedNodes: Array.from(state.completedNodeIds),
        status: "cancelled",
      };
    }
  }

  // All nodes completed successfully
  return {
    ctx: state.ctx,
    completedNodes: Array.from(state.completedNodeIds),
    status: "completed",
  };
}
