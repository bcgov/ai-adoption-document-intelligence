/**
 * `computePortRows` / `estimateNodeHeight` — pure selectors that turn a
 * node's activity-catalog entry into per-port row models for the card
 * renderer, and roll the row count up into an estimated card height for the
 * dagre auto-layout pass. See PORT_WIRING_DESIGN.md (port-row rendering
 * slice).
 *
 * Both functions are pure and cheap: `estimateNodeHeight` only needs the
 * row COUNT, which doesn't depend on wires, so it calls `computePortRows`
 * with an empty wire list rather than requiring a caller-supplied
 * `DerivedWire[]`.
 */
import { getActivityCatalogEntry, type KindRef } from "@ai-di/graph-workflow";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import type { DataWire, DerivedWire } from "./derive-wires";

export const PORT_ROW_HEIGHT = 22;
export const NODE_BASE_HEIGHT = 64; // header + label + padding

/**
 * Single definition of the per-port ReactFlow handle-id formula. The row
 * renderer mounts handles under these ids and the wire→edge projection
 * targets them — both sides MUST import these helpers rather than
 * re-deriving the string shape.
 */
export function inputHandleId(portName: string): string {
  return `in-${portName}`;
}

export function outputHandleId(portName: string): string {
  return `out-${portName}`;
}

export interface PortRowModel {
  name: string;
  label: string;
  description?: string;
  kind?: KindRef;
  direction: "input" | "output";
  required: boolean;
  /** ReactFlow handle id: `in-<name>` / `out-<name>`. */
  handleId: string;
  /** Input only: satisfied by a wire, a ctx variable, or any persisted binding. Outputs: always true. */
  bound: boolean;
  /** Set when the binding reads a declared workflow variable (renders a chip). */
  fromCtx?: string;
  /** required && !bound — renders the amber ring. */
  needsSource: boolean;
}

function isDataWire(wire: DerivedWire): wire is DataWire {
  return wire.variant === "data";
}

/**
 * Maps a node's catalog inputs/outputs to render-ready rows. Only nodes
 * with an `activityType` resolving against the static catalog produce
 * rows; everything else (switch, map, join, childWorkflow, humanGate,
 * source, and Phase-6 `dyn.*` activity types, which resolve against a
 * per-lineage runtime schema rather than the static catalog) falls into
 * the "no catalog entry" branch and returns empty rows.
 *
 * Note the canvas projection currently renders rows for `activity` nodes
 * only — `pollUntil` nodes render through the control-flow rectangle with
 * no port rows in the render-only slice. The `pollUntil` branch below
 * exists so `estimateNodeHeight` (and the upcoming layout/projection
 * work) can size any catalog-backed node without a second code path.
 */
export function computePortRows(
  config: GraphWorkflowConfig,
  nodeId: string,
  wires: readonly DerivedWire[],
): { inputs: PortRowModel[]; outputs: PortRowModel[] } {
  const node = config.nodes[nodeId];
  if (!node) return { inputs: [], outputs: [] };

  const catalogEntry =
    node.type === "activity" || node.type === "pollUntil"
      ? getActivityCatalogEntry(node.activityType)
      : undefined;

  if (!catalogEntry) return { inputs: [], outputs: [] };

  const dataWires = wires.filter(isDataWire);

  const inputs: PortRowModel[] = catalogEntry.inputs.map((descriptor) => {
    const binding = node.inputs?.find((b) => b.port === descriptor.name);
    const wireTargeting = dataWires.find(
      (wire) => wire.target === nodeId && wire.targetPort === descriptor.name,
    );
    const bound = wireTargeting !== undefined || binding !== undefined;
    const fromCtx =
      wireTargeting === undefined &&
      binding !== undefined &&
      config.ctx[binding.ctxKey] !== undefined
        ? binding.ctxKey
        : undefined;
    const required = descriptor.required === true;

    return {
      name: descriptor.name,
      label: descriptor.label,
      description: descriptor.description,
      kind: descriptor.kind,
      direction: "input",
      required,
      handleId: inputHandleId(descriptor.name),
      bound,
      fromCtx,
      needsSource: required && !bound,
    };
  });

  const outputs: PortRowModel[] = catalogEntry.outputs.map((descriptor) => ({
    name: descriptor.name,
    label: descriptor.label,
    description: descriptor.description,
    kind: descriptor.kind,
    direction: "output",
    required: descriptor.required === true,
    handleId: outputHandleId(descriptor.name),
    bound: true,
    fromCtx: undefined,
    needsSource: false,
  }));

  return { inputs, outputs };
}

/**
 * True when the canvas actually mounts a per-port ReactFlow handle
 * (`in-<port>` / `out-<port>`) for this node+port — i.e. the node is an
 * `activity` node (the ONLY type the canvas renders `<PortRows>` for;
 * `pollUntil` resolves a catalog entry but renders the control-flow
 * rectangle without rows) AND `computePortRows` emits a row with that
 * port name on that side. Nodes without a static catalog entry (`dyn.*`
 * activity types, deleted entries) and stale bindings to ports the
 * current entry doesn't declare both return `false`.
 *
 * The wire→edge projection MUST anchor per-port only under this
 * predicate — targeting a handle id that never mounts makes xyflow drop
 * the whole edge (error008), which would leave bound node pairs looking
 * disconnected. Derived from `computePortRows` (not a re-implementation
 * of the catalog lookup) so the two can't drift.
 */
export function rendersPerPortHandle(
  config: GraphWorkflowConfig,
  nodeId: string,
  portName: string,
  direction: "input" | "output",
): boolean {
  const node = config.nodes[nodeId];
  if (!node || node.type !== "activity") return false;
  const rows = computePortRows(config, nodeId, []);
  const side = direction === "input" ? rows.inputs : rows.outputs;
  return side.some((row) => row.name === portName);
}

/**
 * `NODE_BASE_HEIGHT` plus one `PORT_ROW_HEIGHT` per row on the taller side
 * (inputs vs. outputs) — the card renders both columns in the same
 * vertical run, so the shorter side just leaves blank space. Wires don't
 * affect row count, so this passes an empty wire list to `computePortRows`
 * rather than requiring one from the caller.
 */
export function estimateNodeHeight(
  config: GraphWorkflowConfig,
  nodeId: string,
): number {
  const { inputs, outputs } = computePortRows(config, nodeId, []);
  const rows = Math.max(inputs.length, outputs.length);
  return NODE_BASE_HEIGHT + rows * PORT_ROW_HEIGHT;
}
