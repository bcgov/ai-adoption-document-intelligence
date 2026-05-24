/**
 * Frontend helpers around the shared source catalog (US-118).
 *
 * Mirrors the activity-catalog `catalog-utils.ts` surface so palette,
 * canvas, and settings-panel surfaces can resolve a `SourceCatalogEntry`'s
 * `iconHint` / `colorHint` strings to renderable values without
 * duplicating the mapping table.
 *
 * - `resolveSourceIcon` — `iconHint` → Tabler icon component (or
 *   `undefined` when the hint is unknown / absent).
 * - `resolveSourceColor` — `colorHint` → hex token (or `undefined` for
 *   unknown / absent hints). Uses the same palette as the activity
 *   catalog so source nodes pick up identical accent shades.
 * - `getSourceVisualHints` — convenience wrapper that resolves a
 *   `sourceType` to its rendered display strings with sensible
 *   gray / fallback defaults for unregistered subtypes.
 */

import { getSourceCatalogEntry } from "@ai-di/graph-workflow";
import {
  IconCloudUpload,
  IconDatabase,
  IconFileUpload,
  IconWorld,
} from "@tabler/icons-react";
import type { ComponentType } from "react";

export interface TablerIconProps {
  size?: number | string;
}

/**
 * Maps `SourceCatalogEntry.iconHint` strings to Tabler icon components.
 * Returns `undefined` when the hint is missing or unknown — callers
 * fall back to a neutral icon (typically `IconDatabase`) of their
 * choice.
 *
 * Known 8.0 hints: `"cloud-upload"` (source.api), `"file-upload"`
 * (source.upload). `"world"` is reserved for future pull-pattern
 * sources.
 */
export function resolveSourceIcon(
  iconHint: string | undefined,
): ComponentType<TablerIconProps> | undefined {
  if (!iconHint) return undefined;
  switch (iconHint) {
    case "cloud-upload":
      return IconCloudUpload;
    case "file-upload":
      return IconFileUpload;
    case "world":
      return IconWorld;
    case "database":
      return IconDatabase;
    default:
      return undefined;
  }
}

/**
 * Mantine palette tokens — matches `COLOR_TOKENS` in
 * `catalog-utils.ts` so the two surfaces stay visually consistent.
 */
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

/**
 * Resolves a `SourceCatalogEntry.colorHint` to a hex colour token.
 * Returns `undefined` when the hint is missing or unknown — callers
 * fall back to a neutral gray of their choice.
 */
export function resolveSourceColor(
  colorHint: string | undefined,
): string | undefined {
  if (!colorHint) return undefined;
  return COLOR_TOKENS[colorHint];
}

export interface SourceVisualHints {
  displayName: string;
  description: string;
  /**
   * Resolved hex colour token (falls back to neutral gray for
   * unregistered subtypes / unknown colour hints).
   */
  color: string;
  /**
   * Resolved Tabler icon component (falls back to `IconDatabase` for
   * unregistered subtypes / unknown icon hints).
   */
  Icon: ComponentType<TablerIconProps>;
  /**
   * Original `colorHint` string from the catalog entry. Useful when
   * callers want the Mantine theme-color key (e.g. for `<Text c={...} />`)
   * rather than the resolved hex.
   */
  colorHint?: string;
}

const FALLBACK_COLOR = COLOR_TOKENS.gray;
const FALLBACK_ICON: ComponentType<TablerIconProps> = IconDatabase;

/**
 * Convenience wrapper — resolves a `sourceType` to its display
 * strings with sensible fallbacks. Mirrors `getActivityVisualHints`
 * in `catalog-utils.ts`.
 */
export function getSourceVisualHints(sourceType: string): SourceVisualHints {
  const entry = getSourceCatalogEntry(sourceType);
  if (!entry) {
    return {
      displayName: sourceType,
      description: "Unregistered source subtype.",
      color: FALLBACK_COLOR,
      Icon: FALLBACK_ICON,
    };
  }
  const Icon = resolveSourceIcon(entry.iconHint) ?? FALLBACK_ICON;
  const color = resolveSourceColor(entry.colorHint) ?? FALLBACK_COLOR;
  return {
    displayName: entry.displayName,
    description: entry.description,
    color,
    Icon,
    colorHint: entry.colorHint,
  };
}
