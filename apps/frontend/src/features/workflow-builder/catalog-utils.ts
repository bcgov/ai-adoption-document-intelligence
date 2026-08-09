/**
 * Frontend helpers around the shared activity catalog.
 *
 * - resolves `iconHint` strings to Tabler icon components — the same
 *   contract `sources/source-catalog-utils.ts` and `group/group-icons.ts`
 *   already use. Emoji render differently per platform and are not
 *   reliably announced, so every icon surface renders an SVG component.
 * - resolves `colorHint` strings to Mantine colour tokens / hex codes.
 * - returns reasonable defaults for unknown activity types.
 */

import {
  ACTIVITY_CATALOG,
  getActivityCatalogEntry,
} from "@ai-di/graph-workflow";
import {
  IconArrowMerge,
  IconArrowsExchange,
  IconBan,
  IconChartArrowsVertical,
  IconChartBar,
  IconChartLine,
  IconChecklist,
  IconCloudUpload,
  IconCode,
  IconCompass,
  IconDatabase,
  IconDeviceFloppy,
  IconDownload,
  IconEraser,
  IconFile,
  IconFileDownload,
  IconFileStar,
  IconFileText,
  IconFilter,
  IconGauge,
  IconHelpCircle,
  IconHourglass,
  IconPoint,
  IconProgressCheck,
  IconScissors,
  IconSitemap,
  IconSparkles,
  IconStack2,
  IconTag,
  IconTags,
  IconTextSpellcheck,
  IconTransform,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

import { ACTIVITY_ACCENT } from "./node-accents";

// The seven-colour `COLOR_TOKENS` map that used to live here is gone (item 20,
// 2026-08-09). It gave each activity CATEGORY its own accent, and those seven
// plus the six control-flow accents produced 14 colliding pairs under
// colour-vision simulation — including `#22c55e` meaning three different
// things. Every activity now takes one accent; the category is still carried
// by the icon, the label, and the palette sidebar's grouping. See
// `node-accents.ts` for the measurement and the roles.

export interface TablerIconProps {
  size?: number | string;
  color?: string;
}

export type ActivityIconComponent = ComponentType<TablerIconProps>;

/**
 * Maps `ActivityCatalogEntry.iconHint` strings to Tabler icon components.
 * Keys are the hints the shared catalog actually emits — keep them in
 * sync with `packages/graph-workflow/src/catalog/activities/*`.
 */
const ICON_COMPONENTS: Record<string, ActivityIconComponent> = {
  file: IconFile,
  "file-download": IconFileDownload,
  hourglass: IconHourglass,
  document: IconFileText,
  scissors: IconScissors,
  "scissors-with-tag": IconTags,
  tag: IconTag,
  filter: IconFilter,
  merge: IconArrowMerge,
  layers: IconStack2,
  sparkles: IconSparkles,
  "sparkle-document": IconFileStar,
  "spell-check": IconTextSpellcheck,
  swap: IconArrowsExchange,
  broom: IconEraser,
  checklist: IconChecklist,
  upload: IconUpload,
  "upload-arrow": IconCloudUpload,
  save: IconDeviceFloppy,
  trash: IconTrash,
  "no-entry": IconBan,
  "status-tag": IconProgressCheck,
  compass: IconCompass,
  diagram: IconSitemap,
  chart: IconChartLine,
  "chart-bar": IconChartBar,
  "chart-diff": IconChartArrowsVertical,
  download: IconDownload,
  database: IconDatabase,
  transform: IconTransform,
  // Both of these were emitted by the catalog but never mapped, so they fell
  // through to the neutral fallback — `code` covers EVERY `dyn.*` dynamic
  // node, which is why custom nodes all looked alike on the canvas.
  gauge: IconGauge,
  code: IconCode,
};

/** Rendered for an activity type the catalog does not know at all. */
const UNKNOWN_ACTIVITY_ICON: ActivityIconComponent = IconHelpCircle;

/** Rendered for a catalogued activity whose `iconHint` has no mapping. */
const UNKNOWN_HINT_ICON: ActivityIconComponent = IconPoint;

export interface ActivityVisualHints {
  displayName: string;
  category: string;
  color: string;
  /**
   * Resolved Tabler icon component. Falls back to a help glyph for
   * unregistered activity types and to a neutral dot for catalogued
   * activities carrying an unmapped `iconHint`.
   */
  Icon: ActivityIconComponent;
  description: string;
}

export function getActivityVisualHints(
  activityType: string,
): ActivityVisualHints {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) {
    return {
      displayName: activityType,
      category: "Unknown",
      color: ACTIVITY_ACCENT,
      Icon: UNKNOWN_ACTIVITY_ICON,
      description: "Unregistered activity.",
    };
  }
  return {
    displayName: entry.displayName ?? entry.activityType,
    category: entry.category,
    color: ACTIVITY_ACCENT,
    Icon: ICON_COMPONENTS[entry.iconHint] ?? UNKNOWN_HINT_ICON,
    description: entry.description,
  };
}

/**
 * Categories that are hidden from the user-facing palette but kept in the
 * catalog so the backend validator and other consumers still recognise the
 * activity types. Benchmarking activities are scheduled by the
 * benchmarking subsystem itself — users don't drop them into workflows.
 */
const HIDDEN_CATEGORIES = new Set<string>(["Benchmarking"]);

interface UserFacingCatalogEntry {
  activityType: string;
  displayName: string;
  description: string;
  iconHint: string;
  colorHint: string;
}

/**
 * Catalog entries grouped by category, sorted by displayName within group.
 * Internal-only categories (currently: Benchmarking) are filtered out for
 * the user-facing palette.
 */
export function getCatalogByCategory(): Record<
  string,
  UserFacingCatalogEntry[]
> {
  const grouped: Record<string, UserFacingCatalogEntry[]> = {};
  for (const entry of Object.values(ACTIVITY_CATALOG)) {
    if (HIDDEN_CATEGORIES.has(entry.category)) continue;
    if (!grouped[entry.category]) {
      grouped[entry.category] = [];
    }
    grouped[entry.category].push({
      activityType: entry.activityType,
      displayName: entry.displayName ?? entry.activityType,
      description: entry.description,
      iconHint: entry.iconHint,
      colorHint: entry.colorHint,
    });
  }
  for (const list of Object.values(grouped)) {
    list.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  return grouped;
}

/**
 * Whether this activity type is hidden from the user-facing UI.
 * Backend validation still recognises hidden types.
 */
export function isUserFacingActivity(activityType: string): boolean {
  const entry = ACTIVITY_CATALOG[activityType];
  return !!entry && !HIDDEN_CATEGORIES.has(entry.category);
}

/**
 * Ordered list of categories for stable palette display.
 */
export const CATEGORY_ORDER: string[] = [
  "Flow Control",
  "File Handling",
  "OCR (Azure)",
  "OCR (Mistral)",
  "OCR Cleanup & Correction",
  "OCR Quality",
  "Document Handling",
  "Validation",
  "Storage",
  "Data Transformation",
  "Reference Data",
  "Benchmarking",
];
