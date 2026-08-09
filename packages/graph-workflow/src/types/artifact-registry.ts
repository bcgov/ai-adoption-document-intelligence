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
 * below. The hierarchy declared via `baseKind` matches TYPED_IO_DESIGN.md §1.
 *
 * ── The palette: FIVE tokens, not one per family (item 20, 2026-08-09) ────
 *
 * `color` is a family token, and there are exactly five of them. It is NOT a
 * free-form Mantine colour name any more: the frontend maps each token to one
 * measured hex AND to a non-chromatic handle SHAPE
 * (`apps/frontend/src/features/workflow-builder/canvas/artifact-kind-colour.ts`),
 * so colour is never the only signal. Adding a sixth token silently gets the
 * fallback grey circle — merge into an existing family instead.
 *
 *   blue    Documents & files — the document, or a file standing in for one
 *   violet  Content taken OUT of a document — Segment* and Ocr*
 *   yellow  Judgements ABOUT a document — Classification*, ValidationResult
 *   teal    Pointers at something — Identifier*, Reference
 *   gray    Untyped / wildcard — `Artifact`, and anything unregistered
 *
 * Why five and not seven. The seven-colour scheme this replaces had three
 * pairs that are the same colour to a dichromat, with no lightness difference
 * to fall back on: References teal vs Untyped grey (ΔE 5.2 deuteranopia,
 * 1.06:1 luminance), Documents blue vs Identifiers cyan (ΔE 6.4), Identifiers
 * cyan vs Untyped grey (ΔE 6.9 protanopia). Anything under ΔE ≈ 11 reads as
 * one colour. The five above hold a worst pair of **ΔE 14.2** under BOTH
 * deuteranopia and protanopia (Viénot 1999 simulation, CIEDE2000 distance).
 *
 * What that costs, said plainly: you can no longer tell an `OcrResult` from a
 * `Segment` by dot colour — both are violet. The kind literal is still on the
 * handle tooltip verbatim, on the per-port pill row, and in the validator's
 * refusal. Colour degrades from "the exact type" to "the neighbourhood",
 * which is what lets it survive the kind list growing.
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

  // Segment family → violet, WITH the OcrResult family below it: both are
  // "content taken out of a document", and item 20 merged them into one
  // visual family. See the block comment above `ARTIFACT_REGISTRY`.
  Segment: {
    displayName: "Segment",
    color: "violet",
    baseKind: "Artifact",
    isArray: false,
  },
  "Segment<Text>": {
    displayName: "Segment (Text)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Table>": {
    displayName: "Segment (Table)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Figure>": {
    displayName: "Segment (Figure)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Form>": {
    displayName: "Segment (Form)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<KeyValue>": {
    // Sentence-cased rendering of the camelCase `KeyValue` parameter
    // so the UI label doesn't leak camelCase per Scenario 2.
    displayName: "Segment (Key/value)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Signature>": {
    displayName: "Segment (Signature)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  "Segment<Header>": {
    displayName: "Segment (Header)",
    color: "violet",
    baseKind: "Segment",
    isArray: false,
  },
  DocumentSegment: {
    displayName: "Document segment",
    color: "violet",
    baseKind: "Segment",
    fields: zodToFields(DocumentSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  TypedSegment: {
    // fields from the extend-schema repeat DocumentSegment's four;
    // resolveKindFields dedupes by name, so resolution stays 7 fields.
    displayName: "Typed segment",
    color: "violet",
    baseKind: "DocumentSegment",
    fields: zodToFields(TypedSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  ClassifiedPageSegment: {
    displayName: "Classified page segment",
    color: "violet",
    baseKind: "Segment",
    fields: zodToFields(ClassifiedPageSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },
  LabeledSegment: {
    displayName: "Labeled segment",
    color: "violet",
    baseKind: "Segment",
    fields: zodToFields(LabeledSegmentSchema, KIND_SCHEMAS),
    isArray: false,
  },

  // OcrResult family → violet, same family as Segment above.
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

  // Classification + ValidationResult → yellow. Both are JUDGEMENTS about a
  // document rather than the document or its content (item 20).
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

  // Reference → teal, WITH the Identifier family below it: both are
  // POINTERS at something rather than the thing itself (item 20).
  Reference: {
    displayName: "Reference",
    color: "teal",
    baseKind: "Artifact",
    isArray: false,
  },

  // Identifier family → teal (2026-08-02, UX-walkthrough follow-up).
  // Branded ids that were previously untyped `Artifact` strings, which made
  // them invisible to auto-wire and both hover-extend directions and painted
  // most port dots grey. Sibling identifiers deliberately share only the
  // `Identifier` base, so a DocumentId can never satisfy a GroupId port.
  Identifier: {
    displayName: "Identifier",
    color: "teal",
    baseKind: "Artifact",
    isArray: false,
  },
  DocumentId: {
    displayName: "Document ID",
    color: "teal",
    baseKind: "Identifier",
    isArray: false,
  },
  GroupId: {
    displayName: "Group ID",
    color: "teal",
    baseKind: "Identifier",
    isArray: false,
  },
  ModelId: {
    displayName: "Model ID",
    color: "teal",
    baseKind: "Identifier",
    isArray: false,
  },
  RequestId: {
    displayName: "Request ID",
    color: "teal",
    baseKind: "Identifier",
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

/** Belt-and-suspenders bound on the `baseKind` walk (matches kind-fields.ts). */
const MAX_FAMILY_CHAIN = 16;

/**
 * Walk the live-registry `baseKind` chain to a kind's FAMILY ROOT — the direct
 * child of `Artifact` (e.g. `PreparedFile` → `Document`, `TypedSegment` →
 * `Segment`, re-parented `MultiPageDocument` → `DocumentRef` → `Document`).
 * Returns the input unchanged for unknown kinds or a kind whose base is
 * `Artifact`/absent. Pass an ELEMENT kind (strip `[]` first).
 *
 * Single source of truth for family classification so preview dispatch, kind
 * selects, canvas grouping, etc. never re-implement the walk and drift on
 * dynamically-registered kinds or deeper hierarchies.
 */
export function resolveKindFamilyRoot(kind: string): string {
  let current = kind;
  for (let i = 0; i < MAX_FAMILY_CHAIN; i++) {
    const base = getArtifactKindMeta(current)?.baseKind;
    if (base === undefined || base === "Artifact") return current;
    current = base;
  }
  return current;
}
