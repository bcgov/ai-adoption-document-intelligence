/**
 * Kind → effective field list (KIND_FIELD_SCHEMAS_DESIGN.md §4 step 2).
 *
 * Walks the `baseKind` chain in the live registry, merging inherited fields
 * with own fields (own wins on name collision) in base-chain declaration
 * order (a collided field keeps the ancestor's position but carries the
 * child's descriptor). Array kinds return [] — a value is drilled as its
 * ELEMENT type once unwrapped (map itemCtxKey); direct `documents[].x`
 * drill-down is out of scope in v1 (spec §7). Unknown kinds and kinds
 * without fields return [] (graceful degradation, spec §2 principle 5).
 *
 * Pure over registry state; no React, no config.
 */
import type { FieldDescriptor } from "../catalog/source-types";
import { getArtifactKindMeta } from "./artifact-registry";

/** Belt-and-suspenders bound on baseKind walks. */
const MAX_BASE_CHAIN = 16;

export function resolveKindFields(kind: string): FieldDescriptor[] {
  if (kind.endsWith("[]")) return [];
  const ownFirst: FieldDescriptor[][] = [];
  let current: string | undefined = kind;
  for (let i = 0; current !== undefined && i < MAX_BASE_CHAIN; i++) {
    const meta = getArtifactKindMeta(current);
    if (meta === undefined) break;
    if (meta.fields !== undefined) ownFirst.push(meta.fields);
    current = meta.baseKind;
  }
  const merged = new Map<string, FieldDescriptor>();
  // Insert ancestors first so Map fixes positions in base-chain order, then
  // let child descriptors overwrite on collision (Map keeps first position).
  for (let i = ownFirst.length - 1; i >= 0; i--) {
    for (const field of ownFirst[i]) merged.set(field.name, field);
  }
  return [...merged.values()];
}
