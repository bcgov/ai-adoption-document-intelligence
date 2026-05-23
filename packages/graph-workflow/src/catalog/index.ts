/**
 * Activity & node catalog — shared between backend (parameter validation)
 * and frontend (palette + settings-panel rendering).
 *
 * To add a new activity:
 *   1. Create a file under `./activities/` exporting an `ActivityCatalogEntry`.
 *   2. Register it in `ACTIVITY_CATALOG` below.
 *
 * The Zod parameter schema on each entry is the single source of truth for
 * save-time parameter validation. The frontend converts it to JSON Schema
 * via `z.toJSONSchema()` and renders a form by walking the JSON Schema.
 */

import { z } from "zod/v4";
import { azureClassifyPollCatalogEntry } from "./activities/azure-classify-poll";
import { azureClassifySubmitCatalogEntry } from "./activities/azure-classify-submit";
import { azureOcrExtractCatalogEntry } from "./activities/azure-ocr-extract";
import { azureOcrPollCatalogEntry } from "./activities/azure-ocr-poll";
import { azureOcrSubmitCatalogEntry } from "./activities/azure-ocr-submit";
import { benchmarkAggregateCatalogEntry } from "./activities/benchmark-aggregate";
import { benchmarkCleanupCatalogEntry } from "./activities/benchmark-cleanup";
import { benchmarkCompareAgainstBaselineCatalogEntry } from "./activities/benchmark-compare-against-baseline";
import { benchmarkEvaluateCatalogEntry } from "./activities/benchmark-evaluate";
import { benchmarkLoadDatasetManifestCatalogEntry } from "./activities/benchmark-load-dataset-manifest";
import { benchmarkLoadOcrCacheCatalogEntry } from "./activities/benchmark-load-ocr-cache";
import { benchmarkMaterializeDatasetCatalogEntry } from "./activities/benchmark-materialize-dataset";
import { benchmarkPersistEvaluationDetailsCatalogEntry } from "./activities/benchmark-persist-evaluation-details";
import { benchmarkPersistOcrCacheCatalogEntry } from "./activities/benchmark-persist-ocr-cache";
import { benchmarkUpdateRunStatusCatalogEntry } from "./activities/benchmark-update-run-status";
import { benchmarkWritePredictionCatalogEntry } from "./activities/benchmark-write-prediction";
import { blobReadCatalogEntry } from "./activities/blob-read";
import { dataTransformCatalogEntry } from "./activities/data-transform";
import { documentClassifyCatalogEntry } from "./activities/document-classify";
import { documentExtractPageRangeCatalogEntry } from "./activities/document-extract-page-range";
import { documentExtractToBase64CatalogEntry } from "./activities/document-extract-to-base64";
import { documentFlattenClassifiedDocumentsCatalogEntry } from "./activities/document-flatten-classified-documents";
import { documentNormalizeOrientationCatalogEntry } from "./activities/document-normalize-orientation";
import { documentSelectClassifiedPagesCatalogEntry } from "./activities/document-select-classified-pages";
import { documentSplitCatalogEntry } from "./activities/document-split";
import { documentSplitAndClassifyCatalogEntry } from "./activities/document-split-and-classify";
import { documentStoreRejectionCatalogEntry } from "./activities/document-store-rejection";
import { documentUpdateStatusCatalogEntry } from "./activities/document-update-status";
import { documentValidateFieldsCatalogEntry } from "./activities/document-validate-fields";
import { filePrepareCatalogEntry } from "./activities/file-prepare";
import { getWorkflowGraphConfigCatalogEntry } from "./activities/get-workflow-graph-config";
import { mistralOcrProcessCatalogEntry } from "./activities/mistral-ocr-process";
import { ocrCharacterConfusionCatalogEntry } from "./activities/ocr-character-confusion";
import { ocrCheckConfidenceCatalogEntry } from "./activities/ocr-check-confidence";
import { ocrCleanupCatalogEntry } from "./activities/ocr-cleanup";
import { ocrEnrichCatalogEntry } from "./activities/ocr-enrich";
import { ocrNormalizeFieldsCatalogEntry } from "./activities/ocr-normalize-fields";
import { ocrSpellcheckCatalogEntry } from "./activities/ocr-spellcheck";
import { ocrStoreResultsCatalogEntry } from "./activities/ocr-store-results";
import { segmentCombineResultCatalogEntry } from "./activities/segment-combine-result";
import { tablesLookupCatalogEntry } from "./activities/tables-lookup";
import type { ActivityCatalogEntry } from "./types";

