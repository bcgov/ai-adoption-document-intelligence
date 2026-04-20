import "@xyflow/react/dist/style.css";

import { Badge } from "@mantine/core";
import {
  IconBolt,
  IconCornerDownRight,
  IconDeviceFloppy,
  IconFolder,
  IconGitMerge,
  IconRefresh,
  IconRepeat,
  IconScan,
  IconSettings,
  IconShieldCheck,
  IconSparkles,
  IconSwitch3,
  IconUser,
  IconUserCheck,
} from "@tabler/icons-react";
import type { ReactFlowInstance } from "@xyflow/react";
import {
  Background,
  BaseEdge,
  type Edge,
  type EdgeProps,
  EdgeText,
  getBezierPath,
  Handle,
  MarkerType,
  type Node,
  Position,
  ReactFlow,
} from "@xyflow/react";
import dagre from "dagre-esm";
import { memo, useEffect, useMemo, useRef } from "react";
import type {
  ChildWorkflowNode,
  GraphEdge,
  GraphNode,
  GraphWorkflowConfig,
  MapNode,
  SwitchNode,
} from "../../types/workflow";

export interface GraphVisualizationError {
  path: string;
  message: string;
}

interface GraphVisualizationProps {
  config: GraphWorkflowConfig | null;
  validationErrors?: GraphVisualizationError[];
  viewMode?: "detailed" | "simplified";
}

interface GraphNodeData {
  label: string;
  type: GraphNode["type"];
  hasError: boolean;
  workflowRef?: ChildWorkflowNode["workflowRef"];
}

interface GroupNodeData {
  label: string;
  description?: string;
  icon?: string;
  color: string;
  nodeCount: number;
}

interface MapContainerData {
  label: string;
  collectionCtxKey: string;
  maxConcurrency?: number;
  bodyNodeCount: number;
  hasError: boolean;
}

const NODE_DIMENSIONS: Record<
  GraphNode["type"],
  { width: number; height: number }
> = {
  activity: { width: 180, height: 72 },
  switch: { width: 140, height: 140 },
  map: { width: 190, height: 80 },
  join: { width: 190, height: 80 },
  childWorkflow: { width: 200, height: 80 },
  pollUntil: { width: 190, height: 80 },
  humanGate: { width: 190, height: 80 },
};

const LAYER_GAP = 120; // Vertical spacing between layers in map containers

const NODE_COLORS: Record<GraphNode["type"], string> = {
  activity: "#3b82f6",
  switch: "#facc15",
  map: "#22c55e",
  join: "#16a34a",
  childWorkflow: "#a855f7",
  pollUntil: "#fb923c",
  humanGate: "#ef4444",
};

const NODE_ICONS: Record<GraphNode["type"], React.ReactElement> = {
  activity: <IconBolt size={18} />,
  switch: <IconSwitch3 size={18} />,
  map: <IconRepeat size={18} />,
  join: <IconGitMerge size={18} />,
  childWorkflow: <IconFolder size={18} />,
  pollUntil: <IconRefresh size={18} />,
  humanGate: <IconUserCheck size={18} />,
};

const GraphNodeRenderer = memo(function GraphNodeRenderer({
  data,
}: {
  data: GraphNodeData;
}) {
  const color = NODE_COLORS[data.type];
  const isDiamond = data.type === "switch";
  const isChildWorkflow = data.type === "childWorkflow";
  const workflowId =
    isChildWorkflow && data.workflowRef?.type === "library"
      ? data.workflowRef.workflowId
      : undefined;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      {/* Visual layer only - rotated for diamond */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: isDiamond ? 0 : 12,
          border: data.hasError ? "2px solid #ef4444" : `2px solid ${color}`,
          background: "#ffffff",
          boxShadow: "0 6px 12px rgba(0,0,0,0.08)",
          transform: isDiamond ? "rotate(45deg) scale(0.7071)" : "none",
          transformOrigin: "50% 50%",
        }}
      />

      {/* Content layer (upright) */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          textAlign: "center",
          fontSize: 12,
          color: "#111827",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
          }}
        >
          <span style={{ color }}>{NODE_ICONS[data.type]}</span>
          <span>{data.label}</span>
        </div>
        {isChildWorkflow && workflowId ? (
          <div
            style={{
              fontSize: 10,
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
              gap: 4,
              justifyContent: "center",
            }}
          >
            <IconCornerDownRight size={12} />
            <span>{workflowId}</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#6b7280" }}>{data.type}</div>
        )}
      </div>

      {/* Handles on the unrotated wrapper - these stay at vertices for diamond */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ background: color }}
      />
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ background: color }}
      />
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ background: color }}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ background: color }}
      />
    </div>
  );
});

const GROUP_ICONS: Record<string, React.ReactElement> = {
  scan: <IconScan size={20} />,
  cleanup: <IconSparkles size={20} />,
  quality: <IconShieldCheck size={20} />,
  human: <IconUser size={20} />,
  save: <IconDeviceFloppy size={20} />,
  prepare: <IconSettings size={20} />,
  process: <IconBolt size={20} />,
  validate: <IconShieldCheck size={20} />,
};

