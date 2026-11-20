/**
 * Helpers that partition the merged activity catalog
 * (`useActivityCatalog`) into the user-facing palette sections
 * (Phase 6 US-182, Milestone F).
 *
 * The Phase 6 backend (`/api/activity-catalog`) returns the static
 * catalog AND the calling group's dynamic-node lineages in one merged
 * list. Static entries appear under their declared `category` (e.g.
 * "File Handling", "Storage", …); dynamic entries carry a
 * `dynamicNodeSlug` and live under the dedicated "Custom" section.
 *
 * This module is dependency-light + side-effect-free so it can be
 * imported by the palette without dragging React Query into the
 * partitioner.
 */

import type { ActivityCatalogEntry } from "../dynamic-nodes";

export interface DynamicPaletteEntry {
  /** The dyn.* activity type (`dyn.<slug>`) — used as the drop type. */
  activityType: string;
  /** Lineage slug (e.g. `my-node`). Always defined for dynamic entries. */
  dynamicNodeSlug: string;
  /** Display name (signature.name). For dyn entries this is the slug. */
  displayName: string;
  /** Short description shown in the hover tooltip. */
  description: string;
  /** Param schema (JSON Schema 7) — used to materialise defaults on drop. */
  paramsSchema: Record<string, unknown> | undefined;
}

export function isDynamicEntry(
  entry: ActivityCatalogEntry,
): entry is ActivityCatalogEntry & { dynamicNodeSlug: string } {
  return typeof entry.dynamicNodeSlug === "string";
}

/**
 * Extracts the dynamic-node entries from the merged catalog. Sorted by
 * slug ascending so the order matches the management page's table
 * (which sorts the same way).
 */
export function selectDynamicPaletteEntries(
  entries: readonly ActivityCatalogEntry[],
): DynamicPaletteEntry[] {
  const dyn: DynamicPaletteEntry[] = [];
  for (const entry of entries) {
    if (!isDynamicEntry(entry)) continue;
    dyn.push({
      activityType: entry.activityType,
      dynamicNodeSlug: entry.dynamicNodeSlug,
      displayName: entry.displayName ?? entry.dynamicNodeSlug,
      description: entry.description,
      paramsSchema: entry.paramsSchema,
    });
  }
  dyn.sort((a, b) => a.dynamicNodeSlug.localeCompare(b.dynamicNodeSlug));
  return dyn;
}
