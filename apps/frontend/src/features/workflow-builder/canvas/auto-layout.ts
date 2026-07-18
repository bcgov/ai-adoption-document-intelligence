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
 *     overlap same-rank neighbours. `DEFAULT_NODE_HEIGHT` (80) is a
 *     defensive fallback only — `estimateNodeHeight` is total over
 *     `config.nodes`, so it can't fire today. Switch nodes render as
 *     180 × 180 diamonds (hence `CONTROL_FLOW_NODE_HEIGHT = 180`), but a
 *     uniform width is good enough for the layout step; dagre uses
 *     width/height only to compute the bounding boxes.
 *   - Output positions are the centre coordinates dagre returns. We
 *     convert them to top-left so the result is xyflow-friendly (xyflow
 *     `node.position` is the top-left of the node).
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
import {
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
const DEFAULT_NODE_HEIGHT = 80;

/**
 * Returns a new `GraphWorkflowConfig` with every node's `metadata.position`
 * set to the dagre layout output. Pure — never mutates the input config.
 */
export function layoutGraph(
  config: GraphWorkflowConfig,
  options: LayoutGraphOptions = {},
): GraphWorkflowConfig {
  const rankdir = options.rankdir ?? DEFAULT_RANKDIR;
  const nodesep = options.nodesep ?? DEFAULT_NODESEP;
  const ranksep = options.ranksep ?? DEFAULT_RANKSEP;
  // Per-node dagre box width: the caller's measured width when supplied, else
  // the fixed default. Reused for both node registration and the
  // centre→top-left conversion so the box dagre reasons about matches the box
  // we report (a mismatch would shift the card off its slot centre).
  const widthFor = (nodeId: string): number =>
    options.nodeWidths?.get(nodeId) ?? DEFAULT_NODE_WIDTH;
  const hasGroups =
    !!config.nodeGroups && Object.keys(config.nodeGroups).length > 0;

  const graph = new dagre.graphlib.Graph({ compound: hasGroups });
  graph.setGraph({
    rankdir,
    nodesep,
    ranksep,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  // Per-node height, derived from the node's real port-row count so tall,
  // multi-port cards (e.g. azureOcr.extract's 5 input rows) don't overlap
  // same-rank neighbours. Computed once and reused for both dagre node
  // registration and the center→top-left conversion below, so the box
  // dagre reasons about matches the box we report. DEFAULT_NODE_HEIGHT is
  // only a fallback for a node id absent from `config.nodes`, which
  // shouldn't happen since this map is built from that same record.
  const nodeHeights = new Map<string, number>();
  for (const node of Object.values(config.nodes)) {
    nodeHeights.set(node.id, estimateNodeHeight(config, node.id));
  }

  // Register every node.
  for (const node of Object.values(config.nodes)) {
    graph.setNode(node.id, {
      width: widthFor(node.id),
      height: nodeHeights.get(node.id) ?? DEFAULT_NODE_HEIGHT,
    });
  }

  // Register groups as cluster subgraphs so members stay close together.
  if (hasGroups && config.nodeGroups) {
    for (const [groupId, group] of Object.entries(config.nodeGroups)) {
      // Cluster node — dagre uses a cluster's label-prefix convention
      // (`cluster*`) only for graphviz output. For the layout itself,
      // any compound parent works as long as we mark the graph as
      // compound and use `setParent`.
      graph.setNode(groupId, {});
      for (const memberId of group.nodeIds) {
        if (config.nodes[memberId]) {
          graph.setParent(memberId, groupId);
        }
      }
    }
  }

  // Register every edge.
  for (const edge of config.edges) {
    if (config.nodes[edge.source] && config.nodes[edge.target]) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  // Stamp positions onto a new nodes record.
  const nextNodes: Record<string, GraphNode> = {};
  for (const [nodeId, node] of Object.entries(config.nodes)) {
    const laidOut = graph.node(nodeId);
    const centerX = laidOut?.x ?? 0;
    const centerY = laidOut?.y ?? 0;
    const height = nodeHeights.get(nodeId) ?? DEFAULT_NODE_HEIGHT;
    nextNodes[nodeId] = {
      ...node,
      metadata: {
        ...(node.metadata ?? {}),
        position: {
          x: centerX - widthFor(nodeId) / 2,
          y: centerY - height / 2,
        },
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
