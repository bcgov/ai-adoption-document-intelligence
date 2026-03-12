/**
 * Temporal Activities for OCR Workflow
 * Activities handle non-deterministic operations (HTTP calls, file processing)
 *
 * This file re-exports all individual activity modules.
 */

// Load environment variables first (before reading them)
import "dotenv/config";

export type { BenchmarkBaselineComparisonInput } from "./activities/benchmark-baseline-comparison";
export { benchmarkCompareAgainstBaseline } from "./activities/benchmark-baseline-comparison";
export type { BenchmarkCleanupInput } from "./activities/benchmark-cleanup";
export { benchmarkCleanup } from "./activities/benchmark-cleanup";
export type {
  BenchmarkAggregateInput,
  BenchmarkEvaluateInput,
} from "./activities/benchmark-evaluate";
// Benchmark activities
export {
  benchmarkAggregate,
  benchmarkEvaluate,
} from "./activities/benchmark-evaluate";
export type { DatasetManifest } from "./activities/benchmark-materialize";
export {
  loadDatasetManifest,
  materializeDataset,
} from "./activities/benchmark-materialize";
export type { BenchmarkUpdateRunStatusInput } from "./activities/benchmark-update-run";
export { benchmarkUpdateRunStatus } from "./activities/benchmark-update-run";
export type {
  BenchmarkWritePredictionInput,
  BenchmarkWritePredictionOutput,
} from "./activities/benchmark-write-prediction";
export { benchmarkWritePrediction } from "./activities/benchmark-write-prediction";
export { checkOcrConfidence } from "./activities/check-ocr-confidence";
export { classifyDocument } from "./activities/classify-document";
export { combineSegmentResult } from "./activities/combine-segment-result";
export { validateDocumentFields } from "./activities/document-validate-fields";
export type { EnrichResultsParams } from "./activities/enrich-results";
export { enrichResults } from "./activities/enrich-results";
export { extractOCRResults } from "./activities/extract-ocr-results";
export { getWorkflowGraphConfig } from "./activities/get-workflow-graph-config";
export { pollOCRResults } from "./activities/poll-ocr-results";
export { postOcrCleanup } from "./activities/post-ocr-cleanup";
export type { PrepareFileDataInput } from "./activities/prepare-file-data";
// Re-export all activities
export { prepareFileData } from "./activities/prepare-file-data";
export { splitAndClassifyDocument } from "./activities/split-and-classify-document";
// Re-export existing activities from activities folder
export { splitDocument } from "./activities/split-document";
export { storeDocumentRejection } from "./activities/store-document-rejection";
export { submitToAzureOCR } from "./activities/submit-to-azure-ocr";
export { updateDocumentStatus } from "./activities/update-document-status";
export { upsertOcrResult } from "./activities/upsert-ocr-result";
