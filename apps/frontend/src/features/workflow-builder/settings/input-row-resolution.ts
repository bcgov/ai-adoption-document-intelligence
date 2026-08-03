/**
 * Shared wireable-input row resolution — the single source of truth for
 * "what does this input port's row show" semantics, consumed by both the
 * settings-panel `InputsSection` and the canvas's `ConnectSummaryPopover`
 * (PORT_WIRING_DESIGN.md §6.4). Extracted so the two surfaces can never
 * drift: same port population, same resolver, same ctx-bound / auto-bound
 * rescue rules.
 */
import {
  AUTO_CTX_KEY_PREFIX,
  getActivityCatalogEntry,
  getLockedInputPorts,
  isAutoCtxKey,
  type KindRef,
  type PortResolution,
  resolveCtxKeySource,
  resolveInputPort,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import { isConstCtxKey } from "./port-constants";

/**
 * Decode the producer node ID from an auto ctx key of the form
 * `__auto.{nodeId}.{port}`. Returns null if the key is not an auto key or
 * carries no port segment. `port` is the LAST segment, so a nodeId containing
 * dots is preserved (everything between the prefix and the final dot).
 */
export function decodeAutoProducerNodeId(ctxKey: string): string | null {
  if (!ctxKey.startsWith(AUTO_CTX_KEY_PREFIX)) return null;
  const withoutPrefix = ctxKey.slice(AUTO_CTX_KEY_PREFIX.length);
  const dotIdx = withoutPrefix.lastIndexOf(".");
  if (dotIdx === -1) return null;
  return withoutPrefix.slice(0, dotIdx);
}

/**
 * The friendly source a PINNED (locked+bound) input row displays, derived
 * from its ctxKey so a pinned row reads the same as the auto-bound row it
 * replaced rather than exposing the raw `__auto.*` synthesised key
 * (item 6a). Three cases:
 *  - `producer`: an auto key whose producer node still exists — show its
 *    label after a `←` arrow.
 *  - `producer` with `label = ctxKey`: an auto key that no longer decodes to
 *    a live producer (renamed/deleted/undecodable) — keep the arrow but show
 *    the raw key so the row is never blank.
 *  - `ctx`: a hand-authored (non-auto) ctx var — show `from <ctxKey>` with no
 *    producer arrow (there is no producer node to name).
 */
export type PinnedSource =
  | { via: "producer"; label: string }
  | { via: "ctx"; ctxKey: string }
  // P-5 (2026-08-03): a value the author typed on the port row. Its ctx key is
  // synthesised (`__const_{node}_{port}`) and deliberately hidden everywhere
  // else, so echoing it back would show plumbing nobody chose a name for.
  // Carry the VALUE instead — that is the thing the author actually set.
  | { via: "constant"; value: string };

export function resolvePinnedSource(
  config: GraphWorkflowConfig,
  ctxKey: string,
): PinnedSource {
  if (isAutoCtxKey(ctxKey)) {
    const producerNodeId = decodeAutoProducerNodeId(ctxKey);
    const producer = producerNodeId ? config.nodes[producerNodeId] : undefined;
    if (producerNodeId && producer) {
      return { via: "producer", label: producer.label ?? producerNodeId };
    }
    // Auto key, but the producer is gone or the key is undecodable: keep the
    // producer-style arrow and fall back to the raw key rather than blank.
    return { via: "producer", label: ctxKey };
  }
  if (isConstCtxKey(ctxKey)) {
    const declared = config.ctx?.[ctxKey]?.defaultValue;
    return {
      via: "constant",
      value: declared === undefined ? "" : String(declared),
    };
  }
  return { via: "ctx", ctxKey };
}

/**
 * What a port row renders from: the resolver's `PortResolution` plus one
 * display-only state — "ctx-bound", an UNLOCKED port whose persisted binding
 * points at a real (non-auto) ctx variable **that still has a source**. The
 * resolver ignores unlocked `inputs[]` rows and reports "unsatisfied" for
 * these, and the unified validation drawer suppresses the same case (its
 * `manuallyBoundPorts` filter in auto-wire-validation.ts). Every row-rendering
 * surface must agree with the drawer.
 *
 * G-002: "bound to a ctx variable" is NOT by itself proof of a source — the
 * node that wrote that variable can be deleted out from under the binding, and
 * the key then points at nothing. Both this state and the drawer's suppression
 * are therefore gated on `resolveCtxKeySource`; a dangling key falls through
 * to the honest "unsatisfied" ("Needs a source") rather than the reassuring
 * "from `<key>`".
 */
export type RowResolution =
  | PortResolution
  | { status: "ctx-bound"; ctxKey: string };

/**
 * Effective resolution for a port row: when `resolveInputPort` returns
 * "ambiguous" but the consumer already has an auto-key binding for this
 * port (left over from a previous auto-wire pass), we display the existing
 * binding as "auto-bound" so the user sees where their data comes from and
 * can choose to change the source or leave it. When it returns "unsatisfied"
 * but the port carries a persisted non-auto binding, we display "ctx-bound"
 * (see `RowResolution`) rather than the red "Needs a source" button.
 */
function effectiveResolution(
  rawResolution: PortResolution,
  existingCtxKey: string | undefined,
  config: GraphWorkflowConfig,
): RowResolution {
  if (
    rawResolution.status === "ambiguous" &&
    existingCtxKey &&
    isAutoCtxKey(existingCtxKey)
  ) {
    const producerNodeId = decodeAutoProducerNodeId(existingCtxKey);
    if (producerNodeId && config.nodes[producerNodeId]) {
      // Determine the producer port from the ctxKey suffix
      const withoutPrefix = existingCtxKey.slice(AUTO_CTX_KEY_PREFIX.length);
      const dotIdx = withoutPrefix.lastIndexOf(".");
      const producerPort = dotIdx !== -1 ? withoutPrefix.slice(dotIdx + 1) : "";
      return {
        status: "auto-bound",
        producerNodeId,
        producerPort,
        // The original binding mechanism isn't recoverable from a stale
        // auto ctx key alone (only producer node/port survive); default to
        // the most common mechanism rather than guessing a misleading one.
        via: "nearest-kind",
      };
    }
  }
  if (
    rawResolution.status === "unsatisfied" &&
    existingCtxKey &&
    !isAutoCtxKey(existingCtxKey) &&
    resolveCtxKeySource(config, existingCtxKey) !== null
  ) {
    return { status: "ctx-bound", ctxKey: existingCtxKey };
  }
  return rawResolution;
}

export interface WireableInputPort {
  name: string;
  label: string;
  kind?: KindRef;
  /**
   * The catalog descriptor's description. Carried because it is the port's
   * own account of what happens when nothing is supplied — "Auto-detected
   * from the extension if omitted" — which is exactly the placeholder an
   * empty constant field wants (P-5).
   */
  description?: string;
}

export interface WireableInputRow {
  port: WireableInputPort;
  resolution: RowResolution;
  /**
   * True for rows admitted ONLY by `includeOptionalIdentifierPorts`: an
   * optional base-`Artifact` port with nothing bound to it. The Inputs panel
   * folds exactly these behind its collapsed "N optional inputs" disclosure.
   * A row that holds something — a wire, a pin or a constant — is never
   * `optional`, so setting a value on one moves it up into the main list.
   */
  optional: boolean;
}

export interface WireableInputRowOptions {
  /**
   * Include optional base-`Artifact` identifier ports that nothing is bound
   * to, flagged `optional: true`. Off by default, and the default is what
   * `ConnectSummaryPopover` takes: that surface narrates what a CONNECTION
   * did, and an optional port nothing feeds has nothing to report — it would
   * render "⚠ needs a source" for a port the node badge and the validation
   * drawer both deliberately decline to count (`computeNodeInputIssues` skips
   * optional identifier ports), making the popover the only surface calling a
   * healthy node broken. The Inputs panel opts in because it is the surface
   * that can accept an answer.
   */
  includeOptionalIdentifierPorts?: boolean;
}

/**
 * P-5 — which input ports the Inputs panel lets an author SEE and edit.
 *
 * `shouldAutoWirePort(p) || p.kind === "Artifact"` is the rule: every port the
 * catalog declares with a kind gets a row, because every one of them owns an
 * `in-<port>` canvas handle that `computePortRows` renders (port-rows.ts:161)
 * complete with its kind and description. A card that advertises a port the
 * only editable surface denies is the honesty gap R-3 closes.
 *
 * What separates the two populations now is PROMINENCE, not existence.
 * OPTIONAL base-`Artifact` identifier ports with nothing bound to them are
 * returned flagged `optional` and folded behind a collapsed disclosure —
 * `file.prepare` alone has three, and padding the open panel with always-empty
 * rows is what the old exclusion was defending against. Folded, not hidden.
 *
 * Anything that HOLDS something — G-046's dragged binding, or a P-5 constant —
 * is never `optional`: it renders at the top level, which is the state where
 * hiding it destroyed information (a binding made by dragging onto the handle
 * was invisible to the panel, the badge and the drawer, undoable only through
 * the raw advanced-bindings editor).
 *
 * Kindless ports stay excluded, and that is not a gap: zero of the catalog's
 * activities declare one, so the branch would have no population.
 */
function isEditableInputPort(
  port: { name: string; kind?: string; required?: boolean },
  boundPorts: ReadonlySet<string>,
): boolean {
  if (shouldAutoWirePort(port as Parameters<typeof shouldAutoWirePort>[0])) {
    return true;
  }
  if (port.kind !== "Artifact") return false;
  return port.required === true || boundPorts.has(port.name);
}

/** The foldable half of the population — see {@link isEditableInputPort}. */
function isFoldableOptionalPort(
  port: { name: string; kind?: string; required?: boolean },
  boundPorts: ReadonlySet<string>,
): boolean {
  return (
    port.kind === "Artifact" &&
    port.required !== true &&
    !boundPorts.has(port.name)
  );
}

/**
 * Resolves the wireable-input row set for `nodeId` — the port population
 * described on {@link isEditableInputPort}, each with its
 * `effectiveResolution`.
 *
 * Returns `[]` when the node doesn't exist, isn't an activity/pollUntil
 * node, has no catalog entry, or genuinely has zero wireable ports —
 * callers that need to distinguish "no such node" from "node with zero
 * wireable ports" should check those conditions themselves before calling.
 */
export function resolveWireableInputRows(
  config: GraphWorkflowConfig,
  nodeId: string,
  options: WireableInputRowOptions = {},
): WireableInputRow[] {
  const node = config.nodes[nodeId];
  if (node?.type === "map") return [resolveMapCollectionRow(config, node)];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil")) {
    return [];
  }
  const entry = getActivityCatalogEntry(node.activityType);
  if (!entry) return [];

  const boundPorts = new Set(
    (node.inputs ?? []).filter((b) => b.ctxKey).map((b) => b.port),
  );
  const wireableInputs = entry.inputs.filter(
    (p) =>
      isEditableInputPort(p, boundPorts) ||
      (options.includeOptionalIdentifierPorts === true &&
        isFoldableOptionalPort(p, boundPorts)),
  );

  return wireableInputs.map((port) => {
    const portKind = port.kind as KindRef | undefined;
    const rawResolution = resolveInputPort(config, nodeId, {
      name: port.name,
      kind: portKind,
    });
    const existingCtxKey = node.inputs?.find(
      (b) => b.port === port.name,
    )?.ctxKey;
    const resolution = effectiveResolution(
      rawResolution,
      existingCtxKey,
      config,
    );
    return {
      port: {
        name: port.name,
        label: port.label,
        kind: portKind,
        ...(port.description !== undefined
          ? { description: port.description }
          : {}),
      },
      resolution,
      optional: !isEditableInputPort(port, boundPorts),
    };
  });
}