const GroupNodeRenderer = memo(function GroupNodeRenderer({
  data,
}: {
  data: GroupNodeData;
}) {
  const icon = data.icon ? GROUP_ICONS[data.icon] : null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        border: `2px solid ${data.color}`,
        background: "#ffffff",
        boxShadow: "0 6px 12px rgba(0,0,0,0.08)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ color: data.color }}>{icon}</span>}
          <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
            {data.label}
          </span>
        </div>
        <Badge size="sm" variant="light" color="gray">
          {data.nodeCount} {data.nodeCount === 1 ? "node" : "nodes"}
        </Badge>
      </div>
      {data.description && (
        <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
          {data.description}
        </div>
      )}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ background: data.color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ background: data.color }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ background: data.color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ background: data.color }}
      />
    </div>
  );
});

// Stagger labels by alternating: base position and higher (closer to source) to avoid overlap
const LABEL_BASE_FRACTION = 0.75; // main position halfway down the edge
const LABEL_ALTERNATE_OFFSET = 0.28; // odd-indexed labels this much higher (e.g. 50% vs 38%)

function applyStaggeredLabelDistances(edges: Edge[], nodes: Node[]): Edge[] {
  const labeled = edges.filter((e) => !!e.label);

  const nodePosition = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    nodePosition.set(n.id, n.position ?? { x: 0, y: 0 });
  }

  // Group by source + sourceHandle only so all edges leaving the same node (e.g. switch) get staggered
  const groups = new Map<string, Edge[]>();
  for (const e of labeled) {
    const key = [e.source, e.sourceHandle ?? ""].join("|");

    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  const out = edges.map((e) => ({ ...e }));
  const byId = new Map(out.map((e) => [e.id, e] as const));

  for (const arr of groups.values()) {
    // Sort by target node position (x then y) so stagger order matches visual left-to-right, top-to-bottom
    const sorted = [...arr].sort((a, b) => {
      const posA = nodePosition.get(a.target) ?? { x: 0, y: 0 };
      const posB = nodePosition.get(b.target) ?? { x: 0, y: 0 };
      if (posA.x !== posB.x) return posA.x - posB.x;
      return posA.y - posB.y;
    });

    sorted.forEach((edge, index) => {
      const e = byId.get(edge.id);
      if (!e) return;

      // Alternate: even index = base (50%), odd index = higher (closer to source)
      const fraction =
        index % 2 === 0
          ? LABEL_BASE_FRACTION
          : Math.max(0.15, LABEL_BASE_FRACTION - LABEL_ALTERNATE_OFFSET);
      e.type = "staggerLabel";
      e.data = {
        ...(e.data as Record<string, unknown>),
        labelFraction: fraction,
      };
    });
  }

  return out;
}

interface StaggerLabelEdgeData {
  /** Fraction along edge (0–1); labels start at 50% then stagger. */
  labelFraction?: number;
  /** Legacy: pixels from source (used if labelFraction not set). */
  labelDistance?: number;
  [key: string]: unknown;
}

const StaggerLabelEdge = memo(function StaggerLabelEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    markerEnd,
    style,
    label,
    labelStyle,
    data,
  } = props;

  const [edgePath, defaultLabelX, defaultLabelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const edgeData = data as StaggerLabelEdgeData | undefined;
  const fraction = edgeData?.labelFraction;
  const distPx = edgeData?.labelDistance;

  let x = defaultLabelX;
  let y = defaultLabelY;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;

  if (typeof fraction === "number") {
    const t = Math.max(0, Math.min(1, fraction));
    x = sourceX + dx * t;
    y = sourceY + dy * t;
  } else if (typeof distPx === "number") {
    const t = Math.max(0, Math.min(1, distPx / len));
    x = sourceX + dx * t;
    y = sourceY + dy * t;
  }

  const labelStyleObj = labelStyle as
    | { fill?: string; fontSize?: number; fontWeight?: number }
    | undefined;
  const styleObj = style as { stroke?: string } | undefined;
  const fill = labelStyleObj?.fill ?? styleObj?.stroke ?? "#111827";

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {label ? (
        <EdgeText
          x={x}
          y={y}
          label={label}
          labelStyle={{
            fill,
            fontSize: labelStyleObj?.fontSize ?? 11,
            fontWeight: labelStyleObj?.fontWeight ?? 500,
          }}
          labelShowBg
          labelBgStyle={{ fill: "#fff", stroke: fill }}
          labelBgPadding={[4, 6]}
          labelBgBorderRadius={4}
        />
      ) : null}
    </>
  );
});

const MapContainerRenderer = memo(function MapContainerRenderer({
  data,
}: {
  data: MapContainerData;
}) {
  const color = NODE_COLORS.map;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 12,
        border: data.hasError ? "2px solid #ef4444" : `2px dashed ${color}`,
        background: "#f9fafb",
        boxShadow: "0 6px 12px rgba(0,0,0,0.08)",
        padding: "12px 12px 12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 8,
          borderBottom: `1px solid ${color}40`,
        }}
      >
        <span style={{ color }}>
          <IconRepeat size={18} />
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>
          {data.label}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#6b7280" }}>
        for each in {data.collectionCtxKey}
      </div>
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{ background: color }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{ background: color }}
      />
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{ background: color }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ background: color }}
      />
    </div>
  );
});

