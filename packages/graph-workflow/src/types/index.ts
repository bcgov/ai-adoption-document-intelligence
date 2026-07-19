/**
 * Barrel for the typed-I/O artifact module.
 *
 * Re-exports the canonical `ArtifactKind` union, its array-cardinality
 * counterpart `ArrayKind`, the combined `KindRef`, and the runtime
 * `Segment` provenance interface (US-089). Also re-exports the runtime
 * registry surface (US-090) — `ARTIFACT_REGISTRY`, `ArtifactKindMeta`,
 * `registerArtifactKind`, `getArtifactKindMeta` — and the subtype-check
 * function `isAssignable` (US-091). See TYPED_IO_DESIGN.md §1, §6.
 */

export type { ArtifactKindMeta } from "./artifact-registry";
export {
  ARTIFACT_REGISTRY,
  getArtifactKindMeta,
  registerArtifactKind,
  resolveKindFamilyRoot,
} from "./artifact-registry";
export type { ArrayKind, ArtifactKind, KindRef, Segment } from "./artifacts";
export { resolveKindFields } from "./kind-fields";
export type {
  ClassifiedPageSegment,
  DocumentSegment,
  LabeledSegment,
  OcrPayloadRef,
  PreparedFileData,
  SegmentWithType,
} from "./kind-schemas";
export {
  ClassifiedPageSegmentSchema,
  DocumentSegmentSchema,
  KIND_SCHEMAS,
  LabeledSegmentSchema,
  OcrResultSchema,
  PreparedFileSchema,
  TypedSegmentSchema,
} from "./kind-schemas";
export { isAssignable } from "./subtype-check";
export type { KindSchemaMap } from "./zod-to-fields";
export { zodToFields } from "./zod-to-fields";
