/**
 * Source catalog types — shared metadata for source-as-node subtypes.
 *
 * Mirrors the activity catalog (`./types.ts`) but for graph-level source
 * markers. Phase 8.0 introduces two source subtypes: `source.api` (push
 * pattern) and `source.upload` (manual pattern). Future Phase 8.x adds
 * pull-pattern sources (`source.cron`, `source.sharepoint`, etc.).
 *
 * The `parametersSchema` is the single source of truth for save-time
 * parameter validation; `deriveOutputSchema` is the single source of
 * truth for the source's output JSON Schema, which in turn feeds the
 * `/run-spec` endpoint and `/runs` body validation.
 *
 * See docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md §2.
 */

import type { ZodSchema } from "zod/v4";

import type { KindRef } from "../types/artifacts";

/**
 * Source runtime pattern — maps to Temporal primitives.
 * - `"push"`   — webhook / API trigger (Phase 8.0: `source.api`).
 * - `"pull"`   — polling / cron (Phase 8.x: `source.cron`,
 *                `source.sharepoint`, `source.email`, `source.s3`).
 * - `"manual"` — canvas-side test affordance (Phase 8.0: `source.upload`).
 *
 * See docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md §3 for the
 * runtime-pattern-to-Temporal-primitive mapping.
 */
export type SourceRuntimePattern = "push" | "pull" | "manual";

/**
 * Minimal JSON Schema 7 object shape returned by
 * `SourceCatalogEntry.deriveOutputSchema`. Matches the shape consumed
 * by `apps/backend-services/src/workflow/build-run-spec.ts` and
 * `derive-input-schema.ts`.
 *
 * JSON Schema is intentionally open-shape; consumers cherry-pick the
 * fields they need (the run-spec endpoint reads `type`, `properties`,
 * `required`; the Phase 3 binding-walk validator reads `properties`
 * and `required`).
 */
export interface JsonSchema7 {
  type?: string;
  properties?: Record<string, JsonSchema7>;
  required?: string[];
  format?: string;
  default?: unknown;
  description?: string;
  title?: string;
  items?: JsonSchema7;
  /**
   * Permissive extension fields — JSON Schema is open-shape; consumers
   * cherry-pick the keys they need.
   */
  [key: string]: unknown;
}

/**
 * One row in the user-authored field list on a `source.api` node.
 *
 * Consumed by the `FieldListEditor` x-widget on the frontend and by
 * `deriveOutputSchema` on the backend (which transforms the rows into
 * a JSON Schema 7 object).
 *
 * Intentionally mirrors the shape of `CtxDeclaration` (see
 * `src/types/index.ts`) minus the `isInput` flag — sources own the
 * input-schema concept first-class, so the flag is redundant on a
 * source-authored field row.
 */
export interface FieldDescriptor {
  /** Property name on the source's output object. */
  name: string;
  /** JSON Schema 7 primitive / structural type. */
  type: "string" | "number" | "boolean" | "object" | "array";
  /** Optional Phase 3 typed-I/O kind annotation. */
  kind?: KindRef;
  /** Whether the field is required in the produced output. */
  required: boolean;
  /** Optional human-readable description (becomes JSON Schema `description`). */
  description?: string;
  /** Optional default value (becomes JSON Schema `default`). */
  defaultValue?: unknown;
}

/**
 * Catalog entry for a source subtype.
 *
 * Mirrors `ActivityCatalogEntry` but for source-as-node subtypes.
 * See docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md §2.
 */
export interface SourceCatalogEntry {
  /** Matches `SourceNode.sourceType` — e.g. `"source.api"`, `"source.upload"`. */
  type: string;
  /** Catalog category — drives palette section. Always `"source"`. */
  category: "source";
  /** Display name in the palette and on the node. */
  displayName: string;
  /** Short description; shown on hover in the palette and at the top of the settings panel. */
  description: string;
  /** Icon identifier (resolved by the frontend; not a component reference). */
  iconHint?: string;
  /** Colour hint; resolved by the frontend to a Mantine colour token. */
  colorHint?: string;
  /**
   * Zod schema for static parameters. Empty object schema if the
   * source takes no static parameters.
   */
  parametersSchema: ZodSchema;
  /** Runtime invocation pattern — see `SourceRuntimePattern`. */
  runtime: SourceRuntimePattern;
  /**
   * Derives the source's output JSON Schema from its configured
   * parameters.
   *
   * MUST be pure (no I/O). Consumed by `/run-spec` derivation,
   * `/runs` body validation, and the Phase 3 binding-walk validator.
   */
  deriveOutputSchema: (parameters: Record<string, unknown>) => JsonSchema7;
  /**
   * Declared typed output kind for the canvas handle. See
   * `KindRef` (Phase 3 typed-I/O).
   */
  outputKind: KindRef;
}