function extractSwitchEdgeLabel(
  edge: GraphEdge,
  config: GraphWorkflowConfig,
): string | undefined {
  // Check if source node is a switch node
  const sourceNode = config.nodes[edge.source];
  if (!sourceNode || sourceNode.type !== "switch") {
    return undefined;
  }

  const switchNode = sourceNode as SwitchNode;

  // Check if this edge is the default edge
  if (switchNode.defaultEdge === edge.id) {
    return "default";
  }

  // Find the case that matches this edge
  const matchingCase = switchNode.cases.find((c) => c.edgeId === edge.id);
  if (!matchingCase) {
    return undefined;
  }

  // Format the condition - only handle ComparisonExpression for now
  const cond = matchingCase.condition;

  // Check if it's a comparison expression (has left, right, operator)
  if (!("left" in cond) || !("right" in cond) || !("operator" in cond)) {
    return "conditional"; // Fallback for complex expressions
  }

  const leftPart = cond.left.ref
    ? cond.left.ref.replace("ctx.", "").replace("currentSegment.", "")
    : "?";
  const rightPart =
    typeof cond.right.literal === "string"
      ? cond.right.literal
      : JSON.stringify(cond.right.literal ?? cond.right.ref ?? "?");

  const op =
    cond.operator === "equals"
      ? "="
      : cond.operator === "not-equals"
        ? "!="
        : cond.operator;

  return `${leftPart} ${op} ${rightPart}`;
}

function buildEdgeLabel(
  edge: GraphEdge,
  config: GraphWorkflowConfig,
): string | undefined {
  const labelParts: string[] = [];

  // Check for switch node condition first
  const switchLabel = extractSwitchEdgeLabel(edge, config);
  if (switchLabel) {
    labelParts.push(switchLabel);
  }

  if (edge.sourcePort || edge.targetPort) {
    if (edge.sourcePort && edge.targetPort) {
      labelParts.push(`${edge.sourcePort} → ${edge.targetPort}`);
    } else {
      labelParts.push(edge.sourcePort ?? edge.targetPort ?? "");
    }
  }
  if (edge.type === "conditional" && edge.condition) {
    labelParts.push(edge.condition);
  }
  if (labelParts.length === 0) {
    return undefined;
  }
  return labelParts.join(" | ");
}

function extractNodeIdsWithErrors(
  errors: GraphVisualizationError[] | undefined,
): Set<string> {
  const nodeIds = new Set<string>();
  if (!errors) {
    return nodeIds;
  }
  errors.forEach((error) => {
    const match =
      /nodes[.[]([a-zA-Z0-9_-]+)/.exec(error.path) ??
      /nodeId[:=]\s*([a-zA-Z0-9_-]+)/i.exec(error.message);
    if (match?.[1]) {
      nodeIds.add(match[1]);
    }
  });
  return nodeIds;
}

function identifyMapBodyNodes(
  config: GraphWorkflowConfig,
): Map<string, string> {
  // Returns map of bodyNodeId -> mapNodeId
  const bodyNodeToMapNode = new Map<string, string>();

  for (const node of Object.values(config.nodes)) {
    if (node.type === "map") {
      const mapNode = node as MapNode;
      // Find all nodes in the body by traversing from bodyEntryNodeId to bodyExitNodeId
      const bodyNodeIds = new Set<string>();
      const visited = new Set<string>();
      const queue = [mapNode.bodyEntryNodeId];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        bodyNodeIds.add(currentId);

        // Stop if we reached the exit node
        if (currentId === mapNode.bodyExitNodeId) {
          break;
        }

        // Find edges from this node that lead to other body nodes
        for (const edge of config.edges) {
          if (edge.source === currentId && !visited.has(edge.target)) {
            // Check if target is potentially in body (not the map node itself or external)
            const targetNode = config.nodes[edge.target];
            if (targetNode && edge.target !== mapNode.id) {
              queue.push(edge.target);
            }
          }
        }
      }

      // Map all body nodes to this map node
      for (const bodyNodeId of bodyNodeIds) {
        bodyNodeToMapNode.set(bodyNodeId, mapNode.id);
      }
    }
  }

  return bodyNodeToMapNode;
}

function computeBodyNodeLayers(
  bodyNodeIds: string[],
  edges: GraphEdge[],
  entryNodeId: string,
): Map<number, string[]> {
  // Build adjacency list for body nodes only
  const bodyNodeSet = new Set(bodyNodeIds);
  const adjacencyList = new Map<string, string[]>();

  for (const nodeId of bodyNodeIds) {
    adjacencyList.set(nodeId, []);
  }

  for (const edge of edges) {
    if (bodyNodeSet.has(edge.source) && bodyNodeSet.has(edge.target)) {
      adjacencyList.get(edge.source)!.push(edge.target);
    }
  }

  // BFS to compute layers
  const nodeLayer = new Map<string, number>();
  const queue: Array<{ nodeId: string; layer: number }> = [];

  // Start from entry node
  nodeLayer.set(entryNodeId, 0);
  queue.push({ nodeId: entryNodeId, layer: 0 });

  while (queue.length > 0) {
    const { nodeId, layer } = queue.shift()!;
    const neighbors = adjacencyList.get(nodeId) || [];

    for (const neighbor of neighbors) {
      if (!nodeLayer.has(neighbor)) {
        nodeLayer.set(neighbor, layer + 1);
        queue.push({ nodeId: neighbor, layer: layer + 1 });
      }
    }
  }

  // Group nodes by layer
  const layersMap = new Map<number, string[]>();

  for (const [nodeId, layer] of nodeLayer.entries()) {
    if (!layersMap.has(layer)) {
      layersMap.set(layer, []);
    }
    layersMap.get(layer)!.push(nodeId);
  }

  return layersMap;
}

