/**
 * Auto-layout helper for `GraphWorkflowConfig`.
 *
 * Used by:
 *   - The visual workflow editor's "Auto-arrange" top-bar button
 *     (US-049 Scenario 3).
 *   - The template-load path in `WorkflowEditorV2Page.tsx`
 *     (US-050 Scenarios 1–3).
 *   - The read-only `GraphVisualization.tsx` renderer (US-049 Scenario 2).
 *
 * Wraps `dagre-esm` so callers don't have to know about graphlib. The
 * function is pure: given the same input it returns a new config with
 * `metadata.position` stamped on every node. Group sub-graphs (when
 * `config.nodeGroups` is present) are registered as dagre clusters so
 * group members lay out close together (Scenario 4).
 *
 * Design choices:
 *   - Defaults: `rankdir: "LR"`, `nodesep: 60`, `ranksep: 80`. These
 *     match the visual editor's preferred orientation (LR flow).
 *   - Node sizes: `width` is the caller-supplied measured width per node
 *     (`options.nodeWidths`, from the live xyflow instance on Auto-arrange)
 *     when available, else a fixed `DEFAULT_NODE_WIDTH` sized to the widest
 *     rendered activity card — see the constant's comment. Measured widths
 *     make the horizontal gap between adjacent cards a consistent ~`ranksep`
 *     instead of every card reserving the widest card's footprint.
 *     `height` is derived per node via `estimateNodeHeight` (which
 *     rolls up the node's real catalog port-row count) so tall,
 *     multi-port cards (e.g. `azureOcr.extract`'s 5 input rows) don't
 *     overlap same-rank neighbours. Switch nodes render as
 *     180 × 180 diamonds (hence `CONTROL_FLOW_NODE_HEIGHT = 180`), but a
 *     uniform width is good enough for the layout step; dagre uses
 *     width/height only to compute the bounding boxes.
 *   - Output positions are the centre coordinates dagre returns. We
 *     convert them to top-left so the result is xyflow-friendly (xyflow
 *     `node.position` is the top-left of the node).
 *   - Simplified view lays out a DIFFERENT graph — see
 *     `layoutGraphSimplified`. Both share `runDagreLayout`, which is the
 *     only code here that touches dagre.
 */

import type { graphlib } from "dagre";
// Use the explicit ESM dist path so Vitest (Node 22 ESM loader) picks the
// browser-compatible build, not the CJS file that `package.json#main`
// points at. Vite/Vitest both honour `mainFields`, but Node's loader
// resolves `dagre-esm` to its CJS `main` entry and crashes on `require`
// inside an ESM context.
//
// `dagre-esm` ships no types of its own — we declare the module shape we
// actually use inline below to keep this file `any`-free.
// eslint-disable-next-line import/extensions
import dagreLib from "dagre-esm/dist/dagre.esm.js";
import type { GraphNode, GraphWorkflowConfig } from "../../../types/workflow";
import { projectGroupedConfig, readNodePosition } from "./group-projection";
import {
  isSyntheticMapBodyGroupId,
  mergeNodeGroups,
  stripSyntheticMapBodyGroups,
  synthesizeMapBodyGroups,
} from "./map-body-groups";
import { estimateNodeHeight } from "./port-rows";

// ---------------------------------------------------------------------------
// dagre-esm typing wrapper
// ---------------------------------------------------------------------------
//
// dagre-esm re-exports the upstream dagre runtime as the default export of
// an ES module. The upstream `@types/dagre` definitions describe `dagre`
// as a namespace + `layout` function; the ES-default-export shape isn't
// covered by those types. We re-type the import via a small interface so
// the rest of the file stays `any`-free.

interface DagreNamespace {
  graphlib: {
    Graph: new (opts?: {
      directed?: boolean;
      multigraph?: boolean;
      compound?: boolean;
    }) => graphlib.Graph;
  };
  layout: (graph: graphlib.Graph) => void;
}

