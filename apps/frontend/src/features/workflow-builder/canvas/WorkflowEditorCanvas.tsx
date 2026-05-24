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

import { getActivityCatalogEntry } from "@ai-di/graph-workflow";
import { Tooltip } from "@mantine/core";
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
  type ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityNode,
  ErrorPolicy,
  GraphEdge,
  GraphNode,
  GraphValidationError,
  GraphWorkflowConfig,
  SourceNode,
  SwitchNode,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";
import {
  type ControlFlowVisualHints,
  getControlFlowVisualHints,
} from "../control-flow-visual-hints";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "../palette/control-flow-skeletons";
import {
  type SourceNodeData,
  SourceNodeRenderer,
} from "../sources/SourceNodeRenderer";
import { type GroupChipFlowNode, GroupChipNode } from "./GroupChipNode";
import {
  type GroupChip,
  groupIdFromChipId,
  projectGroupedConfig,
} from "./group-projection";
import { HoverExtendPopover } from "./HoverExtendPopover";
import { computeHandleStyle, type HandleStyle } from "./handle-style";
import { NodeContextMenu } from "./NodeContextMenu";
import { NodeTypePill, type NodeTypePillEntry } from "./NodeTypePill";
import { NodeTypeSwapModal } from "./NodeTypeSwapModal";
import { nextNodePosition } from "./place-extended-node";
import { swapActivityType } from "./swap-node-type";
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
  /**
   * Optional callback fired once the inner `<ReactFlow>` has mounted —
   * the host receives the live `ReactFlowInstance` so it can request a
   * viewport re-fit (e.g. after the user clicks "Auto-arrange" in the
   * top bar — US-049 Scenario 3).
   */
  onReactFlowReady?: (instance: ReactFlowInstance) => void;
  /**
   * Fires with the full set of selected node ids whenever xyflow's
   * selection changes (US-041). Distinct from `onSelectNode`, which
   * only carries the first selected id — the host can use this to
   * enable a "Group selected" action when ≥2 nodes are selected.
   */
  onSelectionChangeMany?: (nodeIds: string[]) => void;
  /**
   * When true (US-043), nodes belonging to a `nodeGroups[<id>]` entry
   * are hidden behind a single "chip" pseudo-node — the canvas projects
   * the config through `projectGroupedConfig` and renders chips instead
   * of the underlying nodes. Toggling back to false restores the
   * original projection without mutating positions.
   */
  simplifiedView?: boolean;
  /**
   * Fires when the user selects a group chip on the canvas (US-043).
   * Carries the underlying group id (NOT the chip's xyflow id) so the
   * host can mount `GroupNodeSettings` in the right rail.
   */
  onGroupChipClick?: (groupId: string) => void;
}