function layoutGraph(
  nodes: Node[],
  edges: Edge[],
): { nodes: Node[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 50 });

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: node.width ?? 180,
      height: node.height ?? 80,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - (node.width ?? 0) / 2,
        y: position.y - (node.height ?? 0) / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function buildDetailedViewWithMapContainers(
  config: GraphWorkflowConfig,
  errorNodeIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const bodyNodeToMapNode = identifyMapBodyNodes(config);
  const mappedNodes: Node[] = [];
  const mappedEdges: Edge[] = [];
  const mapNodeToBodyNodes = new Map<string, string[]>();

  // Build reverse map: mapNodeId -> bodyNodeIds[]
  for (const [bodyNodeId, mapNodeId] of bodyNodeToMapNode.entries()) {
    if (!mapNodeToBodyNodes.has(mapNodeId)) {
      mapNodeToBodyNodes.set(mapNodeId, []);
    }
    mapNodeToBodyNodes.get(mapNodeId)!.push(bodyNodeId);
  }

  // Build nodes
  for (const node of Object.values(config.nodes)) {
    const isMapBody = bodyNodeToMapNode.has(node.id);
    const isMapContainer = node.type === "map";

    if (isMapContainer) {
      // Create map container node
      const mapNode = node as MapNode;
      const bodyNodeIds = mapNodeToBodyNodes.get(node.id) || [];
      const bodyNodeCount = bodyNodeIds.length;

      // Calculate container size based on layers
      const PADDING = 24;
      const HEADER_HEIGHT = 50;
      const NODE_GAP = 40;
      const TOP_PADDING = 40; // Increased for more visible spacing
      const BOTTOM_PADDING = 25;

      // Compute layers for body nodes
      const layersMap = computeBodyNodeLayers(
        bodyNodeIds,
        config.edges,
        mapNode.bodyEntryNodeId,
      );
      const numLayers = layersMap.size;

      // Calculate width based on widest layer
      const maxLayerWidth = Math.max(
        ...Array.from(layersMap.values()).map((layerNodes) => {
          const nodesWidth = layerNodes.reduce((sum, nodeId) => {
            return sum + NODE_DIMENSIONS[config.nodes[nodeId].type].width;
          }, 0);
          const gaps = Math.max(0, layerNodes.length - 1) * NODE_GAP;
          return nodesWidth + gaps;
        }),
      );

      const containerWidth = Math.max(250, maxLayerWidth + PADDING * 2);

      // Calculate height based on actual max height per layer for tight fit
      const layerHeights = Array.from(layersMap.values()).map(
        (layerNodeIds) => {
          return Math.max(
            ...layerNodeIds.map(
              (nodeId) => NODE_DIMENSIONS[config.nodes[nodeId].type].height,
            ),
          );
        },
      );
      const totalLayersHeight = layerHeights.reduce((sum, h) => sum + h, 0);
      const containerHeight =
        HEADER_HEIGHT +
        TOP_PADDING +
        totalLayersHeight +
        Math.max(0, numLayers - 1) * LAYER_GAP +
        BOTTOM_PADDING;

      mappedNodes.push({
        id: node.id,
        type: "mapContainer",
        position: { x: 0, y: 0 },
        width: containerWidth,
        height: containerHeight,
        data: {
          label: node.label,
          collectionCtxKey: mapNode.collectionCtxKey,
          maxConcurrency: mapNode.maxConcurrency,
          bodyNodeCount,
          hasError: errorNodeIds.has(node.id),
        } as unknown as Record<string, unknown>,
      });
    } else if (isMapBody) {
      // Create body node with parent relationship
      const parentMapNodeId = bodyNodeToMapNode.get(node.id)!;
      const dimensions = NODE_DIMENSIONS[node.type];
      const workflowRef =
        node.type === "childWorkflow"
          ? (node as ChildWorkflowNode).workflowRef
          : undefined;

      mappedNodes.push({
        id: node.id,
        type: "graphNode",
        position: { x: 0, y: 0 }, // Will be set relative to parent later
        width: dimensions.width,
        height: dimensions.height,
        parentId: parentMapNodeId,
        extent: "parent" as const,
        data: {
          label: node.label,
          type: node.type,
          hasError: errorNodeIds.has(node.id),
          workflowRef,
        } as unknown as Record<string, unknown>,
      });
    } else {
      // Regular top-level node
      const dimensions = NODE_DIMENSIONS[node.type];
      const workflowRef =
        node.type === "childWorkflow"
          ? (node as ChildWorkflowNode).workflowRef
          : undefined;

      mappedNodes.push({
        id: node.id,
        type: "graphNode",
        position: { x: 0, y: 0 },
        width: dimensions.width,
        height: dimensions.height,
        data: {
          label: node.label,
          type: node.type,
          hasError: errorNodeIds.has(node.id),
          workflowRef,
        } as unknown as Record<string, unknown>,
      });
    }
  }

  // Build edges - handle internal vs external
  for (const edge of config.edges) {
    const sourceMapParent = bodyNodeToMapNode.get(edge.source);
    const targetMapParent = bodyNodeToMapNode.get(edge.target);
    const isInternalEdge =
      sourceMapParent && targetMapParent && sourceMapParent === targetMapParent;

    if (isInternalEdge) {
      // Internal edge within map body - use vertical connections (bottom → top) for layer-based layout
      const label = buildEdgeLabel(edge, config);
      const isConditional = edge.type === "conditional";
      const isError = edge.type === "error";
      const color = isError ? "#ef4444" : "#4b5563";

      mappedEdges.push({
        id: edge.id,
        source: edge.source,
        sourceHandle: "bottom",
        target: edge.target,
        targetHandle: "top",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
        animated: false,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isConditional || isError ? "6 4" : "0",
        },
        label,
        labelStyle: {
          fill: color,
          fontSize: 11,
          fontWeight: 500,
        },
      });
    } else {
      // External edge - connect to container if source/target is a body node
      const effectiveSource = sourceMapParent || edge.source;
      const effectiveTarget = targetMapParent || edge.target;

      const label = buildEdgeLabel(edge, config);
      const isConditional = edge.type === "conditional";
      const isError = edge.type === "error";
      const color = isError ? "#ef4444" : "#4b5563";

      mappedEdges.push({
        id: edge.id,
        source: effectiveSource,
        target: effectiveTarget,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
        animated: false,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isConditional || isError ? "6 4" : "0",
        },
        label,
        labelStyle: {
          fill: color,
          fontSize: 11,
          fontWeight: 500,
        },
      });
    }
  }

  // Two-pass layout: Dagre for top-level, manual for body nodes
  return layoutGraphWithMapContainers(
    mappedNodes,
    mappedEdges,
    mapNodeToBodyNodes,
    config,
  );
}

