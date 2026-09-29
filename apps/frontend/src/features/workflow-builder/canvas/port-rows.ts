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
import { PREVIEW_STRIP_TOTAL_HEIGHT_PX } from "../preview/strip-metrics";
import type { DataWire, DerivedWire } from "./derive-wires";

/**
 * Height constants below are CALIBRATED against rendered cards (measured
 * via `offsetHeight` on the seed workflows, 2026-07, re-measured 2026-08-08).
 * An activity card stacks: type-pill row (13px) + label (16px) + the
 * `<PortRows>` grid (6px top margin + 22px per row) + the fixed result strip
 * + card padding/gaps/border. The 22px/row slope is exact; only the
 * intercept needed calibrating.
 *
 * **The old caveat is gone, and that is item 9's whole point.** These
 * constants used to carry a 120px allowance for the preview widget, and the
 * docblock had to admit the number was "a deliberate mid-point, not a
 * universal fact": the widget rendered nothing at rest (~57px cards), a 120px
 * skeleton while pending, and up to `PREVIEW_MAX_HEIGHT_PX` (200px) when
 * content landed — so a card could exceed its estimate by 80px and eat dagre's
 * 60px `nodesep`, which is exactly the overlap Alex saw on the shared screen.
 *
 * The preview now lives in a popover behind a fixed-height strip
 * (`NodeResultStrip`), so the card's height is state-INDEPENDENT and the
 * estimate is a fact rather than an average. Re-measure only if the card
 * chrome itself changes; `PREVIEW_STRIP_TOTAL_HEIGHT_PX` keeps the strip's
 * contribution honest on its own.
 */
export const PORT_ROW_HEIGHT = 22;
/**
 * Chrome of an activity card WITHOUT the port-row grid and WITHOUT the result
 * strip: type pill + label + padding + border. Split out from
 * `ACTIVITY_BASE_HEIGHT` so the strip's contribution is visible rather than
 * baked into a magic number.
 *
 * Measured 2026-08-08 on `standard-ocr` at 1920×1080 via `offsetHeight` (which
 * ignores the canvas zoom transform, so it needs no scale correction). Every
 * activity card on that graph reported the identical decomposition:
 * `offsetHeight − grid − strip = 70` including the grid's and the strip's 6px
 * top margins, i.e. 58px of chrome. Six cards, one to five rows, no variance.
 */
export const ACTIVITY_CHROME_HEIGHT = 58;
/** Row-less activity card: chrome + the fixed result strip. */
export const ACTIVITY_BASE_HEIGHT =
  ACTIVITY_CHROME_HEIGHT + PREVIEW_STRIP_TOTAL_HEIGHT_PX;
/**
 * Control-flow rectangles/diamonds render WITHOUT port rows: map / join /
 * childWorkflow / humanGate measure 178px, the switch diamond 180×180 —
 * one constant at the max. `pollUntil` uses this as its BASE and adds row
 * height on top (G-016): it wraps a real catalog activity, so its card
 * renders the same `<PortRows>` grid an activity card does.
 */
export const CONTROL_FLOW_NODE_HEIGHT = 180;
/**
 * Source cards (e.g. `source.upload`, `source.api`) render a slimmer fixed
 * card. Like the activity card they mount a result strip, so the constant is
 * chrome + strip.
 *
 * Measured 2026-08-08: an `apiSource` card decomposed to 41px of chrome + the
 * 30px strip = 71px. The constant is deliberately ~25px more generous, one
 * text line, because `SourceNodeRenderer` adds a subtitle whenever the author
 * renamed the node (`node.label !== displayName`) and this selector has no
 * source catalog to resolve `displayName` against. Over-estimating only makes
 * the layout sparser; under-estimating is what puts cards on top of each other.
 */
export const SOURCE_CHROME_HEIGHT = 66;
export const SOURCE_NODE_HEIGHT =
  SOURCE_CHROME_HEIGHT + PREVIEW_STRIP_TOTAL_HEIGHT_PX;

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
 * Structural slice of a merged-catalog entry — the fields the selectors
 * below actually read. `ActivityCatalogEntry` (the wire shape served by
 * `GET /api/activity-catalog` and cached by `useActivityCatalog`) satisfies
 * it, so callers pass the fetched entries straight through without an
 * import from the dynamic-nodes module.
 *
 * `kind` is a plain string here because the wire format serialises it
 * untyped — but a PUBLISHED dynamic node's kinds were cross-checked against
 * the artifact-kind registry at publish time (`parse-signature`'s
 * `signature-semantics` pass), so a value observed through this type is a
 * real `KindRef`. An unknown string would fail closed in `isAssignable`
 * (TYPED_IO_DESIGN.md §8 — no silent fallback to Artifact) rather than
 * widen to a wildcard.
 */
export interface DynamicNodePortDescriptor {
  name: string;
  label?: string;
  description?: string;
  required?: boolean;
  kind?: string;
}

export interface DynamicNodeCatalogEntry {
  activityType: string;
  inputs: readonly DynamicNodePortDescriptor[];
  outputs: readonly DynamicNodePortDescriptor[];
}

