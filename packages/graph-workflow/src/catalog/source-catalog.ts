/**
 * Source catalog — sibling registry to `ACTIVITY_CATALOG` for the
 * Phase 8 source-as-node abstraction.
 *
 * Mirrors the activity-catalog surface (`./index.ts`):
 *   - `SOURCE_CATALOG` — the registry of all known source subtypes.
 *   - `getSourceCatalogEntry` — id lookup, returns `undefined` for misses.
 *   - `listSourceTypes` — returns the registered subtype ids.
 *   - `createSourceParameterValidator` — adapter consumed by the shared
 *     validator (US-109); mirrors `createCatalogParameterValidator`'s
 *     callback-with-errors-array shape so the two adapters stay symmetric.
 *   - `deriveSourceOutputSchema` — resolves a `SourceNode` to its
 *     subtype's catalog entry and calls `deriveOutputSchema` on the
 *     node's static parameters.
 *
 * Empty at this milestone (US-108). The two 8.0 entries (`source.api`,
 * `source.upload`) are appended in US-115 + US-116. Until they land,
 * the validator (US-109) will treat every `SourceNode.sourceType` as
 * unknown.
 *
 * See docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md §2.
 */

import { z } from "zod/v4";

import type { GraphValidationError, SourceNode } from "../types";

import { sourceApiCatalogEntry } from "./sources/source-api";
import { sourceUploadCatalogEntry } from "./sources/source-upload";
import type { JsonSchema7, SourceCatalogEntry } from "./source-types";

/**
 * Frozen registry of source catalog entries.
 *
 * US-115 registers `source.api`; US-116 appends `source.upload`.
 * The `readonly` array type forbids callers from mutating the
 * registry at runtime.
 */
export const SOURCE_CATALOG: readonly SourceCatalogEntry[] = Object.freeze([
  sourceApiCatalogEntry,
  sourceUploadCatalogEntry,
] as SourceCatalogEntry[]);

/**
 * Lookup a source catalog entry by `sourceType`. Returns `undefined`
 * when the subtype is not registered — callers are expected to treat
 * an unknown source type as a save-time validation error (see
 * `createSourceParameterValidator` for the adapter that does so).
 *
 * O(n) linear scan; n ≤ 6 in the foreseeable Phase 8 scope, so a Map
 * cache would be premature optimisation.
 */
export function getSourceCatalogEntry(
  sourceType: string,
): SourceCatalogEntry | undefined {
  return SOURCE_CATALOG.find((entry) => entry.type === sourceType);
}

/**
 * Every registered source subtype id. Order matches `SOURCE_CATALOG`
 * registration order, which is the order the palette renders them in.
 */
export function listSourceTypes(): readonly string[] {
  return SOURCE_CATALOG.map((entry) => entry.type);
}

/**
 * JSON Schema for a source subtype's static parameters.
 *
 * Mirrors `getActivityParametersJsonSchema` — the conversion has to
 * happen on the same Zod module that `.meta(...)` was called against,
 * otherwise the metadata registry returns no hits and `title` /
 * `description` / `x-widget` entries silently disappear. Centralising
 * the conversion here keeps frontend callers (e.g. the
 * `SourceNodeSettings` form body) on a single zod instance.
 *
 * Returns `undefined` when the `sourceType` is not registered.
 */
export function getSourceParametersJsonSchema(
  sourceType: string,
): unknown | undefined {
  const entry = getSourceCatalogEntry(sourceType);
  if (!entry) return undefined;
  return z.toJSONSchema(entry.parametersSchema);
}

/**
 * Adapter signature consumed by the shared `validateGraphConfig`
 * (US-109). Mirrors `ValidateActivityParameters` (see
 * `./create-parameter-validator.ts`) — callback-with-errors-array,
 * NOT a Result type, so the two adapters stay symmetric in the
 * shared validator.
 */
export type ValidateSourceParameters = (
  sourceType: string,
  nodeId: string,
  parameters: Record<string, unknown> | undefined,
  errors: GraphValidationError[],
) => void;

/**
 * Build a `validateSourceParameters` callback that runs each source's
 * catalog Zod schema and pushes Zod issues onto the shared
 * `GraphValidationError[]` array.
 *
 * If `catalog` is omitted the default `SOURCE_CATALOG` is used. An
 * unknown `sourceType` is itself a validation error (unlike the
 * activity adapter, the source-type gate lives in this adapter rather
 * than in a separate `isRegisteredSourceType` check) — emits an error
 * with a message naming the unknown subtype, then returns without
 * attempting parameter validation.
 */
export function createSourceParameterValidator(
  catalog: readonly SourceCatalogEntry[] = SOURCE_CATALOG,
): ValidateSourceParameters {
  return (sourceType, nodeId, parameters, errors) => {
    const entry = catalog.find((e) => e.type === sourceType);
    if (!entry) {
      errors.push({
        path: `nodes.${nodeId}.sourceType`,
        message: `Unknown source type: ${sourceType}`,
        severity: "error",
      });
      return;
    }
    const parsed = entry.parametersSchema.safeParse(parameters ?? {});
    if (parsed.success) return;
    for (const issue of parsed.error.issues) {
      const suffix =
        issue.path.length > 0 ? `.${issue.path.join(".")}` : "";
      errors.push({
        path: `nodes.${nodeId}.parameters${suffix}`,
        message: issue.message,
        severity: "error",
      });
    }
  };
}

/**
 * Resolve a `SourceNode` to its catalog entry's derived output JSON
 * Schema. Pure function — no I/O. Used by the backend's `/run-spec`
 * derivation (US-111) and the Phase 3 binding-walk validator (which
 * needs to know what `properties` and `required` the source's
 * downstream consumers can bind to).
 *
 * Throws on unknown `sourceType` — callers are expected to have run
 * the save-time validator (which gates on `createSourceParameterValidator`)
 * upstream.
 */
export function deriveSourceOutputSchema(sourceNode: SourceNode): JsonSchema7 {
  const entry = getSourceCatalogEntry(sourceNode.sourceType);
  if (!entry) {
    throw new Error(
      `Unknown source type \`${sourceNode.sourceType}\` for node \`${sourceNode.id}\``,
    );
  }
  return entry.deriveOutputSchema(sourceNode.parameters ?? {});
}
