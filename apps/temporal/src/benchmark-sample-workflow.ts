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

import { executeChild, proxyActivities } from "@temporalio/workflow";
import {
  buildFlatConfidenceMapFromCtx,
  buildFlatPredictionMapFromCtx,
} from "./azure-ocr-field-display-value";
import {
  GRAPH_RUNNER_VERSION,
  type GraphWorkflowConfig,
  type GraphWorkflowInput,
  type GraphWorkflowResult,
} from "./graph-workflow-types";

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
  input: BenchmarkSampleWorkflowInput,
): Promise<BenchmarkSampleWorkflowOutput> {
  const {
    sampleId,
    workflowConfig,
    configHash,
    inputPaths,
    outputBaseDir,
    sampleMetadata,
    predictionOutputDir,
    persistOcrCache,
    parentWorkflowId,
    requestId,
  } = input;

  const primaryInput = inputPaths[0] || "";
  const fileName = primaryInput.split("/").pop() || "document";
  const lowerName = fileName.toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i.test(lowerName);
  const fileType = isImage ? "image" : "pdf";
  const contentType = isImage
    ? lowerName.endsWith(".png")
      ? "image/png"
      : "image/jpeg"
    : "application/pdf";

  const initialCtx: Record<string, unknown> = {
    ...sampleMetadata,
    inputPaths,
    outputBaseDir,
    sampleId,
    documentId: `benchmark-${sampleId}`,
    blobKey: primaryInput,
    fileName,
    fileType,
    contentType,
  };

  const childInput: GraphWorkflowInput = {
    graph: workflowConfig,
    initialCtx,
    configHash,
    runnerVersion: GRAPH_RUNNER_VERSION,
    parentWorkflowId,
    requestId,
  };

  const graphResult = (await executeChild("graphWorkflow", {
    args: [childInput],
  })) as GraphWorkflowResult;

  const predictionData = buildFlatPredictionMapFromCtx(graphResult.ctx);
  const confidenceData = buildFlatConfidenceMapFromCtx(graphResult.ctx);

  const { predictionPath } = await customActivities[
    "benchmark.writePrediction"
  ]({
    predictionData,
    outputDir: predictionOutputDir,
    sampleId,
  });

  if (
    persistOcrCache &&
    graphResult.ctx.ocrResponse !== undefined &&
    graphResult.ctx.ocrResponse !== null
  ) {
    await customActivities["benchmark.persistOcrCache"]({
      sourceRunId: persistOcrCache.sourceRunId,
      sampleId,
      ocrResponse: graphResult.ctx.ocrResponse,
    });
  }

  const outputPaths = extractOutputPaths(graphResult.ctx);
  const success = graphResult.status === "completed";

  const error = success
    ? undefined
    : {
        message: `graphWorkflow status: ${graphResult.status}`,
        failedNodeId:
          typeof graphResult.ctx.failedNodeId === "string"
            ? graphResult.ctx.failedNodeId
            : undefined,
      };

  return {
    sampleId,
    success,
    graphStatus: graphResult.status,
    completedNodes: graphResult.completedNodes.length,
    predictionPath,
    confidenceData,
    outputPaths,
    error,
  };
}

function extractOutputPaths(ctx: Record<string, unknown>): string[] {
  const paths: string[] = [];

  if (Array.isArray(ctx.outputPaths)) {
    for (const p of ctx.outputPaths) {
      if (typeof p === "string") paths.push(p);
    }
  }

  if (typeof ctx.outputPath === "string") {
    paths.push(ctx.outputPath);
  }

  if (Array.isArray(ctx.results)) {
    for (const result of ctx.results) {
      if (result && typeof result === "object" && "outputPath" in result) {
        const r = result as Record<string, unknown>;
        if (typeof r.outputPath === "string") {
          paths.push(r.outputPath);
        }
      }
    }
  }

  if (paths.length === 0 && typeof ctx.outputBaseDir === "string") {
    paths.push(ctx.outputBaseDir);
  }

  return paths;
}