/**
 * Resolves the port lists a catalog-backed node renders rows from: the
 * STATIC catalog first (canonical, fully typed), then the caller-supplied
 * dynamic entries — in practice the `dyn.*` slice of the merged catalog
 * (`useActivityCatalog().entries`).
 *
 * Fails SOFT on a miss: a `dyn.*` type absent from the list — the lineage
 * was soft-deleted, or an instance pins a version of a deleted lineage —
 * returns `undefined` and the node renders row-less, exactly like an
 * unregistered static type. That absence is deliberately NOT an error
 * surface here: the runtime still resolves pinned versions of soft-deleted
 * lineages, and the card already carries its own red "Deleted" pill.
 */
function resolveCatalogPorts(
  node: GraphNode,
  dynamicEntries: readonly DynamicNodeCatalogEntry[],
): DynamicNodeCatalogEntry | undefined {
  if (node.type !== "activity" && node.type !== "pollUntil") return undefined;
  return (
    getActivityCatalogEntry(node.activityType) ??
    dynamicEntries.find((e) => e.activityType === node.activityType)
  );
}

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
  /**
   * Whether anything is attached to this port on the canvas — the test the
   * "+" invitation reads (Inderdeep UX walkthrough 2026-08-06, item 3).
   *
   * The two directions have genuinely different tests, which is why this is
   * not just `bound`:
   *   - INPUT: same as `bound` — a wire, a ctx variable, or a persisted
   *     binding all mean a value already arrives here, so there is nothing
   *     to invite.
   *   - OUTPUT: at least one derived data wire LEAVES this port. `bound` is
   *     hard-coded `true` for outputs (an output is never waiting on a
   *     source), so it cannot answer this question at all.
   */
  connected: boolean;
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
 * with an `activityType` resolving against the static catalog — or, when
 * the caller supplies `dynamicEntries`, against the merged catalog's
 * published `dyn.*` entries — produce rows; everything else (switch, map,
 * join, childWorkflow, humanGate, source, and a `dyn.*` type absent from
 * both) falls into the "no catalog entry" branch and returns empty rows
 * (see `resolveCatalogPorts` for why that absence is soft).
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
  dynamicEntries: readonly DynamicNodeCatalogEntry[] = [],
): { inputs: PortRowModel[]; outputs: PortRowModel[] } {
  const node = config.nodes[nodeId];
  if (!node) return { inputs: [], outputs: [] };

  const catalogEntry = resolveCatalogPorts(node, dynamicEntries);

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
      label: descriptor.label ?? descriptor.name,
      description: descriptor.description,
      // Sound for the same reason the wire type documents: published
      // dynamic signatures are registry-checked, so a serialised kind
      // string IS a `KindRef`. Static entries pass through unchanged.
      kind: descriptor.kind as KindRef | undefined,
      direction: "input",
      required,
      handleId: inputHandleId(descriptor.name),
      bound,
      connected: bound,
      fromCtx,
      needsSource: required && !bound,
    };
  });

  const outputs: PortRowModel[] = catalogEntry.outputs.map((descriptor) => ({
    name: descriptor.name,
    label: descriptor.label ?? descriptor.name,
    description: descriptor.description,
    kind: descriptor.kind as KindRef | undefined,
    direction: "output",
    required: descriptor.required === true,
    handleId: outputHandleId(descriptor.name),
    bound: true,
    connected: dataWires.some(
      (wire) => wire.source === nodeId && wire.sourcePort === descriptor.name,
    ),
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
 * row with that port name on that side. Nodes with no entry in the
 * static catalog OR the caller's `dynamicEntries` (a soft-deleted
 * `dyn.*` lineage, a `pollUntil` whose wrapped type is gone) and stale
 * bindings to ports the current entry doesn't declare both return
 * `false`. Pass the SAME `dynamicEntries` here as to the row projection,
 * or the two will disagree about which handles exist.
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
  dynamicEntries: readonly DynamicNodeCatalogEntry[] = [],
): boolean {
  const node = config.nodes[nodeId];
  if (!node || !rendersPortRows(node)) return false;
  const rows = computePortRows(config, nodeId, [], dynamicEntries);
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
 *     shorter side just leaves blank space. Row-less activities (a `dyn.*`
 *     type absent from `dynamicEntries`, stale catalog entries) get the
 *     bare base.
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
  dynamicEntries: readonly DynamicNodeCatalogEntry[] = [],
): number {
  const node = config.nodes[nodeId];
  if (!node || !rendersPortRows(node)) {
    return node?.type === "source"
      ? SOURCE_NODE_HEIGHT
      : CONTROL_FLOW_NODE_HEIGHT;
  }
  const base =
    node.type === "pollUntil" ? CONTROL_FLOW_NODE_HEIGHT : ACTIVITY_BASE_HEIGHT;
  const { inputs, outputs } = computePortRows(
    config,
    nodeId,
    [],
    dynamicEntries,
  );
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
  dynamicEntries: readonly DynamicNodeCatalogEntry[] = [],
): number {
  const node = config.nodes[nodeId];
  if (!node) return CONTROL_FLOW_NODE_WIDTH;
  if (node.type === "activity") return ACTIVITY_NODE_WIDTH;
  if (node.type === "source") return SOURCE_NODE_WIDTH;
  if (node.type === "pollUntil") {
    const { inputs, outputs } = computePortRows(
      config,
      nodeId,
      [],
      dynamicEntries,
    );
    return inputs.length > 0 || outputs.length > 0
      ? ACTIVITY_NODE_WIDTH
      : CONTROL_FLOW_NODE_WIDTH;
  }
  return CONTROL_FLOW_NODE_WIDTH;
}