/**
 * The map's `collection` port row (G-013).
 *
 * `collection` is a real bindable input — the resolver honours a
 * `lockedInputPorts` entry for it and auto-fills `collectionCtxKey` — but it
 * lives in its own field rather than in `inputs[]`, so it had no
 * `PortDescriptor`, no kind and no row anywhere. That left the one port every
 * map depends on outside the binding-state model: nothing told the author
 * whether the collection was auto-wired, pinned or dangling, and a deleted
 * producer just made every body node quietly unsatisfiable.
 *
 * The row is read-only on this surface: `collectionCtxKey` is edited in
 * `MapNodeSettings`, and the generic pin/revert mutations write `inputs[]`,
 * which is the wrong home for it. Its job here is to make the state visible.
 *
 * Kind is left undefined, and stays that way after G-007: the collection is
 * `T[]` for whatever `T` the producer emits, so there is no single kind to
 * declare. (G-007 gave control-flow nodes declared OUTPUTS — a map's `item`,
 * a join's `results` — but `collection` is an INPUT, and its element type is
 * only knowable from whichever producer happens to feed it. The resolver
 * derives that per-graph in its `map-item` pass rather than pinning a kind
 * here.)
 */
export const MAP_COLLECTION_PORT: WireableInputPort = {
  name: "collection",
  label: "Collection",
};

