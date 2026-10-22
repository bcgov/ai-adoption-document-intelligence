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
 * W-2 — which port a hover-extend should PIN, and why it is confident enough
 * to do so. `null` means "do not pin": the flow edge still lands, and the
 * consumer's input keeps its ordinary automatic resolution rather than being
 * bound to a guess.
 *
 * The reasons are ordered by how much they actually prove:
 *   - `name` — the two ports carry the same name. The strongest signal there
 *     is, and the only one available for identifier ports (see below).
 *   - `exact-kind` — one candidate declares exactly the kind wanted.
 *   - `sole-assignable` — one candidate, reachable through the subtype walk.
 *     Safe only because it is the ONLY option; with two, the pick would be
 *     declaration order, which is not evidence of anything.
 */
export interface PortPick {
  port: string;
  reason: "name" | "exact-kind" | "sole-assignable";
}

/** Case-insensitive port-name equality — the name-affinity test. */
function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && a.toLowerCase() === b.toLowerCase();
}

/**
 * Applies the ranking to an already-filtered candidate list.
 *
 * `kindIsInformative` is the crux (W-2). `Artifact` is the ROOT of the kind
 * lattice, so EVERY kind is assignable to it — a port declared `Artifact` (or
 * declared nothing) is satisfied by every output in the catalog, and
 * "the kinds are compatible" tells you nothing at all about whether the two
 * ports belong together. That is exactly how `blob.read`'s `base64` came to be
 * pinned onto `azureClassify.poll`'s `resultId`. When the kind proves nothing,
 * only the name lane can justify a pin.
 */
function rankCandidates(
  candidates: readonly { name: string; kind?: KindRef }[],
  kind: KindRef,
  counterpartPortName: string | undefined,
  kindIsInformative: boolean,
): PortPick | null {
  const byName = candidates.filter((port) =>
    sameName(port.name, counterpartPortName),
  );
  if (byName.length === 1) return { port: byName[0].name, reason: "name" };

  if (!kindIsInformative) return null;

  const exact = candidates.filter((port) => port.kind === kind);
  if (exact.length === 1) return { port: exact[0].name, reason: "exact-kind" };
  if (exact.length > 1) return null;

  return candidates.length === 1
    ? { port: candidates[0].name, reason: "sole-assignable" }
    : null;
}

/**
 * The auto-wireable input port a value of kind `kind` should be pinned to, or
 * `null` when no candidate is unambiguous enough to pin. Used by the
 * downstream hover-extend (§6.1).
 *
 * `sourcePortName` is the producer port the gesture started from — it feeds
 * the name lane, so `documentId → documentId` pins even when several inputs
 * would accept the kind.
 */
export function pickInputPortForKind(
  activityType: string,
  kind: KindRef,
  sourcePortName?: string,
): PortPick | null {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return null;
  const candidates = entry.inputs.filter(
    (port) => shouldAutoWirePort(port) && isAssignable(kind, port.kind),
  );
  // Wildcard inputs are already filtered out by `shouldAutoWirePort`, so every
  // surviving candidate carries a kind that means something.
  return rankCandidates(candidates, kind, sourcePortName, true);
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
 * Upstream twin of `pickInputPortForKind`: the producer output that should be
 * pinned into a consumer input of kind `kind`, or `null` when nothing is
 * unambiguous enough to pin.
 *
 * `consumerPortName` is the input the gesture was launched from. It matters
 * more here than on the downstream side: identifier ports are typed with the
 * root `Artifact` wildcard (`resultId`, `documentId`, `apimRequestId` and
 * ~40 others), so for those the kind lane is silent by construction and the
 * name is the only thing that can justify a pin. `azureClassify.submit`'s
 * `resultId → azureClassify.poll`'s `resultId` still pins; `blob.read`'s
 * `base64` no longer does.
 */
export function pickOutputPortForKind(
  activityType: string,
  kind: KindRef,
  consumerPortName?: string,
): PortPick | null {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) return null;
  const candidates = entry.outputs.filter(
    (port) => port.kind !== undefined && isAssignable(port.kind, kind),
  );
  return rankCandidates(
    candidates,
    kind,
    consumerPortName,
    shouldAutoWirePort({ kind }),
  );
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