interface CommonNodeData extends Record<string, unknown> {
  label: string;
  isEntry: boolean;
  errorCount: number;
  warningCount: number;
  onBadgeClick?: (nodeId: string) => void;
  /**
   * Hover-to-extend bridge (US-045) — the canvas wires these so the
   * source `out` handle can drive the 200ms-debounced popover. Each
   * renderer just forwards them to `NodeHandles`.
   */
  onSourceHandleEnter?: (
    nodeId: string,
    anchor: { x: number; y: number },
  ) => void;
  onSourceHandleLeave?: (nodeId: string) => void;
  /**
   * Pre-computed kind-aware styling for the node's single input + output
   * handle (US-095). The projection layer derives these from the catalog
   * entry's port kinds — the renderer just consumes them.
   */
  inputHandleStyle: HandleStyle;
  outputHandleStyle: HandleStyle;
  /**
   * Pre-computed per-port entries used by the on-selection type pill
   * (US-096). The projection layer derives these from the activity
   * catalog entry's `inputs[]` / `outputs[]` — each entry carries the
   * port name + the declared `KindRef` (or `undefined` for legacy
   * un-typed descriptors). Control-flow nodes pass `[]` on both sides.
   */
  inputPillEntries: NodeTypePillEntry[];
  outputPillEntries: NodeTypePillEntry[];
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
type SourceFlowNode = Node<SourceNodeData, "source">;
type FlowNode =
  | ActivityFlowNode
  | ControlFlowFlowNode
  | SourceFlowNode
  | GroupChipFlowNode;

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
  /** Id of the node owning these handles — used by the hover bridge. */
  nodeId: string;
  /**
   * When supplied with `onError === "fallback"`, the renderer mounts a
   * second source handle (`id="error"`) on the bottom of the node so
   * the user can draw an error edge from it (US-024). Switch renderers
   * intentionally do not pass this prop — switch nodes route via
   * cases + defaultEdge, not via an error handle.
   */
  errorPolicy?: ErrorPolicy;
  /**
   * Hover-to-extend (US-045) — when present, the source `out` handle
   * fires `onSourceHandleEnter` on mouseenter (with the handle's
   * bounding-rect right-center as the anchor) and
   * `onSourceHandleLeave` on mouseleave. The canvas debounces these to
   * open/close the picker popover.
   */
  onSourceHandleEnter?: (
    nodeId: string,
    anchor: { x: number; y: number },
  ) => void;
  onSourceHandleLeave?: (nodeId: string) => void;
  /** Kind-aware styles for the input + output handles (US-095). */
  inputHandleStyle: HandleStyle;
  outputHandleStyle: HandleStyle;
  /**
   * Per-port entries the on-selection type pill consumes (US-096). The
   * pill renders only when `selected` is `true` AND the entries declare
   * at least one typed port — both side-effects are handled inside
   * `NodeTypePill` so this component just forwards.
   */
  inputPillEntries: NodeTypePillEntry[];
  outputPillEntries: NodeTypePillEntry[];
  /**
   * True when this node is the current xyflow selection. Drives the
   * on-selection type pill visibility (US-096 Scenario 3 — pill hides
   * on deselection).
   */
  selected: boolean;
}

const ERROR_HANDLE_BACKGROUND = "#e03131";

/**
 * Translates a Mantine colour name from `HandleStyle.color` into the
 * matching theme CSS variable, then renders the handle dot background.
 * Falls back to the literal value (so `"gray"` still resolves) when the
 * variable isn't defined in the current theme.
 */
function handleBackground(color: string): string {
  return `var(--mantine-color-${color}-6, ${color})`;
}

/**
 * Lighter outline tone used to signal array cardinality on a kind-
 * coloured handle dot. Picks shade `3` for a faded ring against shade
 * `6`'s saturated dot.
 */
function handleArrayOutline(color: string): string {
  return `var(--mantine-color-${color}-3, ${color})`;
}

