/**
 * Runtime registry mapping every `ArtifactKind` to its UI metadata
 * (display name + Mantine colour name + base-kind pointer for the
 * nominal-subtyping hierarchy declared in TYPED_IO_DESIGN.md §1).
 *
 * Two surfaces:
 *
 *   - `ARTIFACT_REGISTRY` — the readonly snapshot of the v1 vocabulary
 *     declared at module load. Consumers that only need the closed set
 *     of v1 kinds can index this directly.
 *   - `getArtifactKindMeta(kind)` / `registerArtifactKind(kind, meta)` —
 *     the live API used by Phase 6's dynamic-node registration. Backed
 *     by an internal `Map` seeded from `ARTIFACT_REGISTRY` that also
 *     captures any runtime registrations.
 *
 * Why a Mantine colour name (not a hex code)? The package stays
 * UI-framework-agnostic by emitting `"blue"` / `"green"` etc.; the
 * frontend handle renderer translates those into theme shades. See
 * TYPED_IO_DESIGN.md §4.
 *
 * Note on "amber" → `"yellow"`: TYPED_IO_DESIGN.md §4 specifies the
 * Classification + ValidationResult families as "amber", but Mantine v7's
 * default palette has no `amber` swatch. `yellow` is the closest match in
 * Mantine's palette (more saturated than `orange`), so we use that here.
 */

import type { FieldDescriptor } from "../catalog/source-types";
import type { ArtifactKind } from "./artifacts";
import {
  ClassifiedPageSegmentSchema,
  DocumentSegmentSchema,
  KIND_SCHEMAS,
  LabeledSegmentSchema,
  OcrResultSchema,
  PreparedFileSchema,
  TypedSegmentSchema,
} from "./kind-schemas";
import { zodToFields } from "./zod-to-fields";

/**
 * Per-kind UI metadata. `isArray` is always `false` on registry entries
 * because cardinality is encoded into the kind string (`"Document[]"`),
 * not the registry entry — see US-091 for how `isAssignable` parses
 * array suffixes.
 */
export interface ArtifactKindMeta {
  displayName: string;
  color: string;
  baseKind?: ArtifactKind;
  /**
   * The kind's OWN field schema (excludes inherited — resolution walks
   * `baseKind`; see kind-fields.ts). Derived from the kind's Zod schema via
   * `zodToFields`, never hand-written, so it cannot drift from the runtime
   * type (KIND_FIELD_SCHEMAS_DESIGN.md §3.4). Absent = no drill-down.
   */
  fields?: FieldDescriptor[];
  isArray: false;
}

/**
 * Frozen snapshot of the v1 vocabulary. Indexed by the `ArtifactKind`
 * union — TypeScript enforces full coverage via the `satisfies` clause
 * below. The hierarchy declared via `baseKind` matches TYPED_IO_DESIGN.md
 * §1; the palette matches §4.
 */
export const ARTIFACT_REGISTRY: Readonly<
  Record<ArtifactKind, ArtifactKindMeta>
