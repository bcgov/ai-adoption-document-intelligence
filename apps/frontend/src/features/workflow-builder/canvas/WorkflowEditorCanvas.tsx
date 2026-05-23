/**
 * Interactive canvas for the visual workflow editor.
 *
 * Renders activity + control-flow nodes from a GraphWorkflowConfig using
 * xyflow with selection + drag + connect enabled. Positions are persisted
 * in the node's `metadata.position` so the layout round-trips through
 * save/load.
 *
 * Performance note: internal node state (positions, selection) is managed
 * by xyflow's `useNodesState` hook so dragging is smooth — outer
 * `GraphWorkflowConfig` is only updated on drag-stop / selection-change /
 * delete, not on every mouse-move during a drag.
 *
 * Per-type rendering (US-012):
 *   - activity → rectangle (existing renderer, unchanged shape).
 *   - switch   → diamond (geometry ported from `GraphVisualization.tsx`).
 *   - map / join → rectangle with a fan-out / fan-in corner overlay.
 *   - pollUntil / humanGate / childWorkflow → rectangle with the type's
 *     Tabler icon in the header.
 *   - All control-flow renderers share the same Handles (target on left,
 *     source on right) the activity node uses, and surface the same red
 *     / amber validation corner badge the activity node renders.
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
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ActivityNode,
  ErrorPolicy,
  GraphEdge,
  GraphNode,
  GraphValidationError,
  GraphWorkflowConfig,
  SwitchNode,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";
import {
  type ControlFlowVisualHints,
  getControlFlowVisualHints,
} from "../control-flow-visual-hints";
import type { ControlFlowNodeType } from "../palette/control-flow-skeletons";
import { WorkflowEdge, type WorkflowEdgeData } from "./WorkflowEdge";

interface WorkflowEditorCanvasProps {
  config: GraphWorkflowConfig;
  selectedNodeId: string | null;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onSelectNode: (nodeId: string | null) => void;
  /** Validation issues grouped by node id (errors + warnings). */
  errorsByNode?: Map<string, GraphValidationError[]>;
  /**
   * Called when the user clicks a node's validation badge. The host
   * opens the validation drawer scrolled to the matching entry.
   */
  onNodeBadgeClick?: (nodeId: string) => void;
}

interface CommonNodeData extends Record<string, unknown> {
  label: string;
  isEntry: boolean;
  errorCount: number;
  warningCount: number;
  onBadgeClick?: (nodeId: string) => void;
}

interface ActivityNodeData extends CommonNodeData {
  activityType: string;
  /**
   * Populated from `node.errorPolicy` so the renderer can mount a
   * second `error` source handle when `onError === "fallback"`
   * without re-looking-up the source node by id (US-024).
   */
  errorPolicy?: ErrorPolicy;
}

interface ControlFlowNodeData extends CommonNodeData {
  controlFlowType: ControlFlowNodeType;
  /** Same as ActivityNodeData.errorPolicy — see US-024. */
  errorPolicy?: ErrorPolicy;
}

type ActivityFlowNode = Node<ActivityNodeData, "activity">;
type ControlFlowFlowNode = Node<ControlFlowNodeData, ControlFlowNodeType>;
type FlowNode = ActivityFlowNode | ControlFlowFlowNode;

const DEFAULT_POSITION = { x: 80, y: 80 };
const STAGGER_X = 220;

// Stroke colours match `WorkflowEdge`'s palette so the arrowhead marker
// colours line up with the rendered stroke (US-023 follow-up — flagged in
// US-025).
const NORMAL_STROKE_COLOR = "#9ca3af";
const ERROR_STROKE_COLOR = "var(--mantine-color-red-6, #e03131)";
const CONDITIONAL_STROKE_COLOR = getControlFlowVisualHints("switch").color;

function getEdgeStrokeColor(edgeType: GraphEdge["type"]): string {
  switch (edgeType) {
    case "normal":
      return NORMAL_STROKE_COLOR;
    case "conditional":
      return CONDITIONAL_STROKE_COLOR;
    case "error":
      return ERROR_STROKE_COLOR;
  }
}

const EDGE_TYPES = {
  "workflow-edge": WorkflowEdge,
};

const CONTROL_FLOW_TYPES: readonly ControlFlowNodeType[] = [
  "switch",
  "map",
  "join",
  "childWorkflow",
  "pollUntil",
  "humanGate",
];

