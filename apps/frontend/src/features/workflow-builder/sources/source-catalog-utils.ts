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
 * `resolveSourceColor` is gone (item 20): it mapped the six source subtypes
 * through a private copy of the activity `COLOR_TOKENS` palette, onto two of
 * the colours the colour-vision measurement retired. A source is a step that
 * does work, so it takes `ACTIVITY_ACCENT` like every other working step, and
 * which source it is, is carried by its icon and its title.
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

import { ACTIVITY_ACCENT } from "../node-accents";

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

const FALLBACK_COLOR = ACTIVITY_ACCENT;
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
  return {
    displayName: entry.displayName,
    description: entry.description,
    color: FALLBACK_COLOR,
    Icon,
    colorHint: entry.colorHint,
  };
}
