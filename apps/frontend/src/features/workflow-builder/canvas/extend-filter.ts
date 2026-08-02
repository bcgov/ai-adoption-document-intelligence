/**
 * §9 — kind-aware filtering for the extend popover. "Accepts K" means the
 * activity has at least one AUTO-WIREABLE input assignable from K; base-
 * `Artifact` wildcard inputs are deliberately NOT matches (they accept
 * everything — filtering on them is noise), mirroring shouldAutoWirePort.
 *
 * Helpers are keyed by `activityType` (not by the popover's
 * `UserFacingCatalogEntry` shape) so they compose with the popover's data
 * model without coupling to it — the catalog lookup happens internally.
 */
import {
  getActivityCatalogEntry,
  isAssignable,
  type KindRef,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";

/**
 * True iff `activityType` has an auto-wireable input port a value of kind
 * `kind` is assignable to. Unknown activity types return false.
 */
export function entryAcceptsKind(activityType: string, kind: KindRef): boolean {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return false;
  return entry.inputs.some(
    (port) => shouldAutoWirePort(port) && isAssignable(kind, port.kind),
  );
}

/**
 * The name of the first auto-wireable input port (declaration order) that a
 * value of kind `kind` is assignable to, or `null` when none match / the
 * activity is unknown. Used to pick which port §6.1 pins on the auto-wire.
 */
export function firstMatchingInputPort(
  activityType: string,
  kind: KindRef,
): string | null {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return null;
  const match = entry.inputs.find(
    (port) => shouldAutoWirePort(port) && isAssignable(kind, port.kind),
  );
  return match ? match.name : null;
}

/**
 * Stable partition that ranks activities with an EXACT-kind input
 * (`port.kind === kind`) ahead of those that merely accept `kind` via the
 * subtype walk. Relative order within each partition is preserved.
 */
export function rankActivityTypesForKind(
  activityTypes: string[],
  kind: KindRef,
): string[] {
  const hasExactInput = (activityType: string): boolean => {
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) return false;
    return entry.inputs.some(
      (port) => shouldAutoWirePort(port) && port.kind === kind,
    );
  };
  const exact: string[] = [];
  const assignable: string[] = [];
  for (const activityType of activityTypes) {
    if (hasExactInput(activityType)) exact.push(activityType);
    else assignable.push(activityType);
  }
  return [...exact, ...assignable];
}

// ---------------------------------------------------------------------------
// Producer-side mirror (UX walkthrough 2026-07-29) — the popover can
// extend UPSTREAM from an input handle ("what produces the <kind> this port
// needs?"), so each accept-side helper gets a produce-side twin. "Produces K"
// means the activity has at least one typed output assignable TO K.
// ---------------------------------------------------------------------------

/**
 * True iff `activityType` has a typed output port whose kind is assignable
 * to `kind`. Unknown activity types return false.
 */
export function entryProducesKind(
  activityType: string,
  kind: KindRef,
): boolean {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return false;
  return entry.outputs.some(
    (port) => port.kind !== undefined && isAssignable(port.kind, kind),
  );
}

/**
 * The name of the first typed output port (declaration order) assignable to
 * `kind`, or `null` when none match / the activity is unknown. Used to pick
 * which producer port an upstream extend pins.
 */
export function firstMatchingOutputPort(
  activityType: string,
  kind: KindRef,
): string | null {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return null;
  const match = entry.outputs.find(
    (port) => port.kind !== undefined && isAssignable(port.kind, kind),
  );
  return match ? match.name : null;
}

/**
 * Stable partition that ranks activities with an EXACT-kind output ahead of
 * those whose output is merely assignable. Mirror of
 * `rankActivityTypesForKind`.
 */
export function rankActivityTypesProducingKind(
  activityTypes: string[],
  kind: KindRef,
): string[] {
  const hasExactOutput = (activityType: string): boolean => {
    const entry = getActivityCatalogEntry(activityType);
    if (!entry) return false;
    return entry.outputs.some((port) => port.kind === kind);
  };
  const exact: string[] = [];
  const assignable: string[] = [];
  for (const activityType of activityTypes) {
    if (hasExactOutput(activityType)) exact.push(activityType);
    else assignable.push(activityType);
  }
  return [...exact, ...assignable];
}
