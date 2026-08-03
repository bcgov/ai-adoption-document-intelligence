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
import "./workflow-editor-canvas.css";

import {
  getActivityCatalogEntry,
  getLockedInputPorts,
  isAssignable,
  type KindRef,
  pruneEdgeReferences,
  resolveBindings,
} from "@ai-di/graph-workflow";
import { Anchor, Badge, Modal, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  type IsValidConnection,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type OnConnectEnd,
  type OnConnectStart,
  type OnSelectionChangeParams,
  Panel,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
  type XYPosition,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ActivityNode,
  ErrorPolicy,
  GraphEdge,
  GraphNode,
  GraphValidationError,
  GraphWorkflowConfig,
  NodeGroup,
  SourceNode,
  SwitchNode,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";
import {
  type ControlFlowVisualHints,
  getControlFlowVisualHints,
} from "../control-flow-visual-hints";
import { showOrphanedDeleteToast } from "../delete-orphan-toast";
import { DynamicNodeEditor, useActivityCatalog } from "../dynamic-nodes";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "../palette/control-flow-skeletons";
import { NodePreviewOverlay } from "../preview/PreviewWidget";
import type { PreviewOutputBinding } from "../preview/preview.types";
import { computeActiveEdges, computeTakenEdges } from "../run/active-edges";
import { NodeStatusBadgeOverlay } from "../run/NodeStatusBadge";
import { useOptionalRunState } from "../run/RunStateContext";
import {
  type SourceNodeData,
  SourceNodeRenderer,
} from "../sources/SourceNodeRenderer";
import { layoutGraphSimplified, layoutGraphWithMapBodies } from "./auto-layout";
import { CanvasLegend } from "./CanvasLegend";
import { ConnectSummaryPopover } from "./ConnectSummaryPopover";
import { type DataWire, type DerivedWire, deriveWires } from "./derive-wires";
import { pickInputPortForKind, pickOutputPortForKind } from "./extend-filter";
import {
  type GroupChipFlowNode,
  GroupChipNode,
  type GroupChipNodeData,
} from "./GroupChipNode";
import {
  containerIdForGroup,
  GROUP_HEADER_CLASS,
  type GroupContainerFlowNode,
  GroupContainerNode,
  groupIdFromContainerId,
} from "./GroupContainerNode";
import {
  applyGroupDragDelta,
  captureGroupDragCohort,
  type GroupDragCohort,
} from "./group-drag-cohesion";
import {
  type GroupChip,
  groupIdFromChipId,
  projectGroupedConfig,
  readSimplifiedNodePosition,
} from "./group-projection";
import { HoverExtendPopover } from "./HoverExtendPopover";
import {
  computeHandleStyle,
  type HandleStyle,
  handleArrayOutline,
  handleBackground,
} from "./handle-style";
import {
  isSyntheticMapBodyGroupId,
  mapNodeIdFromSyntheticGroupId,
} from "./map-body-groups";
import { NodeContextMenu } from "./NodeContextMenu";
import type { NodeTypePillEntry } from "./NodeTypePill";
import { NodeTypePillRow } from "./NodeTypePillRow";
import { NodeTypeSwapModal } from "./NodeTypeSwapModal";
import { PaneContextMenu } from "./PaneContextMenu";
import { PortDragContext, PortRows } from "./PortRows";
import { findNextFreePosition } from "./place-extended-node";
import {
  humanKindLabel,
  inputPortKind,
  outputPortKind,
  portFromHandleId,
} from "./port-kinds";
import {
  computePortRows,
  estimateNodeHeight,
  estimateNodeWidth,
  inputHandleId,
  outputHandleId,
  type PortRowModel,
  rendersPerPortHandle,
} from "./port-rows";
import { computePreviewOutputs } from "./preview-outputs";
import { recordErrorEdge } from "./record-error-edge";
import { removeNodesFromConfig } from "./remove-nodes";
import { swapActivityType } from "./swap-node-type";
import { useHoverExtend } from "./use-hover-extend";
import { ValidationBadge } from "./ValidationBadge";
import { WireContextMenu } from "./WireContextMenu";
import {
  dataWireStroke,
  WorkflowEdge,
  type WorkflowEdgeData,
  wireTooltip,
} from "./WorkflowEdge";
import {
  clearReconnectableLocks,
  disconnectDataWire,
  ensureEdgeBetween,
  makeEdgeId,
  pinPortBinding,
  revertPortToAutomatic,
} from "./wire-mutations";

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
   * S-1 — groups the current selection, for the right-click menu's "Group
   * these N steps" entry. The operation itself belongs to the host (it is the
   * same `createGroupFromSelection` call the top-bar action makes), so the
   * canvas only asks for it; when no handler is supplied the entry is absent.
   */
  onGroupSelection?: () => void;
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
  /**
   * Fires when the user clicks a map-body container box. Carries the owning
   * map node's id so the host can select it (opening the map's settings, where
   * the body entry/exit that define the box live). Distinct from
   * `onGroupChipClick` — a map-body box is not an editable user group.
   */
  onSelectMapBodyNode?: (nodeId: string) => void;
  /**
   * Monotonic counter the host bumps when it stamps new `metadata.position`
   * values without any structural change — e.g. "Auto-arrange" (§4.2). The
   * structural fingerprint deliberately excludes positions (so per-node
   * drags don't trigger a full re-projection), so a config-only position
   * change would otherwise never move the rendered nodes. Bumping this makes
   * the canvas re-apply the config's positions to its internal xyflow nodes.
   */
  layoutNonce?: number;
  /**
   * Deep-link into the settings-panel source picker for a specific input
   * port (§6.4's "Fix" button on a warning row). The host owns node
   * selection + opening the right rail; the canvas just forwards the
   * (nodeId, port) pair up.
   */
  onFixNodeInput?: (nodeId: string, port: string) => void;
  /**
   * Item 6X — the id of a node to visually emphasise (hover-highlight from
   * a settings-panel input row's real producer). `null`/`undefined` clears
   * the emphasis. Applied as the `wb-node-highlight` class on the matching
   * xyflow node wrapper (see workflow-editor-canvas.css) so it composes with
   * whatever the node's renderer already draws, for every node type.
   */
  highlightedNodeId?: string | null;
  /**
   * Reverses the last config change (G-003). Offered as the "Undo" action on
   * the toast a delete raises when it orphans ctx variables other steps read —
   * which is what replaced the blocking confirm those paths used to show.
   */
  onUndo?: () => void;
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
   * §9 — hover-to-extend from a typed per-port OUTPUT handle (PortRows).
   * The activity renderer forwards these to `<PortRows>`; the canvas routes
   * them into the kind-aware extend popover. Node-level `out` hover keeps
   * using `onSourceHandleEnter` (unfiltered).
   */
  onOutputHandleEnter?: (
    nodeId: string,
    portName: string,
    anchor: { x: number; y: number },
  ) => void;
  onOutputHandleLeave?: () => void;
  /**
   * UX walkthrough 2026-07-29 — hover-to-extend UPSTREAM from a
   * typed per-port INPUT handle. The renderers forward these to
   * `<PortRows>`; the canvas routes them into the producer-filtered
   * extend popover.
   */
  onInputHandleEnter?: (
    nodeId: string,
    portName: string,
    anchor: { x: number; y: number },
  ) => void;
  onInputHandleLeave?: () => void;
}

interface ActivityNodeData extends CommonNodeData {
  activityType: string;
  /**
   * Populated from `node.errorPolicy` so the renderer can mount a
   * second `error` source handle when `onError === "fallback"`
   * without re-looking-up the source node by id (US-024).
   */
  errorPolicy?: ErrorPolicy;
  /**
   * Per-port row models (PORT_WIRING_DESIGN.md, port-row rendering
   * slice). The projection layer derives these from the catalog entry +
   * the derived wires — the renderer just mounts `<PortRows>`. Nodes
   * without a static catalog entry (control-flow skeletons never reach
   * this data shape; `dyn.*` activities do) get empty arrays and render
   * no rows.
   */
  portRows: { inputs: PortRowModel[]; outputs: PortRowModel[] };
  /**
   * EVERY previewable output of this activity, in declaration order (G-011) —
   * the ctx key each output port is bound to, plus the port's catalog label and
   * kind. Forwarded to the preview overlay, which resolves the selected port's
   * value via `resolveCtxBinding` and renders a port selector when there is
   * more than one. This used to be a single `primaryOutputCtxKey:
   * node.outputs?.[0]?.ctxKey`, which made every output after the first
   * invisible. Empty when the node has no output binding yet.
   */
  previewOutputs: PreviewOutputBinding[];
}

interface ControlFlowNodeData extends CommonNodeData {
  controlFlowType: ControlFlowNodeType;
  /** Same as ActivityNodeData.errorPolicy — see US-024. */
  errorPolicy?: ErrorPolicy;
  /**
   * Pre-computed kind-aware styling for the node's single input + output
   * handle (US-095). The projection layer derives these — the renderer
   * just consumes them. Activity nodes render per-port rows instead
   * (`ActivityNodeData.portRows`), so these now live on the control-flow
   * data shape only.
   */
  inputHandleStyle: HandleStyle;
  outputHandleStyle: HandleStyle;
  /**
   * Pre-computed per-port entries used by the on-selection type pill
   * (US-096). Control-flow nodes have no typed catalog ports today, so
   * these stay `[]` and the pill renders nothing — kept until a future
   * story types control-flow I/O explicitly.
   */
  inputPillEntries: NodeTypePillEntry[];
  outputPillEntries: NodeTypePillEntry[];
}

/**
 * G-016 — `pollUntil` wraps a real catalog activity, so its card carries
 * the control-flow chrome AND the activity affordances: the per-port row
 * grid (so its inputs have something on the canvas to drag to, matching
 * what the settings panel and the problems badge already list) plus the
 * catalog lookup that lets an unregistered wrapped type degrade legibly.
 * Every other control-flow type keeps the plain `ControlFlowNodeData`.
 */
interface PollUntilNodeData extends ControlFlowNodeData {
  /** The wrapped activity type — resolved against the static catalog. */
  activityType: string;
  /** Same shape (and same producer) as `ActivityNodeData.portRows`. */
  portRows: { inputs: PortRowModel[]; outputs: PortRowModel[] };
}

type ActivityFlowNode = Node<ActivityNodeData, "activity">;
/**
 * Every control-flow type EXCEPT `pollUntil` — which carries the richer
 * `PollUntilNodeData` (G-016). Excluding it here keeps the `FlowNode`
 * union discriminated on `type`, so `n.type === "pollUntil"` narrows to
 * exactly one member.
 */
type PlainControlFlowNodeType = Exclude<ControlFlowNodeType, "pollUntil">;
type ControlFlowFlowNode = Node<ControlFlowNodeData, PlainControlFlowNodeType>;
type PollUntilFlowNode = Node<PollUntilNodeData, "pollUntil">;
type SourceFlowNode = Node<SourceNodeData, "source">;
type FlowNode =
  | ActivityFlowNode
  | ControlFlowFlowNode
  | PollUntilFlowNode
  | SourceFlowNode
  | GroupChipFlowNode
  | GroupContainerFlowNode;

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

/**
 * Generates a unique node id of the form `<prefix>_<base36 time><random>`.
 * The random suffix (mirroring the edge-id generators in this file)
 * prevents two same-millisecond adds from colliding and overwriting in
 * the id-keyed `config.nodes` map. The loop additionally re-rolls on the
 * (vanishingly rare) collision with an already-present node id.
 */
function makeUniqueNodeId(
  prefix: string,
  existingNodes: Record<string, unknown>,
): string {
  let id = "";
  do {
    const rand = Math.random().toString(36).slice(2, 6);
    id = `${prefix}_${Date.now().toString(36)}${rand}`;
  } while (existingNodes[id] !== undefined);
  return id;
}

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
 * Builds the mouseenter/mouseleave pair the source `out` handle uses to
 * drive the hover-to-extend popover (US-045). Shared between
 * `NodeHandles` (control-flow / switch renderers) and the activity
 * renderer's node-level `out` handle so the anchor geometry (handle
 * bounding-rect right-centre) stays identical.
 */
function makeSourceHandleHoverHandlers(
  nodeId: string,
  onSourceHandleEnter?: (
    nodeId: string,
    anchor: { x: number; y: number },
  ) => void,
  onSourceHandleLeave?: (nodeId: string) => void,
): {
  onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave: () => void;
} {
  return {
    onMouseEnter: (event) => {
      if (!onSourceHandleEnter) return;
      const rect = event.currentTarget.getBoundingClientRect();
      onSourceHandleEnter(nodeId, {
        x: rect.right,
        y: rect.top + rect.height / 2,
      });
    },
    onMouseLeave: () => {
      onSourceHandleLeave?.(nodeId);
    },
  };
}

/**
 * Fixed id for the "Execution order kept" data-wire disconnect hint so its
 * inline "Detach fully" action can dismiss the exact toast it belongs to
 * (`notifications.hide(id)`) after removing the surviving execution edge.
 */
export const DETACH_FULLY_TOAST_ID = "wb-wire-detach-fully-hint";

/**
 * §9 — viewport coordinates of a connect-end release, handling both mouse
 * and touch. xyflow's `OnConnectEnd` hands a `MouseEvent | TouchEvent`.
 * A touch event with an empty `changedTouches` (e.g. `touchcancel`) carries
 * no coordinate, so we fall back to the origin rather than dereferencing an
 * undefined touch — the popover still opens, just at the top-left.
 */
export function releaseAnchorFromEvent(event: MouseEvent | TouchEvent): {
  x: number;
  y: number;
} {
  if ("clientX" in event) return { x: event.clientX, y: event.clientY };
  const touch = event.changedTouches[0];
  if (!touch) return { x: 0, y: 0 };
  return { x: touch.clientX, y: touch.clientY };
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
  const { onMouseEnter: handleEnter, onMouseLeave: handleLeave } =
    makeSourceHandleHoverHandlers(
      nodeId,
      onSourceHandleEnter,
      onSourceHandleLeave,
    );

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
      {showErrorHandle && (
        <Handle
          id="error"
          type="source"
          position={Position.Bottom}
          style={{ background: ERROR_HANDLE_BACKGROUND }}
        />
      )}
      {selected ? (
        <NodeTypePillRow
          inputs={inputPillEntries}
          outputs={outputPillEntries}
        />
      ) : null}
    </>
  );
});

// ---------------------------------------------------------------------------
// Activity renderer
// ---------------------------------------------------------------------------

