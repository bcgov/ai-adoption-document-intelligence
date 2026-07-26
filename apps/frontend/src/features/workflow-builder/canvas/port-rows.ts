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
import type { GraphNode, GraphWorkflowConfig } from "../../../types/workflow";
import type { DataWire, DerivedWire } from "./derive-wires";

/**
 * Height constants below are CALIBRATED against rendered cards (measured
 * via `offsetHeight` on the seed workflows, 2026-07). An activity card
 * stacks: type-pill row (13px) + label (16px) + the `<PortRows>` grid
 * (6px top margin + 22px per row) + a 120px preview-widget skeleton +
 * card padding/gaps/border — so the row-less activity card measures
 * 177px, NOT just "header + label". Measured activity heights land
 * exactly on `177 + 6 + rows * 22`: 205 (1 row), 227 (2), 249 (3),
 * 271 (4), 293 (5) — the 22px/row slope is exact; only the intercept
 * needed calibrating.
 *
 * CAVEAT — the 120px preview block is STATE-DEPENDENT, so 177 is a
 * deliberate mid-point, not a universal fact: `PreviewWidget` renders the
 * 120px skeleton while pending, `null` when a node has no fresh preview
 * (a never-run workflow's cards are ~57px — over-estimating is safe,
 * layout just gets sparser), and ready content up to
 * `PREVIEW_MAX_HEIGHT_PX` (200px, i.e. up to +80px beyond the estimate,
 * which can eat into the 60px nodesep after a run). Re-measure if the
 * preview widget's sizing changes.
 */
export const PORT_ROW_HEIGHT = 22;
/** Row-less activity card: pill + label + 120px preview widget + padding. */
export const ACTIVITY_BASE_HEIGHT = 177;
/**
 * Control-flow rectangles/diamonds render WITHOUT port rows: map / join /
 * childWorkflow / humanGate measure 178px, the switch diamond 180×180 —
 * one constant at the max. `pollUntil` uses this as its BASE and adds row
 * height on top (G-016): it wraps a real catalog activity, so its card
 * renders the same `<PortRows>` grid an activity card does.
 */
export const CONTROL_FLOW_NODE_HEIGHT = 180;
/** Source cards (e.g. `source.upload`) render a slimmer fixed card: 165px. */
export const SOURCE_NODE_HEIGHT = 165;

// --- Width estimates (mirror the height constants above) --------------------
// Cards vary in width by type. These are the RENDERED footprints the map-body
// container box uses to enclose its members; a slight over-estimate is safe
// (a marginally roomier box), an under-estimate clips a card outside the box.
/**
 * Activity cards render a per-port row grid up to ~522px wide (the same
 * card-width the Auto-arrange rank spacing is tuned to — see
 * `auto-layout.ts` DEFAULT_NODE_WIDTH). Row-less activities are narrower, but
 * over-estimating only pads the box.
 */
export const ACTIVITY_NODE_WIDTH = 522;
/** Source cards render narrower than a port-row activity card. */
export const SOURCE_NODE_WIDTH = 320;
/** Control-flow rectangles/diamonds render ~180px wide. */
export const CONTROL_FLOW_NODE_WIDTH = 180;
/**
 * `marginTop` the `<PortRows>` grid renders above its rows (see
 * `PortRows.tsx`). Only applies when the node has at least one row — the
 * grid returns `null` (no margin) when both columns are empty.
 */
export const PORT_ROWS_TOP_MARGIN = 6;

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
 * The canvas renders rows for the two catalog-backed node types:
 * `activity` and `pollUntil`. A `pollUntil` wraps a real activity, so it
 * keeps the control-flow rectangle chrome (type icon, accent) AND mounts
 * the same `<PortRows>` grid — `rendersPerPortHandle` and
 * `estimateNodeHeight` both follow (G-016). Before that fix its inputs
 * appeared in the settings panel and the problems badge with nothing on
 * the canvas to drag to.
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
    // A binding with a falsy ctxKey is NOT a source (G-072). Deleting a data
    // wire can leave a ctxKey-less input stub behind; the resolver classifies
    // that as `locked-unbound` — "Disconnected by you", a red CTA in the
    // settings panel — but a bare `binding !== undefined` test reads it as
    // satisfied, so the canvas drew a healthy port while the panel called it
    // broken. Two surfaces, one port, opposite answers.
    const hasSource = binding !== undefined && Boolean(binding.ctxKey);
    const bound = wireTargeting !== undefined || hasSource;
    const fromCtx =
      wireTargeting === undefined &&
      binding !== undefined &&
      Boolean(binding.ctxKey) &&
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
 * (`in-<port>` / `out-<port>`) for this node+port — i.e. the node is one
 * of the two types the canvas renders `<PortRows>` for (`activity` and
 * `pollUntil`, the catalog-backed types) AND `computePortRows` emits a
 * row with that port name on that side. Nodes without a static catalog
 * entry (`dyn.*` activity types, deleted entries, a `pollUntil` whose
 * wrapped type is gone) and stale bindings to ports the current entry
 * doesn't declare both return `false`.
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
  if (!node || !rendersPortRows(node)) return false;
  const rows = computePortRows(config, nodeId, []);
  const side = direction === "input" ? rows.inputs : rows.outputs;
  return side.some((row) => row.name === portName);
}

