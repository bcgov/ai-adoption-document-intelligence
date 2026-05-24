/**
 * Library compatibility check for the picker's "Compatible" group
 * (US-100 Scenario 4).
 *
 * A library is "compatible" with the upstream producer iff every required
 * input's `kind` is assignable from the producer's kind. For Phase 3 the
 * surface is simplified to the FIRST input — parents typically wire their
 * upstream producer into the library's first input slot, and the picker
 * doesn't have access to a per-input expectation map at this stage.
 * Future stories may generalise to a `Record<string, KindRef>` keyed by
 * the input's `path`.
 *
 * Legacy / wildcard cases collapse to "compatible":
 *   - Libraries with no inputs (nothing to gate on).
 *   - Missing upstream expectation (`expectedFirstInputKind === undefined`).
 *
 * `isAssignable` treats `undefined` on either side as the `Artifact`
 * wildcard, so a legacy library whose first input declares no `kind`
 * passes the check even when the upstream producer's kind is concrete
 * (Scenario 4's "legacy libraries land in 'Other libraries'" caveat is
 * handled by the picker's grouping logic — see `LibraryPickerModal`).
 */

import {
  isAssignable,
  type KindRef,
  type LibraryPortDescriptor,
} from "@ai-di/graph-workflow";

export function isLibraryCompatibleWithUpstream(
  inputs: LibraryPortDescriptor[],
  expectedFirstInputKind: KindRef | undefined,
): boolean {
  if (inputs.length === 0) return true;
  if (expectedFirstInputKind === undefined) return true;
  const firstInputKind = inputs[0]?.kind;
  return isAssignable(expectedFirstInputKind, firstInputKind);
}
