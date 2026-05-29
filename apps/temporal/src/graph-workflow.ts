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
  type GraphWorkflowExecutionInput,
  type GraphWorkflowInput,
  type GraphWorkflowProgress,
  type GraphWorkflowResult,
  type GraphWorkflowStatus,
  type NodeStatus,
} from "./graph-workflow-types";
import { isOcrPayloadRef } from "./ocr-payload-ref-types";

type PreExecutionActivities = {
  "document.updateStatus": (params: {
    documentId: string;
    status: string;
    apimRequestId?: string;
  }) => Promise<void>;
  getWorkflowGraphConfig: (params: {
    workflowId: string;
    workflowConfigOverrides?: Record<string, unknown>;
  }) => Promise<{
    graph: GraphWorkflowExecutionInput["graph"];
    workflowVersionId: string;
    configHash: string;
  }>;
};

// Workflow type constant
export const GRAPH_WORKFLOW_TYPE = "graphWorkflow";

// Query definitions
export const getStatus = defineQuery<GraphWorkflowStatus>("getStatus");
export const getProgress = defineQuery<GraphWorkflowProgress>("getProgress");

// Signal definitions
export const cancelSignal = defineSignal<[CancelSignal]>("cancel");

function redactCtxForQuery(
  ctx: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ctx).map(([key, value]) => {
      if (isOcrPayloadRef(value)) {
        return [
          key,
          {
            documentId: value.documentId,
            status: value.status,
            byteLength: value.byteLength,
            storage: value.storage,
          },
        ];
      }
      const valueStr = JSON.stringify(value);
      if (valueStr.length > 1000) {
        return [key, "<redacted: large value>"];
      }
      return [key, value];
    }),
  );
}

/**
 * Main graph workflow function
 *
 * Executes a DAG workflow definition with query/signal support for monitoring and control.
 */
export async function graphWorkflow(
  input: GraphWorkflowInput,
): Promise<GraphWorkflowResult> {
  const currentNodes: string[] = [];
  const completedNodeIds = new Set<string>();
  const nodeStatuses = new Map<string, NodeStatus>();
  let overallStatus: "running" | "completed" | "failed" | "cancelled" =
    "running";
  let cancelled = false;
  let cancelMode: "graceful" | "immediate" = "graceful";
  const ctx: Record<string, unknown> = {};
  let workflowError: string | undefined;
  let loadedGraph: GraphWorkflowExecutionInput["graph"] | undefined;
  const lastError: {
    current?: {
      nodeId: string;
      message: string;
      type?: string;
      retryable?: boolean;
    };
  } = {};

  setHandler(getStatus, (): GraphWorkflowStatus => {
    return {
      currentNodes,
      nodeStatuses: Object.fromEntries(nodeStatuses),
      overallStatus,
      ctx: redactCtxForQuery(ctx),
      error: workflowError,
      lastError: lastError.current,
    };
  });

  setHandler(getProgress, (): GraphWorkflowProgress => {
    const totalCount = loadedGraph ? Object.keys(loadedGraph.nodes).length : 0;
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

  setHandler(cancelSignal, (signal: CancelSignal) => {
    cancelled = true;
    cancelMode = signal.mode;
    console.log(
      `[GraphWorkflow] Cancellation requested with mode: ${cancelMode}`,
    );
  });

  try {
    enforceRunnerVersion(input.runnerVersion);

    const activityProxy = proxyActivities<PreExecutionActivities>({
      startToCloseTimeout: "30s",
      retry: { maximumAttempts: 3 },
    });

    const loaded = await activityProxy.getWorkflowGraphConfig({
      workflowId: input.workflowVersionId,
      ...(input.workflowConfigOverrides &&
      Object.keys(input.workflowConfigOverrides).length > 0
        ? { workflowConfigOverrides: input.workflowConfigOverrides }
        : {}),
    });

    if (loaded.configHash !== input.configHash) {
      throw ApplicationFailure.create({
        type: "CONFIG_HASH_MISMATCH",
        message: `Workflow config hash mismatch for ${input.workflowVersionId}`,
        nonRetryable: true,
      });
    }

    loadedGraph = loaded.graph;

    const validation = validateGraphConfigForExecution(loadedGraph);

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

    if (
      input.initialCtx.documentId &&
      typeof input.initialCtx.documentId === "string"
    ) {
      const updateStatusActivity = activityProxy["document.updateStatus"];

      await updateStatusActivity({
        documentId: input.initialCtx.documentId,
        status: "ongoing_ocr",
      });

      console.log(
        `[GraphWorkflow] Pre-execution: Updated document ${input.initialCtx.documentId} status to ongoing_ocr`,
      );
    }

    for (const nodeId of Object.keys(loadedGraph.nodes)) {
      nodeStatuses.set(nodeId, { status: "pending" });
    }

    const executionInput: GraphWorkflowExecutionInput = {
      ...input,
      workflowVersionId: loaded.workflowVersionId,
      graph: loadedGraph,
    };

    const result = await runGraphExecution(executionInput, {
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
      workflowVersionId: loaded.workflowVersionId,
      requestId: input.requestId,
      groupId: input.groupId ?? null,
      workflowConfigOverrides: input.workflowConfigOverrides,
      lastError,
    });

    overallStatus = result.status;
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
