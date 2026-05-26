/**
 * Shared helpers for resolving a Mantine palette colour from an
 * `ARTIFACT_REGISTRY` kind. Reused by `NodeTypePill` and `NodeTypePillRow`
 * so the two surfaces never drift.
 */

import { getArtifactKindMeta, type KindRef } from "@ai-di/graph-workflow";

/**
 * Strip a `T[]` suffix from a `KindRef`, returning the element kind so the
 * registry lookup resolves through the family root. `Segment[]` → `Segment`.
 * Non-array kinds pass through unchanged.
 */
export function elementKindOf(kind: KindRef): string {
  return kind.endsWith("[]") ? kind.slice(0, -2) : kind;
}

/**
 * Resolve the Mantine palette colour for a kind via the live registry.
 * Falls back to gray for the `Artifact` wildcard and for unknown kinds.
 */
export function colorForKind(kind: KindRef | undefined): string {
  if (kind === undefined) return "gray";
  const meta = getArtifactKindMeta(elementKindOf(kind));
  return meta?.color ?? "gray";
}