const NodeHandles = memo(function NodeHandles({
  nodeId,
  errorPolicy,
  onSourceHandleEnter,
  onSourceHandleLeave,
  inputHandleStyle,
  outputHandleStyle,
  inputPillEntries,
  outputPillEntries,
  selected,
}: NodeHandlesProps) {
  const showErrorHandle = errorPolicy?.onError === "fallback";
  const handleEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSourceHandleEnter) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSourceHandleEnter(nodeId, {
      x: rect.right,
      y: rect.top + rect.height / 2,
    });
  };
  const handleLeave = () => {
    onSourceHandleLeave?.(nodeId);
  };

  // Doubled-outline cue for `T[]` cardinality (US-095 Scenario 1).
  // Applied via inline outline so it nests around the existing handle
  // dot without requiring extra DOM. `outline` (not `border`) is used
  // because it doesn't affect layout / handle hit-testing.
  const inputArrayOutline = inputHandleStyle.isArray
    ? {
        outline: `2px solid ${handleArrayOutline(inputHandleStyle.color)}`,
        outlineOffset: "2px",
      }
    : {};
  const outputArrayOutline = outputHandleStyle.isArray
    ? {
        outline: `2px solid ${handleArrayOutline(outputHandleStyle.color)}`,
        outlineOffset: "2px",
      }
    : {};

  return (
    <>
      <Tooltip label={inputHandleStyle.tooltipText} withArrow position="left">
        <span
          data-testid={`port-tooltip-input-${nodeId}`}
          data-port-direction="input"
          data-port-color={inputHandleStyle.color}
          data-port-array={inputHandleStyle.isArray ? "true" : "false"}
          data-port-multi={inputHandleStyle.isMultiPort ? "true" : "false"}
          data-port-tooltip={inputHandleStyle.tooltipText}
        >
          <Handle
            type="target"
            position={Position.Left}
            style={{
              background: handleBackground(inputHandleStyle.color),
              ...inputArrayOutline,
            }}
          />
        </span>
      </Tooltip>
      {/*
        On-selection type pill — input side (US-096). Anchored to the
        node's left edge (where xyflow pins the input handle) and
        offset further left by 14px so the badge sits outside the
        node body. `translateX(-100%)` flips the badge's own width to
        the left so it doesn't overlap the handle dot. The wrapper
        uses `pointerEvents: 'none'` so the pill never steals
        pointer interactions from the handle or the node body.
      */}
      <div
        data-pill-anchor="input"
        style={{
          position: "absolute",
          left: -14,
          top: "50%",
          transform: "translate(-100%, -50%)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <NodeTypePill
          entries={inputPillEntries}
          direction="input"
          hidden={!selected}
        />
      </div>
      <Tooltip label={outputHandleStyle.tooltipText} withArrow position="right">
        <span
          data-testid={`port-tooltip-output-${nodeId}`}
          data-port-direction="output"
          data-port-color={outputHandleStyle.color}
          data-port-array={outputHandleStyle.isArray ? "true" : "false"}
          data-port-multi={outputHandleStyle.isMultiPort ? "true" : "false"}
          data-port-tooltip={outputHandleStyle.tooltipText}
        >
          <Handle
            id="out"
            type="source"
            position={Position.Right}
            style={{
              background: handleBackground(outputHandleStyle.color),
              ...outputArrayOutline,
            }}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          />
        </span>
      </Tooltip>
      {/*
        On-selection type pill — output side (US-096). Mirrors the
        input-side anchor: pinned to the node's right edge with a 14px
        gutter. No `translateX(-100%)` here because the pill grows to
        the right of its anchor.
      */}
      <div
        data-pill-anchor="output"
        style={{
          position: "absolute",
          right: -14,
          top: "50%",
          transform: "translate(100%, -50%)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <NodeTypePill
          entries={outputPillEntries}
          direction="output"
          hidden={!selected}
        />
      </div>
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
        <NodeHandles
          nodeId={id}
          errorPolicy={data.errorPolicy}
          onSourceHandleEnter={data.onSourceHandleEnter}
          onSourceHandleLeave={data.onSourceHandleLeave}
          inputHandleStyle={data.inputHandleStyle}
          outputHandleStyle={data.outputHandleStyle}
          inputPillEntries={data.inputPillEntries}
          outputPillEntries={data.outputPillEntries}
          selected={selected ?? false}
        />
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
        <NodeHandles
          nodeId={id}
          errorPolicy={data.errorPolicy}
          onSourceHandleEnter={data.onSourceHandleEnter}
          onSourceHandleLeave={data.onSourceHandleLeave}
          inputHandleStyle={data.inputHandleStyle}
          outputHandleStyle={data.outputHandleStyle}
          inputPillEntries={data.inputPillEntries}
          outputPillEntries={data.outputPillEntries}
          selected={selected ?? false}
        />
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
        <NodeHandles
          nodeId={id}
          onSourceHandleEnter={data.onSourceHandleEnter}
          onSourceHandleLeave={data.onSourceHandleLeave}
          inputHandleStyle={data.inputHandleStyle}
          outputHandleStyle={data.outputHandleStyle}
          inputPillEntries={data.inputPillEntries}
          outputPillEntries={data.outputPillEntries}
          selected={selected ?? false}
        />
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
  source: SourceNodeRenderer,
  "group-chip": GroupChipNode,
};

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

function isControlFlowType(t: GraphNode["type"]): t is ControlFlowNodeType {
  return (CONTROL_FLOW_TYPES as readonly string[]).includes(t);
}

interface ProjectionCallbacks {
  onBadgeClick: ((nodeId: string) => void) | undefined;
  onSourceHandleEnter:
    | ((nodeId: string, anchor: { x: number; y: number }) => void)
    | undefined;
  onSourceHandleLeave: ((nodeId: string) => void) | undefined;
}

/**
 * Per-side projection shape consumed by the node renderers — bundles the
 * US-095 handle style with the US-096 pill entries derived from the same
 * catalog descriptor.
 */
interface SideProjection {
  handleStyle: HandleStyle;
  pillEntries: NodeTypePillEntry[];
}

/**
 * Derives the input + output `HandleStyle` pair PLUS the pill entries for
 * an activity node from its catalog entry. Activities without a registered
 * catalog entry fall back to the wildcard / multi-port style (gray +
 * "Multiple …" tooltip) and empty pill entries — the same shape
 * control-flow nodes get today.
 */
function activityNodeSides(activityType: string): {
  input: SideProjection;
  output: SideProjection;
} {
  const entry = getActivityCatalogEntry(activityType);
  if (!entry) {
    return {
      input: {
        handleStyle: computeHandleStyle({ portKinds: [], direction: "input" }),
        pillEntries: [],
      },
      output: {
        handleStyle: computeHandleStyle({ portKinds: [], direction: "output" }),
        pillEntries: [],
      },
    };
  }
  const inputPillEntries: NodeTypePillEntry[] = entry.inputs.map((p) => ({
    portName: p.name,
    kind: p.kind,
  }));
  const outputPillEntries: NodeTypePillEntry[] = entry.outputs.map((p) => ({
    portName: p.name,
    kind: p.kind,
  }));
  return {
    input: {
      handleStyle: computeHandleStyle({
        portKinds: entry.inputs.map((p) => p.kind),
        direction: "input",
      }),
      pillEntries: inputPillEntries,
    },
    output: {
      handleStyle: computeHandleStyle({
        portKinds: entry.outputs.map((p) => p.kind),
        direction: "output",
      }),
      pillEntries: outputPillEntries,
    },
  };
}

/**
 * Control-flow nodes (switch / map / join / childWorkflow / pollUntil /
 * humanGate) have no `PortDescriptor.kind` declarations on the catalog
 * today. They render as wildcard / multi-port — gray handles + the
 * "Multiple inputs/outputs — select node to view all" tooltip — and no
 * pill, until a future story types their I/O explicitly (e.g.
 * childWorkflow nodes sourcing their kinds from
 * `LibraryPortDescriptor.kind`).
 */
function controlFlowNodeSides(): {
  input: SideProjection;
  output: SideProjection;
} {
  return {
    input: {
      handleStyle: computeHandleStyle({ portKinds: [], direction: "input" }),
      pillEntries: [],
    },
    output: {
      handleStyle: computeHandleStyle({ portKinds: [], direction: "output" }),
      pillEntries: [],
    },
  };
}

function projectFlowNodes(
  config: GraphWorkflowConfig,
  selectedNodeId: string | null,
  callbacks: ProjectionCallbacks,
): FlowNode[] {
  const all = Object.values(config.nodes);
  return all.map((node, idx) => {
    const position = readPosition(node, idx);
    const isEntry = node.id === config.entryNodeId;
    if (node.type === "activity") {
      const sides = activityNodeSides(node.activityType);
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
          onBadgeClick: callbacks.onBadgeClick,
          errorPolicy: node.errorPolicy,
          onSourceHandleEnter: callbacks.onSourceHandleEnter,
          onSourceHandleLeave: callbacks.onSourceHandleLeave,
          inputHandleStyle: sides.input.handleStyle,
          outputHandleStyle: sides.output.handleStyle,
          inputPillEntries: sides.input.pillEntries,
          outputPillEntries: sides.output.pillEntries,
        },
      };
      return flowNode;
    }
    if (isControlFlowType(node.type)) {
      const sides = controlFlowNodeSides();
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
          onBadgeClick: callbacks.onBadgeClick,
          errorPolicy: node.errorPolicy,
          onSourceHandleEnter: callbacks.onSourceHandleEnter,
          onSourceHandleLeave: callbacks.onSourceHandleLeave,
          inputHandleStyle: sides.input.handleStyle,
          outputHandleStyle: sides.output.handleStyle,
          inputPillEntries: sides.input.pillEntries,
          outputPillEntries: sides.output.pillEntries,
        },
      };
      return flowNode;
    }
    if (node.type === "source") {
      // Source nodes own their own rendering shell (no input handle, a
      // single typed output handle). The renderer reads the full
      // `SourceNode` from `data` and resolves the catalog entry itself
      // — the projection just forwards the node verbatim under the
      // `SourceNodeData` widening (`SourceNode & Record<string, unknown>`).
      const flowNode: SourceFlowNode = {
        id: node.id,
        type: "source",
        position,
        selected: node.id === selectedNodeId,
        data: node as SourceNodeData,
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

function projectFlowEdges(
  edges: readonly GraphEdge[],
  config: GraphWorkflowConfig,
): Edge[] {
  return edges.map((edge) => {
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

/**
 * Builds xyflow nodes for each chip the simplified-view projection
 * emitted. The chip carries its own deterministic id (`group-chip-<id>`)
 * and is non-draggable today — dragging is filed as a follow-up because
 * we recompute the centroid every projection (no chip-position persistence
 * on `nodeGroups[<id>].metadata`).
 */
function projectChipFlowNodes(
  chips: readonly GroupChip[],
  selectedNodeId: string | null,
): GroupChipFlowNode[] {
  return chips.map((chip) => ({
    id: chip.id,
    type: "group-chip" as const,
    position: chip.position,
    selected: chip.id === selectedNodeId,
    draggable: false,
    data: {
      groupId: chip.groupId,
      label: chip.label,
      icon: chip.icon,
      color: chip.color,
      nodeCount: chip.nodeCount,
    },
  }));
}

function buildStructuralFingerprint(
  config: GraphWorkflowConfig,
  simplifiedView: boolean,
): string {
  // Include nodeGroups composition + the simplifiedView flag so toggling
  // the switch (or creating / deleting a group while ON) triggers a
  // re-projection.
  const groupsFingerprint = Object.entries(config.nodeGroups ?? {})
    .map(([id, g]) => [
      id,
      g.label,
      g.icon ?? "",
      g.color ?? "",
      [...g.nodeIds].sort().join(","),
    ])
    .sort()
    .map((tuple) => tuple.join("|"));
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
    simplifiedView,
    groups: groupsFingerprint,
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
  onReactFlowReady,
  onSelectionChangeMany,
  simplifiedView = false,
  onGroupChipClick,
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
  //
  // `simplifiedView` participates in the fingerprint so toggling the
  // top-bar switch (or adding/removing a group while the switch is ON)
  // re-projects the canvas through `projectGroupedConfig`.
  const dataFingerprint = useMemo(
    () => buildStructuralFingerprint(config, simplifiedView),
    [config, simplifiedView],
  );

  // -------------------------------------------------------------------------
  // Hover-to-extend (US-045)
  //   The source `out` handle drives a 200ms-debounced popover that lets
  //   the user pick the next node + edge in one click. Open / close are
  //   both debounced (open on 200ms hover, close on 200ms grace after
  //   mouseleave) so the picker doesn't flicker as the cursor crosses
  //   the gap from the handle to the popover.
  // -------------------------------------------------------------------------
  const [hoverExtend, setHoverExtend] = useState<{
    nodeId: string;
    anchor: { x: number; y: number };
  } | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel any pending timers on unmount so a stray callback doesn't fire
  // after the canvas has gone away.
  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleSourceHandleEnter = useCallback(
    (nodeId: string, anchor: { x: number; y: number }) => {
      // If a close was scheduled (e.g. the user just re-entered the same
      // handle), cancel it — the user is still in the hover region.
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      // Already pending open for the same node — do nothing.
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
      }
      openTimerRef.current = setTimeout(() => {
        openTimerRef.current = null;
        setHoverExtend({ nodeId, anchor });
      }, 200);
    },
    [],
  );

  const handleSourceHandleLeave = useCallback(() => {
    // Cancel any pending open — the user moved off the handle before the
    // 200ms threshold elapsed.
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    // Grace period before closing — gives the user time to slide onto
    // the popover.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoverExtend(null);
    }, 200);
  }, []);

  const handlePopoverEnter = useCallback(() => {
    // The cursor crossed the gap onto the popover — cancel the close
    // timer so the popover stays open.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const handlePopoverLeave = useCallback(() => {
    // Re-arm the close grace timer when the cursor leaves the popover.
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setHoverExtend(null);
    }, 200);
  }, []);

  const closeHoverExtend = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setHoverExtend(null);
  }, []);

  const projectionCallbacks = useMemo<ProjectionCallbacks>(
    () => ({
      onBadgeClick: onNodeBadgeClick,
      onSourceHandleEnter: handleSourceHandleEnter,
      onSourceHandleLeave: handleSourceHandleLeave,
    }),
    [onNodeBadgeClick, handleSourceHandleEnter, handleSourceHandleLeave],
  );

  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFingerprintRef.current === dataFingerprint) return;
    lastFingerprintRef.current = dataFingerprint;
    if (simplifiedView) {
      // Simplified projection: collapse each group into a chip; hide
      // grouped underlying nodes; remap edges. The chip projection adds
      // an extra pass on top of the standard FlowNode projection.
      const projected = projectGroupedConfig(config);
      const visibleConfig: GraphWorkflowConfig = {
        ...config,
        nodes: Object.fromEntries(projected.visibleNodes.map((n) => [n.id, n])),
      };
      const normalNodes = projectFlowNodes(
        visibleConfig,
        selectedNodeId,
        projectionCallbacks,
      );
      const chipNodes = projectChipFlowNodes(projected.chips, selectedNodeId);
      setInternalNodes([...normalNodes, ...chipNodes]);
    } else {
      setInternalNodes(
        projectFlowNodes(config, selectedNodeId, projectionCallbacks),
      );
    }
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
    projectionCallbacks,
    setInternalNodes,
    simplifiedView,
  ]);

  // Validation badge sync — patches data.errorCount / data.warningCount
  // on existing internal nodes whenever the validation results change.
  // Kept separate from the structural projection above so that the
  // 300ms-debounced validator doesn't trigger a full re-projection.
  useEffect(() => {
    if (!errorsByNode) return;
    setInternalNodes((prev) =>
      prev.map((n): FlowNode => {
        // Chips don't render a validation badge — they're a pure visual
        // collapse, so they have no per-node counts to sync.
        if (n.type === "group-chip") return n;
        // Source nodes don't surface a validation badge in US-117 (no
        // `errorCount` / `warningCount` fields on `SourceNodeData`).
        // Skip the patch to avoid stamping undefined → 0 mutations and
        // re-rendering for no reason.
        if (n.type === "source") return n;
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

  // Resolve the edge set the canvas should actually render. Simplified
  // view substitutes the group-projected edges (intra-group edges dropped,
  // cross-group endpoints rewritten to chip ids).
  const visibleEdges = useMemo<GraphEdge[]>(() => {
    if (!simplifiedView) return config.edges;
    return projectGroupedConfig(config).visibleEdges;
  }, [config, simplifiedView]);

  const edgesFingerprint = useMemo(
    () =>
      JSON.stringify(
        visibleEdges.map((e) => `${e.id}|${e.source}|${e.target}|${e.type}`),
      ),
    [visibleEdges],
  );
  const lastEdgesFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastEdgesFingerprintRef.current === edgesFingerprint) return;
    lastEdgesFingerprintRef.current = edgesFingerprint;
    setInternalEdges(projectFlowEdges(visibleEdges, config));
  }, [edgesFingerprint, visibleEdges, config, setInternalEdges]);

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
        case "source":
          updated = withPosition(existing) as SourceNode;
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
      const nextFingerprint = buildStructuralFingerprint(
        {
          ...config,
          nodes: nextNodes,
        },
        simplifiedView,
      );
      lastFingerprintRef.current = nextFingerprint;
      onConfigChange({ ...config, nodes: nextNodes });
    },
    [config, onConfigChange, simplifiedView],
  );

  const handleSelectionChange = useCallback(
    ({ nodes }: OnSelectionChangeParams) => {
      // Group-chip selection (US-043) is routed to its own callback so
      // the host can mount `GroupNodeSettings` for the underlying group.
      // Chip ids follow a deterministic `group-chip-<groupId>` shape
      // (`chipIdForGroup`), so we infer the groupId from the id rather
      // than reading it from the node's `data` payload — keeps the
      // routing robust against the mocked xyflow harness used in tests
      // (which doesn't forward `data` on `onSelectionChange`).
      const chipMatch = nodes.find((n) => groupIdFromChipId(n.id) !== null);
      if (chipMatch && onGroupChipClick) {
        const groupId = groupIdFromChipId(chipMatch.id);
        if (groupId) onGroupChipClick(groupId);
      }

      // Fire the multi-select callback (US-041) so the host can enable /
      // disable a "Group selected" action even if the single-select id
      // hasn't changed (e.g., adding a second shift-click while the same
      // first node stays the head of the list). Filter chips out — the
      // host's multi-select consumers care about underlying graph nodes
      // only.
      if (onSelectionChangeMany) {
        const realNodeIds = nodes
          .filter((n) => groupIdFromChipId(n.id) === null)
          .map((n) => n.id);
        onSelectionChangeMany(realNodeIds);
      }
      // `onSelectNode` carries the first selected id — chips don't
      // participate here either (they have their own callback above).
      const firstReal = nodes.find((n) => groupIdFromChipId(n.id) === null);
      const next = firstReal?.id ?? null;
      if (next === selectedNodeId) return;
      onSelectNode(next);
    },
    [onSelectNode, selectedNodeId, onSelectionChangeMany, onGroupChipClick],
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

  // ---------------------------------------------------------------------------
  // Right-click context menu (US-046)
  // ---------------------------------------------------------------------------

  /**
   * Live menu state — null when no menu is open, otherwise carries the
   * target node's id + discriminator type and the viewport coordinates
   * (event.clientX / clientY) the menu pins to.
   */
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    nodeType: GraphNode["type"];
    x: number;
    y: number;
  } | null>(null);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Suppress the browser's native right-click menu so the workflow
      // menu can sit on top without competition.
      event.preventDefault();
      const graphNode = config.nodes[node.id];
      if (!graphNode) return;
      setContextMenu({
        nodeId: node.id,
        nodeType: graphNode.type,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [config.nodes],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /**
   * Wires the context menu's "Delete node" entry into the existing
   * `handleNodesDelete` path so deletion via right-click and the keyboard
   * delete key share one removal flow.
   */
  const deleteNodeFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    const target = config.nodes[contextMenu.nodeId];
    if (!target) return;
    const flowNode: Node = {
      id: contextMenu.nodeId,
      // The `data` / `position` fields are unused by `handleNodesDelete`
      // (it only inspects `id`), but xyflow's `Node` type requires them.
      data: {},
      position: { x: 0, y: 0 },
    };
    handleNodesDelete([flowNode]);
  }, [contextMenu, config.nodes, handleNodesDelete]);

  /**
   * Picker-modal state — `null` when no swap is in progress, otherwise
   * carries the node id whose activity-type is being changed (US-047).
   * Keeping this on the canvas means the picker survives the context
   * menu's click-away handler (the menu closes itself when "Change
   * activity type" fires, then the modal opens via this state).
   */
  const [swapState, setSwapState] = useState<{ nodeId: string } | null>(null);

  const changeActivityTypeFromContextMenu = useCallback(() => {
    if (!contextMenu) return;
    const target = config.nodes[contextMenu.nodeId];
    // Defence in depth — the menu's `disabled` state already gates this
    // for control-flow nodes (US-046 Scenario 2), but the canvas guards
    // the type-swap helper too so a stray call can't crash.
    if (!target || target.type !== "activity") return;
    setSwapState({ nodeId: contextMenu.nodeId });
  }, [contextMenu, config.nodes]);

  const closeSwapModal = useCallback(() => setSwapState(null), []);

  const handleSwapPick = useCallback(
    (newActivityType: string) => {
      if (!swapState) return;
      const existing = config.nodes[swapState.nodeId];
      if (!existing || existing.type !== "activity") {
        setSwapState(null);
        return;
      }
      const updated = swapActivityType(existing, newActivityType);
      onConfigChange({
        ...config,
        nodes: { ...config.nodes, [swapState.nodeId]: updated },
      });
      setSwapState(null);
    },
    [swapState, config, onConfigChange],
  );

  /**
   * The current activity-type the swap modal is configured against.
   * Looked up at render time so it stays in sync with the live config
   * when other state updates flow through.
   */
  const swapCurrentActivityType = useMemo(() => {
    if (!swapState) return null;
    const node = config.nodes[swapState.nodeId];
    if (!node || node.type !== "activity") return null;
    return node.activityType;
  }, [swapState, config.nodes]);

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

  /**
   * Resolves the edge type the hover-extender should stamp on the new
   * connection — mirrors the (`switch` → `conditional`, otherwise
   * `normal`) part of `handleConnect`. The new edge is always drawn from
   * the source's `out` handle, so the `error` override doesn't apply
   * here.
   */
  const inferExtendEdgeType = useCallback(
    (sourceNodeId: string): GraphEdge["type"] => {
      const sourceNode = config.nodes[sourceNodeId];
      return sourceNode?.type === "switch" ? "conditional" : "normal";
    },
    [config.nodes],
  );

  /**
   * Adds the new graph node + connecting edge to the outer config in a
   * single `onConfigChange`. Used by both the activity-picker and the
   * control-flow-picker branches of the hover popover.
   */
  const extendFromSource = useCallback(
    (sourceNodeId: string, newNode: GraphNode) => {
      const sourceGraphNode = config.nodes[sourceNodeId];
      if (!sourceGraphNode) return;
      const sourcePos = (
        sourceGraphNode.metadata as { position?: { x: number; y: number } }
      )?.position ?? { x: 0, y: 0 };
      const position = nextNodePosition(sourcePos);
      const newNodeWithPosition: GraphNode = {
        ...newNode,
        metadata: {
          ...(newNode.metadata ?? {}),
          position,
        },
      };
      const edgeId = `edge-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      const newEdge: GraphEdge = {
        id: edgeId,
        source: sourceNodeId,
        target: newNode.id,
        type: inferExtendEdgeType(sourceNodeId),
      };
      onConfigChange({
        ...config,
        nodes: { ...config.nodes, [newNode.id]: newNodeWithPosition },
        edges: [...config.edges, newEdge],
      });
      onSelectNode(newNode.id);
    },
    [config, onConfigChange, onSelectNode, inferExtendEdgeType],
  );

  const handleHoverPickActivity = useCallback(
    (activityType: string) => {
      if (!hoverExtend) return;
      const sourceNodeId = hoverExtend.nodeId;
      closeHoverExtend();
      const newId = `activity_${Date.now().toString(36)}`;
      const entry = getActivityCatalogEntry(activityType);
      const inputs = entry
        ? entry.inputs.map((p) => ({ port: p.name, ctxKey: p.name }))
        : [];
      const outputs = entry
        ? entry.outputs.map((p) => ({ port: p.name, ctxKey: p.name }))
        : [];
      const newNode: ActivityNode = {
        id: newId,
        type: "activity",
        label: entry?.displayName ?? activityType,
        activityType,
        inputs,
        outputs,
        parameters: {},
      };
      extendFromSource(sourceNodeId, newNode);
    },
    [hoverExtend, closeHoverExtend, extendFromSource],
  );

  const handleHoverPickControlFlow = useCallback(
    (controlFlowType: ControlFlowNodeType) => {
      if (!hoverExtend) return;
      const sourceNodeId = hoverExtend.nodeId;
      closeHoverExtend();
      const newId = `${controlFlowType}_${Date.now().toString(36)}`;
      const newNode = buildControlFlowSkeleton(controlFlowType, newId);
      extendFromSource(sourceNodeId, newNode);
    },
    [hoverExtend, closeHoverExtend, extendFromSource],
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
        onNodeContextMenu={handleNodeContextMenu}
        onInit={(instance) =>
          // Cast away the typed-generic narrowing on the inner instance —
          // the host only needs the generic `ReactFlowInstance` surface
          // (`fitView`, `getNodes`, etc.) for the auto-arrange flow
          // (US-049 Scenario 3).
          onReactFlowReady?.(instance as unknown as ReactFlowInstance)
        }
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
      {contextMenu && (
        <NodeContextMenu
          nodeId={contextMenu.nodeId}
          nodeType={contextMenu.nodeType}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onChangeActivityType={changeActivityTypeFromContextMenu}
          onDelete={deleteNodeFromContextMenu}
        />
      )}
      {swapState && swapCurrentActivityType !== null && (
        <NodeTypeSwapModal
          opened
          currentActivityType={swapCurrentActivityType}
          onClose={closeSwapModal}
          onPick={handleSwapPick}
        />
      )}
      {hoverExtend && (
        <HoverExtendPopover
          opened
          anchorPosition={hoverExtend.anchor}
          onClose={closeHoverExtend}
          onPickActivity={handleHoverPickActivity}
          onPickControlFlow={handleHoverPickControlFlow}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
        />
      )}
    </div>
  );
}
