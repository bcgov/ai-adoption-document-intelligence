import "@xyflow/react/dist/style.css";

import {
  Background,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import dagre from "dagre-esm";
import {
  IconBolt,
  IconFolder,
  IconGitMerge,
  IconRepeat,
  IconRefresh,
  IconSwitch3,
  IconUserCheck,
  IconScan,
  IconSparkles,
  IconShieldCheck,
  IconUser,
  IconDeviceFloppy,
  IconSettings,
  IconCornerDownRight,
} from "@tabler/icons-react";
import { Badge } from "@mantine/core";
import { memo, useMemo } from "react";
import type { GraphNode, GraphWorkflowConfig, GraphEdge, MapNode, ChildWorkflowNode } from "../../types/workflow";

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

const NODE_DIMENSIONS: Record<GraphNode["type"], { width: number; height: number }> =
  {
    activity: { width: 180, height: 72 },
    switch: { width: 140, height: 140 },
    map: { width: 190, height: 80 },
    join: { width: 190, height: 80 },
    childWorkflow: { width: 200, height: 80 },
    pollUntil: { width: 190, height: 80 },
    humanGate: { width: 190, height: 80 },
  };

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
  const workflowId = isChildWorkflow && data.workflowRef?.type === "library"
    ? data.workflowRef.workflowId
    : undefined;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: isDiamond ? 0 : 12,
        border: data.hasError ? "2px solid #ef4444" : `2px solid ${color}`,
        background: "#ffffff",
        boxShadow: "0 6px 12px rgba(0,0,0,0.08)",
        transform: isDiamond ? "rotate(45deg)" : "none",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <div
        style={{
          transform: isDiamond ? "rotate(-45deg)" : "none",
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
          <div style={{
            fontSize: 10,
            color: "#6b7280",
            display: "flex",
            alignItems: "center",
            gap: 4,
            justifyContent: "center"
          }}>
            <IconCornerDownRight size={12} />
            <span>{workflowId}</span>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#6b7280" }}>{data.type}</div>
        )}
      </div>

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
        padding: "12px 12px 40px 12px",
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

function buildEdgeLabel(edge: GraphEdge): string | undefined {
  const labelParts: string[] = [];
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

function identifyMapBodyNodes(config: GraphWorkflowConfig): Map<string, string> {
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

function layoutGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
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

      // Calculate container size based on body nodes
      const PADDING = 24;
      const HEADER_HEIGHT = 50;
      const NODE_GAP = 40;
      const bodyWidth = bodyNodeIds.reduce((sum, bodyId) => {
        const bodyNode = config.nodes[bodyId];
        const dim = NODE_DIMENSIONS[bodyNode.type];
        return sum + dim.width;
      }, 0) + (Math.max(0, bodyNodeCount - 1) * NODE_GAP);
      const bodyHeight = Math.max(...bodyNodeIds.map(bodyId => {
        const bodyNode = config.nodes[bodyId];
        return NODE_DIMENSIONS[bodyNode.type].height;
      }));

      const containerWidth = Math.max(250, bodyWidth + PADDING * 2);
      const containerHeight = HEADER_HEIGHT + bodyHeight + PADDING * 2;

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
      const workflowRef = node.type === "childWorkflow"
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
      const workflowRef = node.type === "childWorkflow"
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
    const isInternalEdge = sourceMapParent && targetMapParent && sourceMapParent === targetMapParent;

    if (isInternalEdge) {
      // Internal edge within map body - use horizontal connections (right → left)
      const label = buildEdgeLabel(edge);
      const isConditional = edge.type === "conditional";
      const isError = edge.type === "error";
      const color = isError ? "#ef4444" : "#4b5563";

      mappedEdges.push({
        id: edge.id,
        source: edge.source,
        sourceHandle: "right",
        target: edge.target,
        targetHandle: "left",
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

      const label = buildEdgeLabel(edge);
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
  return layoutGraphWithMapContainers(mappedNodes, mappedEdges, mapNodeToBodyNodes);
}

function layoutGraphWithMapContainers(
  nodes: Node[],
  edges: Edge[],
  mapNodeToBodyNodes: Map<string, string[]>,
): { nodes: Node[]; edges: Edge[] } {
  // Pass 1: Layout top-level nodes only (exclude body nodes)
  const topLevelNodes = nodes.filter(node => !node.parentId);
  const topLevelEdges = edges.filter(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    const targetNode = nodes.find(n => n.id === edge.target);
    return !sourceNode?.parentId && !targetNode?.parentId;
  });

  const { nodes: layoutedTopLevel } = layoutGraph(topLevelNodes, topLevelEdges);

  // Pass 2: Position body nodes inside their parent containers
  const finalNodes = layoutedTopLevel.map(node => {
    if (node.type === "mapContainer") {
      // Position body nodes inside this container
      const bodyNodeIds = mapNodeToBodyNodes.get(node.id) || [];
      const PADDING = 24;
      const HEADER_HEIGHT = 50;
      const NODE_GAP = 40;

      let currentX = PADDING;

      const positionedBodyNodes = bodyNodeIds.map(bodyNodeId => {
        const bodyNode = nodes.find(n => n.id === bodyNodeId)!;
        const positionedBody = {
          ...bodyNode,
          position: {
            x: currentX,
            y: HEADER_HEIGHT + PADDING,
          },
        };
        currentX += (bodyNode.width ?? 0) + NODE_GAP;
        return positionedBody;
      });

      return [node, ...positionedBodyNodes];
    }
    return [node];
  }).flat();

  return { nodes: finalNodes, edges };
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
  viewMode = "detailed",
}: GraphVisualizationProps) {
  const errorNodeIds = useMemo(
    () => extractNodeIdsWithErrors(validationErrors),
    [validationErrors],
  );

  const { nodes, edges } = useMemo(() => {
    if (!config) {
      return { nodes: [], edges: [] };
    }

    // Simplified view: build group nodes
    if (viewMode === "simplified" && config.nodeGroups && Object.keys(config.nodeGroups).length > 0) {
      return buildSimplifiedView(config, errorNodeIds);
    }

    // Detailed view: check if there are map nodes
    const hasMapNodes = Object.values(config.nodes).some(node => node.type === "map");

    if (hasMapNodes) {
      // Use new map container rendering
      return buildDetailedViewWithMapContainers(config, errorNodeIds);
    }

    // Fallback: original flat rendering for workflows without map nodes
    const mappedNodes: Node[] = Object.values(config.nodes).map(
      (node) => {
        const dimensions = NODE_DIMENSIONS[node.type];
        const workflowRef = node.type === "childWorkflow"
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
      },
    );

    const mappedEdges: Edge[] = config.edges.map((edge) => {
      const label = buildEdgeLabel(edge);
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

    return layoutGraph(mappedNodes, mappedEdges);
  }, [config, errorNodeIds, viewMode]);

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
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        fitView
      >
        <Background gap={18} size={1} />
      </ReactFlow>
    </div>
  );
}
