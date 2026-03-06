/**
 * Benchmark Workflow Execution
 *
 * Executes a GraphWorkflowConfig against a single dataset sample by invoking
 * the existing `graphWorkflow` as a child workflow on the `benchmark-processing`
 * task queue. This ensures benchmarks test the actual execution path.
 *
 * NOTE: This module exports a workflow-level helper function (not a pure activity)
 * because it uses `executeChild` to start child workflows, which is only available
 * in the Temporal workflow context. The benchmark orchestrator (US-022) calls this
 * directly from workflow code.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-019-workflow-execution-activity.md
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 4.2, 13.1
 */

import { executeChild, workflowInfo } from '@temporalio/workflow';
import {
  GRAPH_RUNNER_VERSION,
  type GraphWorkflowConfig,
  type GraphWorkflowInput,
  type GraphWorkflowResult,
} from '../graph-workflow-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenchmarkExecuteInput {
  /** Unique sample identifier from the dataset manifest */
  sampleId: string;

  /** The graph workflow configuration to execute */
  workflowConfig: GraphWorkflowConfig;

  /** SHA-256 hash of the workflow config (for version pinning) */
  configHash: string;

  /** Paths to input files for this sample (materialized on disk) */
  inputPaths: string[];

  /** Base directory for writing per-sample output files */
  outputBaseDir: string;

  /** Additional context to pass to the workflow */
  sampleMetadata: Record<string, unknown>;

  /** Timeout for the child workflow execution in milliseconds */
  timeoutMs?: number;

  /** Task queue to route the child workflow to (defaults to benchmark-processing) */
  taskQueue?: string;
}

export interface BenchmarkExecuteOutput {
  /** The sample ID this result belongs to */
  sampleId: string;

  /** Whether the workflow execution succeeded */
  success: boolean;

  /** The workflow result if successful */
  workflowResult?: GraphWorkflowResult;

  /** Paths to output files produced by the workflow */
  outputPaths: string[];

  /** Error details if the workflow failed */
  error?: {
    message: string;
    failedNodeId?: string;
    type?: string;
  };

