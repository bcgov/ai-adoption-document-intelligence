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
  | { via: "ctx"; ctxKey: string };

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
}

export interface WireableInputRow {
  port: WireableInputPort;
  resolution: RowResolution;
}

/**
 * Resolves the wireable-input row set for `nodeId`: the same port
 * population InputsSection renders (`shouldAutoWirePort(p) || (p.kind ===
 * "Artifact" && p.required === true)`), each with its `effectiveResolution`.
 *
 * Returns `[]` when the node doesn't exist, isn't an activity/pollUntil
 * node, has no catalog entry, or genuinely has zero wireable ports —
 * callers that need to distinguish "no such node" from "node with zero
 * wireable ports" should check those conditions themselves before calling.
 */
/**
 * G-046 — which input ports the Inputs panel lets an author SEE and edit.
 *
 * `shouldAutoWirePort(p) || (p.kind === "Artifact" && required)` is the
 * deliberate base rule (PORT_WIRING §4.2 ring/badge reconciliation): OPTIONAL
 * base-`Artifact` identifier ports stay hidden so the panel is not padded with
 * always-empty rows — `file.prepare` alone has three.
 *
 * The defect is narrower than "they are hidden". There are 26 such ports across
 * the catalog, and EVERY one owns an `in-<port>` canvas handle that
 * `computePortRows` renders and a user can drag onto — so a binding made by
 * dragging was invisible to the panel, the badge and the drawer, with no way to
 * see or undo it short of the raw advanced-bindings editor.
 *
 * So the rule is "hidden until it holds something". An unbound optional
 * identifier port stays out of the way; a bound one becomes visible and
 * editable, which is the only state where hiding it destroyed information.
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

export function resolveWireableInputRows(
  config: GraphWorkflowConfig,
  nodeId: string,
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
  const wireableInputs = entry.inputs.filter((p) =>
    isEditableInputPort(p, boundPorts),
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
      port: { name: port.name, label: port.label, kind: portKind },
      resolution,
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
