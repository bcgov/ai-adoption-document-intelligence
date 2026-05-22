/**
 * Interactive canvas for the visual workflow editor.
 *
 * Renders activity nodes from a GraphWorkflowConfig using xyflow with
 * selection + drag + connect enabled. Positions are persisted in the
 * node's `metadata.position` so the layout round-trips through save/load.
 *
 * Kept intentionally narrow — the existing GraphVisualization.tsx remains
 * the canonical *read-only* renderer with simplified-view support for
 * groups + map containers. This editor canvas focuses on the
 * Milestone-2 happy path: place activities, draw edges, select.
 */

import "@xyflow/react/dist/style.css";

import {
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeChange,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import { useCallback, useMemo } from "react";
import type {
  ActivityNode,
  GraphEdge,
  GraphWorkflowConfig,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";

interface WorkflowEditorCanvasProps {
  config: GraphWorkflowConfig;
  selectedNodeId: string | null;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onSelectNode: (nodeId: string | null) => void;
}

interface ActivityNodeData extends Record<string, unknown> {
  label: string;
  activityType: string;
  selected: boolean;
  isEntry: boolean;
}

const DEFAULT_POSITION = { x: 80, y: 80 };
const STAGGER_X = 220;

function readPosition(
  node: ActivityNode,
  fallbackIndex: number,
): { x: number; y: number } {
  const fromMeta = (node.metadata as { position?: { x: number; y: number } })
    ?.position;
  if (
    fromMeta &&
    typeof fromMeta.x === "number" &&
    typeof fromMeta.y === "number"
  ) {
    return fromMeta;
  }
  return {
    x: DEFAULT_POSITION.x + fallbackIndex * STAGGER_X,
    y: DEFAULT_POSITION.y,
  };
}

function ActivityNodeRenderer({ data }: NodeProps) {
  const d = data as ActivityNodeData;
  const hints = getActivityVisualHints(d.activityType);
  const accent = hints.color;
  return (
    <div
      style={{
        background: "var(--mantine-color-body, #fff)",
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderBottomWidth: 2,
        borderLeftWidth: 6,
        borderStyle: "solid",
        borderTopColor: d.selected ? accent : "transparent",
        borderRightColor: d.selected ? accent : "transparent",
        borderBottomColor: d.selected ? accent : "transparent",
        borderLeftColor: accent,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 200,
        boxShadow: d.selected
          ? `0 0 0 2px ${accent}33, 0 6px 18px rgba(0,0,0,0.22)`
          : "0 2px 8px rgba(0,0,0,0.18)",
        color: "var(--mantine-color-text, #f3f4f6)",
        fontSize: 13,
        lineHeight: 1.2,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "var(--mantine-color-dimmed, #9ca3af)",
          marginBottom: 4,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>{hints.icon}</span>
        <span style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
          {hints.displayName}
        </span>
        {d.isEntry && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              background: accent,
              color: "#fff",
              fontWeight: 600,
            }}
          >
            ENTRY
          </span>
        )}
      </div>
      <div style={{ fontWeight: 600 }}>{d.label}</div>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: accent }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: accent }}
      />
    </div>
  );
}

const NODE_TYPES = {
  activity: ActivityNodeRenderer,
};

export function WorkflowEditorCanvas({
  config,
  selectedNodeId,
  onConfigChange,
  onSelectNode,
}: WorkflowEditorCanvasProps) {
  const flowNodes = useMemo<Node<ActivityNodeData>[]>(() => {
    const activityNodes = Object.values(config.nodes).filter(
      (n): n is ActivityNode => n.type === "activity",
    );
    return activityNodes.map((node, idx) => {
      const pos = readPosition(node, idx);
      return {
        id: node.id,
        type: "activity",
        position: pos,
        data: {
          label: node.label,
          activityType: node.activityType,
          selected: node.id === selectedNodeId,
          isEntry: node.id === config.entryNodeId,
        },
        selected: node.id === selectedNodeId,
      };
    });
  }, [config, selectedNodeId]);

  const flowEdges = useMemo<Edge[]>(
    () =>
      config.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "default",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#9ca3af" },
        style: { stroke: "#9ca3af", strokeWidth: 2 },
      })),
    [config.edges],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updatedNodes = applyNodeChanges(changes, flowNodes);
      // Persist position changes back to GraphWorkflowConfig
      let mutated = false;
      const nextNodes = { ...config.nodes };
      for (const updated of updatedNodes) {
        const existing = nextNodes[updated.id];
        if (existing?.type !== "activity") continue;
        const existingMeta = existing.metadata as
          | { position?: { x: number; y: number } }
          | undefined;
        const newX = updated.position.x;
        const newY = updated.position.y;
        if (
          existingMeta?.position?.x !== newX ||
          existingMeta?.position?.y !== newY
        ) {
          nextNodes[updated.id] = {
            ...existing,
            metadata: {
              ...existing.metadata,
              position: { x: newX, y: newY },
            },
          };
          mutated = true;
        }
      }
      if (mutated) {
        onConfigChange({ ...config, nodes: nextNodes });
      }

      // Handle selection. xyflow emits a deselect-old then select-new pair
      // when the user clicks from one node to another; we want the
      // newly-selected one to win.
      const selectChanges = changes.filter(
        (c): c is Extract<NodeChange, { type: "select" }> =>
          c.type === "select",
      );
      if (selectChanges.length > 0) {
        const selectionChange = selectChanges.find((c) => c.selected);
        onSelectNode(selectionChange ? selectionChange.id : null);
      }

      // Handle removal
      const removeChanges = changes.filter(
        (c): c is Extract<NodeChange, { type: "remove" }> =>
          c.type === "remove",
      );
      if (removeChanges.length > 0) {
        const removedIds = new Set(removeChanges.map((c) => c.id));
        const nodesCopy = { ...config.nodes };
        for (const id of removedIds) delete nodesCopy[id];
        const filteredEdges = config.edges.filter(
          (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
        );
        let nextEntryNodeId = config.entryNodeId;
        if (removedIds.has(config.entryNodeId)) {
          nextEntryNodeId = Object.keys(nodesCopy)[0] ?? "";
        }
        onConfigChange({
          ...config,
          nodes: nodesCopy,
          edges: filteredEdges,
          entryNodeId: nextEntryNodeId,
        });
        if (selectedNodeId && removedIds.has(selectedNodeId)) {
          onSelectNode(null);
        }
      }
    },
    [config, flowNodes, onConfigChange, onSelectNode, selectedNodeId],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed = changes.filter(
        (c): c is Extract<EdgeChange, { type: "remove" }> =>
          c.type === "remove",
      );
      if (removed.length === 0) return;
      const removedIds = new Set(removed.map((c) => c.id));
      onConfigChange({
        ...config,
        edges: config.edges.filter((e) => !removedIds.has(e.id)),
      });
    },
    [config, onConfigChange],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      // Avoid duplicate edges between the same pair
      const duplicate = config.edges.some(
        (e) => e.source === connection.source && e.target === connection.target,
      );
      if (duplicate) return;
      const id = `edge-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const newEdge: GraphEdge = {
        id,
        source: connection.source,
        target: connection.target,
        type: "normal",
      };
      onConfigChange({ ...config, edges: [...config.edges, newEdge] });
    },
    [config, onConfigChange],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onPaneClick={handlePaneClick}
        nodesDraggable
        nodesConnectable
        elementsSelectable
        fitView
        fitViewOptions={{ padding: 0.25 }}
        deleteKeyCode={["Delete", "Backspace"]}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}
