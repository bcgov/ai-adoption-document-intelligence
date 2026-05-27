/**
 * Shared helpers for working with `ARTIFACT_REGISTRY` kinds. Reused by the
 * canvas pills, source renderer, handle-style helper, and KindDot widget so
 * those surfaces never drift on either element extraction or colour mapping.
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
 * Split a `KindRef` into its base kind + array-cardinality flag.
 * `"Segment[]"` → `{ baseKind: "Segment", isArray: true }`.
 * `"Document"`  → `{ baseKind: "Document", isArray: false }`.
 */
export function splitKindRef(kind: KindRef): {
  baseKind: string;
  isArray: boolean;
} {
  if (kind.endsWith("[]")) {
    return { baseKind: kind.slice(0, -2), isArray: true };
  }
  return { baseKind: kind, isArray: false };
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
