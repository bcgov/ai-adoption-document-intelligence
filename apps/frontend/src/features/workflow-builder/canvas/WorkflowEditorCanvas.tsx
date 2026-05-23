/**
 * Interactive canvas for the visual workflow editor.
 *
 * Renders activity nodes from a GraphWorkflowConfig using xyflow with
 * selection + drag + connect enabled. Positions are persisted in the
 * node's `metadata.position` so the layout round-trips through save/load.
 *
 * Performance note: internal node state (positions, selection) is managed
 * by xyflow's `useNodesState` hook so dragging is smooth — outer
 * `GraphWorkflowConfig` is only updated on drag-stop / selection-change /
 * delete, not on every mouse-move during a drag.
 *
 * Kept intentionally narrow — the existing GraphVisualization.tsx remains
 * the canonical *read-only* renderer with simplified-view support for
 * groups + map containers. This editor canvas focuses on the
 * Milestone-2 happy path: place activities, draw edges, select.
 */

import "@xyflow/react/dist/style.css";

import {
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
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
  isEntry: boolean;
}

type FlowNode = Node<ActivityNodeData, "activity">;

const DEFAULT_POSITION = { x: 80, y: 80 };
const STAGGER_X = 220;
const EDGE_STYLE = { stroke: "#9ca3af", strokeWidth: 2 };
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: "#9ca3af" } as const;

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

/**
 * Renderer for activity nodes. Memoised so React Flow can skip rerenders
 * when only positions change during a drag — without this, dragging a
 * single node thrashes every node's renderer.
 */
const ActivityNodeRenderer = memo(({ data, selected }: NodeProps<FlowNode>) => {
  const hints = getActivityVisualHints(data.activityType);
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
        borderTopColor: selected ? accent : "transparent",
        borderRightColor: selected ? accent : "transparent",
        borderBottomColor: selected ? accent : "transparent",
        borderLeftColor: accent,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 200,
        boxShadow: selected
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
        {data.isEntry && (
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
      <div style={{ fontWeight: 600 }}>{data.label}</div>
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
});
ActivityNodeRenderer.displayName = "ActivityNodeRenderer";

const NODE_TYPES = { activity: ActivityNodeRenderer };

/**
 * Project a GraphWorkflowConfig into the React Flow node list. Only
 * `data` and `position` come from the outer config; `selected` is set by
 * React Flow itself during interaction.
 */
function projectFlowNodes(
  config: GraphWorkflowConfig,
  selectedNodeId: string | null,
): FlowNode[] {
  const activityNodes = Object.values(config.nodes).filter(
    (n): n is ActivityNode => n.type === "activity",
  );
  return activityNodes.map((node, idx) => ({
    id: node.id,
    type: "activity" as const,
    position: readPosition(node, idx),
    selected: node.id === selectedNodeId,
    data: {
      label: node.label,
      activityType: node.activityType,
      isEntry: node.id === config.entryNodeId,
    },
  }));
}

function projectFlowEdges(config: GraphWorkflowConfig): Edge[] {
  return config.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: "default",
    markerEnd: EDGE_MARKER,
    style: EDGE_STYLE,
  }));
}

