/**
 * Error Handling
 *
 * Node error handling, error extraction, and timeout utilities.
 */

import { ApplicationFailure } from "@temporalio/workflow";
import type { GraphNode, GraphWorkflowConfig } from "../graph-workflow-types";
import type { ExecutionState } from "./execution-state";

/**
 * Handle node execution error based on error policy
 */
export function handleNodeError(
  nodeId: string,
  node: GraphNode,
  error: unknown,
  state: ExecutionState,
  config: GraphWorkflowConfig,
): void {
  const details = extractErrorDetails(error, nodeId);
  state.lastError.current = details;

  const policy = node.errorPolicy?.onError ?? "fail";

  if (policy === "skip") {
    state.nodeStatuses.set(nodeId, {
      status: "skipped",
      error: details.message,
      completedAt: new Date().toISOString(),
    });
    state.completedNodeIds.add(nodeId);
    return;
  }

  if (policy === "fallback") {
    const fallbackEdgeId = node.errorPolicy?.fallbackEdgeId;
    if (!fallbackEdgeId) {
      throw ApplicationFailure.create({
        type: "GRAPH_EXECUTION_ERROR",
        message: `Node ${nodeId} missing fallbackEdgeId for fallback policy`,
        nonRetryable: true,
      });
    }

    const fallbackEdge = config.edges.find(
      (edge) => edge.id === fallbackEdgeId,
    );
    if (
      !fallbackEdge ||
      fallbackEdge.type !== "error" ||
      fallbackEdge.source !== nodeId
    ) {
      throw ApplicationFailure.create({
        type: "GRAPH_EXECUTION_ERROR",
        message: `Fallback edge ${fallbackEdgeId} for node ${nodeId} must exist, be type "error", and reference the node as source`,
        nonRetryable: true,
      });
    }

    state.selectedEdges.set(nodeId, fallbackEdgeId);
    state.nodeStatuses.set(nodeId, {
      status: "failed",
      error: details.message,
      completedAt: new Date().toISOString(),
    });
    state.completedNodeIds.add(nodeId);
    return;
  }

  state.nodeStatuses.set(nodeId, {
    status: "failed",
    error: details.message,
  });

  if (node.errorPolicy?.retryable === false) {
    throw ApplicationFailure.create({
      type: details.type ?? "GRAPH_EXECUTION_ERROR",
      message: details.message,
      nonRetryable: true,
    });
  }

  throw error;
}

/**
 * Extract error details from unknown error
 */
export function extractErrorDetails(
  error: unknown,
  nodeId: string,
): {
  nodeId: string;
  message: string;
  type?: string;
  retryable?: boolean;
} {
  const message = error instanceof Error ? error.message : String(error);
  const type =
    error && typeof error === "object" && "type" in error
      ? String((error as { type?: string }).type)
      : undefined;
  const retryable =
    error instanceof ApplicationFailure ? !error.nonRetryable : undefined;

  return {
    nodeId,
    message,
    type,
    retryable,
  };
}

/**
 * Throw poll timeout error
 */
export function throwPollTimeout(
  nodeId: string,
  attempt: number,
  reason: "maxAttempts" | "timeout",
): never {
  throw ApplicationFailure.create({
    type: "POLL_TIMEOUT",
    message: `POLL_TIMEOUT: PollUntil node ${nodeId} exceeded ${reason} after ${attempt} attempts`,
    nonRetryable: true,
  });
}
