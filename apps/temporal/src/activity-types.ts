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
  "mistralOcr.process",
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
  "benchmark.persistEvaluationDetails",
  "ocr.spellcheck",
  "ocr.characterConfusion",
  "ocr.normalizeFields",
  "azureClassify.submit",
  "azureClassify.poll",
  "document.selectClassifiedPages",
  "document.flattenClassifiedDocuments",
  "data.transform",
  "tables.lookup",
  "blob.read",
  "document.extractToBase64",
  "document.normalizeOrientation",
] as const;

export type RegisteredActivityType = (typeof REGISTERED_ACTIVITY_TYPES)[number];

export function isRegisteredActivityType(type: string): boolean {
  // Phase 6 Milestone C (US-170 / US-171) — every `dyn.<slug>` node is
  // dispatched through the single shared `dyn.run` Temporal activity. The
  // catalog merge surface (Milestone D) populates the user-visible list;
  // here we just accept any well-formed `dyn.<slug>` activity type so the
  // executor's `executeActivityNode` doesn't reject the node before the
  // dynamic-node resolution path can take over.
  if (type.startsWith("dyn.")) {
    return type.length > "dyn.".length;
  }
  return (REGISTERED_ACTIVITY_TYPES as readonly string[]).includes(type);
}
