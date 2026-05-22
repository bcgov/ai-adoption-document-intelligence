/**
 * Catalog types — shared metadata for activity and control-flow nodes.
 *
 * The catalog drives both backend save-time parameter validation and frontend
 * palette/settings rendering. Each activity declares:
 *   - identity (activityType, displayName, category)
 *   - visual hints (icon, colorHint)
 *   - input/output slot names (the `ports` of the PortBinding model)
 *   - a Zod schema describing its parameters
 *
 * The Zod schema is also exported as a JSON Schema artifact via
 * `z.toJSONSchema()`, allowing the frontend renderer (and future
 * LLM-tool-calling consumers) to walk the schema without depending on Zod.
 */

import type { z } from "zod/v4";

/**
 * High-level palette categories. Drives grouping in the node palette UI.
 * See docs-md/workflow-builder/WORKFLOW_NODE_CATALOG.md §11.
 */
export type CatalogCategory =
  | "Flow Control"
  | "File Handling"
  | "OCR (Azure)"
  | "OCR (Mistral)"
  | "OCR Cleanup & Correction"
  | "OCR Quality"
  | "Document Handling"
  | "Validation"
  | "Storage"
  | "Data Transformation"
  | "Reference Data"
  | "Benchmarking";

/**
 * A single input or output slot on an activity. The slot name is the
 * `port` field of a PortBinding; the user binds it to a `ctxKey` at design
 * time.
 */
export interface PortDescriptor {
  /** Slot name, matches the `port` in PortBinding. */
  name: string;
  /** Human-readable label for the settings panel. */
  label: string;
  /** Optional description shown as field help text. */
  description?: string;
  /** Whether this slot must be bound for the workflow to validate. */
  required?: boolean;
}

/**
 * Catalog entry for an activity node.
 *
 * Each activity is a distinct entry in the palette. The `parametersSchema`
 * is the single source of truth for static-parameter validation (backend)
 * and form rendering (frontend).
 */
export interface ActivityCatalogEntry {
  /** Matches `ActivityNode.activityType`. */
  activityType: string;
  /** Display name in the palette and on the node. */
  displayName: string;
  /** Palette category. */
  category: CatalogCategory;
  /** Short description; shown on hover in the palette and at the top of the settings panel. */
  description: string;
  /** Icon identifier (resolved by the frontend; not a component reference). */
  iconHint: string;
  /** Colour hint; resolved by the frontend to a Mantine colour token. */
  colorHint: string;
  /** Required and optional input slots. */
  inputs: PortDescriptor[];
  /** Output slots produced by this activity. */
  outputs: PortDescriptor[];
  /**
   * Zod schema for static parameters (the keys of `ActivityNode.parameters`).
   * Empty object schema if the activity takes no static parameters.
   *
   * Use `z.globalRegistry` (or `.meta({ ... })`) to attach UI hints like
   * `{ widget: "select", options: [...] }` to individual fields.
   */
  parametersSchema: z.ZodType;
}
