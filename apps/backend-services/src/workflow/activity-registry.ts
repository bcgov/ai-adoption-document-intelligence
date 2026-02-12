/**
 * Activity Registry Constants (Backend)
 *
 * A constant-only registry of known activity types for save-time validation.
 * This does not contain activity function references (those live in the
 * temporal worker). It provides the set of valid activity type strings
 * and their descriptions.
 *
 * See docs/graph-workflows/DAG_WORKFLOW_ENGINE.md Section 9.5
 */

export interface RegisteredActivityType {
  description: string;
}

/**
 * All registered activity types with descriptions.
 * Used by the backend graph schema validator to check that activity nodes
 * reference valid activity types.
 */
export const REGISTERED_ACTIVITY_TYPES: Record<string, RegisteredActivityType> =
  {
    "document.updateStatus": {
      description: "Update document status in database",
    },
    "file.prepare": { description: "Validate and prepare file data" },
    "azureOcr.submit": { description: "Submit to Azure Document Intelligence" },
    "azureOcr.poll": { description: "Poll Azure for OCR results" },
    "azureOcr.extract": { description: "Extract structured OCR data" },
    "ocr.cleanup": { description: "Post-OCR text normalization" },
    "ocr.checkConfidence": { description: "Calculate OCR confidence" },
    "ocr.storeResults": { description: "Store OCR results in database" },
    "document.storeRejection": { description: "Store document rejection data" },
    "document.split": { description: "Split multi-page PDF into segments" },
    "document.classify": { description: "Classify document type (rule-based)" },
    "document.splitAndClassify": {
      description:
        "Split PDF and classify segments based on OCR keyword markers",
    },
    "document.validateFields": {
      description: "Validate fields across related documents",
    },
    "segment.combineResult": {
      description:
        "Combine segment metadata with OCR result for join collection",
    },
  } as const;

/**
 * Check if an activity type string is registered.
 */
export function isRegisteredActivityType(activityType: string): boolean {
  return activityType in REGISTERED_ACTIVITY_TYPES;
}

/**
 * Get all registered activity type strings.
 */
export function getRegisteredActivityTypeKeys(): string[] {
  return Object.keys(REGISTERED_ACTIVITY_TYPES);
}
