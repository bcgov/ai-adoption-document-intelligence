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
import { azureOcrSubmitCatalogEntry } from "./activities/azure-ocr-submit";
import { documentSplitCatalogEntry } from "./activities/document-split";
import { filePrepareCatalogEntry } from "./activities/file-prepare";
import { ocrCheckConfidenceCatalogEntry } from "./activities/ocr-check-confidence";
import type { ActivityCatalogEntry } from "./types";

export type { ActivityCatalogEntry, CatalogCategory, PortDescriptor } from "./types";

/**
 * Registry of all known activity types.
 */
export const ACTIVITY_CATALOG: Record<string, ActivityCatalogEntry> = {
  [filePrepareCatalogEntry.activityType]: filePrepareCatalogEntry,
  [azureOcrSubmitCatalogEntry.activityType]: azureOcrSubmitCatalogEntry,
  [ocrCheckConfidenceCatalogEntry.activityType]: ocrCheckConfidenceCatalogEntry,
  [documentSplitCatalogEntry.activityType]: documentSplitCatalogEntry,
};

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
