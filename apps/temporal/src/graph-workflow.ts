/**
 * Graph Workflow - Generic DAG Workflow Execution
 *
 * This workflow function replaces the legacy hardcoded workflow with a generic
 * data-driven interpreter that can execute any workflow graph definition.
 *
 * See docs-md/workflows/DAG_WORKFLOW_ENGINE.md Section 5
 */

import {
  ApplicationFailure,
  CancellationScope,
  defineQuery,
  defineSignal,
  isCancellation,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import {
  ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS,
  type ActivityOutputCacheFindFreshInput,
  type ActivityOutputCacheFindFreshResult,
  type ActivityOutputCacheUpsertInput,
} from "./activities/cache/activity-output-cache.types";
import type { RecordWorkflowLifecycleInput } from "./billing/record-workflow-lifecycle.activity";
import type { CachedActivityDeps } from "./cache/cached-activity";
import { runGraphExecution } from "./graph-engine";
import { validateGraphConfigForExecution } from "./graph-schema-validator";
import {
  getNodeStatusesQuery,
  type NodeRunStatus,
} from "./graph-workflow-queries";
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

/**
 * Phase 4 (US-133) — cache-activity proxy typed for the workflow.
 * Routes the two cache operations through Temporal activities so the
 * worker decorator can run in-replay-safe workflow code while reads/
 * writes still go to Postgres. The dot-namespaced keys match the
 * registry entries in `apps/temporal/src/activities.ts`.
 */
type CacheActivities = {
  "activityOutputCache.findFresh": (
    input: ActivityOutputCacheFindFreshInput,
  ) => Promise<ActivityOutputCacheFindFreshResult | null>;
  "activityOutputCache.upsert": (
    input: ActivityOutputCacheUpsertInput,
  ) => Promise<void>;
};

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
  "document.getStatus": (params: { documentId: string }) => Promise<{
    status: string;
  }>;
};