function resolveMapCollectionRow(
  config: GraphWorkflowConfig,
  node: Extract<GraphWorkflowConfig["nodes"][string], { type: "map" }>,
): WireableInputRow {
  const row = (resolution: RowResolution): WireableInputRow => ({
    port: MAP_COLLECTION_PORT,
    resolution,
    // A map has exactly one input row and it is never foldable: `collection`
    // is the port every body node depends on.
    optional: false,
  });
  const locked = getLockedInputPorts(node).includes("collection");
  const ctxKey = node.collectionCtxKey;
  if (!ctxKey) {
    return row(
      locked ? { status: "locked-unbound" } : { status: "unsatisfied" },
    );
  }
  const source = resolveCtxKeySource(config, ctxKey, node.id);
  if (!source) {
    // Unlocked dangling keys are rewritten by the next `resolveBindings` pass
    // when a replacement exists; until then "needs a source" is the honest
    // state. A pinned one is never rewritten, so it is reported as broken.
    return row(
      locked
        ? { status: "locked-dangling", ctxKey }
        : { status: "unsatisfied" },
    );
  }
  if (locked) return row({ status: "locked", ctxKey });
  if (source.origin === "node-output") {
    return row({
      status: "auto-bound",
      producerNodeId: source.nodeId,
      producerPort: source.port,
      via: "nearest-kind",
    });
  }
  return row({ status: "ctx-bound", ctxKey });
}
