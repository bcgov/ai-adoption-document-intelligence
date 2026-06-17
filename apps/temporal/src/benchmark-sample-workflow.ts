/**
 * Benchmark Sample Workflow (wrapper child)
 *
 * Runs the generic `graphWorkflow` as its own child and performs benchmark-specific
 * post-processing from blob refs — heavy payloads stay in blob storage, not parent history.
 */

import { executeChild, proxyActivities } from "@temporalio/workflow";
import {
  GRAPH_RUNNER_VERSION,
  type GraphWorkflowInput,
  type GraphWorkflowResult,
} from "./graph-workflow-types";
import type { OcrPayloadRef } from "./ocr-payload-ref";

export interface BenchmarkSampleWorkflowInput {
  sampleId: string;
  workflowVersionId: string;
  configHash: string;
  inputPaths: string[];
  outputBaseDir: string;
  sampleMetadata: Record<string, unknown>;
  predictionOutputDir: string;
  persistOcrCache?: { sourceRunId: string };
  /** When set, load OCR cache in this wrapper (not the parent orchestrator). */
  ocrCacheBaselineRunId?: string;
  workflowConfigOverrides?: Record<string, unknown>;
  /** Dataset tenant scope; required for OCR ref blob paths on synthetic benchmark documents. */
  groupId?: string;
  parentWorkflowId?: string;
  requestId?: string;
}

export interface BenchmarkSampleWorkflowOutput {
  sampleId: string;
  success: boolean;
  graphStatus?: "completed" | "failed" | "cancelled";
  completedNodes?: number;
  predictionPath?: string;
  confidenceData?: Record<string, number | null>;
  outputPaths: string[];
  error?: { message: string; failedNodeId?: string };
}

interface BenchmarkActivities {
  "benchmark.loadOcrCache": (input: {
    sourceRunId: string;
    sampleId: string;
  }) => Promise<{ ocrResponse: unknown | null }>;
  "benchmark.flattenPredictionFromRefs": (input: {
    cleanedResultRef?: OcrPayloadRef;
    ocrResultRef?: OcrPayloadRef;
  }) => Promise<{
    predictionData: Record<string, unknown>;
    confidenceData: Record<string, number | null>;
  }>;
  "benchmark.writePrediction": (input: {
    predictionData: Record<string, unknown>;
    outputDir: string;
    sampleId: string;
  }) => Promise<{ predictionPath: string }>;
  "benchmark.persistOcrCache": (input: {
    sourceRunId: string;
    sampleId: string;
    ocrResponseRef?: OcrPayloadRef;
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
    ...(groupId ? { groupId } : {}),
  };

  if (ocrCacheBaselineRunId) {
    const loaded = await customActivities["benchmark.loadOcrCache"]({
      sourceRunId: ocrCacheBaselineRunId,
      sampleId,
    });
    if (loaded.ocrResponse === null || loaded.ocrResponse === undefined) {
      throw new Error(
        `OCR cache miss for sample ${sampleId} (baseline run ${ocrCacheBaselineRunId})`,
      );
    }
    initialCtx.__benchmarkOcrCache = { ocrResponse: loaded.ocrResponse };
  }

  const childInput: GraphWorkflowInput = {
    workflowVersionId,
    configHash,
    initialCtx,
    runnerVersion: GRAPH_RUNNER_VERSION,
    groupId: groupId ?? null,
    parentWorkflowId,
    requestId,
    ...(workflowConfigOverrides &&
    Object.keys(workflowConfigOverrides).length > 0
      ? { workflowConfigOverrides }
      : {}),
  };

  const graphResult = (await executeChild("graphWorkflow", {
    args: [childInput],
  })) as GraphWorkflowResult;

  const { predictionData, confidenceData } = await customActivities[
    "benchmark.flattenPredictionFromRefs"
  ]({
    cleanedResultRef: graphResult.refs?.cleanedResultRef,
    ocrResultRef: graphResult.refs?.ocrResultRef,
  });

  const { predictionPath } = await customActivities[
    "benchmark.writePrediction"
  ]({
    predictionData,
    outputDir: predictionOutputDir,
    sampleId,
  });

  if (persistOcrCache && graphResult.refs?.ocrResponseRef?.blobPath) {
    await customActivities["benchmark.persistOcrCache"]({
      sourceRunId: persistOcrCache.sourceRunId,
      sampleId,
      ocrResponseRef: graphResult.refs.ocrResponseRef,
    });
  }

  const outputPaths = graphResult.outputPaths ?? [];
  const success = graphResult.status === "completed";

  const error = success
    ? undefined
    : {
        message: `graphWorkflow status: ${graphResult.status}`,
        failedNodeId: graphResult.failedNodeId,
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
