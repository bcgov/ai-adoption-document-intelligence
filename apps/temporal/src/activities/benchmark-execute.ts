/**
 * Benchmark Workflow Execution
 *
 * Per-sample dispatcher called from `benchmarkRunWorkflow`. Starts the wrapper
 * child workflow `benchmarkSampleWorkflow` (which internally runs the generic
 * `graphWorkflow` and writes prediction / persists OCR cache from inside its
 * own context) on the `benchmark-processing` task queue. The wrapper returns a
 * slim summary so the parent benchmark orchestrator's history stays small.
 *
 * NOTE: This module exports a workflow-level helper function (not a pure activity)
 * because it uses `executeChild` to start child workflows, which is only available
 * in the Temporal workflow context.
 */

import { executeChild, workflowInfo } from "@temporalio/workflow";
import type { BenchmarkSampleWorkflowOutput } from "../benchmark-sample-workflow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkExecuteInput {
  sampleId: string;
  workflowVersionId: string;
  configHash: string;
  inputPaths: string[];
  outputBaseDir: string;
  sampleMetadata: Record<string, unknown>;
  predictionOutputDir: string;
  persistOcrCache?: { sourceRunId: string };
  ocrCacheBaselineRunId?: string;
  workflowConfigOverrides?: Record<string, unknown>;
  /** Dataset tenant scope for OCR blob writes (benchmark samples have no Document row). */
  groupId?: string;
  timeoutMs?: number;
  taskQueue?: string;
  requestId?: string;
}

export interface BenchmarkExecuteOutput {
  sampleId: string;
  success: boolean;
  /** Path to per-sample prediction JSON written by the wrapper child. */
  predictionPath?: string;
  /** Per-field confidence map flattened from the inner workflow ctx. */
  confidenceData?: Record<string, number | null>;
  /** Output paths reported by the inner workflow ctx. */
  outputPaths: string[];
  error?: { message: string; failedNodeId?: string; type?: string };
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCHMARK_TASK_QUEUE = "benchmark-processing";
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

export async function benchmarkExecuteWorkflow(
  params: BenchmarkExecuteInput,
): Promise<BenchmarkExecuteOutput> {
  const startTime = Date.now();
  const {
    sampleId,
    workflowVersionId,
    configHash,
    inputPaths,
    outputBaseDir,
    sampleMetadata,
    predictionOutputDir,
    persistOcrCache,
    ocrCacheBaselineRunId,
    workflowConfigOverrides,
    groupId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    taskQueue = BENCHMARK_TASK_QUEUE,
    requestId,
  } = params;

  const parentWorkflowId = workflowInfo().workflowId;
  const childWorkflowId = `benchmark-${parentWorkflowId}-${sampleId}`;

  console.log(
    JSON.stringify({
      activity: "benchmarkExecuteWorkflow",
      event: "start",
      sampleId,
      parentWorkflowId,
      taskQueue,
      childWorkflowId,
      timeoutMs,
      timestamp: new Date().toISOString(),
    }),
  );

  try {
    const childResult = (await executeChild("benchmarkSampleWorkflow", {
      args: [
        {
          sampleId,
          workflowVersionId,
          configHash,
          inputPaths,
          outputBaseDir,
          sampleMetadata,
          predictionOutputDir,
          persistOcrCache,
          ocrCacheBaselineRunId,
          workflowConfigOverrides,
          groupId,
          parentWorkflowId,
          requestId,
        },
      ],
      taskQueue,
      workflowId: childWorkflowId,
      workflowExecutionTimeout: timeoutMs,
    })) as BenchmarkSampleWorkflowOutput;

    const durationMs = Date.now() - startTime;

    console.log(
      JSON.stringify({
        activity: "benchmarkExecuteWorkflow",
        event: "complete",
        sampleId,
        status:
          childResult.graphStatus ??
          (childResult.success ? "completed" : "failed"),
        completedNodes: childResult.completedNodes ?? 0,
        outputPaths: childResult.outputPaths.length,
        durationMs,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      sampleId,
      success: childResult.success,
      predictionPath: childResult.predictionPath,
      confidenceData: childResult.confidenceData,
      outputPaths: childResult.outputPaths,
      error: childResult.error
        ? {
            message: childResult.error.message,
            failedNodeId: childResult.error.failedNodeId,
          }
        : undefined,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorType = extractErrorType(error);
    const errorName = error instanceof Error ? error.name : undefined;
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorCauseRaw =
      error && typeof error === "object" && "cause" in error
        ? (error as { cause?: unknown }).cause
        : undefined;
    const errorCause =
      errorCauseRaw instanceof Error
        ? { name: errorCauseRaw.name, message: errorCauseRaw.message }
        : errorCauseRaw;

    console.log(
      JSON.stringify({
        activity: "benchmarkExecuteWorkflow",
        event: "error",
        sampleId,
        parentWorkflowId,
        childWorkflowId,
        taskQueue,
        timeoutMs,
        error: errorMessage,
        errorName,
        errorStack,
        errorCause,
        errorType,
        durationMs,
        timestamp: new Date().toISOString(),
      }),
    );

    return {
      sampleId,
      success: false,
      outputPaths: [],
      error: { message: errorMessage, type: errorType },
      durationMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractErrorType(error: unknown): string {
  if (error instanceof Error) {
    if (
      "type" in error &&
      typeof (error as Record<string, unknown>).type === "string"
    ) {
      return (error as Record<string, unknown>).type as string;
    }
    if (
      error.message.includes("timeout") ||
      error.message.includes("Timeout")
    ) {
      return "TIMEOUT";
    }
    if (
      error.message.includes("cancelled") ||
      error.message.includes("Cancelled")
    ) {
      return "CANCELLED";
    }
    return "WORKFLOW_EXECUTION_ERROR";
  }
  return "UNKNOWN_ERROR";
}