export function WorkflowEditorCanvas({
  config,
  selectedNodeId,
  onConfigChange,
  onSelectNode,
}: WorkflowEditorCanvasProps) {
  // Internal node state managed by xyflow — keeps dragging smooth. The
  // outer GraphWorkflowConfig is updated only on drag-stop / select /
  // delete, never per-mousemove.
  const [internalNodes, setInternalNodes, onInternalNodesChange] =
    useNodesState<FlowNode>([]);
  const [internalEdges, setInternalEdges, onInternalEdgesChange] =
    useEdgesState<Edge>([]);

  // Track the node set + the data-relevant fields so we only resync the
  // internal nodes when something actually changed in the outer config —
  // not when, e.g., the user moves a node and onNodeDragStop triggers a
  // round-trip config update that, on its own, would otherwise overwrite
  // the in-flight drag.
  const dataFingerprint = useMemo(
    () =>
      JSON.stringify({
        ids: Object.keys(config.nodes).sort(),
        entryNodeId: config.entryNodeId,
        labelsAndTypes: Object.fromEntries(
          Object.entries(config.nodes).map(([id, n]) => [
            id,
            n.type === "activity" ? `${n.label}::${n.activityType}` : n.type,
          ]),
        ),
      }),
    [config.nodes, config.entryNodeId],
  );

  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFingerprintRef.current === dataFingerprint) return;
    lastFingerprintRef.current = dataFingerprint;
    setInternalNodes(projectFlowNodes(config, selectedNodeId));
    // Note: `selectedNodeId` participates in the projection on
    // structural changes (e.g., when a freshly added node should start
    // selected). After mount, xyflow owns the `selected` flag on each
    // node via its onSelectionChange handler — we don't sync external
    // selection updates back into internal nodes, which avoids a
    // setState loop with xyflow's StoreUpdater.
  }, [dataFingerprint, config, selectedNodeId, setInternalNodes]);

  const edgesFingerprint = useMemo(
    () =>
      JSON.stringify(
        config.edges.map((e) => `${e.id}|${e.source}|${e.target}|${e.type}`),
      ),
    [config.edges],
  );
  const lastEdgesFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastEdgesFingerprintRef.current === edgesFingerprint) return;
    lastEdgesFingerprintRef.current = edgesFingerprint;
    setInternalEdges(projectFlowEdges(config));
  }, [edgesFingerprint, config, setInternalEdges]);

  // Persist final positions to the outer config once the drag finishes.
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const existing = config.nodes[node.id];
      if (existing?.type !== "activity") return;
      const prevPos = (
        existing.metadata as { position?: { x: number; y: number } }
      )?.position;
      if (prevPos?.x === node.position.x && prevPos?.y === node.position.y) {
        return;
      }
      const updated: ActivityNode = {
        ...existing,
        metadata: {
          ...existing.metadata,
          position: { x: node.position.x, y: node.position.y },
        },
      };
      // Bump the fingerprint ref forward by hand so the structural sync
      // useEffect doesn't immediately re-project the nodes and stamp
      // over the local drag commit.
      const nextNodes = { ...config.nodes, [node.id]: updated };
      const nextFingerprint = JSON.stringify({
        ids: Object.keys(nextNodes).sort(),
        entryNodeId: config.entryNodeId,
        labelsAndTypes: Object.fromEntries(
          Object.entries(nextNodes).map(([id, n]) => [
            id,
            n.type === "activity" ? `${n.label}::${n.activityType}` : n.type,
          ]),
        ),
      });
      lastFingerprintRef.current = nextFingerprint;
      onConfigChange({ ...config, nodes: nextNodes });
    },
    [config, onConfigChange],
  );

  const handleSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      const next = nodes[0]?.id ?? null;
      if (next === selectedNodeId) return;
      onSelectNode(next);
    },
    [onSelectNode, selectedNodeId],
  );

  const handleNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (deleted.length === 0) return;
      const removedIds = new Set(deleted.map((n) => n.id));
      const nodesCopy = { ...config.nodes };
      for (const id of removedIds) delete nodesCopy[id];
      const filteredEdges = config.edges.filter(
        (e) => !removedIds.has(e.source) && !removedIds.has(e.target),
      );
      const nextEntryNodeId = removedIds.has(config.entryNodeId)
        ? (Object.keys(nodesCopy)[0] ?? "")
        : config.entryNodeId;
      onConfigChange({
        ...config,
        nodes: nodesCopy,
        edges: filteredEdges,
        entryNodeId: nextEntryNodeId,
      });
      if (selectedNodeId && removedIds.has(selectedNodeId)) {
        onSelectNode(null);
      }
    },
    [config, onConfigChange, onSelectNode, selectedNodeId],
  );

  const handleEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (deleted.length === 0) return;
      const removedIds = new Set(deleted.map((e) => e.id));
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

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <ReactFlow
        nodes={internalNodes}
        edges={internalEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onInternalNodesChange}
        onEdgesChange={onInternalEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        onNodesDelete={handleNodesDelete}
        onEdgesDelete={handleEdgesDelete}
        onConnect={handleConnect}
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