function layoutGraphWithMapContainers(
  nodes: Node[],
  edges: Edge[],
  mapNodeToBodyNodes: Map<string, string[]>,
  config: GraphWorkflowConfig,
): { nodes: Node[]; edges: Edge[] } {
  // Pass 1: Layout top-level nodes only (exclude body nodes)
  const topLevelNodes = nodes.filter((node) => !node.parentId);
  const topLevelEdges = edges.filter((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    return !sourceNode?.parentId && !targetNode?.parentId;
  });

  const { nodes: layoutedTopLevel } = layoutGraph(topLevelNodes, topLevelEdges);

  // Pass 2: Position body nodes inside their parent containers using layers
  const finalNodes = layoutedTopLevel.flatMap((node) => {
    if (node.type === "mapContainer") {
      // Position body nodes inside this container based on layers
      const bodyNodeIds = mapNodeToBodyNodes.get(node.id) || [];
      const PADDING = 24;
      const HEADER_HEIGHT = 50;
      const NODE_GAP = 40;
      const TOP_PADDING = 40; // Increased for more visible spacing

      // Find the map node from config
      const mapNodeConfig = Object.values(config.nodes).find(
        (n) => n.id === node.id && n.type === "map",
      ) as MapNode | undefined;

      if (!mapNodeConfig) {
        // Fallback to old horizontal layout if map node not found
        let currentX = PADDING;
        const positionedBodyNodes = bodyNodeIds.map((bodyNodeId) => {
          const bodyNode = nodes.find((n) => n.id === bodyNodeId)!;
          const positionedBody = {
            ...bodyNode,
            position: {
              x: currentX,
              y: HEADER_HEIGHT + TOP_PADDING,
            },
          };
          currentX += (bodyNode.width ?? 0) + NODE_GAP;
          return positionedBody;
        });
        return [node, ...positionedBodyNodes];
      }

      // Compute layers for body nodes
      const layersMap = computeBodyNodeLayers(
        bodyNodeIds,
        config.edges,
        mapNodeConfig.bodyEntryNodeId,
      );

      // Calculate actual max height per layer for precise positioning
      const layerHeights = Array.from(layersMap.values()).map(
        (layerNodeIds) => {
          return Math.max(
            ...layerNodeIds.map((nodeId) => {
              const bodyNode = nodes.find((n) => n.id === nodeId)!;
              return bodyNode.height ?? 80;
            }),
          );
        },
      );

      // Position nodes layer by layer
      const positionedBodyNodes: Node[] = [];
      let cumulativeY = HEADER_HEIGHT + TOP_PADDING;

      layersMap.forEach((layerNodeIds, layerNumber) => {
        // Calculate layer dimensions
        const layerNodesWithDims = layerNodeIds.map((nodeId) => {
          const bodyNode = nodes.find((n) => n.id === nodeId)!;
          return {
            nodeId,
            node: bodyNode,
            width: bodyNode.width ?? 180,
            height: bodyNode.height ?? 80,
          };
        });

        const totalLayerWidth =
          layerNodesWithDims.reduce((sum, n) => sum + n.width, 0) +
          Math.max(0, layerNodeIds.length - 1) * NODE_GAP;

        // Center the layer horizontally
        let currentX = (node.width! - totalLayerWidth) / 2;

        // Use cumulative Y position for this layer
        const currentY = cumulativeY;

        // Position each node in the layer
        layerNodesWithDims.forEach(({ node: bodyNode }) => {
          positionedBodyNodes.push({
            ...bodyNode,
            position: {
              x: currentX,
              y: currentY,
            },
          });
          currentX += bodyNode.width! + NODE_GAP;
        });

        // Update cumulative Y for next layer
        cumulativeY += layerHeights[layerNumber] + LAYER_GAP;
      });

      return [node, ...positionedBodyNodes];
    }
    return [node];
  });

  return { nodes: finalNodes, edges };
}

