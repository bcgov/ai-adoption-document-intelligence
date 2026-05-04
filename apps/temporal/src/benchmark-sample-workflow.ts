/**
 * Benchmark Sample Workflow (wrapper child)
 *
 * Runs the generic `graphWorkflow` as its own child and performs benchmark-specific
 * post-processing (writing the flattened prediction file and persisting OCR cache)
 * inside this workflow's context — so the heavy `ocrResponse` and `cleanedResult`
 * payloads stay in this child's history, not the parent benchmark orchestrator's.
 *
 * Returns only a slim summary so the parent's history does not grow with per-sample
 * data. See docs-md/benchmarking/temporal-history-bloat-fix.md for context.
 */

import { proxyActivities } from "@temporalio/workflow";
import { type GraphWorkflowConfig } from "./graph-workflow-types";

export interface BenchmarkSampleWorkflowInput {
  sampleId: string;
  workflowConfig: GraphWorkflowConfig;
  configHash: string;
  inputPaths: string[];
  outputBaseDir: string;
  /** Free-form metadata forwarded into the graphWorkflow initialCtx. */
  sampleMetadata: Record<string, unknown>;
  /** Directory under which prediction JSON files should be written. */
  predictionOutputDir: string;
  /**
   * If set, the wrapper persists the OCR response to BenchmarkOcrCache for this run.
   * The activity input is stored in *this* workflow's history, not the parent's.
   */
  persistOcrCache?: { sourceRunId: string };
  parentWorkflowId?: string;
  requestId?: string;
}

export interface BenchmarkSampleWorkflowOutput {
  sampleId: string;
  success: boolean;
  /** Status reported by the inner graphWorkflow (when it ran to completion). */
  graphStatus?: "completed" | "failed" | "cancelled";
  /** Number of graph nodes the inner workflow completed (for logging). */
  completedNodes?: number;
  /** Path to the per-sample prediction JSON written by benchmark.writePrediction. */
  predictionPath?: string;
  /** Per-field confidence map flattened from the inner workflow ctx. */
  confidenceData?: Record<string, number | null>;
  /** Output paths extracted from the inner workflow ctx. */
  outputPaths: string[];
  error?: { message: string; failedNodeId?: string };
}

interface BenchmarkActivities {
  "benchmark.writePrediction": (input: {
    predictionData: Record<string, unknown>;
    outputDir: string;
    sampleId: string;
  }) => Promise<{ predictionPath: string }>;
  "benchmark.persistOcrCache": (input: {
    sourceRunId: string;
    sampleId: string;
    ocrResponse: unknown;
  }) => Promise<void>;
}

const customActivities = proxyActivities<BenchmarkActivities>({
  startToCloseTimeout: "1 minute",
  retry: { maximumAttempts: 3 },
});

export async function benchmarkSampleWorkflow(
  _input: BenchmarkSampleWorkflowInput,
): Promise<BenchmarkSampleWorkflowOutput> {
  // Reference customActivities to keep proxy alive for tests / future tasks.
  void customActivities;
  throw new Error("not implemented");
}
