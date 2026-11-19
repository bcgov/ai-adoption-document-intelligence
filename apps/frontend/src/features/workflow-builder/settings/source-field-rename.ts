/**
 * G-040 — a `source.api` field rename carries its consumers with it.
 *
 * A `source.api` node's `fields[]` names ARE ctx keys: each descriptor becomes
 * a top-level ctx key after the runtime's body-validation step. Renaming one in
 * the field editor therefore does exactly what renaming a ctx declaration does
 * — except the ctx drawer sweeps the graph (`renameCtxKeyInConfig`) and the
 * field editor swept nothing, so every binding, condition ref and mapping that
 * read the old name was left pointing at a key that no longer exists.
 *
 * G-008 already taught `renameCtxKeyInConfig` to rewrite source field names
 * when a ctx key is renamed. This is the same sweep driven from the other end,
 * so the two directions stay symmetric.
 */
import type { FieldDescriptor } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { renameCtxKeyInConfig } from "./rename-ctx-key";

export interface FieldRename {
  from: string;
  to: string;
}

/**
 * Positional diff of two `fields[]` arrays.
 *
 * Renames are only inferred when the arrays are the SAME LENGTH. An add or a
 * remove shifts every later row, and a shifted row is indistinguishable from a
 * renamed one by position alone — inferring a rename there would rewrite
 * bindings the author never touched. The field editor commits a name on blur,
 * never per keystroke, so a real rename always arrives as a same-length diff.
 *
 * A rename out of or into an empty name is not a rename: an empty name is an
 * unfinished row, and no consumer can be bound to it.
 */
export function diffFieldNames(
  prev: readonly FieldDescriptor[],
  next: readonly FieldDescriptor[],
): FieldRename[] {
  if (prev.length !== next.length) return [];
  const renames: FieldRename[] = [];
  for (let i = 0; i < prev.length; i += 1) {
    const from = prev[i]?.name ?? "";
    const to = next[i]?.name ?? "";
    if (from === "" || to === "" || from === to) continue;
    renames.push({ from, to });
  }
  return renames;
}

/**
 * Reads `fields[]` off a source node's parameters, tolerating the shapes an
 * unconfigured or hand-edited node can carry (absent, null, non-array).
 */
export function readFields(
  parameters: Record<string, unknown> | undefined,
): FieldDescriptor[] {
  const fields = parameters?.fields;
  return Array.isArray(fields) ? (fields as FieldDescriptor[]) : [];
}

/**
 * Applies every rename `prev` → `next` implies to `config`, which must ALREADY
 * carry the new field names (the parameters write lands first). Renaming
 * `from` → `to` then leaves the source node's own field alone — it is already
 * `to` — and rewrites the consumers that still say `from`.
 *
 * Returns the same config reference when nothing was renamed.
 */
export function applySourceFieldRenames(
  config: GraphWorkflowConfig,
  prev: readonly FieldDescriptor[],
  next: readonly FieldDescriptor[],
): GraphWorkflowConfig {
  const renames = diffFieldNames(prev, next);
  let out = config;
  for (const { from, to } of renames) {
    out = renameCtxKeyInConfig(out, from, to);
  }
  return out;
}
