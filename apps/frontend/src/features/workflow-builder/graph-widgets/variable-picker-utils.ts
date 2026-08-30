/**
 * Pure helpers for `VariablePicker`'s typed-I/O sort + tooltip surface
 * (US-097).
 *
 * Given a flat list of ctx variables the picker would otherwise show and
 * the expected `KindRef` of the target port, `sortVariablesByCompatibility`
 * splits the list into a compatible-first / incompatible-second pair and
 * emits a human-readable reason string for each incompatible entry. The
 * reason text is the exact tooltip copy required by Scenario 2.
 *
 * Pure — no React, no DOM, no side effects.
 */

import { isAssignable, type KindRef } from "@ai-di/graph-workflow";

/**
 * One row the picker would otherwise show. Callers populate `producerKind`
 * by resolving the upstream producer (see `resolve-producer-kind.ts`); when
 * the producer has no declared kind, leaving the field `undefined` keeps
 * the row in the compatible group per US-091 Scenario 4 (Artifact wildcard).
 */
export interface VariablePickerEntry {
  /** Stable identifier for the picker row (typically the ctx key path). */
  id: string;
  /** Display label rendered in the picker row. */
  label: string;
  /** ctx key the row binds to when picked. */
  ctxKey: string;
  /**
   * The cached kind of this variable's producer. `undefined` for legacy
   * producers or manual ctx declarations without a `kind`; treated as the
   * `Artifact` wildcard by `isAssignable`.
   */
  producerKind?: KindRef;
}

export interface CompatibilityResult {
  /** Entries the target port accepts; preserves caller-supplied ordering. */
  compatible: VariablePickerEntry[];
  /** Entries the target port rejects; preserves caller-supplied ordering. */
  incompatible: VariablePickerEntry[];
  /**
   * Map from `entry.id` → human-readable tooltip text for incompatible
   * entries. The exact format is
   * `"<producerKind> — incompatible with this port (expects <consumerKind>)"`
   * (Scenario 2). Compatible entries do not appear in the map.
   */
  reasons: Map<string, string>;
}

/**
 * Split `variables` into compatible-first / incompatible-second buckets
 * relative to `expectedKind`. When `expectedKind === undefined`, returns
 * every variable in the compatible bucket with an empty `reasons` map and
 * an empty `incompatible` bucket — the picker renders that path as the
 * legacy pre-Phase-3 flat list (Scenario 3).
 */
export function sortVariablesByCompatibility(
  variables: VariablePickerEntry[],
  expectedKind: KindRef | undefined,
): CompatibilityResult {
  if (expectedKind === undefined) {
    return {
      compatible: [...variables],
      incompatible: [],
      reasons: new Map(),
    };
  }

  const compatible: VariablePickerEntry[] = [];
  const incompatible: VariablePickerEntry[] = [];
  const reasons = new Map<string, string>();

  for (const entry of variables) {
    if (isAssignable(entry.producerKind, expectedKind)) {
      compatible.push(entry);
    } else {
      incompatible.push(entry);
      // `entry.producerKind` cannot be `undefined` here — `isAssignable`
      // returns true when either side is undefined, so an incompatible
      // entry always has a concrete producer kind. The `?? "Artifact"`
      // fall-back keeps the format defensible if that contract ever
      // changes.
      const fromKind = entry.producerKind ?? "Artifact";
      reasons.set(
        entry.id,
        `${fromKind} — incompatible with this port (expects ${expectedKind})`,
      );
    }
  }

  return { compatible, incompatible, reasons };
}