  /** Duration of the child workflow execution in milliseconds */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BENCHMARK_TASK_QUEUE = 'benchmark-processing';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Main Function
// ---------------------------------------------------------------------------

/**
 * Execute a GraphWorkflowConfig as a child workflow for a single benchmark sample.
 *
 * This function is called from the benchmark orchestrator workflow context.
 * It invokes `graphWorkflow` as a child workflow on the `benchmark-processing`
 * task queue to ensure isolation from production workloads.
 */
export async function benchmarkExecuteWorkflow(
  params: BenchmarkExecuteInput
): Promise<BenchmarkExecuteOutput> {
  const startTime = Date.now();
  const {
    sampleId,
    workflowConfig,
    configHash,
    inputPaths,
    outputBaseDir,
    sampleMetadata,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    taskQueue = BENCHMARK_TASK_QUEUE,
  } = params;

  const parentWorkflowId = workflowInfo().workflowId;

  console.log(JSON.stringify({
    activity: 'benchmarkExecuteWorkflow',
    event: 'start',
    sampleId,
    parentWorkflowId,
    taskQueue,
    timestamp: new Date().toISOString()
  }));

  try {
    // Build initial context for the child workflow.
    // The graph workflow nodes expect fields like blobKey, documentId, fileName, etc.
    // In benchmark mode, we populate these from the materialized input files.
    const primaryInput = inputPaths[0] || '';
    const fileName = primaryInput.split('/').pop() || 'document';
    const lowerName = fileName.toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i.test(lowerName);
    const fileType = isImage ? 'image' : 'pdf';
    const contentType = isImage
      ? (lowerName.endsWith('.png') ? 'image/png' : 'image/jpeg')
      : 'application/pdf';

    const initialCtx: Record<string, unknown> = {
      ...sampleMetadata,
      inputPaths,
      outputBaseDir,
      sampleId,
      // Fields expected by graph workflow nodes (e.g., file.prepare)
      documentId: `benchmark-${sampleId}`,
      blobKey: primaryInput,
      fileName,
      fileType,
      contentType,
    };

    const childWorkflowInput: GraphWorkflowInput = {
      graph: workflowConfig,
      initialCtx,
      configHash,
      runnerVersion: GRAPH_RUNNER_VERSION,
      parentWorkflowId,
    };

    // Execute the graphWorkflow as a child workflow on the specified task queue
    const childResult = (await executeChild('graphWorkflow', {
      args: [childWorkflowInput],
      taskQueue,
      workflowId: `benchmark-${parentWorkflowId}-${sampleId}`,
      workflowExecutionTimeout: timeoutMs,
    })) as GraphWorkflowResult;

    // Collect output paths from the workflow context
    const outputPaths = extractOutputPaths(childResult.ctx);

    const durationMs = Date.now() - startTime;

    console.log(JSON.stringify({
      activity: 'benchmarkExecuteWorkflow',
      event: 'complete',
      sampleId,
      status: childResult.status,
      completedNodes: childResult.completedNodes.length,
      outputPaths: outputPaths.length,
      durationMs,
      timestamp: new Date().toISOString()
    }));

    if (childResult.status === 'failed') {
      return {
        sampleId,
        success: false,
        workflowResult: childResult,
        outputPaths,
        error: {
          message: `Workflow completed with status: failed`,
          failedNodeId: findFailedNodeId(childResult),
        },
        durationMs,
      };
    }

    return {
      sampleId,
      success: true,
      workflowResult: childResult,
      outputPaths,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorType = extractErrorType(error);

    console.log(JSON.stringify({
      activity: 'benchmarkExecuteWorkflow',
      event: 'error',
      sampleId,
      error: errorMessage,
      errorType,
      durationMs,
      timestamp: new Date().toISOString()
    }));

    // Return failure result without crashing the parent benchmark workflow
    return {
      sampleId,
      success: false,
      outputPaths: [],
      error: {
        message: errorMessage,
        type: errorType,
      },
      durationMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract output file paths from the workflow context.
 * Looks for common output path patterns in the context.
 */
function extractOutputPaths(ctx: Record<string, unknown>): string[] {
  const paths: string[] = [];

  // Check for explicit outputPaths in context
  if (Array.isArray(ctx.outputPaths)) {
    for (const p of ctx.outputPaths) {
      if (typeof p === 'string') {
        paths.push(p);
      }
    }
  }

  // Check for outputPath (singular) in context
  if (typeof ctx.outputPath === 'string') {
    paths.push(ctx.outputPath);
  }

  // Check for results that contain file paths
  if (Array.isArray(ctx.results)) {
    for (const result of ctx.results) {
      if (result && typeof result === 'object' && 'outputPath' in result) {
        const resultObj = result as Record<string, unknown>;
        if (typeof resultObj.outputPath === 'string') {
          paths.push(resultObj.outputPath);
        }
      }
    }
  }

  // If no paths found but outputBaseDir is in ctx, use that
  if (paths.length === 0 && typeof ctx.outputBaseDir === 'string') {
    paths.push(ctx.outputBaseDir);
  }

  return paths;
}

/**
 * Try to extract the failed node ID from a workflow result.
 */
function findFailedNodeId(result: GraphWorkflowResult): string | undefined {
  // Check if there's error info in the context that might contain a failed node ID
  if (result.ctx && typeof result.ctx.failedNodeId === 'string') {
    return result.ctx.failedNodeId;
  }
  return undefined;
}

/**
 * Extract error type string from an error.
 */
function extractErrorType(error: unknown): string {
  if (error instanceof Error) {
    if ('type' in error && typeof (error as Record<string, unknown>).type === 'string') {
      return (error as Record<string, unknown>).type as string;
    }
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return 'TIMEOUT';
    }
    if (error.message.includes('cancelled') || error.message.includes('Cancelled')) {
      return 'CANCELLED';
    }
    return 'WORKFLOW_EXECUTION_ERROR';
  }
  return 'UNKNOWN_ERROR';
}
