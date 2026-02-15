/**
 * Temporal Activities for OCR Workflow
 * Activities handle non-deterministic operations (HTTP calls, file processing)
 *
 * This file re-exports all individual activity modules.
 */

// Load environment variables first (before reading them)
require('dotenv').config();

// Re-export all activities
export { prepareFileData } from './activities/prepare-file-data';
export type { PrepareFileDataInput } from './activities/prepare-file-data';

export { submitToAzureOCR } from './activities/submit-to-azure-ocr';
export { pollOCRResults } from './activities/poll-ocr-results';
export { extractOCRResults } from './activities/extract-ocr-results';

export { updateDocumentStatus } from './activities/update-document-status';
export { storeDocumentRejection } from './activities/store-document-rejection';
export { upsertOcrResult } from './activities/upsert-ocr-result';

export { postOcrCleanup } from './activities/post-ocr-cleanup';
export { checkOcrConfidence } from './activities/check-ocr-confidence';

export { getWorkflowGraphConfig } from './activities/get-workflow-graph-config';

export { enrichResults } from './activities/enrich-results';
export type { EnrichResultsParams } from './activities/enrich-results';

// Re-export existing activities from activities folder
export { splitDocument } from './activities/split-document';
export { classifyDocument } from './activities/classify-document';
export { validateDocumentFields } from './activities/document-validate-fields';
export { splitAndClassifyDocument } from './activities/split-and-classify-document';
export { combineSegmentResult } from './activities/combine-segment-result';

// Benchmark activities
export { benchmarkEvaluate, benchmarkAggregate } from './activities/benchmark-evaluate';
export type {
  BenchmarkEvaluateInput,
  BenchmarkAggregateInput,
} from './activities/benchmark-evaluate';

export { benchmarkLogToMlflow, benchmarkCleanup } from './activities/benchmark-logging';
export type {
  BenchmarkLogToMlflowInput,
  BenchmarkCleanupInput,
} from './activities/benchmark-logging';
