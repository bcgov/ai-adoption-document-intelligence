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
  isAutoCtxKey,
  type KindRef,
  type PortResolution,
  resolveInputPort,
  shouldAutoWirePort,
} from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";

/**
 * Decode the producer node ID from an auto ctx key of the form
 * `__auto.{nodeId}.{port}`. Returns null if the key is not an auto key.
 */
function decodeAutoProducerNodeId(ctxKey: string): string | null {
  if (!ctxKey.startsWith(AUTO_CTX_KEY_PREFIX)) return null;
  // "__auto.{nodeId}.{port}" — nodeId may contain dots, but port is the last
  // segment. We at least need the first segment after the prefix.
  const withoutPrefix = ctxKey.slice(AUTO_CTX_KEY_PREFIX.length);
  const dotIdx = withoutPrefix.indexOf(".");
  if (dotIdx === -1) return null;
  return withoutPrefix.slice(0, dotIdx);
}

/**
 * What a port row renders from: the resolver's `PortResolution` plus one
 * display-only state — "ctx-bound", an UNLOCKED port whose persisted binding
 * points at a real (non-auto) ctx variable. The resolver ignores unlocked
 * `inputs[]` rows and reports "unsatisfied" for these, but the unified
 * validation drawer suppresses exactly this case (its `manuallyBoundPorts`
 * filter in auto-wire-validation.ts): a ctx-bound port HAS a source. Every
 * row-rendering surface must agree with the drawer.
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
export function effectiveResolution(
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
      const dotIdx = withoutPrefix.indexOf(".");
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
    !isAutoCtxKey(existingCtxKey)
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
export function resolveWireableInputRows(
  config: GraphWorkflowConfig,
  nodeId: string,
): WireableInputRow[] {
  const node = config.nodes[nodeId];
  if (!node || (node.type !== "activity" && node.type !== "pollUntil")) {
    return [];
  }
  const entry = getActivityCatalogEntry(node.activityType);
  if (!entry) return [];

  const wireableInputs = entry.inputs.filter(
    (p) =>
      shouldAutoWirePort(p) || (p.kind === "Artifact" && p.required === true),
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
