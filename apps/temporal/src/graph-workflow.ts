/**
 * Graph Workflow - Generic DAG Workflow Execution
 *
 * This workflow function replaces the legacy hardcoded workflow with a generic
 * data-driven interpreter that can execute any workflow graph definition.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5
 */

import {
  ApplicationFailure,
  defineQuery,
  defineSignal,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import { runGraphExecution } from "./graph-engine";
import { validateGraphConfigForExecution } from "./graph-schema-validator";
import {
  type CancelSignal,
  GRAPH_RUNNER_VERSION,
  type GraphWorkflowInput,
  type GraphWorkflowProgress,
  type GraphWorkflowResult,
  type GraphWorkflowStatus,
  type NodeStatus,
} from "./graph-workflow-types";

type PreExecutionActivities = {
  "document.updateStatus": (params: {
    documentId: string;
    status: string;
    apimRequestId?: string;
  }) => Promise<void>;
};

// Workflow type constant
export const GRAPH_WORKFLOW_TYPE = "graphWorkflow";

// Query definitions
export const getStatus = defineQuery<GraphWorkflowStatus>("getStatus");
export const getProgress = defineQuery<GraphWorkflowProgress>("getProgress");

// Signal definitions
export const cancelSignal = defineSignal<[CancelSignal]>("cancel");

/**
 * Main graph workflow function
 *
 * Executes a DAG workflow definition with query/signal support for monitoring and control.
 */
export async function graphWorkflow(
  input: GraphWorkflowInput,
): Promise<GraphWorkflowResult> {
  // State variables for queries and signals
  const currentNodes: string[] = [];
  const completedNodeIds = new Set<string>();
  const nodeStatuses = new Map<string, NodeStatus>();
  let overallStatus: "running" | "completed" | "failed" | "cancelled" =
    "running";
  let cancelled = false;
  let cancelMode: "graceful" | "immediate" = "graceful";
  let ctx: Record<string, unknown> = {
    __workflowMetadata: {
      groupId: input.groupId ?? null,
      workflowId: workflowInfo().workflowId,
    },
  };
  let workflowError: string | undefined;
  const lastError: {
    current?: {
      nodeId: string;
      message: string;
      type?: string;
      retryable?: boolean;
    };
  } = {};

  // Set up query handlers
  setHandler(getStatus, (): GraphWorkflowStatus => {
    // Redact large ctx values for performance
    const redactedCtx = Object.fromEntries(
      Object.entries(ctx).map(([key, value]) => {
        const valueStr = JSON.stringify(value);
        if (valueStr.length > 1000) {
          return [key, "<redacted: large value>"];
        }
        return [key, value];
      }),
    );

    return {
      currentNodes,
      nodeStatuses: Object.fromEntries(nodeStatuses),
      overallStatus,
      ctx: redactedCtx,
      error: workflowError,
      lastError: lastError.current,
    };
  });

  setHandler(getProgress, (): GraphWorkflowProgress => {
    const totalCount = Object.keys(input.graph.nodes).length;
    const completedCount = completedNodeIds.size;
    const progressPercentage =
      totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      completedCount,
      totalCount,
      currentNodes,
      progressPercentage,
    };
  });

  // Set up signal handler for cancellation
  setHandler(cancelSignal, (signal: CancelSignal) => {
    cancelled = true;
    cancelMode = signal.mode;
    console.log(
      `[GraphWorkflow] Cancellation requested with mode: ${cancelMode}`,
    );
  });

  try {
    enforceRunnerVersion(input.runnerVersion);

    // Step 1: Validate graph config
    const validation = validateGraphConfigForExecution(input.graph);

    if (!validation.valid) {
      const errorMessages = validation.errors
        .map((e) => `${e.path}: ${e.message}`)
        .join("; ");
      throw ApplicationFailure.create({
        type: "GRAPH_VALIDATION_ERROR",
        message: `Graph validation failed: ${errorMessages}`,
        nonRetryable: true,
        details: validation.errors,
      });
    }

    // Step 2: Pre-execution hook - automatically update document status
    // This ensures status is set before workflow processing begins
    if (
      input.initialCtx.documentId &&
      typeof input.initialCtx.documentId === "string"
    ) {
      const activityProxy = proxyActivities<PreExecutionActivities>({
        startToCloseTimeout: "30s",
        retry: { maximumAttempts: 5 },
      });
      const updateStatusActivity = activityProxy["document.updateStatus"];

      await updateStatusActivity({
        documentId: input.initialCtx.documentId,
        status: "ongoing_ocr",
      });

      console.log(
        `[GraphWorkflow] Pre-execution: Updated document ${input.initialCtx.documentId} status to ongoing_ocr`,
      );
    }

    // Step 3: Run graph execution
    for (const nodeId of Object.keys(input.graph.nodes)) {
      nodeStatuses.set(nodeId, { status: "pending" });
    }

    const result = await runGraphExecution(input, {
      currentNodes,
      completedNodeIds,
      nodeStatuses,
      cancelled: () => cancelled,
      cancelMode: () => cancelMode,
      ctx,
      selectedEdges: new Map(),
      mapBranchResults: new Map(),
      configHash: input.configHash,
      runnerVersion: input.runnerVersion,
      lastError,
    });

    // Update final state
    overallStatus = result.status;
    ctx = result.ctx;

    return result;
  } catch (error) {
    overallStatus = "failed";
    if (error instanceof Error) {
      workflowError = error.message;
    }
    throw error;
  }
}

function enforceRunnerVersion(inputVersion: string): void {
  if (inputVersion === GRAPH_RUNNER_VERSION) {
    return;
  }

  const inputMajor = getMajorVersion(inputVersion);
  const currentMajor = getMajorVersion(GRAPH_RUNNER_VERSION);

  if (
    inputMajor !== null &&
    currentMajor !== null &&
    inputMajor !== currentMajor
  ) {
    throw ApplicationFailure.create({
      type: "RUNNER_VERSION_MISMATCH",
      message: `Graph runner version mismatch: input=${inputVersion}, current=${GRAPH_RUNNER_VERSION}`,
      nonRetryable: true,
    });
  }

  if (workflowInfo().unsafe.isReplaying) {
    console.warn(
      `[GraphWorkflow] Runner version mismatch: input=${inputVersion}, current=${GRAPH_RUNNER_VERSION}`,
    );
  }
}

function getMajorVersion(version: string): number | null {
  const match = version.match(/^(\d+)\./);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}