function buildHybridView(
  config: GraphWorkflowConfig,
  errorNodeIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  // Hybrid view: simplified groups for regular nodes + detailed map containers
  const nodeGroups = config.nodeGroups!;
  const mappedNodes: Node[] = [];
  const mappedEdges: Edge[] = [];

  // Identify map body nodes
  const bodyNodeToMapNode = identifyMapBodyNodes(config);
  const mapNodeToBodyNodes = new Map<string, string[]>();
  for (const [bodyNodeId, mapNodeId] of bodyNodeToMapNode.entries()) {
    if (!mapNodeToBodyNodes.has(mapNodeId)) {
      mapNodeToBodyNodes.set(mapNodeId, []);
    }
    mapNodeToBodyNodes.get(mapNodeId)!.push(bodyNodeId);
  }

  // Build a map of nodeId -> groupId for fast lookup
  const nodeToGroupMap = new Map<string, string>();
  for (const [groupId, group] of Object.entries(nodeGroups)) {
    for (const nodeId of group.nodeIds) {
      // Don't group map containers or their body nodes
      const node = config.nodes[nodeId];
      if (node && node.type !== "map" && !bodyNodeToMapNode.has(nodeId)) {
        nodeToGroupMap.set(nodeId, groupId);
      }
    }
  }

  // Build group nodes (for non-map nodes only)
  for (const [groupId, group] of Object.entries(nodeGroups)) {
    // Check if this group contains any non-map nodes
    const nonMapNodeIds = group.nodeIds.filter((nodeId) => {
      const node = config.nodes[nodeId];
      return node && node.type !== "map";
    });

    if (nonMapNodeIds.length > 0) {
      mappedNodes.push({
        id: groupId,
        type: "groupNode",
        position: { x: 0, y: 0 },
        width: 220,
        height: 90,
        data: {
          label: group.label,
          description: group.description,
          icon: group.icon,
          color: group.color || "#3b82f6",
          nodeCount: nonMapNodeIds.length,
        } as unknown as Record<string, unknown>,
      });
    }
  }

  // Build ungrouped regular nodes AND all map containers with their body nodes
  const ungroupedNodeIds = Object.keys(config.nodes).filter(
    (nodeId) => !nodeToGroupMap.has(nodeId) && !bodyNodeToMapNode.has(nodeId),
  );

  for (const nodeId of ungroupedNodeIds) {
    const node = config.nodes[nodeId];

    if (node.type === "map") {
      // Render map container with full detail (copied from buildDetailedViewWithMapContainers)
      const mapNode = node as MapNode;
      const bodyNodeIds = mapNodeToBodyNodes.get(node.id) || [];

      // Calculate container size based on layers
      const PADDING = 24;
      const HEADER_HEIGHT = 50;
      const NODE_GAP = 40;
      const TOP_PADDING = 40;
      const BOTTOM_PADDING = 25;

      const layersMap = computeBodyNodeLayers(
        bodyNodeIds,
        config.edges,
        mapNode.bodyEntryNodeId,
      );
      const numLayers = layersMap.size;

      const maxLayerWidth = Math.max(
        ...Array.from(layersMap.values()).map((layerNodes) => {
          const nodesWidth = layerNodes.reduce((sum, nodeId) => {
            return sum + NODE_DIMENSIONS[config.nodes[nodeId].type].width;
          }, 0);
          const gaps = Math.max(0, layerNodes.length - 1) * NODE_GAP;
          return nodesWidth + gaps;
        }),
      );

      const containerWidth = Math.max(250, maxLayerWidth + PADDING * 2);

      const layerHeights = Array.from(layersMap.values()).map(
        (layerNodeIds) => {
          return Math.max(
            ...layerNodeIds.map(
              (nodeId) => NODE_DIMENSIONS[config.nodes[nodeId].type].height,
            ),
          );
        },
      );
      const totalLayersHeight = layerHeights.reduce((sum, h) => sum + h, 0);
      const containerHeight =
        HEADER_HEIGHT +
        TOP_PADDING +
        totalLayersHeight +
        Math.max(0, numLayers - 1) * LAYER_GAP +
        BOTTOM_PADDING;

      // Add map container node
      mappedNodes.push({
        id: node.id,
        type: "mapContainer",
        position: { x: 0, y: 0 },
        width: containerWidth,
        height: containerHeight,
        data: {
          label: node.label,
          type: node.type,
          hasError: errorNodeIds.has(node.id),
        } as unknown as Record<string, unknown>,
      });

      // Add body nodes as children
      for (const bodyNodeId of bodyNodeIds) {
        const bodyNode = config.nodes[bodyNodeId];
        const dimensions = NODE_DIMENSIONS[bodyNode.type];
        const workflowRef =
          bodyNode.type === "childWorkflow"
            ? (bodyNode as ChildWorkflowNode).workflowRef
            : undefined;

        mappedNodes.push({
          id: bodyNode.id,
          type: "graphNode",
          position: { x: 0, y: 0 },
          parentId: node.id,
          width: dimensions.width,
          height: dimensions.height,
          data: {
            label: bodyNode.label,
            type: bodyNode.type,
            hasError: errorNodeIds.has(bodyNode.id),
            workflowRef,
          } as unknown as Record<string, unknown>,
        });
      }
    } else {
      // Regular ungrouped node
      const dimensions = NODE_DIMENSIONS[node.type];
      mappedNodes.push({
        id: node.id,
        type: "graphNode",
        position: { x: 0, y: 0 },
        width: dimensions.width,
        height: dimensions.height,
        data: {
          label: node.label,
          type: node.type,
          hasError: errorNodeIds.has(node.id),
        } as unknown as Record<string, unknown>,
      });
    }
  }

  // Build edges between groups, map containers, and ungrouped nodes
  const edgeSet = new Set<string>();
  for (const edge of config.edges) {
    const sourceMapParent = bodyNodeToMapNode.get(edge.source);
    const targetMapParent = bodyNodeToMapNode.get(edge.target);
    const isInternalEdge =
      sourceMapParent && targetMapParent && sourceMapParent === targetMapParent;

    if (isInternalEdge) {
      // Internal edge within map body - use vertical connections
      const label = buildEdgeLabel(edge, config);
      const isConditional = edge.type === "conditional";
      const isError = edge.type === "error";
      const color = isError ? "#ef4444" : "#4b5563";

      mappedEdges.push({
        id: edge.id,
        source: edge.source,
        sourceHandle: "bottom",
        target: edge.target,
        targetHandle: "top",
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
        animated: false,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isConditional || isError ? "6 4" : "0",
        },
        label,
        labelStyle: {
          fill: color,
          fontSize: 11,
          fontWeight: 500,
        },
      });
    } else {
      // External edge - check for groups
      const sourceGroup = nodeToGroupMap.get(edge.source);
      const targetGroup = nodeToGroupMap.get(edge.target);

      // Skip internal group edges
      if (sourceGroup && targetGroup && sourceGroup === targetGroup) {
        continue;
      }

      const effectiveSource = sourceGroup || edge.source;
      const effectiveTarget = targetGroup || edge.target;
      const edgeKey = `${effectiveSource}->${effectiveTarget}`;

      if (edgeSet.has(edgeKey)) {
        continue;
      }
      edgeSet.add(edgeKey);

      const isConditional = edge.type === "conditional";
      const isError = edge.type === "error";
      const color = isError ? "#ef4444" : "#4b5563";

      mappedEdges.push({
        id: `hybrid-${edge.id}`,
        source: effectiveSource,
        target: effectiveTarget,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
        animated: false,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isConditional || isError ? "6 4" : "0",
        },
      });
    }
  }

  // Use layoutGraphWithMapContainers to position everything including map body nodes
  return layoutGraphWithMapContainers(
    mappedNodes,
    mappedEdges,
    mapNodeToBodyNodes,
    config,
  );
}

