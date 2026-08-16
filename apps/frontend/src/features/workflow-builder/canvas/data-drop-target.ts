/**
 * What a drag that STARTED on a data port is allowed to become when it is
 * released on a node-level (run-order) handle — review item D9.
 *
 * The defect: `handleConnect` classified a connection by its TARGET handle
 * alone. A drag begun on `out-segments` and released on the target card's
 * run-order dot fell into the node-level branch and quietly created a
 * `normal` edge, which `deriveWires` renders as the grey dashed "Runs after"
 * wire. The user aimed a data wire and got an execution edge, with nothing
 * said. Reproduced in a browser on Split Document → Run for each item.
 *
 * The rule now: the gesture's ORIGIN decides what it can become. A drag from
 * a data port either lands on data, or is refused with the reason.
 *
 *   - exactly one declared input on the target can accept the dragged kind →
 *     complete it as a DATA edge to that port. Unambiguous, and it is what
 *     the user was plainly aiming at.
 *   - several can → refuse and NAME them. Picking one for the user would be
 *     the same silent substitution in a nicer coat.
 *   - none can → refuse and say which of the two reasons applies: the step
 *     has no data inputs at all (`no-input-ports` — every control-flow step,
 *     which reads its values from variables), or it has some and none of
 *     them accepts this kind (`no-compatible-port`).
 *
 * A drag that started on a node-level dot is not this function's business:
 * that gesture is authoring run order and stays exactly as it was.
 *
 * Pure — same config + endpoints always yield the same verdict. Shared by
 * `isValidConnection` (which must refuse precisely what `handleConnect`
 * would not complete) and by `handleConnectEnd` (which words the refusal),
 * so the three can never disagree.
 */

import { isAssignable, type KindRef } from "@ai-di/graph-workflow";

import type { GraphWorkflowConfig } from "../../../types/workflow";
import { humanKindLabel, outputPortKind } from "./port-kinds";
import { computePortRows } from "./port-rows";

/** One candidate input port, named the way the card labels it. */
export interface DataDropPort {
  /** Catalog port name — `in-<name>` is its handle id. */
  name: string;
  /** Plain-language row label, for user-facing copy. */
  label: string;
}

export type DataDropVerdict =
  /** Unambiguous — bind the dragged output to this input. */
  | { kind: "port"; port: DataDropPort }
  /** Two or more inputs accept the dragged kind; the user has to say which. */
  | { kind: "ambiguous"; ports: DataDropPort[] }
  /** Nothing here can take it. `reason` drives the wording. */
  | {
      kind: "none";
      reason: "no-input-ports" | "no-compatible-port";
      sourceKind: KindRef | undefined;
    };

/**
 * Resolve where a data-port drag released on `targetNodeId`'s node-level
 * handle should land.
 *
 * Candidates are read from `computePortRows`, not from the catalog directly,
 * so the set considered is exactly the set of dots the card actually mounts
 * — a port the user could not have dropped on is never offered as the answer
 * (the same guard `rendersPerPortHandle` applies to the wire projection).
 *
 * A wildcard input (`undefined` or the base `Artifact` kind) accepts
 * anything, matching `isValidConnection`'s port-to-port rule: a manual drag
 * is an explicit choice and is not second-guessed the way auto-wire's
 * resolver is.
 */
export function resolveDataDropTarget(
  config: GraphWorkflowConfig,
  sourceNodeId: string,
  sourcePort: string,
  targetNodeId: string,
): DataDropVerdict {
  const sourceKind = outputPortKind(config, sourceNodeId, sourcePort);
  const { inputs } = computePortRows(config, targetNodeId, []);

  if (inputs.length === 0) {
    return { kind: "none", reason: "no-input-ports", sourceKind };
  }

  const compatible = inputs
    .filter(
      (row) =>
        row.kind === undefined ||
        row.kind === "Artifact" ||
        isAssignable(sourceKind, row.kind),
    )
    .map((row) => ({ name: row.name, label: row.label }));

  if (compatible.length === 0) {
    return { kind: "none", reason: "no-compatible-port", sourceKind };
  }
  if (compatible.length === 1) {
    return { kind: "port", port: compatible[0] };
  }
  return { kind: "ambiguous", ports: compatible };
}

/**
 * The sentence shown when a data-port drag is refused. Written to answer the
 * question the user actually has ("why did nothing happen?") and to name the
 * gesture that WOULD have worked, since D9 and D10 are the same confusion
 * from opposite ends: one gesture silently did the other one's job, and the
 * other one looked impossible.
 *
 * `targetLabel` is the target node's own label, quoted, so the message names
 * the card on screen rather than a node id.
 */
export function dataDropRefusalMessage(
  verdict: DataDropVerdict,
  targetLabel: string,
): string | null {
  if (verdict.kind === "port") return null;
  if (verdict.kind === "ambiguous") {
    const names = verdict.ports.map((p) => `"${p.label}"`).join(", ");
    return `"${targetLabel}" has more than one input that accepts this — drop on the one you mean: ${names}.`;
  }
  const kind = humanKindLabel(verdict.sourceKind);
  if (verdict.reason === "no-input-ports") {
    return `"${targetLabel}" has no data inputs — it reads its values from workflow variables. To make it run after this step, drag between the two grey run-order dots instead.`;
  }
  return `"${targetLabel}" has no input that accepts ${kind}. Drop on an input dot that does, or drag between the two grey run-order dots to set the order only.`;
}
