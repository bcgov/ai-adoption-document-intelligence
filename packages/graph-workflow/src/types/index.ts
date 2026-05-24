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

export type { ArtifactKind, ArrayKind, KindRef, Segment } from "./artifacts";
export type { ArtifactKindMeta } from "./artifact-registry";
export {
  ARTIFACT_REGISTRY,
  registerArtifactKind,
  getArtifactKindMeta,
} from "./artifact-registry";
export { isAssignable } from "./subtype-check";
