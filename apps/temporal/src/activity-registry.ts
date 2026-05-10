/**
 * Activity Type Registry
 *
 * Maps activity type strings (used in graph node definitions) to their
 * Temporal activity implementations. The graph runner resolves activityType
 * from node definitions to actual activity functions via this registry.
 *
 * See docs-md/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 5.5 for the full specification.
 */

import {
  azureCuAnalyze,
  azureCuDeployAnalyzer,
  benchmarkAggregate,
  benchmarkCleanup,
  benchmarkCompareAgainstBaseline,
  benchmarkEvaluate,
  benchmarkLoadOcrCache,
  benchmarkPersistEvaluationDetails,
  benchmarkPersistOcrCache,
  benchmarkUpdateRunStatus,
  benchmarkWritePrediction,
  checkOcrConfidence,
  enrichResults,
  extractOCRResults,
  getWorkflowGraphConfig,
  loadDatasetManifest,
  materializeDataset,
  mistralAzureOcrProcess,
  mistralOcrProcess,
  pollOCRResults,
  postOcrCleanup,
  prepareFileData,
  storeDocumentRejection,
  submitToAzureOCR,
  updateDocumentStatus,
  upsertOcrResult,
} from "./activities";
import { azureClassifyPoll } from "./activities/azure-classify-poll";
import { azureClassifySubmit } from "./activities/azure-classify-submit";
import { blobRead } from "./activities/blob-read";
import { classifyDocument } from "./activities/classify-document";
import { combineSegmentResult } from "./activities/combine-segment-result";
import { executeTransformNode } from "./activities/data-transform/execute";
import { validateDocumentFields } from "./activities/document-validate-fields";
import { extractPageRange } from "./activities/extract-page-range";
import { extractPagesBase64 } from "./activities/extract-pages-base64";
import { flattenClassifiedDocuments } from "./activities/flatten-classified-documents";
import { normalizeDocumentOrientation } from "./activities/normalize-document-orientation";
import { characterConfusionCorrection } from "./activities/ocr-character-confusion";
import { normalizeOcrFields } from "./activities/ocr-normalize-fields";
import { spellcheckOcrResult } from "./activities/ocr-spellcheck";
import { selectClassifiedPages } from "./activities/select-classified-pages";
import { splitAndClassifyDocument } from "./activities/split-and-classify-document";
import { splitDocument } from "./activities/split-document";
import { tablesLookup } from "./activities/tables-lookup";
import type { RetryPolicy } from "./graph-workflow-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityRegistryEntry {
  activityType: string;
  activityFn: (...args: unknown[]) => Promise<unknown>;
  defaultTimeout: string;
  defaultRetry: RetryPolicy;
  description: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ACTIVITY_REGISTRY_MAP = new Map<string, ActivityRegistryEntry>();

function register(entry: ActivityRegistryEntry): void {
  ACTIVITY_REGISTRY_MAP.set(entry.activityType, entry);
}

// -- Existing activities ----------------------------------------------------

register({
  activityType: "document.updateStatus",
  activityFn: updateDocumentStatus as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 5 },
  description: "Update document status in database",
});

register({
  activityType: "file.prepare",
  activityFn: prepareFileData as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Validate and prepare file data",
});

register({
  activityType: "azureOcr.submit",
  activityFn: submitToAzureOCR as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Submit to Azure Document Intelligence",
});

register({
  activityType: "azureOcr.poll",
  activityFn: pollOCRResults as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Poll Azure for OCR results",
});

register({
  activityType: "azureOcr.extract",
  activityFn: extractOCRResults as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Extract structured OCR data",
});

register({
  activityType: "ocr.cleanup",
  activityFn: postOcrCleanup as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Post-OCR text normalization",
});

register({
  activityType: "mistralOcr.process",
  activityFn: mistralOcrProcess as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "10m",
  defaultRetry: { maximumAttempts: 2 },
  description:
    "Mistral Document AI OCR (sync) with optional document annotation",
});

register({
  activityType: "mistralAzureOcr.process",
  activityFn: mistralAzureOcrProcess as (
    ...args: unknown[]
  ) => Promise<unknown>,
  // Foundry's annotation step "can be slower and may result in timeouts" per
  // Microsoft docs; allow generous wallclock plus extra retry attempts vs the
  // public-API path. The deployment is rate-limited by per-minute requests
  // (default 10 RPM on GlobalStandard) and a 33-sample benchmark fan-out
  // gets sustained 429s — the retry policy is therefore tuned to spread
  // retries across the quota window with backoff jitter rather than the
  // public-API path's tighter 3-attempt policy.
  defaultTimeout: "20m",
  defaultRetry: {
    maximumAttempts: 30,
    initialInterval: "15s",
    backoffCoefficient: 1.5,
    maximumInterval: "60s",
  },
  description:
    "Mistral Document AI on Azure AI Foundry (sync) with optional document annotation",
});