> = Object.freeze({
  Artifact: { displayName: "Artifact", color: "gray", isArray: false },

  // Document family → blue
  Document: {
    displayName: "Document",
    color: "blue",
    baseKind: "Artifact",
    isArray: false,
  },
  DocumentRef: {
    displayName: "Document ref",
    color: "blue",
    baseKind: "Document",
    isArray: false,
  },
  MultiPageDocument: {
    displayName: "Multi-page document",
    color: "blue",
    baseKind: "DocumentRef",
    isArray: false,
  },
  SinglePageDocument: {
    displayName: "Single-page document",
    color: "blue",
    baseKind: "DocumentRef",
    isArray: false,
  },
  PreparedFile: {
    displayName: "Prepared file",
    color: "blue",
    baseKind: "Document",
    fields: zodToFields(PreparedFileSchema, KIND_SCHEMAS),
    isArray: false,
  },
  DocumentContent: {
    displayName: "Document content",
    color: "blue",
    baseKind: "Document",
    isArray: false,
  },

  // Segment family → green
  Segment: {
    displayName: "Segment",
    color: "green",
    baseKind: "Artifact",
    isArray: false,
  },
  "Segment<Text>": {
    displayName: "Segment (Text)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Table>": {
    displayName: "Segment (Table)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Figure>": {
    displayName: "Segment (Figure)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Form>": {
    displayName: "Segment (Form)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<KeyValue>": {
    // Sentence-cased rendering of the camelCase `KeyValue` parameter
    // so the UI label doesn't leak camelCase per Scenario 2.
    displayName: "Segment (Key/value)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Signature>": {
    displayName: "Segment (Signature)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Header>": {
    displayName: "Segment (Header)",
    color: "green",
    baseKind: "Segment",
    isArray: false,
  },
  DocumentSegment: {
    displayName: "Document segment",
    color: "green",
    baseKind: "Segment",
    fields: zodToFields(DocumentSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  TypedSegment: {
    // fields from the extend-schema repeat DocumentSegment's four;
    // resolveKindFields dedupes by name, so resolution stays 7 fields.
    displayName: "Typed segment",
    color: "green",
    baseKind: "DocumentSegment",
    fields: zodToFields(TypedSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  ClassifiedPageSegment: {
    displayName: "Classified page segment",
    color: "green",
    baseKind: "Segment",
    fields: zodToFields(ClassifiedPageSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  LabeledSegment: {
    displayName: "Labeled segment",
    color: "green",
    baseKind: "Segment",
    fields: zodToFields(LabeledSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },

  // OcrResult family → violet
  OcrResult: {
    displayName: "OCR result",
    color: "violet",
    baseKind: "Artifact",
    fields: zodToFields(OcrResultSchema, KIND_SCHEMAS),
    isArray: false,
  },
  OcrFields: {
    displayName: "OCR fields",
    color: "violet",
    baseKind: "OcrResult",
    isArray: false,
  },
  OcrTable: {
    displayName: "OCR table",
    color: "violet",
    baseKind: "OcrResult",
    isArray: false,
  },

  // Classification + ValidationResult → "amber" per design doc; using
  // `"yellow"` as the closest match in Mantine v7's default palette.
  Classification: {
    displayName: "Classification",
    color: "yellow",
    baseKind: "Artifact",
    isArray: false,
  },
  ClassificationLabel: {
    displayName: "Classification label",
    color: "yellow",
    baseKind: "Classification",
    isArray: false,
  },
  LabeledDocumentMap: {
    // Dynamic-key record (label → classified documents) — deliberately
    // schema-free; zodToFields refuses records and drill-down does not
    // apply (KIND_TAXONOMY_REFINEMENT_DESIGN.md §3).
    displayName: "Labeled documents",
    color: "yellow",
    baseKind: "Classification",
    isArray: false,
  },
  ValidationResult: {
    displayName: "Validation result",
    color: "yellow",
    baseKind: "Artifact",
    isArray: false,
  },

  // Reference → teal
  Reference: {
    displayName: "Reference",
    color: "teal",
    baseKind: "Artifact",
    isArray: false,
  },
} as const satisfies Record<ArtifactKind, ArtifactKindMeta>);

/**
 * Live mutable map seeded from `ARTIFACT_REGISTRY`. `registerArtifactKind`
 * mutates this map; `getArtifactKindMeta` reads from it, so runtime
 * registrations are visible to all callers that go through the helper.
 *
 * `ARTIFACT_REGISTRY` itself is a frozen snapshot of the v1 vocabulary and
 * does NOT reflect runtime additions — callers needing the dynamic view
 * must use `getArtifactKindMeta`.
 */
const liveRegistry: Map<string, ArtifactKindMeta> = new Map(
  Object.entries(ARTIFACT_REGISTRY),
);

/**
 * Register a new kind at runtime (Phase 6's dynamic-node bridge).
 *
 * Throws:
 *   - `Error('baseKind "<x>" not found in registry')` if `meta.baseKind`
 *     is set but does not resolve in the live registry.
 *   - `Error('kind "<x>" already registered')` if `kind` is already in
 *     the live registry (no silent overwrite).
 */
export function registerArtifactKind(
  kind: string,
  meta: ArtifactKindMeta,
): void {
  if (liveRegistry.has(kind)) {
    throw new Error(`kind "${kind}" already registered`);
  }
  if (meta.baseKind !== undefined && !liveRegistry.has(meta.baseKind)) {
    throw new Error(`baseKind "${meta.baseKind}" not found in registry`);
  }
  liveRegistry.set(kind, meta);
}

/**
 * Look up a kind in the live registry. Returns `undefined` for unknown
 * kinds; callers (validator, renderer) treat `undefined` as the wildcard
 * `Artifact` per TYPED_IO_DESIGN.md §3.
 */
export function getArtifactKindMeta(
  kind: string,
): ArtifactKindMeta | undefined {
  return liveRegistry.get(kind);
}