function buildSimplifiedView(
  config: GraphWorkflowConfig,
  errorNodeIds: Set<string>,
): { nodes: Node[]; edges: Edge[] } {
  const nodeGroups = config.nodeGroups!;
  const mappedNodes: Node[] = [];
  const mappedEdges: Edge[] = [];

  // Build a map of nodeId -> groupId for fast lookup
  const nodeToGroupMap = new Map<string, string>();
  for (const [groupId, group] of Object.entries(nodeGroups)) {
    for (const nodeId of group.nodeIds) {
      nodeToGroupMap.set(nodeId, groupId);
    }
  }

  // Build group nodes
  for (const [groupId, group] of Object.entries(nodeGroups)) {
    mappedNodes.push({
      id: groupId,
      type: "groupNode",
      position: { x: 0, y: 0 },
      width: 220,
      height: 90,
      data: {
        label: group.label,
        description: group.description,
        icon: group.icon,
        color: group.color || "#3b82f6",
        nodeCount: group.nodeIds.length,
      } as unknown as Record<string, unknown>,
    });
  }

  // Build nodes that are NOT in any group
  const ungroupedNodeIds = Object.keys(config.nodes).filter(
    (nodeId) => !nodeToGroupMap.has(nodeId),
  );
  for (const nodeId of ungroupedNodeIds) {
    const node = config.nodes[nodeId];
    const dimensions = NODE_DIMENSIONS[node.type];
    mappedNodes.push({
      id: node.id,
      type: "graphNode",
      position: { x: 0, y: 0 },
      width: dimensions.width,
      height: dimensions.height,
      data: {
        label: node.label,
        type: node.type,
        hasError: errorNodeIds.has(node.id),
      } as unknown as Record<string, unknown>,
    });
  }

  // Build edges between groups (and ungrouped nodes)
  const edgeSet = new Set<string>();
  for (const edge of config.edges) {
    const sourceGroup = nodeToGroupMap.get(edge.source);
    const targetGroup = nodeToGroupMap.get(edge.target);

    // Skip internal edges (both nodes in same group)
    if (sourceGroup && targetGroup && sourceGroup === targetGroup) {
      continue;
    }

    const effectiveSource = sourceGroup || edge.source;
    const effectiveTarget = targetGroup || edge.target;
    const edgeKey = `${effectiveSource}->${effectiveTarget}`;

    // Deduplicate edges between same groups
    if (edgeSet.has(edgeKey)) {
      continue;
    }
    edgeSet.add(edgeKey);

    const isConditional = edge.type === "conditional";
    const isError = edge.type === "error";
    const color = isError ? "#ef4444" : "#4b5563";

    mappedEdges.push({
      id: `simplified-${edge.id}`,
      source: effectiveSource,
      target: effectiveTarget,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
      },
      animated: false,
      style: {
        stroke: color,
        strokeWidth: 2,
        strokeDasharray: isConditional || isError ? "6 4" : "0",
      },
    });
  }

  return layoutGraph(mappedNodes, mappedEdges);
}