export type {
  ActivityCatalogEntry,
  CatalogCategory,
  PortDescriptor,
} from "./types";

export {
  createCatalogParameterValidator,
  type ValidateActivityParameters,
} from "./create-parameter-validator";

export {
  validationRuleSchema,
  documentValidateFieldsParametersSchema,
  type ValidationRule,
} from "./activities/document-validate-fields";

const ENTRIES: ActivityCatalogEntry[] = [
  filePrepareCatalogEntry,
  blobReadCatalogEntry,
  documentExtractToBase64CatalogEntry,
  documentUpdateStatusCatalogEntry,
  documentStoreRejectionCatalogEntry,
  documentNormalizeOrientationCatalogEntry,
  azureOcrSubmitCatalogEntry,
  azureOcrPollCatalogEntry,
  azureOcrExtractCatalogEntry,
  azureClassifySubmitCatalogEntry,
  azureClassifyPollCatalogEntry,
  mistralOcrProcessCatalogEntry,
  ocrCleanupCatalogEntry,
  ocrSpellcheckCatalogEntry,
  ocrCharacterConfusionCatalogEntry,
  ocrNormalizeFieldsCatalogEntry,
  ocrCheckConfidenceCatalogEntry,
  ocrEnrichCatalogEntry,
  ocrStoreResultsCatalogEntry,
  documentSplitCatalogEntry,
  documentSplitAndClassifyCatalogEntry,
  documentClassifyCatalogEntry,
  documentSelectClassifiedPagesCatalogEntry,
  documentFlattenClassifiedDocumentsCatalogEntry,
  documentExtractPageRangeCatalogEntry,
  segmentCombineResultCatalogEntry,
  documentValidateFieldsCatalogEntry,
  dataTransformCatalogEntry,
  tablesLookupCatalogEntry,
  benchmarkEvaluateCatalogEntry,
  benchmarkAggregateCatalogEntry,
  benchmarkCleanupCatalogEntry,
  benchmarkUpdateRunStatusCatalogEntry,
  benchmarkCompareAgainstBaselineCatalogEntry,
  benchmarkWritePredictionCatalogEntry,
  benchmarkMaterializeDatasetCatalogEntry,
  benchmarkLoadDatasetManifestCatalogEntry,
  benchmarkLoadOcrCacheCatalogEntry,
  benchmarkPersistOcrCacheCatalogEntry,
  benchmarkPersistEvaluationDetailsCatalogEntry,
  getWorkflowGraphConfigCatalogEntry,
];

/**
 * Registry of all known activity types.
 */
export const ACTIVITY_CATALOG: Record<string, ActivityCatalogEntry> =
  Object.fromEntries(ENTRIES.map((entry) => [entry.activityType, entry]));

/**
 * Returns the catalog entry for an activity type, or `undefined` if the
 * activity is not registered. Treat unregistered activity types as a
 * validation error at workflow-save time.
 */
export function getActivityCatalogEntry(
  activityType: string,
): ActivityCatalogEntry | undefined {
  return ACTIVITY_CATALOG[activityType];
}

/**
 * All registered activity types.
 */
export function listActivityTypes(): string[] {
  return Object.keys(ACTIVITY_CATALOG);
}

/**
 * JSON Schema for an activity's static parameters.
 *
 * Convenient for the frontend form renderer (which walks JSON Schema,
 * not Zod), and for future LLM-tool-calling consumers that accept
 * JSON Schema natively.
 */
export function getActivityParametersJsonSchema(
  activityType: string,
): unknown | undefined {
  const entry = ACTIVITY_CATALOG[activityType];
  if (!entry) return undefined;
  return z.toJSONSchema(entry.parametersSchema);
}