register({
  activityType: "azureContentUnderstanding.deployAnalyzer",
  activityFn: azureCuDeployAnalyzer as (...args: unknown[]) => Promise<unknown>,
  // Idempotent PUT against the CU control plane; the in-memory cache + GET
  // probe make repeats cheap. Short timeout, three attempts is enough.
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description:
    "Deploy (idempotent PUT) an Azure Content Understanding analyzer; in-memory cache short-circuits no-ops",
});

register({
  activityType: "azureContentUnderstanding.analyze",
  activityFn: azureCuAnalyze as (...args: unknown[]) => Promise<unknown>,
  // CU is async (POST 202 + poll). The Foundry deployment shares the
  // ~10 RPM quota model with Mistral on Foundry, so the retry policy
  // mirrors `mistralAzureOcr.process`: 30 attempts × 15 s / 1.5x / 60 s
  // cap. Generous startToClose to absorb slow analyses.
  defaultTimeout: "20m",
  defaultRetry: {
    maximumAttempts: 30,
    initialInterval: "15s",
    backoffCoefficient: 1.5,
    maximumInterval: "60s",
  },
  description:
    "Azure Content Understanding analyze (async, polls until terminal); deploys analyzer first if a template schema is supplied",
});

register({
  activityType: "ocr.checkConfidence",
  activityFn: checkOcrConfidence as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 3 },
  description: "Calculate OCR confidence",
});

register({
  activityType: "ocr.storeResults",
  activityFn: upsertOcrResult as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 5 },
  description: "Store OCR results in database",
});

register({
  activityType: "document.storeRejection",
  activityFn: storeDocumentRejection as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 5 },
  description: "Store document rejection data",
});

register({
  activityType: "getWorkflowGraphConfig",
  activityFn: getWorkflowGraphConfig as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 3 },
  description: "Load workflow configuration from database",
});

register({
  activityType: "ocr.enrich",
  activityFn: enrichResults as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "3m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Enrich OCR results with field schema and optional LLM",
});

// -- New activities (implementations in US-017, US-018, US-019) -------------

register({
  activityType: "document.split",
  activityFn: splitDocument as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "5m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Split multi-page PDF into segments",
});

register({
  activityType: "document.classify",
  activityFn: classifyDocument as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Classify document type (rule-based)",
});

register({
  activityType: "document.splitAndClassify",
  activityFn: splitAndClassifyDocument as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "5m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Split PDF and classify segments based on OCR keyword markers",
});

register({
  activityType: "document.validateFields",
  activityFn: validateDocumentFields as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Validate fields across related documents",
});

register({
  activityType: "segment.combineResult",
  activityFn: combineSegmentResult as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "10s",
  defaultRetry: { maximumAttempts: 1 },
  description: "Combine segment metadata with OCR result for join collection",
});

// -- OCR correction activities (Feature 008) --------------------------------

register({
  activityType: "ocr.spellcheck",
  activityFn: spellcheckOcrResult as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "3m",
  defaultRetry: { maximumAttempts: 2 },
  description:
    "Spellcheck correction on full OCR result using local dictionary",
});

register({
  activityType: "ocr.characterConfusion",
  activityFn: characterConfusionCorrection as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 2 },
  description:
    "Character confusion (O→0, l→1, …); optional documentType for schema-aware rules; enabledRules/disabledRules or confusionMapOverride",
});

register({
  activityType: "ocr.normalizeFields",
  activityFn: normalizeOcrFields as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 2 },
  description:
    "Field normalization (whitespace, digit grouping, dates); optional documentType for schema-aware rules",
});

// -- Benchmark activities ---------------------------------------------------

register({
  activityType: "benchmark.evaluate",
  activityFn: benchmarkEvaluate as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "10m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Evaluate benchmark run results against ground truth",
});

register({
  activityType: "benchmark.aggregate",
  activityFn: benchmarkAggregate as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "5m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Aggregate evaluation results into summary metrics",
});

register({
  activityType: "benchmark.cleanup",
  activityFn: benchmarkCleanup as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "5m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Clean up temporary files and materialized datasets",
});

