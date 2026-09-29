/**
 * Library compatibility check for the picker's "Compatible" group
 * (US-100 Scenario 4).
 *
 * A library is "compatible" with the upstream producer iff EVERY input's
 * `kind` is assignable from the producer's kind. The picker only has a
 * single upstream expectation at this stage (`expectedInputKind`, the
 * producer feeding the library), so each input is checked against that
 * one kind — a single incompatible input (at any position, not just the
 * first) disqualifies the library.
 *
 * NOTE: `LibraryPortDescriptor` carries no per-input `required` flag (see
 * packages/graph-workflow `types.ts`), so "every required input" from the
 * original docstring degenerates to "every declared input" — there's no
 * data to distinguish optional inputs. Every `metadata.inputs[]` entry is
 * an entry-point the library expects to be fed, so gating on all of them
 * matches save-time validation, which type-checks every ctx producer →
 * consumer pair regardless of optionality.
 *
 * Legacy / wildcard cases collapse to "compatible":
 *   - Libraries with no inputs (nothing to gate on).
 *   - Missing upstream expectation (`expectedInputKind === undefined`).
 *
 * `isAssignable` treats `undefined` on either side as the `Artifact`
 * wildcard, so a legacy library whose inputs declare no `kind` passes the
 * check even when the upstream producer's kind is concrete (Scenario 4's
 * "legacy libraries land in 'Other libraries'" caveat is handled by the
 * picker's grouping logic — see `LibraryPickerModal`).
 */

import {
  isAssignable,
  type KindRef,
  type LibraryPortDescriptor,
} from "@ai-di/graph-workflow";

export function isLibraryCompatibleWithUpstream(
  inputs: LibraryPortDescriptor[],
  expectedInputKind: KindRef | undefined,
): boolean {
  if (inputs.length === 0) return true;
  if (expectedInputKind === undefined) return true;
  // Every declared input's kind must accept the upstream producer's kind.
  // A single incompatible input (at any position) disqualifies the library.
  return inputs.every((input) => isAssignable(expectedInputKind, input.kind));
}