/**
 * The node types whose canvas card mounts a `<PortRows>` grid — the two
 * catalog-backed types. Single predicate so the handle-mount check, the
 * height estimate and the width estimate can't drift from each other.
 */
function rendersPortRows(node: GraphNode): boolean {
  return node.type === "activity" || node.type === "pollUntil";
}

/**
 * Estimated rendered card height for the dagre auto-layout pass, routed by
 * node type to mirror what the canvas actually mounts:
 *
 *   - `activity`: `ACTIVITY_BASE_HEIGHT` plus one `PORT_ROW_HEIGHT` per row
 *     on the taller side (inputs vs. outputs) plus the grid's top margin —
 *     the card renders both columns in the same vertical run, so the
 *     shorter side just leaves blank space. Row-less activities (`dyn.*`,
 *     stale catalog entries) get the bare base.
 *   - `pollUntil` (G-016): `CONTROL_FLOW_NODE_HEIGHT` — it keeps the
 *     rectangle chrome — plus the same per-row scaling, because the card
 *     mounts the wrapped activity's `<PortRows>` grid. A `pollUntil`
 *     whose wrapped type resolves no catalog entry has no rows and gets
 *     the bare rectangle height.
 *   - `source`: fixed `SOURCE_NODE_HEIGHT` card.
 *   - everything else (switch/map/join/childWorkflow/humanGate, and
 *     unknown node ids): `CONTROL_FLOW_NODE_HEIGHT`.
 *
 * Wires don't affect row count, so this passes an empty wire list to
 * `computePortRows` rather than requiring one from the caller.
 */
export function estimateNodeHeight(
  config: GraphWorkflowConfig,
  nodeId: string,
): number {
  const node = config.nodes[nodeId];
  if (!node || !rendersPortRows(node)) {
    return node?.type === "source"
      ? SOURCE_NODE_HEIGHT
      : CONTROL_FLOW_NODE_HEIGHT;
  }
  const base =
    node.type === "pollUntil" ? CONTROL_FLOW_NODE_HEIGHT : ACTIVITY_BASE_HEIGHT;
  const { inputs, outputs } = computePortRows(config, nodeId, []);
  const rows = Math.max(inputs.length, outputs.length);
  if (rows === 0) return base;
  return base + PORT_ROWS_TOP_MARGIN + rows * PORT_ROW_HEIGHT;
}

/**
 * Estimated rendered WIDTH of a node's card, by type. Mirrors
 * `estimateNodeHeight`; used to enclose a map body's members in the container
 * box. Width is not row-count-dependent (rows add height, not width), but it
 * IS row-PRESENCE-dependent: a card that mounts the `<PortRows>` grid renders
 * to the wide activity footprint, which is why a `pollUntil` wrapping a live
 * catalog activity measures wide and a row-less one stays rectangle-narrow
 * (G-016).
 */
export function estimateNodeWidth(
  config: GraphWorkflowConfig,
  nodeId: string,
): number {
  const node = config.nodes[nodeId];
  if (!node) return CONTROL_FLOW_NODE_WIDTH;
  if (node.type === "activity") return ACTIVITY_NODE_WIDTH;
  if (node.type === "source") return SOURCE_NODE_WIDTH;
  if (node.type === "pollUntil") {
    const { inputs, outputs } = computePortRows(config, nodeId, []);
    return inputs.length > 0 || outputs.length > 0
      ? ACTIVITY_NODE_WIDTH
      : CONTROL_FLOW_NODE_WIDTH;
  }
  return CONTROL_FLOW_NODE_WIDTH;
}
