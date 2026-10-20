/**
 * Frontend helpers around the shared activity catalog.
 *
 * - resolves `iconHint` strings to Tabler icon components — the same
 *   contract `sources/source-catalog-utils.ts` and `group/group-icons.ts`
 *   already use. Emoji render differently per platform and are not
 *   reliably announced, so every icon surface renders an SVG component.
 * - resolves `colorHint` strings to Mantine colour tokens / hex codes.
 * - classifies custom steps (`dyn.*`), which the shared catalog does not hold,
 *   and returns reasonable defaults for unknown activity types.
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

// Every activity takes one accent, `ACTIVITY_ACCENT`. The category is carried
// by the icon, the label and the palette sidebar's grouping instead: seven
// category accents next to the six control-flow accents give 14 pairs that
// collide under colour-vision simulation. See `node-accents.ts` for the
// measurement and the roles.

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
  gauge: IconGauge,
};

/**
 * Every custom step's activity type is `dyn.<name>`. The shared catalog holds
 * the built-in activities only; custom steps are published in the app and are
 * classified by this prefix.
 */
const CUSTOM_STEP_PREFIX = "dyn.";

/** Rendered for a custom step: the glyph the palette's Custom section shows. */
const CUSTOM_STEP_ICON: ActivityIconComponent = IconCode;

/** Rendered for an activity type the catalog does not know at all. */
const UNKNOWN_ACTIVITY_ICON: ActivityIconComponent = IconHelpCircle;

/** Rendered for a catalogued activity whose `iconHint` has no mapping. */
const UNKNOWN_HINT_ICON: ActivityIconComponent = IconPoint;

export interface ActivityVisualHints {
  displayName: string;
  category: string;
  color: string;
  /**
   * Resolved Tabler icon component. A code glyph for custom steps, a help
   * glyph for unregistered activity types, and a neutral dot for catalogued
   * activities carrying an unmapped `iconHint`.
   */
  Icon: ActivityIconComponent;
  description: string;
}

/**
 * Display strings and icon for an activity type.
 *
 * A custom step (`dyn.<name>`) is not in the shared catalog, but it is not an
 * unknown type either. Whether it is still published or was deleted is only
 * known to the merged catalog, which the step's own settings and its canvas
 * pill read; so its description says what kind of step it is, which holds
 * either way, and never claims it is registered or that it is gone.
 */
export function getActivityVisualHints(
  activityType: string,
): ActivityVisualHints {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry && activityType.startsWith(CUSTOM_STEP_PREFIX)) {
    return {
      displayName: activityType.slice(CUSTOM_STEP_PREFIX.length),
      category: "Custom",
      color: ACTIVITY_ACCENT,
      Icon: CUSTOM_STEP_ICON,
      description: "Custom step, written in TypeScript.",
    };
  }
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