register({
  activityType: "benchmark.updateRunStatus",
  activityFn: benchmarkUpdateRunStatus as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 5 },
  description: "Update benchmark run status in database",
});

register({
  activityType: "benchmark.compareAgainstBaseline",
  activityFn: benchmarkCompareAgainstBaseline as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Compare run metrics against baseline and detect regressions",
});

register({
  activityType: "benchmark.writePrediction",
  activityFn: benchmarkWritePrediction as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Write workflow prediction data to a JSON file for evaluation",
});

register({
  activityType: "benchmark.materializeDataset",
  activityFn: materializeDataset as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30m",
  defaultRetry: { maximumAttempts: 2 },
  description: "Materialize dataset version from object storage",
});

register({
  activityType: "benchmark.loadDatasetManifest",
  activityFn: loadDatasetManifest as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Load dataset manifest from materialized data",
});

register({
  activityType: "benchmark.loadOcrCache",
  activityFn: benchmarkLoadOcrCache as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 3 },
  description: "Load cached Azure OCR poll JSON for a benchmark sample",
});

register({
  activityType: "benchmark.persistOcrCache",
  activityFn: benchmarkPersistOcrCache as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 3 },
  description: "Persist Azure OCR poll JSON for a benchmark sample",
});

register({
  activityType: "benchmark.persistEvaluationDetails",
  activityFn: benchmarkPersistEvaluationDetails as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 3 },
  description:
    "Persist per-sample evaluation details (groundTruth/prediction/evaluationDetails) to blob storage",
});

// -- Azure Classifier activities -------------------------------------------

register({
  activityType: "azureClassify.submit",
  activityFn: azureClassifySubmit as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Submit document to Azure Document Intelligence classifier",
});

register({
  activityType: "azureClassify.poll",
  activityFn: azureClassifyPoll as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 20 },
  description:
    "Poll Azure Document Intelligence classifier results and split document into labelled segments",
});

// -- Azure Classifier segment utilities ------------------------------------

register({
  activityType: "document.selectClassifiedPages",
  activityFn: selectClassifiedPages as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 1 },
  description:
    "Select all page range segments for a specific classifier label from azureClassify.poll output",
});

register({
  activityType: "document.flattenClassifiedDocuments",
  activityFn: flattenClassifiedDocuments as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 1 },
  description:
    "Flatten all (or filtered) classifier labels into a single sorted ClassifiedSegment array for map node iteration",
});

// -- Page range extraction --------------------------------------------------

register({
  activityType: "document.extractPageRange",
  activityFn: extractPageRange as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "5m",
  defaultRetry: { maximumAttempts: 3 },
  description:
    "Extract a specific page range from a source document and write it as a new blob segment",
});

// -- Data transform activities ----------------------------------------------

register({
  activityType: "data.transform",
  activityFn: executeTransformNode as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 1 },
  description:
    "Execute data transformation: parse input, resolve field-mapping bindings, render output",
});

// -- Tables activities ------------------------------------------------------

register({
  activityType: "tables.lookup",
  activityFn: tablesLookup as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 3 },
  description: "Look up a row from a Tables-managed reference table",
});

register({
  activityType: "blob.read",
  activityFn: blobRead as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "1m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Read a blob from storage and return its contents as base64",
});

register({
  activityType: "document.extractToBase64",
  activityFn: extractPagesBase64 as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "3m",
  defaultRetry: { maximumAttempts: 2 },
  description:
    "Extract a page range from a PDF blob and return it as base64 (no blob write)",
});

register({
  activityType: "document.normalizeOrientation",
  activityFn: normalizeDocumentOrientation as (
    ...args: unknown[]
  ) => Promise<unknown>,
  defaultTimeout: "5m",
  defaultRetry: { maximumAttempts: 2 },
  description:
    "Detect and correct per-page orientation using mupdf rendering and Tesseract OSD",
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up an activity registry entry by its activity type string.
 * Returns undefined if the activity type is not registered.
 */
export function getActivityEntry(
  activityType: string,
): ActivityRegistryEntry | undefined {
  return ACTIVITY_REGISTRY_MAP.get(activityType);
}

/**
 * Get the full registry map (for runtime validation in the temporal worker).
 */
export function getActivityRegistry(): ReadonlyMap<
  string,
  ActivityRegistryEntry
> {
  return ACTIVITY_REGISTRY_MAP;
}

/**
 * Get all registered activity type strings.
 */
export function getRegisteredActivityTypes(): string[] {
  return Array.from(ACTIVITY_REGISTRY_MAP.keys());
}