type BillingActivities = {
  "billing.recordWorkflowLifecycle": (
    input: RecordWorkflowLifecycleInput,
  ) => Promise<unknown>;
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
      // JSON.stringify(undefined) returns undefined, not a string — guard so a
      // ctx key holding `undefined` doesn't crash the getStatus query handler.
      if (valueStr !== undefined && valueStr.length > 1000) {
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
  // Phase 4 (US-135) — per-node live run status surfaced through the
  // `getNodeStatusesQuery` handler. Distinct from `nodeStatuses` (the
  // legacy `getStatus` payload): the new shape carries "succeeded" /
  // "skipped" (cache hit) / "failed" semantics + cache-row identifiers.
  // The map's object identity is preserved across the workflow
  // lifetime so the query handler always returns the latest state.
  const nodeRunStatuses: Record<string, NodeRunStatus> = {};
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

  // Phase 4 (US-135) — register the per-node run-status query handler
  // BEFORE any node runs so the canvas's very-first poll observes a
  // (possibly empty) map rather than a "query handler not found"
  // error. The handler returns a live snapshot — the underlying object
  // is mutated in place by the runner.
  setHandler(getNodeStatusesQuery, () => nodeRunStatuses);

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

    // Phase 4 (US-133 Scenario 2): wire the cache-activity proxy once
    // per workflow execution. The proxy lifetime is the workflow's
    // lifetime; every per-node activity dispatch shares it.
    //
    // The cache is editor-Try-only: production-scope caching is deferred
    // (Phase 4.x) pending a GDPR review, so only a run that both carries a
    // `workflowLineageId` (the cache's tenancy scope) and was started with
    // `trigger === "try"` gets cacheDeps. Everything else — production
    // `"api"` runs, legacy tests, pre-Phase-4 callers, and inputs recorded
    // before `trigger` existed — bypasses cache reads AND writes.
    let cacheDeps: CachedActivityDeps | undefined;
    if (input.workflowLineageId && input.trigger === "try") {
      const cacheProxy = proxyActivities<CacheActivities>(
        ACTIVITY_OUTPUT_CACHE_ACTIVITY_OPTIONS,
      );
      cacheDeps = {
        findFresh: (req) => cacheProxy["activityOutputCache.findFresh"](req),
        upsert: (req) => cacheProxy["activityOutputCache.upsert"](req),
      };
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
      nodeRunStatuses,
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
      workflowLineageId: input.workflowLineageId ?? null,
      cacheDeps,
      // Change A/A+ — thread the run trigger so both `executeChild` sites
      // (map fan-out and library children) hand it to their children and
      // Try-only caching survives fan-out.
      trigger: input.trigger,
      // Change M — current child-workflow nesting depth (0 for a run
      // started from the API); the executors increment it per spawn.
      childDepth: input.childDepth ?? 0,
      // Phase 6 Milestone C (US-170) — populate workflowRunId from
      // `workflowInfo()` here (it's a workflow-context-only API; the
      // runner module can't reach it directly).
      workflowRunId: workflowInfo().workflowId,
      lastError,
    });

    overallStatus = result.status;

    // Post-execution hook: If workflow completed successfully, transition documents
    // from extracted to complete (documents that didn't go through HITL).
    // Documents at awaiting_review (went through HumanGate) are left alone - HITL
    // approval will transition them to complete.
    if (
      result.status === "completed" &&
      input.initialCtx.documentId &&
      typeof input.initialCtx.documentId === "string"
    ) {
      const postExecutionProxy = proxyActivities<PreExecutionActivities>({
        startToCloseTimeout: "30s",
        retry: { maximumAttempts: 5 },
      });

      try {
        const { status: currentStatus } = await postExecutionProxy[
          "document.getStatus"
        ]({
          documentId: input.initialCtx.documentId,
        });

        // Only transition from extracted to complete
        // Leave awaiting_review alone (HITL handles that transition)
        if (currentStatus === "extracted") {
          await postExecutionProxy["document.updateStatus"]({
            documentId: input.initialCtx.documentId,
            status: "complete",
          });

          console.log(
            `[GraphWorkflow] Post-execution: Updated document ${input.initialCtx.documentId} from extracted to complete`,
          );
        } else {
          console.log(
            `[GraphWorkflow] Post-execution: Document ${input.initialCtx.documentId} at status ${currentStatus}, skipping transition to complete`,
          );
        }
      } catch (error) {
        // Don't fail the workflow if post-execution hook fails
        console.warn(
          `[GraphWorkflow] Post-execution hook failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Record workflow terminal lifecycle billing event
    if (input.groupId) {
      try {
        const billingProxy = proxyActivities<BillingActivities>({
          startToCloseTimeout: "30s",
          retry: { maximumAttempts: 3 },
        });
        await CancellationScope.nonCancellable(() =>
          billingProxy["billing.recordWorkflowLifecycle"]({
            workflowExecutionId: workflowInfo().runId,
            groupId: input.groupId,
            status: result.status,
          }),
        );
      } catch (billingError) {
        console.warn(
          `[GraphWorkflow] Billing lifecycle event failed: ${billingError instanceof Error ? billingError.message : String(billingError)}`,
        );
      }
    }

    return result;
  } catch (error) {
    overallStatus = isCancellation(error) ? "cancelled" : "failed";

    // Record workflow_failed/cancelled billing event before rethrowing.
    // Wrapped in nonCancellable so the activity fires even when Temporal delivers
    // a CancelledFailure (e.g. workflowExecutionTimeout or client.cancel()).
    if (input.groupId) {
      try {
        const billingProxy = proxyActivities<BillingActivities>({
          startToCloseTimeout: "30s",
          retry: { maximumAttempts: 3 },
        });
        await CancellationScope.nonCancellable(() =>
          billingProxy["billing.recordWorkflowLifecycle"]({
            workflowExecutionId: workflowInfo().runId,
            groupId: input.groupId,
            status: overallStatus as "completed" | "failed" | "cancelled",
          }),
        );
      } catch (billingError) {
        console.warn(
          `[GraphWorkflow] Billing lifecycle event (failed) failed: ${billingError instanceof Error ? billingError.message : String(billingError)}`,
        );
      }
    }

    if (error instanceof Error) {
      workflowError = error.message;
    }

    // Failure-path status transition: a failed workflow must move the document
    // out of `ongoing_ocr` ("Processing") into a terminal `failed` status.
    // Without this, OCR failures (e.g. Azure rejecting a password-protected or
    // unsupported PDF) leave the document orphaned in "Processing" forever — it
    // never completes, and `deleteDocument` refuses to remove in-flight docs.
    // Guarded to only transition from an in-flight status so a doc that already
    // progressed (extracted/awaiting_review) is never clobbered. Skipped on
    // cancellation (the doc is being torn down, and an activity call in a
    // cancelled scope would itself fail). A status-update failure here is
    // swallowed so it can never mask the original workflow error.
    if (
      !cancelled &&
      input.initialCtx.documentId &&
      typeof input.initialCtx.documentId === "string"
    ) {
      const documentId = input.initialCtx.documentId;
      try {
        const failureProxy = proxyActivities<PreExecutionActivities>({
          startToCloseTimeout: "30s",
          retry: { maximumAttempts: 5 },
        });
        const { status: currentStatus } = await failureProxy[
          "document.getStatus"
        ]({ documentId });
        if (currentStatus === "ongoing_ocr" || currentStatus === "pre_ocr") {
          await failureProxy["document.updateStatus"]({
            documentId,
            status: "failed",
          });
          console.log(
            `[GraphWorkflow] Failure hook: set document ${documentId} to failed`,
          );
        } else {
          console.log(
            `[GraphWorkflow] Failure hook: document ${documentId} at status ${currentStatus}, leaving unchanged`,
          );
        }
      } catch (statusError) {
        console.warn(
          `[GraphWorkflow] Failure hook: could not set document ${documentId} to failed: ${
            statusError instanceof Error
              ? statusError.message
              : String(statusError)
          }`,
        );
      }
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