function readPosition(
  node: GraphNode,
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

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

interface ValidationBadgeProps {
  nodeId: string;
  errorCount: number;
  warningCount: number;
  onBadgeClick?: (nodeId: string) => void;
}

/**
 * Red / amber corner badge surfacing validation issues on a node.
 * Shared by all node renderers so activity and control-flow nodes look
 * the same. When `onBadgeClick` is provided, the badge becomes clickable
 * and the host opens the validation drawer scrolled to the relevant
 * entry.
 */
const ValidationBadge = memo(function ValidationBadge({
  nodeId,
  errorCount,
  warningCount,
  onBadgeClick,
}: ValidationBadgeProps) {
  if (errorCount === 0 && warningCount === 0) return null;
  const title =
    errorCount > 0
      ? `${errorCount} error${errorCount === 1 ? "" : "s"}${warningCount > 0 ? `, ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}`
      : `${warningCount} warning${warningCount === 1 ? "" : "s"}`;
  const background = errorCount > 0 ? "#e03131" : "#f59f00";
  const ariaLabel = `${title} — click to open validation drawer`;
  const commonStyle: React.CSSProperties = {
    position: "absolute",
    top: -7,
    right: -7,
    background,
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 5px",
    boxShadow: "0 0 0 2px var(--mantine-color-body, #1a1b1e)",
    zIndex: 2,
  };
  const content = errorCount > 0 ? errorCount : warningCount;
  if (!onBadgeClick) {
    return (
      <div
        title={title}
        style={commonStyle}
        data-testid={`node-badge-${nodeId}`}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      data-testid={`node-badge-${nodeId}`}
      onClick={(e) => {
        e.stopPropagation();
        onBadgeClick(nodeId);
      }}
      // Stop xyflow from initiating a drag when the user mouses down on
      // the badge.
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...commonStyle,
        border: "none",
        cursor: "pointer",
      }}
    >
      {content}
    </button>
  );
});

interface NodeHandlesProps {
  accent: string;
  /**
   * When supplied with `onError === "fallback"`, the renderer mounts a
   * second source handle (`id="error"`) on the bottom of the node so
   * the user can draw an error edge from it (US-024). Switch renderers
   * intentionally do not pass this prop — switch nodes route via
   * cases + defaultEdge, not via an error handle.
   */
  errorPolicy?: ErrorPolicy;
}

const ERROR_HANDLE_BACKGROUND = "#e03131";

const NodeHandles = memo(function NodeHandles({
  accent,
  errorPolicy,
}: NodeHandlesProps) {
  const showErrorHandle = errorPolicy?.onError === "fallback";
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: accent }}
      />
      <Handle
        id="out"
        type="source"
        position={Position.Right}
        style={{ background: accent }}
      />
      {showErrorHandle && (
        <Handle
          id="error"
          type="source"
          position={Position.Bottom}
          style={{ background: ERROR_HANDLE_BACKGROUND }}
        />
      )}
    </>
  );
});

// ---------------------------------------------------------------------------
// Activity renderer
// ---------------------------------------------------------------------------

const ActivityNodeRenderer = memo(
  ({ id, data, selected }: NodeProps<ActivityFlowNode>) => {
    const hints = getActivityVisualHints(data.activityType);
    const accent = hints.color;
    const errorCount = data.errorCount ?? 0;
    const warningCount = data.warningCount ?? 0;
    return (
      <div
        data-testid={`canvas-node-${id}`}
        data-shape="rectangle"
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
          position: "relative",
        }}
      >
        <ValidationBadge
          nodeId={id}
          errorCount={errorCount}
          warningCount={warningCount}
          onBadgeClick={data.onBadgeClick}
        />
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
        <NodeHandles accent={accent} errorPolicy={data.errorPolicy} />
      </div>
    );
  },
);
ActivityNodeRenderer.displayName = "ActivityNodeRenderer";

// ---------------------------------------------------------------------------
// Control-flow renderers
// ---------------------------------------------------------------------------

interface ControlFlowRenderContext {
  id: string;
  data: ControlFlowNodeData;
  selected: boolean;
  hints: ControlFlowVisualHints;
}

function renderControlFlowHeader(ctx: ControlFlowRenderContext) {
  const { hints, data } = ctx;
  const Icon = hints.Icon;
  return (
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
      <Icon size={14} />
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
            background: hints.color,
            color: "#fff",
            fontWeight: 600,
          }}
        >
          ENTRY
        </span>
      )}
    </div>
  );
}

function renderFanIndicator(hints: ControlFlowVisualHints) {
  const FanIcon = hints.fanIndicator;
  if (!FanIcon) return null;
  return (
    <div
      title={hints.fanIndicatorLabel}
      data-testid={`fan-indicator-${hints.type}`}
      style={{
        position: "absolute",
        top: -7,
        left: -7,
        background: hints.color,
        color: "#fff",
        borderRadius: 9,
        width: 22,
        height: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 0 0 2px var(--mantine-color-body, #1a1b1e)",
        zIndex: 2,
      }}
    >
      <FanIcon size={12} />
    </div>
  );
}

/**
 * Rectangle renderer used for map / join / childWorkflow / pollUntil /
 * humanGate. Matches the activity rectangle's selection + handle
 * styling for consistency.
 */
const ControlFlowRectangleRenderer = memo(
  ({ id, data, selected, type }: NodeProps<ControlFlowFlowNode>) => {
    const hints = getControlFlowVisualHints(data.controlFlowType);
    const accent = hints.color;
    return (
      <div
        data-testid={`canvas-node-${id}`}
        data-shape="rectangle"
        data-node-type={type}
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
          position: "relative",
        }}
      >
        {renderFanIndicator(hints)}
        <ValidationBadge
          nodeId={id}
          errorCount={data.errorCount ?? 0}
          warningCount={data.warningCount ?? 0}
          onBadgeClick={data.onBadgeClick}
        />
        {renderControlFlowHeader({ id, data, selected, hints })}
        <div style={{ fontWeight: 600 }}>{data.label}</div>
        <NodeHandles accent={accent} errorPolicy={data.errorPolicy} />
      </div>
    );
  },
);
ControlFlowRectangleRenderer.displayName = "ControlFlowRectangleRenderer";

/**
 * Diamond renderer for `switch` nodes. Visual layer is a rotated square
 * (matching `GraphVisualization.tsx`); content + handles stay upright.
 * Handles are pinned to the unrotated wrapper so they sit at the
 * diamond's left/right vertices.
 */
const SwitchNodeRenderer = memo(
  ({ id, data, selected }: NodeProps<ControlFlowFlowNode>) => {
    const hints = getControlFlowVisualHints("switch");
    const accent = hints.color;
    const Icon = hints.Icon;
    const errorCount = data.errorCount ?? 0;
    const warningCount = data.warningCount ?? 0;
    return (
      <div
        data-testid={`canvas-node-${id}`}
        data-shape="diamond"
        data-node-type="switch"
        style={{
          width: 140,
          height: 140,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
        }}
      >
        {/* Visual layer only — rotated 45deg to form the diamond. */}
        <div
          data-testid={`switch-diamond-visual-${id}`}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 0,
            border: selected ? `3px solid ${accent}` : `2px solid ${accent}`,
            background: "var(--mantine-color-body, #fff)",
            boxShadow: selected
              ? `0 0 0 2px ${accent}33, 0 6px 18px rgba(0,0,0,0.22)`
              : "0 6px 12px rgba(0,0,0,0.18)",
            transform: "rotate(45deg) scale(0.7071)",
            transformOrigin: "50% 50%",
          }}
        />
        {/* Content layer (upright). */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            textAlign: "center",
            fontSize: 12,
            color: "var(--mantine-color-text, #f3f4f6)",
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
            <span style={{ color: accent, display: "inline-flex" }}>
              <Icon size={16} />
            </span>
            <span>{data.label}</span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--mantine-color-dimmed, #9ca3af)",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {hints.displayName}
            {data.isEntry ? " · entry" : ""}
          </div>
        </div>
        <ValidationBadge
          nodeId={id}
          errorCount={errorCount}
          warningCount={warningCount}
          onBadgeClick={data.onBadgeClick}
        />
        <NodeHandles accent={accent} />
      </div>
    );
  },
);
SwitchNodeRenderer.displayName = "SwitchNodeRenderer";

const NODE_TYPES = {
  activity: ActivityNodeRenderer,
  switch: SwitchNodeRenderer,
  map: ControlFlowRectangleRenderer,
  join: ControlFlowRectangleRenderer,
  childWorkflow: ControlFlowRectangleRenderer,
  pollUntil: ControlFlowRectangleRenderer,
  humanGate: ControlFlowRectangleRenderer,
};

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

function isControlFlowType(t: GraphNode["type"]): t is ControlFlowNodeType {
  return (CONTROL_FLOW_TYPES as readonly string[]).includes(t);
}

function projectFlowNodes(
  config: GraphWorkflowConfig,
  selectedNodeId: string | null,
  onBadgeClick: ((nodeId: string) => void) | undefined,
): FlowNode[] {
  const all = Object.values(config.nodes);
  return all.map((node, idx) => {
    const position = readPosition(node, idx);
    const isEntry = node.id === config.entryNodeId;
    if (node.type === "activity") {
      const flowNode: ActivityFlowNode = {
        id: node.id,
        type: "activity",
        position,
        selected: node.id === selectedNodeId,
        data: {
          label: node.label,
          activityType: node.activityType,
          isEntry,
          errorCount: 0,
          warningCount: 0,
          onBadgeClick,
          errorPolicy: node.errorPolicy,
        },
      };
      return flowNode;
    }
    if (isControlFlowType(node.type)) {
      const flowNode: ControlFlowFlowNode = {
        id: node.id,
        type: node.type,
        position,
        selected: node.id === selectedNodeId,
        data: {
          label: node.label,
          controlFlowType: node.type,
          isEntry,
          errorCount: 0,
          warningCount: 0,
          onBadgeClick,
          errorPolicy: node.errorPolicy,
        },
      };
      return flowNode;
    }
    // The discriminated union is exhausted above; this throw is purely
    // defensive in case a new node type is added without updating the
    // canvas.
    throw new Error(
      `WorkflowEditorCanvas: unsupported node.type "${(node as { type: string }).type}".`,
    );
  });
}

function projectFlowEdges(config: GraphWorkflowConfig): Edge[] {
  return config.edges.map((edge) => {
    const sourceNode = config.nodes[edge.source];
    const sourceSwitch: SwitchNode | undefined =
      sourceNode?.type === "switch" ? sourceNode : undefined;
    const data: WorkflowEdgeData = { graphEdge: edge, sourceSwitch };
    const strokeColor = getEdgeStrokeColor(edge.type);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "workflow-edge",
      data,
      markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
      style: { stroke: strokeColor, strokeWidth: 2 },
    };
  });
}

function buildStructuralFingerprint(config: GraphWorkflowConfig): string {
  return JSON.stringify({
    ids: Object.keys(config.nodes).sort(),
    entryNodeId: config.entryNodeId,
    labelsAndTypes: Object.fromEntries(
      Object.entries(config.nodes).map(([id, n]) => [
        id,
        n.type === "activity"
          ? `${n.label}::${n.activityType}`
          : `${n.label}::${n.type}`,
      ]),
    ),
  });
}

export function WorkflowEditorCanvas(props: WorkflowEditorCanvasProps) {
  // `useReactFlow` is only available inside a `<ReactFlowProvider>`, so
  // the public component wraps the inner implementation. The provider
  // also isolates xyflow's internal store from any sibling canvases that
  // might mount on the page in future.
  return (
    <ReactFlowProvider>
      <WorkflowEditorCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function WorkflowEditorCanvasInner({
  config,
  selectedNodeId,
  onConfigChange,
  onSelectNode,
  errorsByNode,
  onNodeBadgeClick,
}: WorkflowEditorCanvasProps) {
  // Internal node state managed by xyflow — keeps dragging smooth. The
  // outer GraphWorkflowConfig is updated only on drag-stop / select /
  // delete, never per-mousemove.
  const [internalNodes, setInternalNodes, onInternalNodesChange] =
    useNodesState<FlowNode>([]);
  const [internalEdges, setInternalEdges, onInternalEdgesChange] =
    useEdgesState<Edge>([]);
  const reactFlow = useReactFlow();

  // Auto-fit the viewport when nodes are added (US-014). Compares the
  // previous node-id set to the current one; new ids that weren't present
  // before are treated as additions and the viewport animates to bring
  // the addition into view. Drag, selection, and edge mutations don't
  // change the node-id set, so they don't trigger a re-fit.
  const prevNodeIdsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(Object.keys(config.nodes));
    const prevIds = prevNodeIdsRef.current;
    prevNodeIdsRef.current = currentIds;
    // First mount — ReactFlow's `fitView` prop handles the initial layout.
    if (prevIds === null) return;
    const added: string[] = [];
    for (const id of currentIds) {
      if (!prevIds.has(id)) added.push(id);
    }
    if (added.length === 0) return;
    const options =
      added.length === 1
        ? {
            padding: 0.25,
            duration: 300,
            nodes: [{ id: added[0] }],
          }
        : { padding: 0.25, duration: 300 };
    // Defer one macrotask so xyflow's structural-projection effect (which
    // pushes the new node into the internal store) has finished running
    // before we ask it to fit the new node. A 0ms timeout is enough
    // because xyflow updates its internal store synchronously inside the
    // sibling effect on the same tick.
    const timer = setTimeout(() => {
      reactFlow.fitView(options);
    }, 0);
    return () => clearTimeout(timer);
  }, [config.nodes, reactFlow]);

  // Track the node set + the data-relevant fields so we only resync the
  // internal nodes when something actually changed in the outer config —
  // not when, e.g., the user moves a node and onNodeDragStop triggers a
  // round-trip config update that, on its own, would otherwise overwrite
  // the in-flight drag.
  const dataFingerprint = useMemo(
    () => buildStructuralFingerprint(config),
    [config],
  );

  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFingerprintRef.current === dataFingerprint) return;
    lastFingerprintRef.current = dataFingerprint;
    setInternalNodes(
      projectFlowNodes(config, selectedNodeId, onNodeBadgeClick),
    );
    // Note: `selectedNodeId` participates in the projection on
    // structural changes (e.g., when a freshly added node should start
    // selected). After mount, xyflow owns the `selected` flag on each
    // node via its onSelectionChange handler — we don't sync external
    // selection updates back into internal nodes, which avoids a
    // setState loop with xyflow's StoreUpdater.
  }, [
    dataFingerprint,
    config,
    selectedNodeId,
    onNodeBadgeClick,
    setInternalNodes,
  ]);

  // Validation badge sync — patches data.errorCount / data.warningCount
  // on existing internal nodes whenever the validation results change.
  // Kept separate from the structural projection above so that the
  // 300ms-debounced validator doesn't trigger a full re-projection.
  useEffect(() => {
    if (!errorsByNode) return;
    setInternalNodes((prev) =>
      prev.map((n): FlowNode => {
        const bucket = errorsByNode.get(n.id) ?? [];
        let errorCount = 0;
        let warningCount = 0;
        for (const err of bucket) {
          if (err.severity === "error") errorCount += 1;
          else warningCount += 1;
        }
        if (
          n.data.errorCount === errorCount &&
          n.data.warningCount === warningCount
        ) {
          return n;
        }
        // Preserve the discriminated-union narrowing by patching each
        // branch with its own concrete data shape — TS can't widen a
        // spread back into FlowNode through the union.
        if (n.type === "activity") {
          const updated: ActivityFlowNode = {
            ...n,
            data: { ...n.data, errorCount, warningCount },
          };
          return updated;
        }
        const updated: ControlFlowFlowNode = {
          ...n,
          data: { ...n.data, errorCount, warningCount },
        };
        return updated;
      }),
    );
  }, [errorsByNode, setInternalNodes]);

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
      if (!existing) return;
      const prevPos = (
        existing.metadata as { position?: { x: number; y: number } }
      )?.position;
      if (prevPos?.x === node.position.x && prevPos?.y === node.position.y) {
        return;
      }
      // Build the position-updated node while preserving the
      // discriminated-union narrowing. Each branch produces the same
      // shape with a fresh `metadata.position`.
      const withPosition = (n: GraphNode): GraphNode => ({
        ...n,
        metadata: {
          ...n.metadata,
          position: { x: node.position.x, y: node.position.y },
        },
      });
      let updated: GraphNode;
      switch (existing.type) {
        case "activity":
          updated = withPosition(existing) as ActivityNode;
          break;
        case "switch":
        case "map":
        case "join":
        case "childWorkflow":
        case "pollUntil":
        case "humanGate":
          updated = withPosition(existing);
          break;
        default: {
          const exhaustive: never = existing;
          throw new Error(
            `handleNodeDragStop: unsupported node type "${String(exhaustive)}"`,
          );
        }
      }
      // Bump the fingerprint ref forward by hand so the structural sync
      // useEffect doesn't immediately re-project the nodes and stamp
      // over the local drag commit.
      const nextNodes = { ...config.nodes, [node.id]: updated };
      const nextFingerprint = buildStructuralFingerprint({
        ...config,
        nodes: nextNodes,
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
      // Edge type resolution (US-025):
      //   1. Default to `conditional` if the source node is a switch,
      //      otherwise `normal`.
      //   2. Override to `error` when the explicit source handle id is
      //      `"error"` — handle-id wins over the source-type heuristic
      //      so a stray switch+error connection is still tagged
      //      `error` (defence in depth; switch nodes don't render an
      //      error handle today).
      const sourceNode = config.nodes[connection.source];
      let edgeType: GraphEdge["type"] =
        sourceNode?.type === "switch" ? "conditional" : "normal";
      if (connection.sourceHandle === "error") {
        edgeType = "error";
      }
      const newEdge: GraphEdge = {
        id,
        source: connection.source,
        target: connection.target,
        type: edgeType,
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
        edgeTypes={EDGE_TYPES}
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
