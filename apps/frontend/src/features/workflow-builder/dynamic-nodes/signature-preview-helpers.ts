/**
 * Pure helpers for `SignaturePreviewPane` (Phase 6 US-178).
 *
 * Split from the component so the unit tests can exercise the kind-color
 * mapping + the params-schema "empty?" check without rendering the whole
 * card.
 */

import type {
  ActivityCatalogEntry,
  DynamicNodeSignature,
  KindRef,
} from "@ai-di/graph-workflow";
import { colorForKind, portDotColor } from "../canvas/artifact-kind-colour";
import type { JsonSchemaProperty as ImportedJsonSchemaProperty } from "../json-schema-form";

/**
 * Re-export the JSON Schema property type so the signature card can
 * pass the dynamic-node's `paramsSchema` into `JsonSchemaForm` with a
 * minimal cast. The runtime shape (object-with-properties or array of
 * `anyOf` variants) is exactly what `JsonSchemaForm` expects.
 */
export type JsonSchemaProperty = ImportedJsonSchemaProperty;

/**
 * Map an `ArtifactKind` declaration string to the colour the canvas paints
 * that kind's ports in. Strips a trailing `[]` so `Document[]` and `Document`
 * share a colour. Unknown kinds fall back to the untyped grey.
 *
 * This used to be a hand-written `KIND_COLOR_TOKENS` map, and by 2026-08-09 it
 * had drifted badly: it coloured `Segment` teal and `ValidationResult` green
 * where the registry says violet and yellow, and half its keys — `OcrPage`,
 * `OcrLine`, `OcrToken`, `QualityReport`, `ReferenceData` — were not registry
 * kinds at all, so they could never match anything a signature declares. A
 * developer previewing a dynamic node saw one colour here and a different one
 * on the canvas for the same port. It reads the live registry now (item 20).
 */
export function resolveKindColor(kindDeclaration: string): string {
  return portDotColor(colorForKind(kindDeclaration as KindRef));
}

/**
 * Adapt the parser's `ActivityCatalogEntry` output into the
 * `DynamicNodeSignature` shape the SignaturePreviewPane consumes.
 *
 * The shared `parseDynamicNodeSignature` (US-159) returns a fully-derived
 * `ActivityCatalogEntry` rather than a raw `DynamicNodeSignature`
 * (catalog-entry is the canonical post-publish shape). The preview pane
 * is happier working against the simpler signature shape — this adapter
 * is the seam.
 *
 * Field mapping:
 *  - `name`           ← `entry.dynamicNodeSlug` (always set by the parser)
 *  - `description`    ← `entry.description`
 *  - `category`       ← `entry.category`
 *  - `deterministic`  ← `!entry.nonCacheable` (the parser writes
 *                       `nonCacheable: !deterministic` on every dynamic entry)
 *  - `inputs/outputs` ← `entry.inputs/outputs` mapped to the
 *                       `DynamicNodePort` shape (use `label` as port name
 *                       when `kind` is absent — the parser always emits
 *                       a `kind` for dynamic entries, so this branch is
 *                       defensive)
 *  - `paramsSchema`   ← `entry.paramsSchema ?? {}` (empty schema if absent)
 *  - `allowNet`       ← `entry.allowNet ?? []`
 *  - `timeoutMs` / `maxMemoryMB`: not on the catalog entry — derive from
 *                       sensible defaults (60_000 / 256) since the
 *                       preview pane doesn't render them.
 */
export function adaptEntryToSignature(
  entry: ActivityCatalogEntry,
): DynamicNodeSignature {
  return {
    name: entry.dynamicNodeSlug ?? entry.activityType,
    description: entry.description,
    category: entry.category,
    deterministic: !entry.nonCacheable,
    inputs: entry.inputs.map((p) => ({
      name: p.name,
      kind: (p.kind as string | undefined) ?? "Artifact",
      required: p.required,
      description: p.description,
    })),
    outputs: entry.outputs.map((p) => ({
      name: p.name,
      kind: (p.kind as string | undefined) ?? "Artifact",
      required: p.required,
      description: p.description,
    })),
    paramsSchema: entry.paramsSchema ?? {},
    allowNet: entry.allowNet ?? [],
    timeoutMs: 60_000,
    maxMemoryMB: 256,
  };
}

/**
 * Whether a JSON Schema 7 `paramsSchema` declares no usable fields.
 * The signature-preview pane hides the Parameters block in that case
 * (Scenario 4: "if `paramsSchema` declares no properties, the parameters
 * block is hidden").
 *
 * Treats absence, `null`, non-object, and `{ properties: {} }` as empty;
 * an `anyOf` discriminated-union schema is always considered non-empty
 * (the discriminator itself is a renderable field).
 */
export function isParamsSchemaEmpty(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return true;
  const record = schema as Record<string, unknown>;
  // Discriminated-union (Zod's `z.discriminatedUnion → anyOf`) renders.
  if (Array.isArray(record.anyOf) && record.anyOf.length > 0) {
    return false;
  }
  const props = record.properties;
  if (!props || typeof props !== "object") return true;
  return Object.keys(props as Record<string, unknown>).length === 0;
}
