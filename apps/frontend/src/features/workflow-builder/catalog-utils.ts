/**
 * Frontend helpers around the shared activity catalog.
 *
 * - resolves `iconHint` strings to a glyph/symbol (Tabler icon mapping
 *   will land in Phase 1A polish; for now we use emoji fallbacks so
 *   nodes are visually distinguishable without a heavy mapping table).
 * - resolves `colorHint` strings to Mantine colour tokens / hex codes.
 * - returns reasonable defaults for unknown activity types.
 */

import {
  ACTIVITY_CATALOG,
  getActivityCatalogEntry,
} from "@ai-di/graph-workflow";

const COLOR_TOKENS: Record<string, string> = {
  blue: "#3b82f6",
  teal: "#14b8a6",
  green: "#22c55e",
  orange: "#f97316",
  red: "#ef4444",
  indigo: "#6366f1",
  gray: "#6b7280",
  cyan: "#06b6d4",
  violet: "#8b5cf6",
  lavender: "#a78bfa",
  yellow: "#eab308",
};

const ICON_FALLBACKS: Record<string, string> = {
  file: "📄",
  "file-download": "⬇",
  hourglass: "⌛",
  document: "📄",
  scissors: "✂",
  "scissors-with-tag": "✂🏷",
  tag: "🏷",
  filter: "🔎",
  merge: "⊕",
  layers: "🗂",
  sparkles: "✨",
  "sparkle-document": "✨📄",
  "spell-check": "🔡",
  swap: "🔠",
  broom: "🧹",
  checklist: "✔",
  upload: "📤",
  "upload-arrow": "📤",
  save: "💾",
  trash: "🗑",
  "no-entry": "⛔",
  "status-tag": "🏷",
  compass: "🧭",
  diagram: "📊",
  chart: "📈",
  "chart-bar": "📊",
  "chart-diff": "📉",
  download: "⬇",
  database: "🗄",
  transform: "🔄",
};

export interface ActivityVisualHints {
  displayName: string;
  category: string;
  color: string;
  icon: string;
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
      color: COLOR_TOKENS.gray,
      icon: "❓",
      description: "Unregistered activity.",
    };
  }
  return {
    displayName: entry.displayName ?? entry.activityType,
    category: entry.category,
    color: COLOR_TOKENS[entry.colorHint] ?? COLOR_TOKENS.gray,
    icon: ICON_FALLBACKS[entry.iconHint] ?? "●",
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