const dagre = dagreLib as unknown as DagreNamespace;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface LayoutGraphOptions {
  rankdir?: "LR" | "TB";
  nodesep?: number;
  ranksep?: number;
  /**
   * Per-node rendered widths, keyed by node id. When a node id is present its
   * measured width is used as the dagre box width instead of the fixed
   * `DEFAULT_NODE_WIDTH` — so a narrow card gets a narrow slot and the
   * horizontal gap between any two adjacent cards collapses to ~`ranksep`
   * regardless of card width, instead of every card reserving the widest
   * card's footprint. Ids absent from the map fall back to
   * `DEFAULT_NODE_WIDTH`.
   *
   * The "Auto-arrange" button supplies this from the live xyflow instance's
   * measured node sizes; non-DOM callers (template load, tests) omit it and
   * keep the uniform-width behaviour.
   */
  nodeWidths?: ReadonlyMap<string, number>;
}

const DEFAULT_RANKDIR = "LR" as const;
const DEFAULT_NODESEP = 60;
const DEFAULT_RANKSEP = 80;

/**
 * Activity cards render with `minWidth: 200` but NO max — the two-column
 * port-label grid grows the card to fit its content, and cards anchor at
 * the dagre slot's left edge (`centerX - width/2`) and spill rightward.
 * Measured across the three seed workflows (2026-07) the widest rendered
 * card is 522px (`validateFields`, multi-page-report), so a 200px dagre
 * box let wide cards spill `522 - 200 = 322px` past their slot — far more
 * than the 80px `ranksep` gap, producing real post-arrange overlap.
 *
 * 482 is the smallest width that keeps a >= 40px visual gap after the
 * widest measured card: gap = WIDTH + ranksep(80) - 522 >= 40.
 *
 * FRAGILITY: 522 is a point-in-time measurement — longer port labels or
 * new catalog entries can exceed it. If auto-arrange starts producing
 * horizontal overlap again, re-measure and bump (or replace with a
 * per-node width estimate, the deferred long-term fix).
 */
const DEFAULT_NODE_WIDTH = 482;

/**
 * A group chip renders one header row — icon, label, node-count badge — at
 * `minWidth: 220` (`GroupChipNode.tsx`). Its height does NOT vary with member
 * count, which is why only the width is worth measuring: 10px padding + a
 * ~24px row + 10px padding + 2×2px border ≈ 48. The width fallback is the
 * min-width plus its horizontal padding, used only when the caller supplies no
 * measured width (tests, and any chip xyflow has not measured yet).
 */
const GROUP_CHIP_HEIGHT = 48;
const DEFAULT_GROUP_CHIP_WIDTH = 248;

/** One dagre box: an id and the footprint the layout should reserve for it. */
interface LayoutBox {
  id: string;
  width: number;
  height: number;
}

interface DagreLayoutInput {
  boxes: readonly LayoutBox[];
  edges: readonly { source: string; target: string }[];
  /**
   * Cluster id → member box ids. Members stay close together under a
   * compound layout. Ids that are not registered boxes are ignored, and an
   * empty record turns the compound flag off entirely.
   */
  clusters: Readonly<Record<string, readonly string[]>>;
}

/**
 * The one place this module talks to dagre. Takes explicit boxes rather than a
 * config because it serves two graphs: the member-level graph (`layoutGraph`)
 * and the simplified view's projected graph of chips + ungrouped nodes
 * (`layoutGraphSimplified`), where half the boxes are not `config.nodes`
 * entries at all.
 *
 * Returns TOP-LEFT positions (dagre reports centres; xyflow wants top-left),
 * converted with the same width/height each box was registered with — a
 * mismatch there would shift the card off its slot centre.
 */
