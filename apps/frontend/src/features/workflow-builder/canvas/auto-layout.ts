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
 *   - Node sizes: default `width: 200`, `height: 80` — close to the
 *     `WorkflowEditorCanvas` activity node footprint. Switch nodes are
 *     square-diamond shaped at 140 × 140 in the canvas, but a uniform
 *     box is good enough for the layout step; dagre uses width/height
 *     only to compute the bounding boxes.
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
}

const DEFAULT_OPTIONS: Required<LayoutGraphOptions> = {
  rankdir: "LR",
  nodesep: 60,
  ranksep: 80,
};

const DEFAULT_NODE_WIDTH = 200;
const DEFAULT_NODE_HEIGHT = 80;

/**
 * Returns a new `GraphWorkflowConfig` with every node's `metadata.position`
 * set to the dagre layout output. Pure — never mutates the input config.
 */
export function layoutGraph(
  config: GraphWorkflowConfig,
  options: LayoutGraphOptions = {},
): GraphWorkflowConfig {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const hasGroups =
    !!config.nodeGroups && Object.keys(config.nodeGroups).length > 0;

  const graph = new dagre.graphlib.Graph({ compound: hasGroups });
  graph.setGraph({
    rankdir: opts.rankdir,
    nodesep: opts.nodesep,
    ranksep: opts.ranksep,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  // Register every node.
  for (const node of Object.values(config.nodes)) {
    graph.setNode(node.id, {
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
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
    nextNodes[nodeId] = {
      ...node,
      metadata: {
        ...(node.metadata ?? {}),
        position: {
          x: centerX - DEFAULT_NODE_WIDTH / 2,
          y: centerY - DEFAULT_NODE_HEIGHT / 2,
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
