/**
 * Activity Type Constants
 *
 * List of registered activity types that can be used in graph node definitions.
 * This file can be safely imported into workflow code (no Prisma/activity dependencies).
 */

export const REGISTERED_ACTIVITY_TYPES = [
  "document.updateStatus",
  "file.prepare",
  "azureOcr.submit",
  "azureOcr.poll",
  "azureOcr.extract",
  "ocr.cleanup",
  "ocr.checkConfidence",
  "ocr.storeResults",
  "ocr.enrich",
  "document.storeRejection",
  "getWorkflowGraphConfig",
  "document.split",
  "document.classify",
  "document.splitAndClassify",
  "document.validateFields",
  "document.extractPageRange",
  "segment.combineResult",
  "benchmark.evaluate",
  "benchmark.aggregate",
  "benchmark.cleanup",
  "benchmark.updateRunStatus",
  "benchmark.compareAgainstBaseline",
  "benchmark.writePrediction",
  "benchmark.materializeDataset",
  "benchmark.loadDatasetManifest",
  "benchmark.loadOcrCache",
  "benchmark.persistOcrCache",
  "ocr.spellcheck",
  "ocr.characterConfusion",
  "ocr.normalizeFields",
  "azureClassify.submit",
  "azureClassify.poll",
  "document.selectClassifiedPages",
  "document.flattenClassifiedDocuments",
  "data.transform",
] as const;

export type RegisteredActivityType = (typeof REGISTERED_ACTIVITY_TYPES)[number];

export function isRegisteredActivityType(type: string): boolean {
  return (REGISTERED_ACTIVITY_TYPES as readonly string[]).includes(type);
}