function runDagreLayout(
  input: DagreLayoutInput,
  options: LayoutGraphOptions,
): Map<string, { x: number; y: number }> {
  const rankdir = options.rankdir ?? DEFAULT_RANKDIR;
  const nodesep = options.nodesep ?? DEFAULT_NODESEP;
  const ranksep = options.ranksep ?? DEFAULT_RANKSEP;
  const clusterIds = Object.keys(input.clusters);

  const graph = new dagre.graphlib.Graph({ compound: clusterIds.length > 0 });
  graph.setGraph({
    rankdir,
    nodesep,
    ranksep,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  const boxById = new Map(input.boxes.map((box) => [box.id, box] as const));
  for (const box of input.boxes) {
    graph.setNode(box.id, { width: box.width, height: box.height });
  }

  // Cluster nodes — dagre uses the `cluster*` label-prefix convention only
  // for graphviz output. For the layout itself, any compound parent works as
  // long as the graph is marked compound and membership goes through
  // `setParent`.
  for (const clusterId of clusterIds) {
    graph.setNode(clusterId, {});
    for (const memberId of input.clusters[clusterId]) {
      if (boxById.has(memberId)) {
        graph.setParent(memberId, clusterId);
      }
    }
  }

  for (const edge of input.edges) {
    if (boxById.has(edge.source) && boxById.has(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const box of input.boxes) {
    const laidOut = graph.node(box.id);
    positions.set(box.id, {
      x: (laidOut?.x ?? 0) - box.width / 2,
      y: (laidOut?.y ?? 0) - box.height / 2,
    });
  }
  return positions;
}

/** Per-node dagre box width: the caller's measured width, else the default. */
function widthForNode(nodeId: string, options: LayoutGraphOptions): number {
  return options.nodeWidths?.get(nodeId) ?? DEFAULT_NODE_WIDTH;
}

/**
 * Returns a new `GraphWorkflowConfig` with every node's `metadata.position`
 * set to the dagre layout output. Pure — never mutates the input config.
 */
export function layoutGraph(
  config: GraphWorkflowConfig,
  options: LayoutGraphOptions = {},
): GraphWorkflowConfig {
  // Per-node height, derived from the node's real port-row count so tall,
  // multi-port cards (e.g. azureOcr.extract's 5 input rows) don't overlap
  // same-rank neighbours.
  const boxes: LayoutBox[] = Object.values(config.nodes).map((node) => ({
    id: node.id,
    width: widthForNode(node.id, options),
    height: estimateNodeHeight(config, node.id),
  }));

  // Groups become cluster subgraphs so members stay close together.
  const clusters: Record<string, readonly string[]> = {};
  for (const [groupId, group] of Object.entries(config.nodeGroups ?? {})) {
    clusters[groupId] = group.nodeIds;
  }

  const placed = runDagreLayout(
    { boxes, edges: config.edges, clusters },
    options,
  );

  // Stamp positions onto a new nodes record.
  const nextNodes: Record<string, GraphNode> = {};
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    nextNodes[nodeId] = {
      ...node,
      metadata: {
        ...(node.metadata ?? {}),
        position: placed.get(nodeId) ?? { x: 0, y: 0 },
      },
    } as GraphNode;
  }

  return {
    ...config,
    nodes: nextNodes,
  };
}

/**
 * `layoutGraph`, but first merges the render-time synthetic map-body groups
 * into the config so a map's body members cluster together under dagre (real
 * user groups already cluster). Then strips those synthetic groups back out of
 * the result so they never persist — they're re-derived at render time.
 *
 * Without this, `layoutGraph` only sees `config.nodeGroups` (which never
 * contains the synthetic map-body groups), so a map's body scatters on
 * Auto-arrange and its derived body-container box sprawls over non-member
 * nodes. Use this from every Auto-arrange entry point.
 */
export function layoutGraphWithMapBodies(
  config: GraphWorkflowConfig,
  options: LayoutGraphOptions = {},
): GraphWorkflowConfig {
  const synthetic = synthesizeMapBodyGroups(config);
  const forLayout =
    Object.keys(synthetic).length === 0
      ? config
      : {
          ...config,
          nodeGroups: mergeNodeGroups(config.nodeGroups ?? {}, synthetic),
        };
  const laidOut = layoutGraph(forLayout, options);
  return laidOut.nodeGroups
    ? {
        ...laidOut,
        nodeGroups: stripSyntheticMapBodyGroups(laidOut.nodeGroups),
      }
    : laidOut;
}

/**
 * G-4 — Auto-arrange for the SIMPLIFIED view.
 *
 * `layoutGraphWithMapBodies` lays out the member-level graph, which is not
 * the graph on screen when groups are collapsed: a chip sits at the CENTROID
 * of its members' positions, so arranging the members only moved each chip to
 * the middle of its own member chain. Nothing the author could see moved,
 * which is why Auto-arrange read as a no-op in simplified view.
 *
 * So lay out what is actually rendered — `projectGroupedConfig`'s own output:
 * one box per chip, one per ungrouped node, wired by the projection's
 * rewritten edges (intra-group edges dropped, cross-group endpoints remapped
 * to chip ids; dagre collapses the duplicates that remapping creates, since a
 * non-multigraph keys edges by their endpoint pair).
 *
 * Members then move as a rigid body: each group's members are translated by
 * the delta its chip travelled, so INTERNAL geometry survives untouched and
 * expanding after an arrange shows the same arrangement, relocated. What it
 * does NOT guarantee is that an expanded group clears its neighbours — the
 * chip reserved a chip-sized slot, not a group-sized one. Reserving the
 * members' bounding box instead would push the visible chips apart by the
 * size of things nobody can see, which is the worse trade.
 *
 * Chip box sizes come from `options.nodeWidths` exactly as measured card
 * widths do — chips are real xyflow nodes, so the Auto-arrange entry points'
 * measured-width sweep already includes them.
 *
 * Pure, like everything else here: no React, no xyflow.
 */
export function layoutGraphSimplified(
  config: GraphWorkflowConfig,
  options: LayoutGraphOptions = {},
): GraphWorkflowConfig {
  const projected = projectGroupedConfig(config);

  // Nothing is collapsed — simplified view is showing exactly what the
  // expanded view shows, so it gets exactly the expanded layout.
  if (projected.chips.length === 0) {
    return layoutGraphWithMapBodies(config, options);
  }
  // A translation needs something to translate FROM. With no authored
  // geometry anywhere there is no intra-group arrangement to preserve (every
  // member reads the same fallback position and the chips would stack their
  // members on one point), so lay out the member graph and let the centroids
  // become real.
  if (!configHasAnyPosition(config)) {
    return layoutGraphWithMapBodies(config, options);
  }

  const boxes: LayoutBox[] = projected.visibleNodes.map((node) => ({
    id: node.id,
    width: widthForNode(node.id, options),
    height: estimateNodeHeight(config, node.id),
  }));
  for (const chip of projected.chips) {
    boxes.push({
      id: chip.id,
      width: options.nodeWidths?.get(chip.id) ?? DEFAULT_GROUP_CHIP_WIDTH,
      height: GROUP_CHIP_HEIGHT,
    });
  }

  // Map bodies still cluster, as they do in the expanded layout. `mergeNodeGroups`
  // strips from each synthetic group every member a user group already claimed
  // — i.e. everything folded into a chip — so what survives is visible boxes
  // only, and a body swallowed whole by a group drops out.
  const clusters: Record<string, readonly string[]> = {};
  const merged = mergeNodeGroups(
    config.nodeGroups ?? {},
    synthesizeMapBodyGroups(config),
  );
  for (const [groupId, group] of Object.entries(merged)) {
    if (isSyntheticMapBodyGroupId(groupId)) {
      clusters[groupId] = group.nodeIds;
    }
  }

  const placed = runDagreLayout(
    { boxes, edges: projected.visibleEdges, clusters },
    options,
  );

  const nextPositions = new Map<string, { x: number; y: number }>();
  for (const node of projected.visibleNodes) {
    const position = placed.get(node.id);
    if (position) nextPositions.set(node.id, position);
  }
  for (const chip of projected.chips) {
    const position = placed.get(chip.id);
    if (!position) continue;
    // The chip's own travel, applied uniformly to its members. `chip.position`
    // is the centroid the projection derived from these same members, read
    // through `readNodePosition` — so the same reader has to supply the
    // "before" here or the members would drift off their chip.
    const dx = position.x - chip.position.x;
    const dy = position.y - chip.position.y;
    for (const memberId of chip.memberNodeIds) {
      const member = config.nodes[memberId];
      if (!member) continue;
      const from = readNodePosition(member);
      nextPositions.set(memberId, { x: from.x + dx, y: from.y + dy });
    }
  }

  const nextNodes: Record<string, GraphNode> = {};
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    const position = nextPositions.get(nodeId);
    nextNodes[nodeId] = position
      ? ({
          ...node,
          metadata: { ...(node.metadata ?? {}), position },
        } as GraphNode)
      : node;
  }

  return { ...config, nodes: nextNodes };
}

/**
 * Returns true if at least one node in the config has a
 * `metadata.position`. Used by `layoutGraphIfMissingPositions` and by
 * the V2 editor's template-load hydration (US-050).
 */
export function configHasAnyPosition(config: GraphWorkflowConfig): boolean {
  for (const node of Object.values(config.nodes)) {
    const pos = (node.metadata as { position?: { x: number; y: number } })
      ?.position;
    if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
      return true;
    }
  }
  return false;
}

/**
 * US-050 entry point: if the config has zero nodes carrying a
 * `metadata.position`, run `layoutGraph` and return the result. If any
 * node has a position (partial or full), the input config is returned
 * unchanged. The user can always trigger auto-layout manually via the
 * "Auto-arrange" top-bar button (US-049).
 */
export function layoutGraphIfMissingPositions(
  config: GraphWorkflowConfig,
  options: LayoutGraphOptions = {},
): GraphWorkflowConfig {
  if (configHasAnyPosition(config)) {
    return config;
  }
  return layoutGraph(config, options);
}

// ---------------------------------------------------------------------------
// xyflow-shaped helper — used by `GraphVisualization.tsx` (US-049 Scenario 2)
// ---------------------------------------------------------------------------

interface XyflowLayoutNode {
  id: string;
  width?: number;
  height?: number;
}

interface XyflowLayoutEdge {
  source: string;
  target: string;
}

export interface XyflowLayoutOptions {
  rankdir?: "LR" | "TB";
  nodesep?: number;
  ranksep?: number;
}

const DEFAULT_XY_RANKDIR = "TB" as const;
const DEFAULT_XY_NODESEP = 50;
const DEFAULT_XY_RANKSEP = 80;
const DEFAULT_XY_NODE_WIDTH = 180;
const DEFAULT_XY_NODE_HEIGHT = 80;

/**
 * Lift of the dagre layout previously inlined in
 * `GraphVisualization.tsx`. Accepts xyflow-shaped nodes/edges and
 * returns the same nodes with `position` patched. Used by the read-only
 * renderer so all dagre interaction lives in this one module.
 *
 * Defaults match the renderer's previous behaviour (`rankdir: "TB"`,
 * `ranksep: 80`, `nodesep: 50`, fallback dimensions 180 × 80).
 */
export function layoutXyflowNodes<
  N extends XyflowLayoutNode & { position?: { x: number; y: number } },
  E extends XyflowLayoutEdge,
>(
  nodes: N[],
  edges: E[],
  options: XyflowLayoutOptions = {},
): { nodes: N[]; edges: E[] } {
  const rankdir = options.rankdir ?? DEFAULT_XY_RANKDIR;
  const nodesep = options.nodesep ?? DEFAULT_XY_NODESEP;
  const ranksep = options.ranksep ?? DEFAULT_XY_RANKSEP;

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir, ranksep, nodesep });

  for (const node of nodes) {
    graph.setNode(node.id, {
      width: node.width ?? DEFAULT_XY_NODE_WIDTH,
      height: node.height ?? DEFAULT_XY_NODE_HEIGHT,
    });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }
  dagre.layout(graph);

  const laidOut = nodes.map((node) => {
    const placed = graph.node(node.id);
    const width = node.width ?? DEFAULT_XY_NODE_WIDTH;
    const height = node.height ?? DEFAULT_XY_NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: (placed?.x ?? 0) - width / 2,
        y: (placed?.y ?? 0) - height / 2,
      },
    };
  });

  return { nodes: laidOut, edges };
}
