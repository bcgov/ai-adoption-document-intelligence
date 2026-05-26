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
} from "@ai-di/graph-workflow";
import type { JsonSchemaProperty as ImportedJsonSchemaProperty } from "../json-schema-form";

/**
 * Re-export the JSON Schema property type so the signature card can
 * pass the dynamic-node's `paramsSchema` into `JsonSchemaForm` with a
 * minimal cast. The runtime shape (object-with-properties or array of
 * `anyOf` variants) is exactly what `JsonSchemaForm` expects.
 */
export type JsonSchemaProperty = ImportedJsonSchemaProperty;

/**
 * The Phase 3 kind palette. Mirrors `catalog-utils.ts`'s `COLOR_TOKENS`
 * but mapped from `ArtifactKind` names rather than `colorHint` tokens —
 * the dynamic-node signature carries declared kinds (`Document`,
 * `Segment[]`, `OcrTable[]` …), so we map kind → color directly.
 *
 * The mapping is deliberately small + extensible: unknown kinds fall
 * back to gray. Phase 3's typed-I/O registry will grow this list as new
 * kinds are added.
 */
export const KIND_COLOR_TOKENS: Record<string, string> = {
  // Document / content kinds
  Document: "#3b82f6", // blue
  Segment: "#14b8a6", // teal
  Artifact: "#6b7280", // gray (generic)
  // OCR-related kinds
  OcrPage: "#8b5cf6", // violet
  OcrLine: "#a78bfa", // lavender
  OcrTable: "#06b6d4", // cyan
  OcrToken: "#eab308", // yellow
  // Validation / quality kinds
  ValidationResult: "#22c55e", // green
  QualityReport: "#f97316", // orange
  // Reference / catalog kinds
  ReferenceData: "#6366f1", // indigo
};

const FALLBACK_KIND_COLOR = "#6b7280"; // gray

/**
 * Map an `ArtifactKind` declaration string to a Mantine-token-style hex.
 * Strips a trailing `[]` so `Document[]` and `Document` share a colour
 * (per the Phase 3 brief — array-of-kind colours match scalar-kind).
 * Unknown kinds fall back to gray.
 */
export function resolveKindColor(kindDeclaration: string): string {
  const stripped = kindDeclaration.endsWith("[]")
    ? kindDeclaration.slice(0, -2)
    : kindDeclaration;
  return KIND_COLOR_TOKENS[stripped] ?? FALLBACK_KIND_COLOR;
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
