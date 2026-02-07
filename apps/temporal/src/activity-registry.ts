/**
 * Activity Type Registry
 *
 * Maps activity type strings (used in graph node definitions) to their
 * Temporal activity implementations. The graph runner resolves activityType
 * from node definitions to actual activity functions via this registry.
 *
 * See docs/DAG_WORKFLOW_ENGINE.md Section 5.5 for the full specification.
 */

import type { RetryPolicy } from "./graph-workflow-types";

import {
  updateDocumentStatus,
  prepareFileData,
  submitToAzureOCR,
  pollOCRResults,
  extractOCRResults,
  postOcrCleanup,
  checkOcrConfidence,
  upsertOcrResult,
  storeDocumentRejection,
} from "./activities";
import { splitDocument } from "./activities/split-document";
import { classifyDocument } from "./activities/classify-document";

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
  activityFn: storeDocumentRejection as (...args: unknown[]) => Promise<unknown>,
  defaultTimeout: "30s",
  defaultRetry: { maximumAttempts: 5 },
  description: "Store document rejection data",
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
  activityType: "document.validateFields",
  activityFn: async () => {
    throw new Error("document.validateFields activity not yet implemented (see US-019)");
  },
  defaultTimeout: "2m",
  defaultRetry: { maximumAttempts: 3 },
  description: "Validate fields across related documents",
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up an activity registry entry by its activity type string.
 * Returns undefined if the activity type is not registered.
 */
export function getActivityEntry(activityType: string): ActivityRegistryEntry | undefined {
  return ACTIVITY_REGISTRY_MAP.get(activityType);
}

/**
 * Get the full registry map (for runtime validation in the temporal worker).
 */
export function getActivityRegistry(): ReadonlyMap<string, ActivityRegistryEntry> {
  return ACTIVITY_REGISTRY_MAP;
}

/**
 * Get all registered activity type strings.
 */
export function getRegisteredActivityTypes(): string[] {
  return Array.from(ACTIVITY_REGISTRY_MAP.keys());
}