const ActivityNodeRenderer = memo(
  ({ id, data, selected }: NodeProps<ActivityFlowNode>) => {
    const hints = getActivityVisualHints(data.activityType);
    // Destructured to a capitalised binding because JSX treats a lowercase tag
    // as an intrinsic element — `<hints.Icon />` works, but the local alias
    // keeps the render below readable alongside the control-flow renderers,
    // which resolve their icon component the same way.
    const ActivityIcon = hints.Icon;
    // Per-port handle ids change when the node's activityType is swapped
    // (even with an equal row count) — xyflow caches handleBounds per node,
    // so without an explicit invalidation the projected port-to-port wires
    // would keep anchoring at the OLD handles' coordinates. Key on the
    // ordered handle-id list so a swap (or a catalog-driven row change)
    // triggers exactly one re-measure, while routine re-projections with
    // identical rows don't.
    const updateNodeInternals = useUpdateNodeInternals();
    const portHandlesKey = useMemo(
      () =>
        [
          ...data.portRows.inputs.map((row) => row.handleId),
          "→",
          ...data.portRows.outputs.map((row) => row.handleId),
        ].join(","),
      [data.portRows],
    );
    useEffect(() => {
      updateNodeInternals(id);
    }, [id, portHandlesKey, updateNodeInternals]);
    const accent = hints.color;
    const errorCount = data.errorCount ?? 0;
    const warningCount = data.warningCount ?? 0;
    // Phase 6 (US-183): mark dynamic-node instances with a "DYN" pill, and
    // when the referenced slug is absent from the merged catalog (because the
    // lineage was soft-deleted) render a red "Deleted" pill instead.
    const isDynamic = data.activityType.startsWith("dyn.");
    const catalog = useActivityCatalog();
    const catalogEntry = catalog.entries.find(
      (e) => e.activityType === data.activityType,
    );
    const isMissingFromCatalog =
      isDynamic && !catalog.isLoading && catalogEntry === undefined;
    // D-12: a `@deterministic:false` dynamic node is never written to the
    // output cache, so its empty preview is "not cached", not "evicted".
    const neverCached = catalogEntry?.nonCacheable === true;
    // Node-level flow handles: the unnamed left target + the `id="out"`
    // right source keep today's connect gesture AND anchor everything the
    // wire projection doesn't route to a per-port dot. Source handles are
    // now always stamped explicitly ("out" / "error" / "out-<port>"), but
    // TARGET handles on structural wires and node-level-fallback data
    // wires are projected as `null`, and xyflow's default resolution
    // (`getHandle`) picks `bounds[0]` — the FIRST handle of the required
    // type in DOM order — so the node-level target MUST render before
    // <PortRows> in the JSX, or those null-targetHandle edges would
    // silently resolve to `bounds[0]` and anchor at the first per-port row
    // dot instead. This DOM-order requirement is independent of per-port
    // handles being connectable and drag-validated (§6.1/§6.2) — it's
    // purely about which handle xyflow's default resolver picks. The
    // `out` handle also keeps the hover-to-extend bridge (US-045).
    const hoverHandlers = makeSourceHandleHoverHandlers(
      id,
      data.onSourceHandleEnter,
      data.onSourceHandleLeave,
    );
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
        <NodeStatusBadgeOverlay nodeId={id} />
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
          <span aria-hidden style={{ display: "inline-flex" }}>
            <ActivityIcon size={14} />
          </span>
          <span style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
            {hints.displayName}
          </span>
          {(isDynamic || data.isEntry) && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              {isDynamic && (
                <Badge
                  size="xs"
                  variant="filled"
                  color={isMissingFromCatalog ? "red" : "grape"}
                  data-testid={
                    isMissingFromCatalog
                      ? `canvas-node-${id}-deleted-pill`
                      : `canvas-node-${id}-dyn-pill`
                  }
                >
                  {isMissingFromCatalog ? "Deleted" : "DYN"}
                </Badge>
              )}
              {data.isEntry && (
                <span
                  style={{
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
            </span>
          )}
        </div>
        <div style={{ fontWeight: 600 }}>{data.label}</div>
        {isMissingFromCatalog && (
          <div
            style={{
              fontSize: 10,
              color: "var(--mantine-color-dimmed, #9ca3af)",
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            (deleted dynamic node)
          </div>
        )}
        {/* Node-level handles FIRST in DOM order for their type — see the
            default-resolution comment above `hoverHandlers`. */}
        <Tooltip label="Flow — execution order" withArrow position="left">
          <span>
            <Handle
              type="target"
              position={Position.Left}
              style={{ top: 18, background: handleBackground("gray") }}
            />
          </span>
        </Tooltip>
        <Tooltip label="Flow — execution order" withArrow position="right">
          <span>
            <Handle
              id="out"
              type="source"
              position={Position.Right}
              style={{ top: 18, background: handleBackground("gray") }}
              onMouseEnter={hoverHandlers.onMouseEnter}
              onMouseLeave={hoverHandlers.onMouseLeave}
            />
          </span>
        </Tooltip>
        {data.errorPolicy?.onError === "fallback" && (
          <Handle
            id="error"
            type="source"
            position={Position.Bottom}
            style={{ background: ERROR_HANDLE_BACKGROUND }}
          />
        )}
        <PortRows
          nodeId={id}
          inputs={data.portRows.inputs}
          outputs={data.portRows.outputs}
          onOutputHandleEnter={data.onOutputHandleEnter}
          onOutputHandleLeave={data.onOutputHandleLeave}
          onInputHandleEnter={data.onInputHandleEnter}
          onInputHandleLeave={data.onInputHandleLeave}
        />
        <NodePreviewOverlay
          nodeId={id}
          outputs={data.previewOutputs}
          neverCached={neverCached}
          isDynamicNode={isDynamic}
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

function renderFanIndicator(
  hints: ControlFlowVisualHints,
  offsetForBadge: boolean,
) {
  const FanIcon = hints.fanIndicator;
  if (!FanIcon) return null;
  return (
    <div
      title={hints.fanIndicatorLabel}
      data-testid={`fan-indicator-${hints.type}`}
      style={{
        position: "absolute",
        top: -7,
        // Home is the top-left corner, but the per-node ValidationBadge also
        // lives there (top:-7, left:-7). When this node shows a validation
        // badge, slide the fan glyph right so the two small circles sit
        // side-by-side instead of overlapping (map/join only — they're the
        // types that carry a fan indicator).
        left: offsetForBadge ? 18 : -7,
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
        {renderFanIndicator(
          hints,
          (data.errorCount ?? 0) > 0 || (data.warningCount ?? 0) > 0,
        )}
        <ValidationBadge
          nodeId={id}
          errorCount={data.errorCount ?? 0}
          warningCount={data.warningCount ?? 0}
          onBadgeClick={data.onBadgeClick}
        />
        <NodeStatusBadgeOverlay nodeId={id} />
        {renderControlFlowHeader({ id, data, selected, hints })}
        <div style={{ fontWeight: 600 }}>{data.label}</div>
        <NodePreviewOverlay nodeId={id} producesOutput={false} />
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
 * `pollUntil` renderer (G-016). A pollUntil is a control-flow node that
 * WRAPS a real catalog activity, and it used to render through
 * `ControlFlowRectangleRenderer` — so its catalog inputs appeared in the
 * settings panel and in the problems badge with nothing on the canvas to
 * drag to, and a wrapped activity that vanished from the catalog left the
 * card looking entirely normal.
 *
 * This renderer keeps the rectangle chrome (type icon, accent, ENTRY pill,
 * node-level flow handles) and adds the two affordances that belong to the
 * activity it wraps:
 *
 *   1. `<PortRows>` — the same grid `ActivityNodeRenderer` mounts, from the
 *      same `computePortRows` projection, so `rendersPerPortHandle` can
 *      anchor wires per port.
 *   2. the catalog fallback — the unknown-activity icon + "Unregistered
 *      activity." + the raw type for a missing static entry, and the red
 *      "Deleted" pill for a soft-deleted `dyn.*` lineage. Identical treatment
 *      to an `activity`.
 */
const PollUntilNodeRenderer = memo(
  ({ id, data, selected }: NodeProps<PollUntilFlowNode>) => {
    const hints = getControlFlowVisualHints("pollUntil");
    const accent = hints.color;
    // Same handle-bounds invalidation the activity renderer needs: swapping
    // the wrapped activityType changes the per-port handle ids, and xyflow
    // caches handleBounds per node.
    const updateNodeInternals = useUpdateNodeInternals();
    const portHandlesKey = useMemo(
      () =>
        [
          ...data.portRows.inputs.map((row) => row.handleId),
          "→",
          ...data.portRows.outputs.map((row) => row.handleId),
        ].join(","),
      [data.portRows],
    );
    useEffect(() => {
      updateNodeInternals(id);
    }, [id, portHandlesKey, updateNodeInternals]);

    const isDynamic = data.activityType.startsWith("dyn.");
    const catalog = useActivityCatalog();
    const isMissingFromCatalog = isDynamic
      ? !catalog.isLoading &&
        !catalog.entries.some((e) => e.activityType === data.activityType)
      : getActivityCatalogEntry(data.activityType) === undefined;
    const activityHints = getActivityVisualHints(data.activityType);
    const WrappedActivityIcon = activityHints.Icon;
    const hasRows =
      data.portRows.inputs.length > 0 || data.portRows.outputs.length > 0;

    return (
      <div
        data-testid={`canvas-node-${id}`}
        data-shape="rectangle"
        data-node-type="pollUntil"
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
          errorCount={data.errorCount ?? 0}
          warningCount={data.warningCount ?? 0}
          onBadgeClick={data.onBadgeClick}
        />
        <NodeStatusBadgeOverlay nodeId={id} />
        {renderControlFlowHeader({ id, data, selected, hints })}
        <div style={{ fontWeight: 600 }}>{data.label}</div>
        {/* The wrapped activity, named on the card — the pollUntil's own
            header names the CONTROL-FLOW type, so without this row the
            activity it repeats is invisible on the canvas. */}
        <div
          data-testid={`poll-until-wrapped-${id}`}
          style={{
            fontSize: 11,
            color: "var(--mantine-color-dimmed, #9ca3af)",
            marginTop: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden style={{ display: "inline-flex" }}>
            <WrappedActivityIcon size={14} />
          </span>
          <span>{activityHints.displayName}</span>
          {isDynamic && (
            <Badge
              size="xs"
              variant="filled"
              color={isMissingFromCatalog ? "red" : "grape"}
              data-testid={
                isMissingFromCatalog
                  ? `canvas-node-${id}-deleted-pill`
                  : `canvas-node-${id}-dyn-pill`
              }
            >
              {isMissingFromCatalog ? "Deleted" : "DYN"}
            </Badge>
          )}
        </div>
        {isMissingFromCatalog && (
          <div
            data-testid={`poll-until-unregistered-${id}`}
            style={{
              fontSize: 10,
              color: "var(--mantine-color-dimmed, #9ca3af)",
              fontStyle: "italic",
              marginTop: 2,
            }}
          >
            {isDynamic ? "(deleted dynamic node)" : "Unregistered activity."}
          </div>
        )}
        <NodePreviewOverlay nodeId={id} producesOutput={false} />
        {/* Node-level handles FIRST in DOM order for their type — xyflow's
            default target resolution picks bounds[0], so a null-targetHandle
            edge must not land on the first per-port row dot. Same constraint
            `ActivityNodeRenderer` documents. */}
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
        {hasRows && (
          <PortRows
            nodeId={id}
            inputs={data.portRows.inputs}
            outputs={data.portRows.outputs}
            onOutputHandleEnter={data.onOutputHandleEnter}
            onOutputHandleLeave={data.onOutputHandleLeave}
            onInputHandleEnter={data.onInputHandleEnter}
            onInputHandleLeave={data.onInputHandleLeave}
          />
        )}
      </div>
    );
  },
);
PollUntilNodeRenderer.displayName = "PollUntilNodeRenderer";

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
          width: 180,
          height: 180,
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
            // The visual layer is rotated + scaled by 0.7071, which shrinks any
            // box-shadow spread by the same factor. The selected halo is drawn
            // deliberately large (and higher-opacity) so that AFTER scaling it
            // still reads as a clear diamond-shaped ring — a `2px` ring here
            // collapsed to ~1.4px at 20% opacity and looked unselected.
            boxShadow: selected
              ? `0 0 0 5px ${accent}80, 0 0 14px ${accent}66, 0 8px 20px rgba(0,0,0,0.30)`
              : "0 6px 12px rgba(0,0,0,0.18)",
            transform: "rotate(45deg) scale(0.7071)",
            transformOrigin: "50% 50%",
          }}
        />
        {/* Content layer (upright). Constrained to the inscribed square. */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            alignItems: "center",
            textAlign: "center",
            fontSize: 12,
            color: "var(--mantine-color-text, #f3f4f6)",
            maxWidth: 127,
            maxHeight: 127,
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
            <span
              data-testid={`switch-label-${id}`}
              style={{
                wordBreak: "break-word",
                textAlign: "center",
                maxWidth: 127,
              }}
            >
              {data.label}
            </span>
          </div>
          {data.isEntry ? (
            <div
              style={{
                fontSize: 10,
                color: "var(--mantine-color-dimmed, #9ca3af)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              entry
            </div>
          ) : null}
        </div>
        <ValidationBadge
          nodeId={id}
          errorCount={errorCount}
          warningCount={warningCount}
          onBadgeClick={data.onBadgeClick}
        />
        <NodeStatusBadgeOverlay nodeId={id} />
        <div
          data-testid={`switch-preview-anchor-${id}`}
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translate(-50%, 6px)",
            minWidth: 200,
            zIndex: 1,
          }}
        >
          <NodePreviewOverlay nodeId={id} producesOutput={false} />
        </div>
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
  pollUntil: PollUntilNodeRenderer,
  humanGate: ControlFlowRectangleRenderer,
  source: SourceNodeRenderer,
  "group-chip": GroupChipNode,
  "group-container": GroupContainerNode,
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
  onOutputHandleEnter:
    | ((
        nodeId: string,
        portName: string,
        anchor: { x: number; y: number },
      ) => void)
    | undefined;
  onOutputHandleLeave: (() => void) | undefined;
  onInputHandleEnter:
    | ((
        nodeId: string,
        portName: string,
        anchor: { x: number; y: number },
      ) => void)
    | undefined;
  onInputHandleLeave: (() => void) | undefined;
}

/**
 * Per-side projection shape consumed by the control-flow node renderers —
 * bundles the US-095 handle style with the US-096 pill entries. Activity
 * nodes render per-port rows instead (`computePortRows`), so this shape
 * only feeds `controlFlowNodeSides` today.
 */
interface SideProjection {
  handleStyle: HandleStyle;
  pillEntries: NodeTypePillEntry[];
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
  wires: readonly DerivedWire[],
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
          onBadgeClick: callbacks.onBadgeClick,
          errorPolicy: node.errorPolicy,
          onSourceHandleEnter: callbacks.onSourceHandleEnter,
          onSourceHandleLeave: callbacks.onSourceHandleLeave,
          onOutputHandleEnter: callbacks.onOutputHandleEnter,
          onOutputHandleLeave: callbacks.onOutputHandleLeave,
          onInputHandleEnter: callbacks.onInputHandleEnter,
          onInputHandleLeave: callbacks.onInputHandleLeave,
          portRows: computePortRows(config, node.id, wires),
          previewOutputs: computePreviewOutputs(config, node.id),
        },
      };
      return flowNode;
    }
    if (node.type === "pollUntil") {
      // G-016 — the one control-flow type that wraps a catalog activity
      // projects the activity's port rows too.
      const sides = controlFlowNodeSides();
      const flowNode: PollUntilFlowNode = {
        id: node.id,
        type: "pollUntil",
        position,
        selected: node.id === selectedNodeId,
        data: {
          label: node.label,
          controlFlowType: "pollUntil",
          activityType: node.activityType,
          isEntry,
          errorCount: 0,
          warningCount: 0,
          onBadgeClick: callbacks.onBadgeClick,
          errorPolicy: node.errorPolicy,
          onSourceHandleEnter: callbacks.onSourceHandleEnter,
          onSourceHandleLeave: callbacks.onSourceHandleLeave,
          onOutputHandleEnter: callbacks.onOutputHandleEnter,
          onOutputHandleLeave: callbacks.onOutputHandleLeave,
          onInputHandleEnter: callbacks.onInputHandleEnter,
          onInputHandleLeave: callbacks.onInputHandleLeave,
          inputHandleStyle: sides.input.handleStyle,
          outputHandleStyle: sides.output.handleStyle,
          inputPillEntries: sides.input.pillEntries,
          outputPillEntries: sides.output.pillEntries,
          portRows: computePortRows(config, node.id, wires),
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
        // G-031 — the badge needs the same deep-link callback every other
        // node type gets, or a source's issues would be visible but not
        // clickable.
        data: {
          ...(node as SourceNodeData),
          onBadgeClick: callbacks.onBadgeClick,
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

/**
 * xyflow class marking data wires. Paired with the
 * `.wb-editor-canvas .react-flow__edge.wb-data-wire` rule in
 * workflow-editor-canvas.css that re-enables pointer events — xyflow
 * treats unselectable, click-handler-less edges as `.inactive` and its
 * base stylesheet turns pointer events off, which would kill the
 * provenance hover tooltip.
 */
const DATA_WIRE_CLASS = "wb-data-wire";

/**
 * xyflow class applied to the node currently hover-highlighted from a
 * settings-panel input row (item 6X). Styled by the
 * `.wb-editor-canvas .react-flow__node.wb-node-highlight` rule in
 * workflow-editor-canvas.css. Applied via `className` (not per-renderer
 * data) so a single hook emphasises ANY node type uniformly.
 */
const HIGHLIGHT_CLASS = "wb-node-highlight";

/**
 * Returns `node` with `HIGHLIGHT_CLASS` toggled on its `className` to match
 * `shouldHighlight`, or the SAME reference when it already matches (so the
 * emphasis effect can skip a no-op state update). Preserves any other
 * classes xyflow / the projection stamped.
 */
function withHighlightClass<T extends { className?: string }>(
  node: T,
  shouldHighlight: boolean,
): T {
  const classes = (node.className ?? "").split(/\s+/).filter(Boolean);
  const has = classes.includes(HIGHLIGHT_CLASS);
  if (has === shouldHighlight) return node;
  const next = shouldHighlight
    ? [...classes, HIGHLIGHT_CLASS]
    : classes.filter((c) => c !== HIGHLIGHT_CLASS);
  return { ...node, className: next.join(" ") || undefined };
}

/**
 * True when `node`'s renderer actually mounts the bottom `error` source
 * handle — activity nodes and control-flow rectangles with
 * `errorPolicy.onError === "fallback"`. Switch nodes route via
 * cases/defaultEdge and source nodes carry no error policy, so neither
 * ever mounts one. Mirrors the render condition in
 * `ActivityNodeRenderer` / `NodeHandles`.
 *
 * Error edges whose source does NOT mount the handle exist in the wild
 * (hand-authored/API/agent configs — the validator checks fallback ⇒
 * edge, not the converse); stamping `sourceHandle: "error"` on them
 * would make xyflow drop the edge entirely (error008), so they fall
 * back to the node-level `out` handle. Same class of guard as
 * `rendersPerPortHandle`.
 */
function mountsErrorHandle(node: GraphNode | undefined): boolean {
  if (!node || node.type === "switch" || node.type === "source") return false;
  return node.errorPolicy?.onError === "fallback";
}

/**
 * Maps derived wires (PORT_WIRING_DESIGN.md §5) to xyflow edges — the
 * "one wire = data" projection.
 *
 *   - Data wires attach port-to-port when — and only when —
 *     `rendersPerPortHandle` says the endpoint actually mounts an
 *     `in-<port>` / `out-<port>` handle (`inputHandleId`/`outputHandleId`
 *     — the SAME formula the row renderer uses). Everything else
 *     (control-flow, source, `dyn.*`/catalog-less activities, stale
 *     bindings to undeclared ports) anchors at the node-level handles —
 *     pointing at a handle id that never mounts makes xyflow drop the
 *     edge entirely (error008), leaving the pair looking disconnected.
 *     Data wires are deletable + selectable (PORT_WIRING_DESIGN.md §6.3):
 *     deleting one does NOT remove a `config.edges` row — it disconnects
 *     the consumer's input binding and pins the port unbound, handled by
 *     `handleDelete` via `disconnectWires`. They stay hoverable via
 *     `DATA_WIRE_CLASS` regardless.
 *   - Structural wires keep the legacy edge projection: id = edge id,
 *     `graphEdge` + `sourceSwitch` data. Error wires anchor at the bottom
 *     `error` source handle (previously they silently defaulted to
 *     `out`). Stroke/dash are rendered by `WorkflowEdge` from the wire
 *     data; only the arrowhead marker colour lives here.
 */
function projectFlowWires(
  wires: readonly DerivedWire[],
  config: GraphWorkflowConfig,
): Edge[] {
  return wires.map((wire) => {
    if (wire.variant === "data") {
      const producerNode = config.nodes[wire.source];
      const peekProducerLabel = producerNode?.label ?? wire.source;
      const peekPortLabel =
        (producerNode?.type === "activity" || producerNode?.type === "pollUntil"
          ? getActivityCatalogEntry(producerNode.activityType)?.outputs.find(
              (o) => o.name === wire.sourcePort,
            )?.label
          : undefined) ?? wire.sourcePort;
      const data: WorkflowEdgeData = { wire, peekProducerLabel, peekPortLabel };
      return {
        id: wire.id,
        source: wire.source,
        target: wire.target,
        sourceHandle: rendersPerPortHandle(
          config,
          wire.source,
          wire.sourcePort,
          "output",
        )
          ? outputHandleId(wire.sourcePort)
          : "out",
        targetHandle: rendersPerPortHandle(
          config,
          wire.target,
          wire.targetPort,
          "input",
        )
          ? inputHandleId(wire.targetPort)
          : null,
        type: "workflow-edge",
        className: DATA_WIRE_CLASS,
        // Surfaces the provenance to assistive tech — the visual
        // affordance is the hover <title> inside WorkflowEdge.
        ariaLabel: wireTooltip(wire),
        data,
        deletable: true,
        selectable: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: dataWireStroke(wire.kind),
        },
      };
    }
    const edge = wire.edge;
    const sourceNode = config.nodes[edge.source];
    const sourceSwitch: SwitchNode | undefined =
      sourceNode?.type === "switch" ? sourceNode : undefined;
    const data: WorkflowEdgeData = { wire, graphEdge: edge, sourceSwitch };
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // Error wires spring from the bottom red `error` handle — but only
      // when the source actually mounts it (`mountsErrorHandle`); stray
      // error edges and every other structural wire use the node-level
      // `out` source handle (which is what xyflow's default resolution
      // picked implicitly before per-port handles existed).
      sourceHandle:
        edge.type === "error" && mountsErrorHandle(sourceNode)
          ? "error"
          : "out",
      targetHandle: null,
      type: "workflow-edge",
      data,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: getEdgeStrokeColor(edge.type),
      },
    };
  });
}

/**
 * Simplified-view (US-043) edge projection — unchanged edge-only shape.
 * Group chips have anonymous handles and the projected `visibleEdges`
 * may terminate at chip ids that don't exist in `config.nodes`, so the
 * wire projection doesn't apply here; data wires are not drawn while
 * the simplified toggle is ON. Error edges still anchor at the bottom
 * `error` handle when their source is a real (non-chip) node that
 * mounts it — `mountsErrorHandle` composes with the chip guard (chip
 * ids miss `config.nodes`, so the lookup yields `undefined`).
 */
function projectSimplifiedFlowEdges(
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
      ...(edge.type === "error" && mountsErrorHandle(sourceNode)
        ? { sourceHandle: "error" }
        : {}),
      type: "workflow-edge",
      data,
      markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor },
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
      memberNodeIds: chip.memberNodeIds,
    },
  }));
}

/**
 * W-1 — a copy of `node` whose `metadata.position` is where it sits in the
 * SIMPLIFIED view. The two views keep separate arrangements, and every
 * downstream projection reads `metadata.position`, so the substitution happens
 * once here rather than teaching each of them about a second field.
 */
function atSimplifiedPosition(node: GraphNode): GraphNode {
  return {
    ...node,
    metadata: {
      ...(node.metadata ?? {}),
      position: readSimplifiedNodePosition(node),
    },
  } as GraphNode;
}

/** Breathing room between the members' bounding box and the container's edge. */
const GROUP_CONTAINER_PAD = 40;

/**
 * The padded bounding box of `memberIds`, or `null` when not one of them has
 * been placed yet (nothing to draw a box around).
 *
 * `positionOf` is injected because the box has two callers with two sources of
 * truth: the projection reads authored positions out of the config, while a
 * drag in flight reads the LIVE xyflow positions so the box re-fits under the
 * cursor rather than a frame after the commit.
 */
function computeGroupBounds(
  memberIds: readonly string[],
  config: GraphWorkflowConfig,
  positionOf: (nodeId: string) => { x: number; y: number } | undefined,
): { x: number; y: number; width: number; height: number } | null {
  // Enclose each member's FULL footprint: `position` is the card's top-left,
  // so the box's right/bottom edge must reach `position + card size`. Using
  // per-node width/height (not a flat footprint) stops wide port-row cards —
  // e.g. a map body's exit `azureOcr.extract` — from spilling out of the box.
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const nodeId of memberIds) {
    const pos = positionOf(nodeId);
    if (!pos) continue;
    any = true;
    const w = estimateNodeWidth(config, nodeId);
    const h = estimateNodeHeight(config, nodeId);
    if (pos.x < left) left = pos.x;
    if (pos.y < top) top = pos.y;
    if (pos.x + w > right) right = pos.x + w;
    if (pos.y + h > bottom) bottom = pos.y + h;
  }
  if (!any) return null;
  return {
    x: left - GROUP_CONTAINER_PAD,
    y: top - GROUP_CONTAINER_PAD,
    width: right - left + GROUP_CONTAINER_PAD * 2,
    height: bottom - top + GROUP_CONTAINER_PAD * 2,
  };
}

/** Reads a node's authored position out of the config. */
function configPositionOf(
  config: GraphWorkflowConfig,
): (nodeId: string) => { x: number; y: number } | undefined {
  return (nodeId) =>
    (
      config.nodes[nodeId]?.metadata as
        | { position?: { x: number; y: number } }
        | undefined
    )?.position;
}

/**
 * G-1 — one container box per group, authored or synthetic. Size is the
 * bounding box of the members' positions (padded); the box is a projection of
 * `nodeIds`, so it follows its declared members wherever they go and never
 * captures a node that merely overlaps it.
 *
 * The two kinds differ only in what the header does and whether it drags:
 *   - authored group → header opens the group's settings and is the drag
 *     handle that carries every member (R-1).
 *   - map body → header selects the owning map node (decoded from the
 *     synthetic id), where the body entry/exit that define this box live, and
 *     does not drag: the body is derived from the map, not arranged as a unit.
 */
function projectGroupContainerNodes(
  groups: Record<string, NodeGroup>,
  config: GraphWorkflowConfig,
  onOpenGroup?: (groupId: string) => void,
  onSelectMapNode?: (nodeId: string) => void,
): GroupContainerFlowNode[] {
  const out: GroupContainerFlowNode[] = [];
  const positionOf = configPositionOf(config);
  for (const [groupId, group] of Object.entries(groups)) {
    const bounds = computeGroupBounds(group.nodeIds, config, positionOf);
    if (!bounds) continue;
    const synthetic = isSyntheticMapBodyGroupId(groupId);
    out.push({
      id: containerIdForGroup(groupId),
      type: "group-container",
      position: { x: bounds.x, y: bounds.y },
      data: {
        groupId,
        label: group.label,
        color: group.color,
        icon: synthetic ? undefined : group.icon,
        width: bounds.width,
        height: bounds.height,
        onOpen: synthetic
          ? () => onSelectMapNode?.(mapNodeIdFromSyntheticGroupId(groupId))
          : () => onOpenGroup?.(groupId),
      },
      // zIndex 0 (not -1) keeps the box ABOVE the canvas pane so its header
      // is clickable; it still renders behind member nodes because the
      // container nodes are prepended to the node array (earlier = lower in
      // the same stacking level). The box body is pointer-events:none, so
      // member-node clicks and canvas pans still pass through it.
      zIndex: 0,
      // Never selectable: the box is chrome for the group, and letting it into
      // xyflow's selection would put it in front of Delete and of the
      // "N selected" actions, neither of which means anything for a projection.
      selectable: false,
      draggable: !synthetic,
      // The header strip is the ONLY drag surface (R-1) — without this the
      // whole box would drag, and the box covers its members.
      ...(synthetic ? {} : { dragHandle: `.${GROUP_HEADER_CLASS}` }),
    });
  }
  return out;
}

/**
 * Re-fit every container box in `nodes` to where its members currently sit.
 *
 * Called on each drag tick: a member drag moves one card and the box must grow
 * or shrink around it live (the box is a projection of membership, so it has
 * no independent geometry to preserve), and a header drag moves the members
 * out from under a box xyflow is dragging by its own delta — recomputing from
 * the members keeps the two exactly in step instead of accumulating drift.
 */
function refitGroupContainers(
  nodes: readonly FlowNode[],
  config: GraphWorkflowConfig,
): FlowNode[] {
  const livePositions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) livePositions.set(n.id, n.position);
  const positionOf = (nodeId: string) => livePositions.get(nodeId);
  return nodes.map((n): FlowNode => {
    if (n.type !== "group-container") return n;
    const memberIds = config.nodeGroups?.[n.data.groupId]?.nodeIds;
    if (!memberIds) return n;
    const bounds = computeGroupBounds(memberIds, config, positionOf);
    if (!bounds) return n;
    if (
      n.position.x === bounds.x &&
      n.position.y === bounds.y &&
      n.data.width === bounds.width &&
      n.data.height === bounds.height
    ) {
      return n;
    }
    return {
      ...n,
      position: { x: bounds.x, y: bounds.y },
      data: { ...n.data, width: bounds.width, height: bounds.height },
    };
  });
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
        // §4.12: fold `errorPolicy` into the per-node signature so toggling
        // `onError: 'fallback'` re-projects and the bottom "error" source
        // handle appears/disappears immediately (the handle's presence is
        // derived from the error policy at projection time).
        // `pollUntil` is folded in with `activity` because it too renders
        // catalog-derived port rows (G-016) — its wrapped `activityType`
        // must be part of the signature or a re-wrap would leave the rows
        // (and their handle ids) stale behind the fingerprint gate.
        n.type === "activity" || n.type === "pollUntil"
          ? `${n.label}::${n.activityType}::${n.errorPolicy?.onError ?? ""}`
          : `${n.label}::${n.type}::${n.errorPolicy?.onError ?? ""}`,
      ]),
    ),
    // Wire-relevant state: input/output bindings, pinned-port locks, and
    // (for source nodes) the parameters that feed the producer index
    // (`source.upload`'s ctxKey, `source.api`'s fields). Without these a
    // binding edit in the settings rail would leave the derived wires +
    // port rows stale — the fingerprint gate would skip re-projection.
    bindings: Object.fromEntries(
      Object.entries(config.nodes).map(([id, n]) => [
        id,
        JSON.stringify({
          inputs: n.inputs ?? [],
          outputs: n.outputs ?? [],
          locked: getLockedInputPorts(n),
          sourceParams: n.type === "source" ? (n.parameters ?? {}) : undefined,
        }),
      ]),
    ),
    // Ctx declarations drive the "from <ctx>" chip on port rows — only
    // key presence matters today (`computePortRows` checks existence).
    // Revisit if rows ever read ctx VALUES (defaults, types): a value
    // edit under an unchanged key would then need to re-project too.
    ctxKeys: Object.keys(config.ctx).sort(),
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
  onGroupSelection,
  simplifiedView = false,
  onGroupChipClick,
  onSelectMapBodyNode,
  layoutNonce = 0,
  onFixNodeInput,
  highlightedNodeId = null,
  onUndo,
}: WorkflowEditorCanvasProps) {
  // Internal node state managed by xyflow — keeps dragging smooth. The
  // outer GraphWorkflowConfig is updated only on drag-stop / select /
  // delete, never per-mousemove.
  const [internalNodes, setInternalNodes, onInternalNodesChange] =
    useNodesState<FlowNode>([]);
  const [internalEdges, setInternalEdges, onInternalEdgesChange] =
    useEdgesState<Edge>([]);
  const reactFlow = useReactFlow();

  // Latest config for deferred handlers. The "Detach fully" toast action
  // (below) fires long after the toast was created, so closing over `config`
  // directly would drop any edits made in between; the handler reads the
  // current graph through this ref instead.
  const configRef = useRef(config);
  configRef.current = config;

  // Edge ids to auto-select on the NEXT edge projection. When the last data
  // wire on a pair is deleted, its normal edge only re-materialises as a
  // dashed sequence remainder after the disconnect re-projects — so we can't
  // select it in the current `internalEdges` (it isn't there yet). We stash
  // the surviving edge id here and the projection effect stamps `selected`
  // onto it once the remainder edge exists, so the next Delete removes it.
  const pendingEdgeSelectionRef = useRef<Set<string> | null>(null);

  // Auto-fit the viewport when nodes are added (US-014). Compares the
  // previous node-id set to the current one; new ids that weren't present
  // before are treated as additions and the viewport animates to bring
  // the addition into view. Drag, selection, and edge mutations don't
  // change the node-id set, so they don't trigger a re-fit.
  //
  // B-2 (2026-08-03) — "a new id appeared" is NOT the same as "the author added
  // a node". Undoing a delete re-adds the removed ids, which read here as an
  // addition and sent the single-node branch below into a hard zoom onto one
  // card: press Ctrl+Z and the canvas jumps somewhere else. `layoutNonce` is
  // what separates the two. The host bumps it on every undo/redo step and on
  // Auto-arrange, and on nothing else — and Auto-arrange only moves nodes, so a
  // bump landing together with a changed id-set means a history step restored
  // them. A restore keeps the viewport it was performed from; only an authored
  // add earns a fit. Its own ref, not `prevLayoutNonceRef`: the position-sync
  // effect below watches the same value, and whichever effect ran first would
  // otherwise swallow the change before the other saw it.
  const prevNodeIdsRef = useRef<Set<string> | null>(null);
  const prevFitNonceRef = useRef(layoutNonce);
  useEffect(() => {
    const currentIds = new Set(Object.keys(config.nodes));
    const prevIds = prevNodeIdsRef.current;
    prevNodeIdsRef.current = currentIds;
    const historyStepped = prevFitNonceRef.current !== layoutNonce;
    prevFitNonceRef.current = layoutNonce;
    // First mount — ReactFlow's `fitView` prop handles the initial layout.
    if (prevIds === null) return;
    if (historyStepped) return;
    const added: string[] = [];
    for (const id of currentIds) {
      if (!prevIds.has(id)) added.push(id);
    }
    if (added.length === 0) return;
    const options =
      added.length === 1
        ? {
            padding: 0.15,
            duration: 300,
            nodes: [{ id: added[0] }],
          }
        : { padding: 0.15, duration: 300 };
    // Defer one macrotask so xyflow's structural-projection effect (which
    // pushes the new node into the internal store) has finished running
    // before we ask it to fit the new node. A 0ms timeout is enough
    // because xyflow updates its internal store synchronously inside the
    // sibling effect on the same tick.
    const timer = setTimeout(() => {
      reactFlow.fitView(options);
    }, 0);
    return () => clearTimeout(timer);
  }, [config.nodes, reactFlow, layoutNonce]);

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

  // Wire derivation gate. `deriveWires` walks the upstream graph per
  // auto-bound port (see its performance note), so it must NOT rerun on
  // every config identity change — position-only drag-stops included.
  // Wires depend on the binding/node state (covered by `dataFingerprint`)
  // plus the edge structure (edge-id stamping + sequence classification),
  // which the structural fingerprint deliberately excludes — so fold the
  // FULL config's edge tuples in here (not `visibleEdges`: wires always
  // derive from the full config).
  const wireEdgesFingerprint = useMemo(
    () =>
      JSON.stringify(
        config.edges.map((e) => [e.id, e.source, e.target, e.type]),
      ),
    [config.edges],
  );

  // Derived ONCE per fingerprint change (ref-cached across config identity
  // churn) and shared by the node projection (port rows) and the edge
  // projection (wires → edges) so the graph walk never runs twice for one
  // change. Always derived from the FULL config so a wire from a
  // group-hidden producer still marks the visible consumer's port as
  // bound in simplified view.
  const wiresCacheRef = useRef<{
    key: string;
    wires: DerivedWire[];
  } | null>(null);
  const derivedWires = useMemo(() => {
    const key = `${dataFingerprint}::${wireEdgesFingerprint}`;
    const cached = wiresCacheRef.current;
    if (cached && cached.key === key) return cached.wires;
    const wires = deriveWires(config);
    wiresCacheRef.current = { key, wires };
    return wires;
  }, [dataFingerprint, wireEdgesFingerprint, config]);

  // Hover-to-extend (US-045) — debounced source-handle popover. See
  // use-hover-extend.ts. Picking a node stays here since it mutates the graph
  // (the hook owns only the open/close timer state + popover handlers).
  const {
    hoverExtend,
    handleSourceHandleEnter,
    handleSourceHandleLeave,
    handlePopoverEnter,
    handlePopoverLeave,
    openHoverExtendNow,
    closeHoverExtend,
  } = useHoverExtend();

  // §9 — per-port output-handle hover routes through the same debounced
  // opener as the node-level `out` handle, carrying the port name so the
  // popover can filter/rank by that port's kind.
  const handlePortOutputHandleEnter = useCallback(
    (nodeId: string, portName: string, anchor: { x: number; y: number }) => {
      handleSourceHandleEnter(nodeId, anchor, portName);
    },
    [handleSourceHandleEnter],
  );

  // UX walkthrough 2026-07-29 — the upstream mirror: hovering a typed
  // INPUT handle opens the same debounced popover, filtered to activities
  // that PRODUCE the port's kind ("you can build left-to-right but not
  // right-to-left" — now you can).
  const handlePortInputHandleEnter = useCallback(
    (nodeId: string, portName: string, anchor: { x: number; y: number }) => {
      handleSourceHandleEnter(nodeId, anchor, portName, "upstream");
    },
    [handleSourceHandleEnter],
  );

  const projectionCallbacks = useMemo<ProjectionCallbacks>(
    () => ({
      onBadgeClick: onNodeBadgeClick,
      onSourceHandleEnter: handleSourceHandleEnter,
      onSourceHandleLeave: handleSourceHandleLeave,
      onOutputHandleEnter: handlePortOutputHandleEnter,
      onOutputHandleLeave: handleSourceHandleLeave,
      onInputHandleEnter: handlePortInputHandleEnter,
      onInputHandleLeave: handleSourceHandleLeave,
    }),
    [
      onNodeBadgeClick,
      handleSourceHandleEnter,
      handleSourceHandleLeave,
      handlePortOutputHandleEnter,
      handlePortInputHandleEnter,
    ],
  );

  const lastFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastFingerprintRef.current === dataFingerprint) return;
    lastFingerprintRef.current = dataFingerprint;
    const wires = derivedWires;
    if (simplifiedView) {
      // Simplified projection: collapse each group into a chip; hide
      // grouped underlying nodes; remap edges. The chip projection adds
      // an extra pass on top of the standard FlowNode projection.
      const projected = projectGroupedConfig(config);
      const visibleConfig: GraphWorkflowConfig = {
        ...config,
        nodes: Object.fromEntries(
          projected.visibleNodes.map((n) => [n.id, atSimplifiedPosition(n)]),
        ),
      };
      const normalNodes = projectFlowNodes(
        visibleConfig,
        selectedNodeId,
        projectionCallbacks,
        wires,
      );
      const chipNodes = projectChipFlowNodes(projected.chips, selectedNodeId);
      setInternalNodes([...normalNodes, ...chipNodes]);
    } else {
      // G-1 — every group gets a container box, authored or synthetic. This
      // replaced the per-member dashed outline + hover label: one concept, one
      // rendering, and a surface the group can be grabbed by (R-1).
      const containerNodes = projectGroupContainerNodes(
        config.nodeGroups ?? {},
        config,
        onGroupChipClick,
        onSelectMapBodyNode,
      );
      const normalNodes = projectFlowNodes(
        config,
        selectedNodeId,
        projectionCallbacks,
        wires,
      );
      setInternalNodes([...containerNodes, ...normalNodes]);
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
    derivedWires,
    selectedNodeId,
    projectionCallbacks,
    setInternalNodes,
    simplifiedView,
    onGroupChipClick,
    onSelectMapBodyNode,
  ]);

  /**
   * Copies `source`'s `metadata.position` onto the rendered xyflow nodes,
   * bypassing the structural-fingerprint gate. That gate deliberately excludes
   * positions (§4.2) so a per-node drag doesn't re-project the whole canvas —
   * which also means a config-only position change (Auto-arrange, an undone
   * drag) would otherwise persist without anything on screen moving.
   *
   * Takes the config to read from rather than closing over the `config` prop:
   * the pane menu's Auto-arrange has the new layout in hand and must apply it
   * in the same tick, one render before that layout comes back as a prop.
   */
  const applyPositionsFromConfig = useCallback(
    (source: GraphWorkflowConfig) => {
      // Group container nodes aren't in `config.nodes`, so the position copy
      // below can't move OR resize them — their geometry is the bounding box of
      // the member positions that Auto-arrange just changed. Project them fresh
      // so each box tracks its members; otherwise it stays at the pre-arrange
      // bounds (displaced, no longer wrapping the group). Only REPLACES existing
      // container nodes — in simplified view (no containers) this is a no-op.
      const freshContainers = new Map(
        projectGroupContainerNodes(
          source.nodeGroups ?? {},
          source,
          onGroupChipClick,
          onSelectMapBodyNode,
        ).map((c) => [c.id, c] as const),
      );
      // G-4 — chips are the same kind of derived geometry: a chip sits at the
      // CENTROID of its members' positions, and it is not in `source.nodes`,
      // so the position copy below cannot reach it. Re-derive it. Without
      // this, a simplified-view Auto-arrange moves every member in the config
      // and the only thing on screen — the chips — stays exactly where it was,
      // which is the "nothing happened" bug from the author's side. Empty in
      // expanded view (no chips), same as the container map above.
      const freshChipPositions = new Map(
        projectGroupedConfig(source).chips.map(
          (chip) => [chip.id, chip.position] as const,
        ),
      );
      setInternalNodes((prev) =>
        prev.map((n): FlowNode => {
          const fresh = freshContainers.get(n.id);
          if (fresh) return fresh;
          const chipPosition = freshChipPositions.get(n.id);
          if (chipPosition) return { ...n, position: { ...chipPosition } };
          const node = source.nodes[n.id];
          if (!node) return n;
          // W-1 — read the arrangement belonging to the view on screen.
          const pos = simplifiedView
            ? readSimplifiedNodePosition(node)
            : ((node.metadata as { position?: { x: number; y: number } })
                ?.position ?? null);
          return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
        }),
      );
    },
    [onGroupChipClick, onSelectMapBodyNode, setInternalNodes, simplifiedView],
  );

  // Auto-arrange position sync (§4.2). The host bumps `layoutNonce` after a
  // position-only change it made itself (its own Auto-arrange, undo/redo of a
  // layout step); re-apply the config's positions here. Skips the initial mount
  // (no diff on first render).
  const prevLayoutNonceRef = useRef(layoutNonce);
  useEffect(() => {
    if (prevLayoutNonceRef.current === layoutNonce) return;
    prevLayoutNonceRef.current = layoutNonce;
    applyPositionsFromConfig(config);
  }, [layoutNonce, config, applyPositionsFromConfig]);

  // Validation badge sync — patches data.errorCount / data.warningCount
  // on existing internal nodes whenever the validation results change.
  // Kept separate from the structural projection above so that the
  // 300ms-debounced validator doesn't trigger a full re-projection.
  useEffect(() => {
    if (!errorsByNode) return;
    setInternalNodes((prev) =>
      prev.map((n): FlowNode => {
        // Group container boxes are background-only chrome — their members
        // carry their own badges, and (unlike a chip) those members are all on
        // screen, so there is nothing to roll up.
        if (n.type === "group-container") return n;

        // G-031 — a chip COLLAPSES its members, so the members' badges leave
        // the canvas with them. Rolling their counts onto the chip is what
        // stops the top bar reading "N issues" while simplified view shows
        // nothing marked anywhere. (The chip already aggregates run status
        // this way; validation was the missing axis.)
        const countedIds =
          n.type === "group-chip"
            ? ((n.data as GroupChipNodeData).memberNodeIds ?? [])
            : [n.id];
        let errorCount = 0;
        let warningCount = 0;
        for (const id of countedIds) {
          for (const err of errorsByNode.get(id) ?? []) {
            if (err.severity === "error") errorCount += 1;
            else warningCount += 1;
          }
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
        if (n.type === "pollUntil") {
          const updated: PollUntilFlowNode = {
            ...n,
            data: { ...n.data, errorCount, warningCount },
          };
          return updated;
        }
        // G-031 — source nodes carry ERROR-severity rules
        // (`nodes.<id>.sourceType`, `nodes.<id>.parameters<suffix>`) that
        // reached the drawer and the top-bar count with nothing on the card.
        if (n.type === "source") {
          const updated: SourceFlowNode = {
            ...n,
            data: { ...n.data, errorCount, warningCount },
          };
          return updated;
        }
        if (n.type === "group-chip") {
          const updated: GroupChipFlowNode = {
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

  // Item 6X — hover-highlight sync. Patches ONLY the `wb-node-highlight`
  // class on the matching node (and strips it from any previously-highlighted
  // one) whenever `highlightedNodeId` changes. Kept separate from the
  // structural projection so a hover doesn't trigger a full re-derive/re-
  // project; `withHighlightClass` returns the same reference when a node
  // already matches, so unaffected nodes are untouched and, when nothing
  // changed at all, the setter returns `prev` to avoid a wasted render.
  useEffect(() => {
    setInternalNodes((prev) => {
      let changed = false;
      const next = prev.map((n): FlowNode => {
        const patched = withHighlightClass(n, n.id === highlightedNodeId);
        if (patched !== n) changed = true;
        return patched;
      });
      return changed ? next : prev;
    });
  }, [highlightedNodeId, setInternalNodes]);

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
        visibleEdges.map((e) => {
          const src = config.nodes[e.source];
          // §4.9: conditional-edge labels are read from the source switch
          // node's cases (condition text, order, default) at projection time
          // and snapshotted into the edge's `sourceSwitch` data. Editing a
          // case must re-project the edges, so fold the switch's case
          // structure into the fingerprint — otherwise the label stays stale
          // until an edge is added/removed.
          const switchSig =
            src?.type === "switch"
              ? JSON.stringify({
                  cases: src.cases,
                  defaultEdge: src.defaultEdge,
                })
              : "";
          return `${e.id}|${e.source}|${e.target}|${e.type}|${switchSig}`;
        }),
      ),
    [visibleEdges, config.nodes],
  );
  // The wire→edge projection depends on BOTH fingerprints: the edge set +
  // switch cases (`edgesFingerprint`) and the binding/ctx state folded into
  // `dataFingerprint` — a binding edit re-routes data wires even when
  // `config.edges` is untouched.
  const lastEdgesFingerprintRef = useRef<string | null>(null);
  useEffect(() => {
    const combinedFingerprint = `${dataFingerprint}::${edgesFingerprint}`;
    if (lastEdgesFingerprintRef.current === combinedFingerprint) return;
    lastEdgesFingerprintRef.current = combinedFingerprint;
    const projected = simplifiedView
      ? projectSimplifiedFlowEdges(visibleEdges, config)
      : projectFlowWires(derivedWires, config);
    // Apply a one-shot auto-selection queued by a data-wire disconnect that
    // left a sequence remainder (see `disconnectWires`). Deselect everything
    // else so the next Delete/Backspace targets only the survivor(s).
    const pending = pendingEdgeSelectionRef.current;
    if (pending) {
      pendingEdgeSelectionRef.current = null;
      setInternalEdges(
        projected.map((e) => ({ ...e, selected: pending.has(e.id) })),
      );
      return;
    }
    setInternalEdges(projected);
  }, [
    dataFingerprint,
    edgesFingerprint,
    visibleEdges,
    config,
    derivedWires,
    simplifiedView,
    setInternalEdges,
  ]);

  // ---------------------------------------------------------------------------
  // Active-edge animation (US-139)
  //   Re-derives the set of "currently flowing" edge ids whenever the
  //   live status map shifts (the polling hook in `RunStateContext`
  //   pushes a new map every ~1.5s while a Try executes) and patches
  //   each xyflow edge's `data.isActive` flag + top-level `animated`
  //   prop accordingly. Kept separate from the structural edges effect
  //   above so a status tick doesn't trigger a full re-projection.
  //
  //   Soft-fails when no `<RunStateProvider>` is mounted — e.g. legacy
  //   unit tests that exercise the canvas in isolation get an empty
  //   active set so every edge renders with its Phase 1B styling.
  // ---------------------------------------------------------------------------
  const runState = useOptionalRunState();
  const nodeStatuses = runState?.nodeStatuses;
  const activeEdges = useMemo(
    () => computeActiveEdges(config, nodeStatuses ?? {}),
    [config, nodeStatuses],
  );
  // G-014 — the path the run actually took. Independent of `activeEdges`:
  // a replayed run has nothing running so `activeEdges` is empty by
  // definition, which is exactly why no path was ever shown for a finished
  // run before.
  const takenEdges = useMemo(
    () => computeTakenEdges(config, nodeStatuses ?? {}),
    [config, nodeStatuses],
  );
  useEffect(() => {
    setInternalEdges((prev) =>
      prev.map((e): Edge => {
        const prevData = (e.data ?? {}) as WorkflowEdgeData;
        // Structural wires keep the underlying edge id, so they match the
        // active set directly. Data wires carry `wire:` ids — they are
        // active when the normal edge stamped onto them (`edgeId`) is.
        const wire = prevData.wire;
        const matches = (set: Set<string>) =>
          wire?.variant === "data"
            ? wire.edgeId !== undefined && set.has(wire.edgeId)
            : set.has(e.id);
        const isActive = matches(activeEdges);
        const isTaken = matches(takenEdges);
        const prevIsActive = prevData.isActive === true;
        const prevIsTaken = prevData.isTaken === true;
        if (
          prevIsActive === isActive &&
          prevIsTaken === isTaken &&
          e.animated === isActive
        ) {
          return e;
        }
        const nextData: WorkflowEdgeData = { ...prevData, isActive, isTaken };
        return { ...e, data: nextData, animated: isActive };
      }),
    );
  }, [activeEdges, takenEdges, setInternalEdges]);

  // Persist final positions to the outer config once the drag finishes.
  /**
   * G-060 — persists EVERY node the gesture moved, not just the one under the
   * cursor.
   *
   * xyflow hands `onNodeDragStop` three arguments; the third is the full set of
   * dragged nodes, and a multi-selection drag moves all of them. Reading only
   * the second meant the other members moved on screen, were never written to
   * the config, and snapped back on the next structural re-project or reload —
   * a silent loss of work with no error anywhere.
   *
   * `dragged` is defaulted rather than assumed: the mocked xyflow harness used
   * in tests calls the handler with two arguments.
   */
  /**
   * R-1 — what a HEADER drag in progress must carry along. Captured at drag
   * start, applied on every tick, consumed and cleared at drag stop. A ref
   * (not state) because it changes many times per gesture and nothing renders
   * from it.
   *
   * Null for every other drag: a member's drag moves that member alone, which
   * is what makes rearranging a node inside its own group possible.
   */
  const groupDragCohortRef = useRef<GroupDragCohort | null>(null);

  /**
   * The gesture is a group move when — and only when — the node under the
   * cursor IS a group's container box. xyflow only starts that drag from the
   * header strip (`dragHandle`), so "the pointer is on the header" and "the
   * dragged node is the container" are the same fact, and no geometry has to
   * be guessed. Everything else (including a member of that very group) drags
   * alone.
   */
  const handleNodeDragStart = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const groupId = groupIdFromContainerId(node.id);
      groupDragCohortRef.current = groupId
        ? captureGroupDragCohort(config, groupId, node.id, node.position)
        : null;
    },
    [config],
  );

  /**
   * Live geometry during a drag:
   *   - header drag → every member moves by the box's delta, so the group
   *     holds its shape while it travels rather than snapping into place at
   *     the end;
   *   - member drag → nothing rides along, and the box re-fits around the new
   *     bounding box on every tick.
   *
   * This writes straight to the canvas's own node state — xyflow is controlled
   * here, so that state is what renders. Selection is untouched on purpose
   * (see group-drag-cohesion.ts): clicking a member still selects only that
   * member, and the settings panel still edits only that member.
   */
  const handleNodeDrag = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const cohort = groupDragCohortRef.current;
      const moves =
        cohort && cohort.anchorId === node.id
          ? applyGroupDragDelta(cohort, node.position)
          : null;
      setInternalNodes((prev) =>
        refitGroupContainers(
          prev.map((n): FlowNode => {
            // The dragged node's live position is folded in explicitly rather
            // than left to xyflow's own change stream: the box must re-fit
            // against where the pointer is NOW, not one commit behind.
            if (n.id === node.id) {
              return n.position.x === node.position.x &&
                n.position.y === node.position.y
                ? n
                : { ...n, position: { ...node.position } };
            }
            const at = moves?.get(n.id);
            return at ? { ...n, position: at } : n;
          }),
          config,
        ),
      );
    },
    [config, setInternalNodes],
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node, dragged?: Node[]) => {
      const xyflowMoved = dragged?.length ? dragged : [node];

      // Fold the members a header drag carried into the same commit as the
      // nodes xyflow moved itself, so one gesture is one config write (and one
      // undo step) however many nodes it displaced.
      const cohort = groupDragCohortRef.current;
      groupDragCohortRef.current = null;
      const carried: Node[] =
        cohort && cohort.anchorId === node.id
          ? [...applyGroupDragDelta(cohort, node.position)].map(
              ([id, position]): Node => ({ id, position, data: {} }),
            )
          : [];
      const moved =
        carried.length > 0 ? [...xyflowMoved, ...carried] : xyflowMoved;

      // Build the position-updated node while preserving the
      // discriminated-union narrowing. Each branch produces the same
      // shape with a fresh position.
      //
      // W-1 — which position depends on the view: the simplified canvas keeps
      // an arrangement of its own, so a drag there writes
      // `metadata.simplifiedPosition` and leaves the expanded layout alone.
      const positionField = simplifiedView ? "simplifiedPosition" : "position";
      const withPosition = (n: GraphNode, at: XYPosition): GraphNode => ({
        ...n,
        metadata: { ...n.metadata, [positionField]: { x: at.x, y: at.y } },
      });

      const nextNodes = { ...config.nodes };
      let changed = false;
      for (const flowNode of moved) {
        // Chips and group container boxes can ride along in the dragged set —
        // a header drag IS a drag of the box — and neither is a graph node, so
        // neither has a position to persist.
        const existing = config.nodes[flowNode.id];
        if (!existing) continue;
        // Compare against the field this view owns — in simplified view a node
        // whose drag ended on its EXPANDED coordinates has still moved.
        const prevPos = (
          existing.metadata as
            | Record<string, { x?: number; y?: number } | undefined>
            | undefined
        )?.[positionField];
        if (
          prevPos?.x === flowNode.position.x &&
          prevPos?.y === flowNode.position.y
        ) {
          continue;
        }
        let updated: GraphNode;
        switch (existing.type) {
          case "activity":
            updated = withPosition(existing, flowNode.position) as ActivityNode;
            break;
          case "switch":
          case "map":
          case "join":
          case "childWorkflow":
          case "pollUntil":
          case "humanGate":
            updated = withPosition(existing, flowNode.position);
            break;
          case "source":
            updated = withPosition(existing, flowNode.position) as SourceNode;
            break;
          default: {
            const exhaustive: never = existing;
            throw new Error(
              `handleNodeDragStop: unsupported node type "${String(exhaustive)}"`,
            );
          }
        }
        nextNodes[flowNode.id] = updated;
        changed = true;
      }
      if (!changed) return;

      const nextConfig = { ...config, nodes: nextNodes };

      // Land every box on the gesture's final geometry. `handleNodeDrag` has
      // usually done this already, but not when a drag produced no tick (a
      // programmatic move, or a flick short enough to go start→stop), and the
      // box must never be left wrapping where the members used to be.
      const finalPositions = new Map(
        moved.map((n) => [n.id, n.position] as const),
      );
      setInternalNodes((prev) =>
        refitGroupContainers(
          prev.map((n): FlowNode => {
            const at = finalPositions.get(n.id);
            return at ? { ...n, position: { x: at.x, y: at.y } } : n;
          }),
          nextConfig,
        ),
      );

      // Bump the fingerprint ref forward by hand so the structural sync
      // useEffect doesn't immediately re-project the nodes and stamp
      // over the local drag commit.
      lastFingerprintRef.current = buildStructuralFingerprint(
        nextConfig,
        simplifiedView,
      );
      onConfigChange(nextConfig);
    },
    [config, onConfigChange, setInternalNodes, simplifiedView],
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
      const realNodeIds = nodes
        .filter((n) => groupIdFromChipId(n.id) === null)
        .map((n) => n.id);
      // W-3 — the context menu needs to know what is selected. A ref, not
      // state: it is read inside an event handler and nothing renders from it,
      // so storing it in state would re-render the canvas on every click.
      selectedNodeIdsRef.current = realNodeIds;
      if (onSelectionChangeMany) {
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
      onConfigChange(removeNodesFromConfig(config, removedIds));
      if (selectedNodeId && removedIds.has(selectedNodeId)) {
        onSelectNode(null);
      }
      // G-002: name the ctx variables this delete just orphaned, with an Undo.
      // Described against the PRE-delete `config`, which still has the writers.
      if (onUndo) showOrphanedDeleteToast(config, removedIds, onUndo);
    },
    [config, onConfigChange, onSelectNode, selectedNodeId, onUndo],
  );

  /**
   * §6.3 — disconnect data wires (pinned unbound) + one-shot hint when the
   * pair's normal edge survives as a dashed sequence remainder. Invoked
   * from the unified `handleDelete` pass and from the wire context menu's
   * "Disconnect" entry (§7); callers must pre-filter to SURVIVOR wires only
   * (both endpoints still in the graph) — the context menu's single wire
   * trivially satisfies this since no nodes are being deleted.
   */
  /**
   * Removes surviving execution edge(s) from the LATEST config in one click —
   * the "Detach fully" toast action. Reads `configRef` (not the closed-over
   * `config`) because the toast fires after later edits may have landed, then
   * dismisses its own toast by fixed id.
   */
  const handleDetachFully = useCallback(
    (edgeIds: ReadonlySet<string>) => {
      const current = configRef.current;
      const remaining = current.edges.filter((e) => !edgeIds.has(e.id));
      if (remaining.length !== current.edges.length) {
        // G-029 — a detached edge may still be named by a switch case, a
        // switch default, a gate fallback or an errorPolicy fallback.
        onConfigChange(pruneEdgeReferences({ ...current, edges: remaining }));
      }
      notifications.hide(DETACH_FULLY_TOAST_ID);
    },
    [onConfigChange],
  );

  const disconnectWires = useCallback(
    (wires: DataWire[], base: GraphWorkflowConfig): GraphWorkflowConfig => {
      let next = base;
      for (const wire of wires) {
        next = disconnectDataWire(next, wire.target, wire.targetPort);
      }
      // For every deleted wire that removed the LAST data wire on its pair,
      // collect the surviving normal (execution) edge — it re-renders as a
      // dashed sequence remainder. `base.edges` still holds it since a
      // data-wire delete never touches `config.edges`.
      const survivingEdgeIds = new Set<string>();
      for (const wire of wires) {
        if (wire.edgeId === undefined) continue; // no edge → no remainder
        // Pre-delete wires between the pair vs how many of them were just
        // deleted: equal counts mean the LAST data wire on this pair went.
        const pairWiresBefore = derivedWires.filter(
          (w): w is DataWire =>
            w.variant === "data" &&
            w.source === wire.source &&
            w.target === wire.target,
        ).length;
        const deletedFromPair = wires.filter(
          (d) => d.source === wire.source && d.target === wire.target,
        ).length;
        if (pairWiresBefore !== deletedFromPair) continue; // a wire survives
        const executionEdge =
          base.edges.find(
            (e) =>
              e.source === wire.source &&
              e.target === wire.target &&
              e.type === "normal",
          ) ??
          base.edges.find(
            (e) => e.source === wire.source && e.target === wire.target,
          );
        if (executionEdge) survivingEdgeIds.add(executionEdge.id);
      }
      if (survivingEdgeIds.size > 0) {
        // Auto-select the surviving edge(s) once they re-project as dashed
        // remainders, so a second Delete/Backspace detaches them with no
        // manual click.
        pendingEdgeSelectionRef.current = survivingEdgeIds;
        // Deliberately grey + 6s (vs the codebase's red/green/blue 3s
        // norm): this is a passive "here's why the arrow stayed" hint,
        // not a success/failure verdict, and readers need time to spot
        // the dashed wire it refers to. The inline "Detach fully" action
        // removes those same edge(s) in one click.
        notifications.show({
          id: DETACH_FULLY_TOAST_ID,
          message: (
            <>
              Execution order kept — delete the dashed wire to fully detach.{" "}
              <Anchor
                component="button"
                type="button"
                onClick={() => handleDetachFully(survivingEdgeIds)}
              >
                Detach fully
              </Anchor>
            </>
          ),
          color: "gray",
          autoClose: 6000,
        });
      }
      return next;
    },
    [derivedWires, handleDetachFully],
  );

  /**
   * Item 6 (UX walkthrough) — delete a group as a unit, from the
   * collapsed chip.
   *
   * This is the one place full Figma semantics apply. Collapsed, the chip IS
   * the object: there is nothing else on screen to mean, so "delete this" can
   * only mean the group and the steps folded into it. Expanded, the same
   * gesture on a member means only that member — deleting three real pipeline
   * steps because one was selected is destructive out of proportion to the
   * click.
   *
   * The confirm names the step count for exactly that reason: it is the
   * difference between this and every other delete on the canvas.
   */
  const confirmDeleteGroupUnit = useCallback(
    (groupId: string) => {
      const current = configRef.current;
      const group = current.nodeGroups?.[groupId];
      if (!group) return;
      const memberIds = group.nodeIds.filter((id) => current.nodes[id]);
      const count = memberIds.length;
      const stepWord = count === 1 ? "step" : "steps";
      modals.openConfirmModal({
        title: `Delete "${group.label}" and its ${count} ${stepWord}?`,
        children: (
          <Text size="sm">
            The group and the {count} {stepWord} inside it are removed from the
            workflow. To keep the steps and drop only the grouping, cancel and
            use <strong>Ungroup</strong> instead. This is undoable.
          </Text>
        ),
        labels: {
          confirm: `Delete group and ${count} ${stepWord}`,
          cancel: "Cancel",
        },
        confirmProps: {
          color: "red",
          "data-testid": "delete-group-unit-confirm",
        },
        cancelProps: { "data-testid": "delete-group-unit-cancel" },
        onConfirm: () => {
          const at = configRef.current;
          const removedIds = new Set(memberIds);
          // Removing every member prunes the (now empty) group entry too —
          // see pruneNodesFromGroups — so the grouping needs no separate
          // delete here.
          onConfigChange(removeNodesFromConfig(at, removedIds));
          if (selectedNodeId && removedIds.has(selectedNodeId)) {
            onSelectNode(null);
          }
          // Same orphaned-variable accounting as any other delete (G-002),
          // described against the pre-delete config.
          if (onUndo) showOrphanedDeleteToast(at, removedIds, onUndo);
        },
      });
    },
    [onConfigChange, onSelectNode, selectedNodeId, onUndo],
  );

  /**
   * Runs BEFORE xyflow removes anything, which is the only point a chip
   * delete can be diverted: by the time `onDelete` fires the chip is already
   * out of xyflow's store, so a confirm there would leave the canvas showing
   * a deletion the author had not agreed to yet.
   *
   * Chips are vetoed and routed to `confirmDeleteGroupUnit`; everything else
   * in the same gesture proceeds untouched.
   *
   * B-1 (2026-08-03) — the chip's WIRES have to be vetoed with it. xyflow
   * sweeps every edge incident to a deleted node into `edges` here, so
   * returning that list untouched cut the chip's connections immediately: ahead
   * of the confirm, and unrecoverably if the author cancelled. Holding them back
   * also collapses the confirm path to a single `onConfigChange` (the edge cut
   * used to be a separate write through `handleDelete`), so restoring a
   * confirmed group delete costs one Ctrl+Z rather than two.
   */
  const handleBeforeDelete = useCallback(
    async ({
      nodes: toDelete,
      edges: edgesToDelete,
    }: {
      nodes: FlowNode[];
      edges: Edge[];
    }) => {
      const chips = toDelete.filter((n) => groupIdFromChipId(n.id) !== null);
      if (chips.length === 0) return true;
      for (const chip of chips) {
        const groupId = groupIdFromChipId(chip.id);
        if (groupId) confirmDeleteGroupUnit(groupId);
      }
      const rest = toDelete.filter((n) => groupIdFromChipId(n.id) === null);
      // Every edge touching a vetoed chip becomes the confirm's business:
      // `removeNodesFromConfig` drops the members' edges as collateral of the
      // member removal, in the same write.
      const chipIds = new Set(chips.map((c) => c.id));
      const restEdges = edgesToDelete.filter(
        (e) => !chipIds.has(e.source) && !chipIds.has(e.target),
      );
      if (rest.length === 0 && restEdges.length === 0) return false;
      return { nodes: rest, edges: restEdges };
    },
    [confirmDeleteGroupUnit],
  );

  /**
   * Unified deletion handler — xyflow's `onDelete` fires ONCE per delete
   * gesture with everything removed (selected elements plus the swept-in
   * edges connected to deleted nodes), unlike the `onNodesDelete` /
   * `onEdgesDelete` pair which fire back-to-back in the same tick and,
   * each emitting a full config, let the second call clobber the first
   * (lost update). One pass, one `onConfigChange`:
   *
   *   - node removal reuses `removeNodesFromConfig` (shared with the
   *     context menu's `handleNodesDelete`);
   *   - structural wires are dropped from `config.edges` by id;
   *   - data wires split by why they're here: swept in because an
   *     endpoint node died → vanish with the node, no §6.3 disconnect
   *     and no hint; deleted directly with both endpoints surviving →
   *     routed through `disconnectWires` (pinned unbound + hint).
   *
   * `handleBeforeDelete` runs first and is the gesture's only veto point:
   * xyflow removes elements from its store BEFORE firing `onDelete`, so
   * anything that can still be refused has to be refused there. It exists for
   * exactly one case now — a collapsed group chip, whose delete takes real
   * pipeline steps with it and therefore asks first (item 6). Ordinary node and
   * wire deletes are reversible (G-003), nothing asks about them, and they
   * arrive here already approved.
   */
  const handleDelete = useCallback(
    ({
      nodes: deletedNodes,
      edges: deletedEdges,
    }: {
      nodes: Node[];
      edges: Edge[];
    }) => {
      if (deletedNodes.length === 0 && deletedEdges.length === 0) return;

      // Item 6 (2026-08-02) — chips never reach this pass any more:
      // `handleBeforeDelete` intercepts them and routes each to its own
      // confirm, because deleting a group as a unit takes real pipeline steps
      // with it. Anything still carrying a chip id here would be a bug, so
      // filter defensively rather than letting it fall through to
      // `removeNodesFromConfig`, where it would match nothing.
      const realDeletedNodes = deletedNodes.filter(
        (n) => groupIdFromChipId(n.id) === null,
      );
      if (realDeletedNodes.length === 0 && deletedEdges.length === 0) return;

      const removedNodeIds = new Set(realDeletedNodes.map((n) => n.id));
      const survivorDataWires: DataWire[] = [];
      const removedEdgeIds = new Set<string>();
      for (const e of deletedEdges) {
        const wire = (e.data as WorkflowEdgeData | undefined)?.wire;
        if (wire?.variant === "data") {
          if (
            !removedNodeIds.has(wire.source) &&
            !removedNodeIds.has(wire.target)
          ) {
            survivorDataWires.push(wire);
          }
        } else {
          removedEdgeIds.add(e.id);
        }
      }
      let next = config;
      if (removedNodeIds.size > 0) {
        next = removeNodesFromConfig(next, removedNodeIds);
      }
      if (removedEdgeIds.size > 0) {
        // G-029 — this pass strips edges AFTER `removeNodesFromConfig` already
        // swept, so the control-flow references have to be swept again.
        next = pruneEdgeReferences({
          ...next,
          edges: next.edges.filter((e) => !removedEdgeIds.has(e.id)),
        });
      }
      next = disconnectWires(survivorDataWires, next);
      if (next !== config) onConfigChange(next);
      if (selectedNodeId && removedNodeIds.has(selectedNodeId)) {
        onSelectNode(null);
      }
      // ONE toast per gesture, whatever the selection size — the counts inside
      // `describeOrphanedDelete` already roll up across every removed node, so
      // a three-node delete reports once rather than three times.
      if (onUndo && removedNodeIds.size > 0) {
        showOrphanedDeleteToast(config, removedNodeIds, onUndo);
      }
    },
    [
      config,
      onConfigChange,
      disconnectWires,
      onSelectNode,
      selectedNodeId,
      onUndo,
    ],
  );

  // ---------------------------------------------------------------------------
  // Wire right-click context menu (Task 5, §7): "Disconnect" / "Revert to
  // automatic". Only opened for data wires — structural (sequence /
  // conditional / error) wires keep the browser's native context menu.
  // ---------------------------------------------------------------------------

  const [wireMenu, setWireMenu] = useState<{
    wire: DataWire;
    x: number;
    y: number;
  } | null>(null);

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      const wire = (edge.data as WorkflowEdgeData | undefined)?.wire;
      if (wire?.variant !== "data") return; // structural edges keep native behavior
      event.preventDefault();
      setWireMenu({ wire, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const closeWireMenu = useCallback(() => setWireMenu(null), []);

  const handleWireDisconnect = useCallback(
    (wire: DataWire) => {
      const next = disconnectWires([wire], config);
      if (next !== config) onConfigChange(next);
    },
    [config, onConfigChange, disconnectWires],
  );

  const handleWireRevert = useCallback(
    (wire: DataWire) => {
      const next = revertPortToAutomatic(config, wire.target, wire.targetPort);
      if (next !== config) onConfigChange(next);
    },
    [config, onConfigChange],
  );

  const handleWireViewData = useCallback(
    (wire: DataWire) => {
      setInternalEdges((eds) =>
        eds.map((e) => ({ ...e, selected: e.id === wire.id })),
      );
    },
    [setInternalEdges],
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
    activityType?: string;
    /** W-3 — nodes selected when the menu opened; 1 means "just this one". */
    selectionCount: number;
    x: number;
    y: number;
  } | null>(null);

  // Phase 6 (US-183): the in-situ Edit-script modal — opened by right-clicking
  // a dyn.* node on the canvas; mounts the DynamicNodeEditor scoped to that
  // node's slug. The same editor component is used at /dynamic-nodes/:slug
  // full-page (US-181).
  const [editScriptSlug, setEditScriptSlug] = useState<string | null>(null);

  /**
   * W-3 — the ids xyflow currently has selected, graph nodes only. Kept so the
   * right-click menu can act on the SELECTION rather than on the one node the
   * cursor happens to be over.
   */
  const selectedNodeIdsRef = useRef<string[]>([]);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Suppress the browser's native right-click menu so the workflow
      // menu can sit on top without competition.
      event.preventDefault();
      const graphNode = config.nodes[node.id];
      if (!graphNode) return;
      // W-3 — the menu acts on the selection only when the node under the
      // cursor is IN it. Right-clicking outside the selection resets it to
      // that node, which is what every other canvas does and stops the menu
      // from offering to delete nodes the author is no longer pointing at.
      const selected = selectedNodeIdsRef.current;
      const inSelection = selected.includes(node.id);
      if (!inSelection && selected.length > 0) {
        selectedNodeIdsRef.current = [node.id];
        reactFlow.setNodes((ns) =>
          ns.map((n) =>
            n.selected === (n.id === node.id)
              ? n
              : { ...n, selected: n.id === node.id },
          ),
        );
      }
      setContextMenu({
        nodeId: node.id,
        nodeType: graphNode.type,
        activityType:
          graphNode.type === "activity"
            ? (graphNode as ActivityNode).activityType
            : undefined,
        selectionCount: inSelection ? selected.length : 1,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [config.nodes, reactFlow],
  );

  /**
   * W-3 — removes every selected node in ONE config write, so the whole
   * gesture is a single undo step. Routed through `handleNodesDelete` for the
   * same reason the single-node entry is: orphan warnings, ctx cleanup and the
   * keyboard path all live there.
   */
  const deleteSelectionFromContextMenu = useCallback(() => {
    const ids = selectedNodeIdsRef.current.filter((id) => config.nodes[id]);
    if (ids.length === 0) return;
    handleNodesDelete(
      ids.map((id) => ({ id, data: {}, position: { x: 0, y: 0 } })),
    );
  }, [config.nodes, handleNodesDelete]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  /**
   * Wires the context menu's "Delete node" entry into `handleNodesDelete`,
   * which shares `removeNodesFromConfig` with the keyboard-delete path
   * (`handleDelete`) so both flows remove nodes identically.
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
   * UX walkthrough 2026-07-29 — the user group containing the
   * context-menu node, when it belongs to one. Drives the menu's
   * "Ungroup" entry so ungrouping is reachable from the canvas (the only
   * paths before were undo and the right-rail group settings).
   */
  const contextMenuGroup = useMemo(() => {
    if (!contextMenu) return null;
    for (const [gid, group] of Object.entries(config.nodeGroups ?? {})) {
      if (isSyntheticMapBodyGroupId(gid)) continue;
      if (group.nodeIds.includes(contextMenu.nodeId)) {
        return { groupId: gid, group };
      }
    }
    return null;
  }, [contextMenu, config.nodeGroups]);

  const ungroupFromContextMenu = useCallback(() => {
    if (!contextMenuGroup) return;
    const { groupId, group } = contextMenuGroup;
    const nextGroups = { ...(config.nodeGroups ?? {}) };
    delete nextGroups[groupId];
    onConfigChange({ ...config, nodeGroups: nextGroups });
    // Symmetric feedback with the "Grouped" toast — ungrouping used to
    // give no visual response at all.
    notifications.show({
      color: "green",
      title: "Ungrouped",
      message: `"${group.label}" removed — its ${group.nodeIds.length} step${group.nodeIds.length === 1 ? "" : "s"} stay on the canvas.`,
    });
  }, [contextMenuGroup, config, onConfigChange]);

  // ---------------------------------------------------------------------------
  // Empty-canvas right-click menu (P-4) + the close-on-left-click fix (B-3)
  // ---------------------------------------------------------------------------

  /**
   * P-4 — where the pane menu is pinned, in BOTH coordinate systems.
   * `x`/`y` are viewport coordinates (the menu is a fixed-position portal);
   * `flow` is the same point in graph space, resolved at open time because
   * that is the point "Add node here" means, whatever the viewport does
   * between the right-click and the pick.
   */
  const [paneMenu, setPaneMenu] = useState<{
    x: number;
    y: number;
    flow: { x: number; y: number };
  } | null>(null);

  const closePaneMenu = useCallback(() => setPaneMenu(null), []);

  /**
   * P-4 — the node picker opened by "Add node here", pinned to the same
   * point. Reuses the hover-extend popover unfiltered, which is the canvas's
   * node catalogue; the difference is that nothing is being extended FROM, so
   * the pick lands a detached node at `flow` instead of wiring it to a source.
   */
  const [addNodeAt, setAddNodeAt] = useState<{
    x: number;
    y: number;
    flow: { x: number; y: number };
  } | null>(null);

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      // Without this the empty canvas is the one surface still serving the
      // browser's own menu while every node and wire serves ours.
      event.preventDefault();
      const screen = { x: event.clientX, y: event.clientY };
      setPaneMenu({
        ...screen,
        flow: reactFlow.screenToFlowPosition(screen),
      });
    },
    [reactFlow],
  );

  /**
   * B-3 — every open canvas menu closes on a left click on the pane, on a
   * node, or on a pan/zoom.
   *
   * Mantine's `closeOnClickOutside` cannot do this: it listens on document
   * `mousedown`, and xyflow's pane runs d3-zoom/d3-drag, which calls
   * `stopImmediatePropagation` on pane mousedown. So the menu closed when you
   * clicked anywhere EXCEPT the canvas — which is the one place you click. The
   * Mantine listener is kept (it still handles clicks on the surrounding
   * chrome); these handlers cover what it cannot see.
   */
  const closeCanvasMenus = useCallback(() => {
    setContextMenu(null);
    setPaneMenu(null);
    // The wire menu is the same kind of Mantine menu opened from the same kind
    // of right-click, so it had the identical defect. Closing all three here
    // keeps "a left click dismisses the menu" one rule rather than three.
    setWireMenu(null);
  }, []);

  const arrangeFromPaneMenu = useCallback(() => {
    closePaneMenu();
    // Feed dagre each card's REAL rendered width from the live instance, as
    // the top-bar Auto-arrange does — a narrow card should get a narrow slot.
    const nodeWidths = new Map<string, number>();
    for (const node of reactFlow.getNodes()) {
      const width = node.measured?.width ?? node.width;
      if (typeof width === "number" && width > 0)
        nodeWidths.set(node.id, width);
    }
    // G-4 — same rule as the top-bar Auto-arrange: with groups collapsed the
    // graph on screen is the projected chips-plus-ungrouped-nodes graph, so
    // that is what gets laid out. A fix that covered only the top bar would
    // leave this menu doing visibly nothing.
    const next = simplifiedView
      ? layoutGraphSimplified(config, { nodeWidths })
      : layoutGraphWithMapBodies(config, { nodeWidths });
    onConfigChange(next);
    // The host bumps `layoutNonce` for arranges IT starts; this one starts
    // here, so apply the new positions to the rendered nodes directly —
    // otherwise the layout persists to config and nothing moves (§4.2).
    applyPositionsFromConfig(next);
    setTimeout(() => {
      reactFlow.fitView({ padding: 0.15, duration: 300 });
    }, 0);
  }, [
    closePaneMenu,
    reactFlow,
    config,
    onConfigChange,
    applyPositionsFromConfig,
    simplifiedView,
  ]);

  const fitViewFromPaneMenu = useCallback(() => {
    closePaneMenu();
    reactFlow.fitView({ padding: 0.15, duration: 300 });
  }, [closePaneMenu, reactFlow]);

  const selectAllFromPaneMenu = useCallback(() => {
    closePaneMenu();
    // Map-body container boxes are `selectable: false` decor — selecting them
    // would put a box in the selection that no action can act on.
    setInternalNodes((prev) =>
      prev.map(
        (n): FlowNode =>
          n.selectable === false || n.selected ? n : { ...n, selected: true },
      ),
    );
  }, [closePaneMenu, setInternalNodes]);

  const openAddNodePicker = useCallback(() => {
    if (!paneMenu) return;
    setAddNodeAt(paneMenu);
    setPaneMenu(null);
  }, [paneMenu]);

  const closeAddNodePicker = useCallback(() => setAddNodeAt(null), []);

  /**
   * P-4 — lands a picked node at the right-clicked point. Unlike
   * `extendFromSource` there is no source to wire to and no position to
   * derive: the author chose the spot. Adopting the node as `entryNodeId`
   * when the graph has none mirrors the palette-add path — a first node that
   * is not the entry point makes the workflow invalid on arrival.
   */
  const addNodeAtPoint = useCallback(
    (newNode: GraphNode, position: { x: number; y: number }) => {
      const placed: GraphNode = {
        ...newNode,
        metadata: { ...(newNode.metadata ?? {}), position },
      };
      onConfigChange({
        ...config,
        nodes: { ...config.nodes, [placed.id]: placed },
        entryNodeId: config.entryNodeId === "" ? placed.id : config.entryNodeId,
      });
      onSelectNode(placed.id);
    },
    [config, onConfigChange, onSelectNode],
  );

  const handleAddNodePickActivity = useCallback(
    (activityType: string) => {
      if (!addNodeAt) return;
      const { flow } = addNodeAt;
      setAddNodeAt(null);
      const entry = getActivityCatalogEntry(activityType);
      // No port bindings: the auto-wire resolver owns input binding, and a
      // stamped `ctxKey = portName` reads as a user-authored override it will
      // never revisit. Same reasoning as the palette-add path.
      const newNode: ActivityNode = {
        id: makeUniqueNodeId("activity", config.nodes),
        type: "activity",
        label: entry?.displayName ?? activityType,
        activityType,
        inputs: [],
        outputs: [],
        parameters: {},
      };
      addNodeAtPoint(newNode, flow);
    },
    [addNodeAt, config.nodes, addNodeAtPoint],
  );

  const handleAddNodePickControlFlow = useCallback(
    (controlFlowType: ControlFlowNodeType) => {
      if (!addNodeAt) return;
      const { flow } = addNodeAt;
      setAddNodeAt(null);
      const newId = makeUniqueNodeId(controlFlowType, config.nodes);
      addNodeAtPoint(buildControlFlowSkeleton(controlFlowType, newId), flow);
    },
    [addNodeAt, config.nodes, addNodeAtPoint],
  );

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
      const { node: updated, dropped } = swapActivityType(
        existing,
        newActivityType,
      );
      onConfigChange({
        ...config,
        nodes: { ...config.nodes, [swapState.nodeId]: updated },
      });
      // G-032 — the new type cannot honour every binding the old one had, and
      // dropping them quietly would trade a silent corruption for a silent
      // loss. Name them, as the delete paths name orphaned ctx variables.
      if (dropped.length > 0) {
        const outputs = dropped.filter((d) => d.direction === "output");
        notifications.show({
          color: "yellow",
          title: `Changed to ${newActivityType}`,
          message: [
            `${dropped.length} connection${dropped.length === 1 ? "" : "s"} could not carry over: ${dropped
              .map((d) => `${d.port} → ${d.ctxKey}`)
              .join(", ")}.`,
            outputs.length > 0
              ? `Steps reading ${outputs.map((d) => `"${d.ctxKey}"`).join(", ")} now have no source.`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
          autoClose: 10_000,
          style: { whiteSpace: "pre-line" },
        });
      }
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

  // Connect-summary popover state (§6.4) — set by `openConnectSummary`
  // below, cleared when the popover closes (Fix click, click-away, Escape,
  // or the 8s auto-dismiss).
  const [connectSummary, setConnectSummary] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  // Node id awaiting a connect-summary popover — set by `openConnectSummary`
  // below, resolved by the effect that follows it. A plain synchronous
  // lookup at call time doesn't work for BOTH callers: `handleConnect`'s
  // node-level branch calls this with a target that already exists in
  // `config`, but `extendFromSource`'s hover-extend path calls this with a
  // BRAND NEW node that only exists in the `next` config it just handed to
  // `onConfigChange` — not yet in the `config` PROP this render closes
  // over. Driving the resolution off a state value (rather than a ref +
  // blind timer) means the effect naturally re-runs on the next render
  // that actually carries the new node in `config.nodes`, however many
  // renders that takes, instead of racing a fixed delay against however
  // long the host takes to round-trip `onConfigChange`.
  const [pendingSummaryTarget, setPendingSummaryTarget] = useState<
    string | null
  >(null);

  const openConnectSummary = useCallback((targetNodeId: string) => {
    setPendingSummaryTarget(targetNodeId);
  }, []);

  // Stable identity — the popover holds `onClose` in a ref, but a stable
  // callback keeps the prop honest (an inline closure here would be a new
  // function on every canvas re-render).
  const closeConnectSummary = useCallback(() => {
    setConnectSummary(null);
  }, []);

  // Resolves `pendingSummaryTarget` into an anchored `connectSummary` once
  // the node is both present in `config` (see above) and an
  // activity/pollUntil node (the only types that ever have wireable input
  // rows — other types would just render nothing, so there's no popover to
  // anchor). Reads the node's rendered card via the same `canvas-node-<id>`
  // testid every node renderer already stamps (used elsewhere in this file
  // for hover-handle lookups), so no new DOM hook is needed. Runs as a
  // plain effect (not deferred by a timer) — by the time an effect runs,
  // React has already committed the node's DOM, so `getBoundingClientRect`
  // reads a real position.
  useEffect(() => {
    if (!pendingSummaryTarget) return;
    const target = config.nodes[pendingSummaryTarget];
    if (
      !target ||
      (target.type !== "activity" && target.type !== "pollUntil")
    ) {
      // A node that exists but is the WRONG type never will satisfy this
      // — give up rather than spin forever. Otherwise (not in `config`
      // yet — extendFromSource's new node, pre-round-trip) stay pending;
      // this effect re-runs once `config.nodes` changes again.
      if (target) setPendingSummaryTarget(null);
      return;
    }
    // `config.nodes` having the target doesn't mean its DOM card exists
    // yet: the canvas's OWN `internalNodes` state is projected from
    // `config` by a separate effect (see the structural-projection effects
    // above) that runs in the SAME commit but hasn't landed in the DOM
    // until ITS scheduled state update flushes on the NEXT commit. Depend
    // on `internalNodes` too so this effect retries once that lands,
    // rather than querying a DOM that's one render behind.
    const el = document.querySelector(
      `[data-testid="canvas-node-${pendingSummaryTarget}"]`,
    );
    if (!el) return;
    setPendingSummaryTarget(null);
    const rect = el.getBoundingClientRect();
    setConnectSummary({
      nodeId: pendingSummaryTarget,
      x: rect.right,
      y: rect.top,
    });
  }, [pendingSummaryTarget, config.nodes, internalNodes]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      // §6.1 drag-to-bind: BOTH endpoints on per-port handles → one gesture
      // writes data + order + pin. Mixed gestures (port→node-body or
      // node→port) fall through to the node-level path below — an edge is
      // created and auto-wire fills bindings as before. Port-to-port drags
      // do NOT get the §6.4 connect-summary popover — the pinned wire
      // itself is the feedback — so `openConnectSummary` is only called
      // from the node-level path below.
      const sourcePort = portFromHandleId(connection.sourceHandle, "output");
      const targetPort = portFromHandleId(connection.targetHandle, "input");
      if (sourcePort !== null && targetPort !== null) {
        let next = pinPortBinding(config, connection.target, targetPort, {
          producerNodeId: connection.source,
          producerPort: sourcePort,
        });
        next = ensureEdgeBetween(next, connection.source, connection.target);
        if (next !== config) onConfigChange(next);
        return;
      }
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
      // §4.10: dedup on the edge TYPE too. Comparing only source+target
      // dropped an error-fallback edge (or a conditional edge) to a node that
      // already had a normal edge, since they share endpoints but come from
      // different source handles. An edge of the SAME type between the same
      // endpoints is still a genuine duplicate.
      const duplicate = config.edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.type === edgeType,
      );
      if (duplicate) return;
      const newEdge: GraphEdge = {
        id: makeEdgeId(),
        source: connection.source,
        target: connection.target,
        type: edgeType,
      };
      // G-001: drawing from the bottom `error` handle IS the author naming
      // the node's error path — record it on the policy, or the validator
      // reports a missing `fallbackEdgeId` the author has no way to clear.
      const configWithNewEdge = recordErrorEdge(
        {
          ...config,
          edges: [...config.edges, newEdge],
        },
        newEdge,
      );
      // §6.3/§7 "connect again = wire again": a fresh node-level execution
      // edge makes the source upstream, so clear any `locked-unbound`
      // ("Disconnected by you") lock on the target's port(s) that this edge
      // now makes auto-bindable. Runs against the edge-INCLUDED config so the
      // resolver sees the new source; only DECIDES which locks to drop — the
      // host's resolveBindings pass writes the binding. Locked-BOUND (pinned)
      // ports and still-unsatisfiable ports keep their lock.
      const nextConfig = clearReconnectableLocks(
        configWithNewEdge,
        connection.target,
      );
      onConfigChange(nextConfig);
      openConnectSummary(connection.target);

      // §6.4a — auto-wire supersession toast. A node-level execution edge
      // can make the resolver auto-bind the TARGET's input to this SOURCE,
      // rendering a blue data wire that visually supersedes the grey
      // sequence edge. That swap is unexplained for newcomers, so name the
      // producer — but ONLY when it actually happens. Diff the derived DATA
      // wires before vs after re-resolving the edge-added config: a NEW auto
      // data wire (source, target, targetPort) that did not exist before
      // means THIS connect created the binding. `resolveBindings` is
      // idempotent and only ADDS auto-bindings, so re-running it on the
      // already-resolved `config` is safe. No new wire (incompatible kinds,
      // or the input was already bound) → no toast. The port-to-port pin
      // path returned early above, so this never fires for explicit pins.
      const dataWireSig = (wire: DataWire) =>
        `${wire.source}\0${wire.target}\0${wire.targetPort}`;
      const boundAutoWireSigsBefore = new Set(
        deriveWires(config)
          .filter((wire): wire is DataWire => wire.variant === "data")
          .filter((wire) => wire.auto)
          .map(dataWireSig),
      );
      const createdAutoWire = deriveWires(resolveBindings(nextConfig))
        .filter((wire): wire is DataWire => wire.variant === "data")
        .some(
          (wire) =>
            wire.auto &&
            wire.source === connection.source &&
            wire.target === connection.target &&
            !boundAutoWireSigsBefore.has(dataWireSig(wire)),
        );
      if (createdAutoWire) {
        const sourceLabel =
          config.nodes[connection.source]?.label ?? connection.source;
        notifications.show({
          color: "blue",
          message: `Auto-wired — data now flows from "${sourceLabel}".`,
          autoClose: 4000,
        });
      }
    },
    [config, onConfigChange, openConnectSummary],
  );

  /**
   * §6.2 — connect-time kind validation for port-to-port drags. Node-level
   * gestures (either endpoint missing a per-port handle id) keep today's
   * permissive behavior; a self-connection is always rejected outright. A
   * wildcard (`undefined` or base `Artifact`) target kind accepts any
   * drop — a manual drag is an explicit choice, so §6.2 doesn't second-
   * guess it the way auto-wire's resolver does.
   */
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      if (connection.source === connection.target) return false;
      const sourcePort = portFromHandleId(connection.sourceHandle, "output");
      const targetPort = portFromHandleId(connection.targetHandle, "input");
      if (sourcePort === null || targetPort === null) return true;
      const targetKind = inputPortKind(config, connection.target, targetPort);
      if (targetKind === undefined || targetKind === "Artifact") return true;
      const sourceKind = outputPortKind(config, connection.source, sourcePort);
      return isAssignable(sourceKind, targetKind);
    },
    [config],
  );

  // Tracks the in-flight port drag's origin handle so `<PortRows>` can
  // classify each input row as a compatible/incompatible drop target
  // (§6.2) via `PortDragContext`. Cleared on `onConnectEnd` regardless of
  // outcome (drop, cancel, or a completed connect).
  const [dragFrom, setDragFrom] = useState<{
    nodeId: string;
    handleId: string;
  } | null>(null);

  const handleConnectStart = useCallback<OnConnectStart>((_event, params) => {
    if (params.nodeId && params.handleId) {
      setDragFrom({ nodeId: params.nodeId, handleId: params.handleId });
    }
  }, []);

  const portDragValue = useMemo(() => {
    const sourcePort = portFromHandleId(dragFrom?.handleId, "output");
    if (!dragFrom || sourcePort === null) return null;
    return { sourceKind: outputPortKind(config, dragFrom.nodeId, sourcePort) };
  }, [dragFrom, config]);

  /**
   * §6.2 — plain-language rejection notice. Fires ONLY when the drag was a
   * genuine port-to-port drop — node-level drags and drops off any handle
   * don't name a source/target kind, so they're silently skipped rather
   * than showing a confusing notice. A port pair can be invalid for TWO
   * reasons (`isValidConnection` checks self-connection before kinds), so
   * the copy branches: same node on both ends → "a step can't feed
   * itself" (the kind copy would be self-contradictory when the kinds
   * match); different nodes → the kind mismatch, worded without an
   * indefinite article so vowel-initial kinds (OcrResult, OcrFields)
   * don't read "a OcrResult".
   */
  const handleConnectEnd = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      setDragFrom(null);
      const fromPort = portFromHandleId(
        connectionState.fromHandle?.id,
        "output",
      );
      const toPort = portFromHandleId(connectionState.toHandle?.id, "input");

      // §6.2 — plain-language rejection notice on a genuine port-to-port
      // drop that failed validation. Independent of the §9 drag-release
      // path below (that path requires `toNode == null`, so the two are
      // mutually exclusive — no early return needed to keep them separate).
      if (
        !connectionState.isValid &&
        fromPort !== null &&
        toPort !== null &&
        connectionState.fromNode &&
        connectionState.toNode
      ) {
        if (connectionState.fromNode.id === connectionState.toNode.id) {
          notifications.show({
            color: "yellow",
            message: "A step can't feed itself",
            autoClose: 5000,
          });
        } else {
          const sourceKind = outputPortKind(
            config,
            connectionState.fromNode.id,
            fromPort,
          );
          const targetKind = inputPortKind(
            config,
            connectionState.toNode.id,
            toPort,
          );
          notifications.show({
            color: "yellow",
            message: `This input needs ${humanKindLabel(targetKind)} — ${humanKindLabel(sourceKind)} can't be used here`,
            autoClose: 5000,
          });
        }
      }

      // §9 — a typed OUTPUT port drag released on the empty pane (not on any
      // node) opens the kind-aware extend popover at the release point, so
      // "drag out → pick → auto-pick-wire" works without a target handle.
      if (
        fromPort !== null &&
        connectionState.toNode == null &&
        connectionState.fromNode
      ) {
        openHoverExtendNow({
          nodeId: connectionState.fromNode.id,
          sourcePort: fromPort,
          anchor: releaseAnchorFromEvent(event),
        });
      }
    },
    [config, openHoverExtendNow],
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
      if (!config.nodes[sourceNodeId]) return;
      const position = findNextFreePosition(config, sourceNodeId);
      const newNodeWithPosition: GraphNode = {
        ...newNode,
        metadata: {
          ...(newNode.metadata ?? {}),
          position,
        },
      };
      const newEdge: GraphEdge = {
        id: makeEdgeId(),
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
      openConnectSummary(newNode.id);
    },
    [
      config,
      onConfigChange,
      onSelectNode,
      inferExtendEdgeType,
      openConnectSummary,
    ],
  );

  /**
   * §9 auto-pick variant of `extendFromSource`: place the new node AND pin
   * its matched input port to the source producer (§6.1) so it lands
   * pre-wired. Placement, pin, and edge compose into ONE `onConfigChange`,
   * with `pinPortBinding` applied AFTER placement so the producer ctxKey
   * overwrites the node's initial self-named input binding (not the other
   * way round).
   */
  const extendFromSourceAndPin = useCallback(
    (
      sourceNodeId: string,
      newNode: GraphNode,
      pin: { consumerPort: string; producerPort: string },
    ) => {
      if (!config.nodes[sourceNodeId]) return;
      const position = findNextFreePosition(config, sourceNodeId);
      const newNodeWithPosition: GraphNode = {
        ...newNode,
        metadata: { ...(newNode.metadata ?? {}), position },
      };
      let next: GraphWorkflowConfig = {
        ...config,
        nodes: { ...config.nodes, [newNode.id]: newNodeWithPosition },
      };
      next = pinPortBinding(next, newNode.id, pin.consumerPort, {
        producerNodeId: sourceNodeId,
        producerPort: pin.producerPort,
      });
      next = ensureEdgeBetween(next, sourceNodeId, newNode.id);
      onConfigChange(next);
      onSelectNode(newNode.id);
      openConnectSummary(newNode.id);
    },
    [config, onConfigChange, onSelectNode, openConnectSummary],
  );

  /**
   * UX walkthrough 2026-07-29 — upstream twin of
   * `extendFromSourceAndPin`: place the new PRODUCER to the consumer's
   * left, draw producer → consumer, and (when the kinds matched) pin the
   * consumer's hovered input to the new producer's output. One
   * `onConfigChange`, same as the downstream path.
   */
  const extendUpstreamAndPin = useCallback(
    (
      consumerNodeId: string,
      newNode: GraphNode,
      pin: { consumerPort: string; producerPort: string } | null,
    ) => {
      if (!config.nodes[consumerNodeId]) return;
      const position = findNextFreePosition(config, consumerNodeId, {
        dx: -280,
      });
      const newNodeWithPosition: GraphNode = {
        ...newNode,
        metadata: { ...(newNode.metadata ?? {}), position },
      };
      let next: GraphWorkflowConfig = {
        ...config,
        nodes: { ...config.nodes, [newNode.id]: newNodeWithPosition },
      };
      next = ensureEdgeBetween(next, newNode.id, consumerNodeId);
      if (pin) {
        next = pinPortBinding(next, consumerNodeId, pin.consumerPort, {
          producerNodeId: newNode.id,
          producerPort: pin.producerPort,
        });
      }
      onConfigChange(next);
      onSelectNode(newNode.id);
      // The interesting change lands on the CONSUMER's input rows — narrate
      // those, not the fresh producer's.
      openConnectSummary(consumerNodeId);
    },
    [config, onConfigChange, onSelectNode, openConnectSummary],
  );

  const handleHoverPickActivity = useCallback(
    (activityType: string) => {
      if (!hoverExtend) return;
      const sourceNodeId = hoverExtend.nodeId;
      const sourcePort = hoverExtend.sourcePort;
      const extendDirection = hoverExtend.direction ?? "downstream";
      closeHoverExtend();
      const newId = makeUniqueNodeId("activity", config.nodes);
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
      // UX walkthrough 2026-07-29 — upstream extend: the gesture node
      // is the CONSUMER and `sourcePort` is its INPUT port. Insert the picked
      // activity as a producer wired into that port.
      if (extendDirection === "upstream") {
        const inputKind: KindRef | undefined = sourcePort
          ? inputPortKind(config, sourceNodeId, sourcePort)
          : undefined;
        // W-2 — the pin is conditional; the flow edge is not.
        // `extendUpstreamAndPin` draws producer → consumer either way, so a
        // pick the ranking can't justify still lands connected and simply
        // leaves the input on its ordinary automatic resolution.
        const producerPick =
          inputKind !== undefined
            ? pickOutputPortForKind(activityType, inputKind, sourcePort)
            : null;
        extendUpstreamAndPin(
          sourceNodeId,
          newNode,
          sourcePort !== undefined && producerPick !== null
            ? { consumerPort: sourcePort, producerPort: producerPick.port }
            : null,
        );
        return;
      }
      // §9 — the pin is kind-driven, not view-driven: extend launched from a
      // typed output port + the picked activity has a compatible auto-wireable
      // input → land it pre-wired, EVEN when picked from the "Show all" view.
      // Only an untyped source or a pick with no matching input falls back to
      // plain extend, which narrates the connection in the §6.4 summary.
      const kind: KindRef | undefined = sourcePort
        ? outputPortKind(config, sourceNodeId, sourcePort)
        : undefined;
      const matchedPick =
        sourcePort !== undefined && kind !== undefined
          ? pickInputPortForKind(activityType, kind, sourcePort)
          : null;
      if (sourcePort !== undefined && matchedPick !== null) {
        extendFromSourceAndPin(sourceNodeId, newNode, {
          consumerPort: matchedPick.port,
          producerPort: sourcePort,
        });
      } else {
        extendFromSource(sourceNodeId, newNode);
      }
    },
    [
      hoverExtend,
      closeHoverExtend,
      extendFromSource,
      extendFromSourceAndPin,
      extendUpstreamAndPin,
      config,
    ],
  );

  const handleHoverPickControlFlow = useCallback(
    (controlFlowType: ControlFlowNodeType) => {
      if (!hoverExtend) return;
      const sourceNodeId = hoverExtend.nodeId;
      closeHoverExtend();
      const newId = makeUniqueNodeId(controlFlowType, config.nodes);
      const newNode = buildControlFlowSkeleton(controlFlowType, newId);
      extendFromSource(sourceNodeId, newNode);
    },
    [hoverExtend, closeHoverExtend, extendFromSource, config.nodes],
  );

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <PortDragContext.Provider value={portDragValue}>
        <ReactFlow
          className="wb-editor-canvas"
          nodes={internalNodes}
          edges={internalEdges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onNodesChange={onInternalNodesChange}
          onEdgesChange={onInternalEdgesChange}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onSelectionChange={handleSelectionChange}
          onBeforeDelete={handleBeforeDelete}
          onDelete={handleDelete}
          onConnect={handleConnect}
          isValidConnection={isValidConnection}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onNodeContextMenu={handleNodeContextMenu}
          onEdgeContextMenu={handleEdgeContextMenu}
          onPaneContextMenu={handlePaneContextMenu}
          // B-3 — the three gestures Mantine's click-away never sees.
          onPaneClick={closeCanvasMenus}
          onNodeClick={closeCanvasMenus}
          onMove={closeCanvasMenus}
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
          fitViewOptions={{ padding: 0.15 }}
          /*
           * xyflow's default minZoom is 0.5, and `fitView` CLAMPS to it rather
           * than reporting that it could not fit. A real workflow is wide —
           * standard-ocr lays out ~4500 flow-units across, and the pane is
           * ~720px once the palette and the settings rail take their share, so
           * fitting needs ~0.16. At the default the viewport stopped at 0.5,
           * left the graph overflowing off both edges, and every later Fit was
           * a silent no-op because it was already at the limit.
           *
           * 0.1 is chosen to fit the widest seeded graph with headroom, not as
           * a round number: below ~0.2 the cards stop being legible anyway, so
           * this buys "you can see the shape of the whole thing", which is what
           * Fit is for. Panning and the minimap remain how you read detail.
           */
          minZoom={0.1}
          deleteKeyCode={["Delete", "Backspace"]}
        >
          <Background gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
          {/*
            UX walkthrough 2026-07-29 — the colour scheme existed
            (one colour per data family) but nothing explained it. The
            legend teaches it in place.
          */}
          <Panel position="bottom-center">
            <CanvasLegend />
          </Panel>
        </ReactFlow>
      </PortDragContext.Provider>
      {contextMenu && (
        <NodeContextMenu
          nodeId={contextMenu.nodeId}
          nodeType={contextMenu.nodeType}
          activityType={contextMenu.activityType}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={closeContextMenu}
          onChangeActivityType={changeActivityTypeFromContextMenu}
          onDelete={deleteNodeFromContextMenu}
          onEditScript={
            contextMenu.activityType?.startsWith("dyn.")
              ? () => {
                  const slug = contextMenu.activityType!.replace(/^dyn\./, "");
                  setEditScriptSlug(slug);
                }
              : undefined
          }
          groupLabel={contextMenuGroup?.group.label}
          onUngroup={contextMenuGroup ? ungroupFromContextMenu : undefined}
          selectionCount={contextMenu.selectionCount}
          onDeleteSelection={deleteSelectionFromContextMenu}
          onGroupSelection={onGroupSelection}
        />
      )}
      {paneMenu && (
        <PaneContextMenu
          position={{ x: paneMenu.x, y: paneMenu.y }}
          hasNodes={Object.keys(config.nodes).length > 0}
          onClose={closePaneMenu}
          onAddNode={openAddNodePicker}
          onAutoArrange={arrangeFromPaneMenu}
          onFitView={fitViewFromPaneMenu}
          onSelectAll={selectAllFromPaneMenu}
        />
      )}
      {/*
        P-4 — "Add node here". The same catalogue the hover-extender shows,
        unfiltered (nothing is being extended from, so no kind narrows it) and
        with no gesture key, since there is one gesture and it ends on the pick.
      */}
      {addNodeAt && (
        <HoverExtendPopover
          opened
          anchorPosition={{ x: addNodeAt.x, y: addNodeAt.y }}
          onClose={closeAddNodePicker}
          onPickActivity={handleAddNodePickActivity}
          onPickControlFlow={handleAddNodePickControlFlow}
        />
      )}
      <WireContextMenu
        opened={wireMenu !== null}
        x={wireMenu?.x ?? 0}
        y={wireMenu?.y ?? 0}
        wire={wireMenu?.wire ?? null}
        canViewData={
          runState?.activeRunId != null && runState.activeRunId !== ""
        }
        onViewData={handleWireViewData}
        onClose={closeWireMenu}
        onDisconnect={handleWireDisconnect}
        onRevert={handleWireRevert}
      />
      {editScriptSlug && (
        <Modal
          opened
          onClose={() => setEditScriptSlug(null)}
          size="80%"
          title="Edit dynamic node"
          centered
        >
          <DynamicNodeEditor
            slug={editScriptSlug}
            layout="modal"
            onAfterPublish={() => setEditScriptSlug(null)}
            onClose={() => setEditScriptSlug(null)}
          />
        </Modal>
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
          filterKind={
            hoverExtend.sourcePort
              ? hoverExtend.direction === "upstream"
                ? inputPortKind(
                    config,
                    hoverExtend.nodeId,
                    hoverExtend.sourcePort,
                  )
                : outputPortKind(
                    config,
                    hoverExtend.nodeId,
                    hoverExtend.sourcePort,
                  )
              : undefined
          }
          direction={hoverExtend.direction ?? "downstream"}
          gestureKey={`${hoverExtend.nodeId}:${hoverExtend.direction ?? "downstream"}:${hoverExtend.sourcePort ?? ""}`}
          onMouseEnter={handlePopoverEnter}
          onMouseLeave={handlePopoverLeave}
        />
      )}
      {/*
       * §6.4 — reads the LIVE `config` prop: by the time this renders, the
       * host's `resolveBindings` pass (inside `handleCanvasConfigChange`)
       * has already run against the `onConfigChange` call `handleConnect` /
       * `extendFromSource` made above, so these rows show post-auto-wire
       * truth, not the pre-connect snapshot.
       */}
      <ConnectSummaryPopover
        opened={connectSummary !== null}
        anchorPosition={connectSummary ?? { x: 0, y: 0 }}
        config={config}
        nodeId={connectSummary?.nodeId ?? null}
        onClose={closeConnectSummary}
        onFix={onFixNodeInput}
      />
    </div>
  );
}