export function GraphVisualization({
  config,
  validationErrors,
  viewMode = "simplified",
}: GraphVisualizationProps) {
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);

  const errorNodeIds = useMemo(
    () => extractNodeIdsWithErrors(validationErrors),
    [validationErrors],
  );

  const { nodes, edges } = useMemo(() => {
    const finalize = (
      result: { nodes: Node[]; edges: Edge[] },
      options?: { staggerLabels?: boolean },
    ) => ({
      nodes: result.nodes,
      edges:
        options?.staggerLabels === true
          ? applyStaggeredLabelDistances(result.edges, result.nodes)
          : result.edges,
    });

    if (!config) {
      return finalize({ nodes: [], edges: [] });
    }

    const hasMapNodes = Object.values(config.nodes).some(
      (node) => node.type === "map",
    );
    const hasNodeGroups =
      config.nodeGroups && Object.keys(config.nodeGroups).length > 0;

    // Priority 1: Hybrid view - simplified groups + detailed map containers
    if (viewMode === "simplified" && hasNodeGroups) {
      if (hasMapNodes) {
        return finalize(buildHybridView(config, errorNodeIds), {
          staggerLabels: true,
        });
      }
      return finalize(buildSimplifiedView(config, errorNodeIds));
    }

    // Priority 2: Detailed view with map containers
    if (hasMapNodes) {
      return finalize(
        buildDetailedViewWithMapContainers(config, errorNodeIds),
        { staggerLabels: true },
      );
    }

    // Fallback: original flat rendering for workflows without map nodes
    const mappedNodes: Node[] = Object.values(config.nodes).map((node) => {
      const dimensions = NODE_DIMENSIONS[node.type];
      const workflowRef =
        node.type === "childWorkflow"
          ? (node as ChildWorkflowNode).workflowRef
          : undefined;
      return {
        id: node.id,
        type: "graphNode",
        position: { x: 0, y: 0 },
        width: dimensions.width,
        height: dimensions.height,
        data: {
          label: node.label,
          type: node.type,
          hasError: errorNodeIds.has(node.id),
          workflowRef,
        } as unknown as Record<string, unknown>,
      };
    });

    const mappedEdges: Edge[] = config.edges.map((edge) => {
      const label = buildEdgeLabel(edge, config);
      const isConditional = edge.type === "conditional";
      const isError = edge.type === "error";
      const color = isError ? "#ef4444" : "#4b5563";
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
        animated: false,
        style: {
          stroke: color,
          strokeWidth: 2,
          strokeDasharray: isConditional || isError ? "6 4" : "0",
        },
        label,
        labelStyle: {
          fill: color,
          fontSize: 11,
          fontWeight: 500,
        },
      };
    });

    return finalize(layoutGraph(mappedNodes, mappedEdges)); // no staggerLabels: flat view
  }, [config, errorNodeIds, viewMode]);

  // Fit view whenever nodes change
  useEffect(() => {
    if (reactFlowInstance.current && nodes.length > 0) {
      // Use setTimeout to ensure nodes are fully rendered before fitting
      setTimeout(() => {
        reactFlowInstance.current?.fitView({
          padding: 0.2,
          duration: 200,
        });
      }, 0);
    }
  }, [nodes, edges]);

  if (!config) {
    return (
      <div
        style={{
          height: 620,
          border: "1px dashed #d1d5db",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6b7280",
          fontSize: 14,
        }}
      >
        Fix JSON errors to see visualization.
      </div>
    );
  }

  return (
    <div style={{ height: 620 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{
          graphNode: GraphNodeRenderer,
          groupNode: GroupNodeRenderer,
          mapContainer: MapContainerRenderer,
        }}
        edgeTypes={{
          staggerLabel: StaggerLabelEdge,
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        fitView
        onInit={(instance) => {
          reactFlowInstance.current = instance;
        }}
      >
        <Background gap={18} size={1} />
      </ReactFlow>
    </div>
  );
}
