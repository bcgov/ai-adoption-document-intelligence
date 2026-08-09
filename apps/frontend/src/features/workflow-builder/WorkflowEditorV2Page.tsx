/**
 * Visual workflow editor (V2).
 *
 * Three-column layout per the design brief: palette → canvas → settings.
 * Click a palette entry to add an activity to the canvas; drag the node
 * to position; click to select; the right panel renders the catalog-driven
 * settings form for the selected node. Save persists via the existing
 * `useCreateWorkflow` / `useUpdateWorkflow` hooks — same backend, same
 * `GraphWorkflowConfig` shape as the JSON editor.
 *
 * The sole workflow editor, mounted at `/workflows/create` and
 * `/workflows/:id/edit` (the legacy JSON-driven editor was removed).
 *
 * Out of scope for Milestone 2:
 *   - node groups
 *   - drag-from-palette (we have click-to-add)
 *
 * Control-flow nodes (switch/map/join/childWorkflow/pollUntil/humanGate)
 * land via a separate "Flow Control" section in the palette that emits a
 * skeleton built by `buildControlFlowSkeleton`; position is calculated
 * with the same stagger as activity adds.
 */

import {
  ACTIVITY_CATALOG,
  type ActivityCatalogEntry,
  getSourceCatalogEntry,
  normaliseLocks,
  resolveBindings,
  stripRedundantLocks,
} from "@ai-di/graph-workflow";
import {
  Box,
  Button,
  Divider,
  Drawer,
  Group,
  Loader,
  Menu,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBookmark,
  IconCircleCheck,
  IconClipboardList,
  IconDeviceFloppy,
  IconDots,
  IconExclamationCircle,
  IconHelp,
  IconHistory,
  IconLayoutDistributeHorizontal,
  IconMaximize,
  IconPlayerPlay,
  IconRewindBackward10,
  IconSettings,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactFlowInstance } from "@xyflow/react";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  type CreateWorkflowDto,
  useCreateWorkflow,
  useRevertWorkflowHead,
  useUpdateWorkflow,
  useWorkflow,
  useWorkflowVersion,
  WorkflowSaveError,
  type WorkflowSaveValidation,
  WorkflowVersionConflictError,
} from "../../data/hooks/useWorkflows";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
  SourceNode,
} from "../../types/workflow";
import { configWantsArrangeOnLoad, nodesAllMeasured } from "./arrange-on-load";
import {
  configHasAnyPosition,
  layoutGraphIfMissingPositions,
  layoutGraphSimplified,
  layoutGraphWithMapBodies,
} from "./canvas/auto-layout";
import {
  mergeNodeGroups,
  stripSyntheticMapBodyGroups,
  synthesizeMapBodyGroups,
} from "./canvas/map-body-groups";
import { removeNodesFromConfig } from "./canvas/remove-nodes";
import { WorkflowEditorCanvas } from "./canvas/WorkflowEditorCanvas";
import {
  ORPHANED_DELETE_TOAST_ID,
  showOrphanedDeleteToast,
} from "./delete-orphan-toast";
import {
  ACTIVITY_CATALOG_QUERY_KEY,
  type ActivityCatalogResponse,
  materialiseParamDefaults,
  useActivityCatalog,
} from "./dynamic-nodes";
import {
  createGroupFromSelection,
  filterOutSyntheticBodyMembers,
} from "./group/create-group";
import {
  SaveAsLibraryModal,
  type SaveAsLibrarySubmission,
} from "./library/SaveAsLibraryModal";
import { NodeSearchBox } from "./NodeSearchBox";
import { ActivityPalette } from "./palette/ActivityPalette";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "./palette/control-flow-skeletons";
import {
  type ReplayVersionRef,
  RunStateProvider,
  useRunState,
} from "./run/RunStateContext";
import {
  RunWorkflowDrawer,
  type RunWorkflowDrawerOpenMode,
} from "./run/RunWorkflowDrawer";
import { RunHistoryDrawer } from "./run-history/RunHistoryDrawer";
import { NodeSettingsPanel } from "./settings/NodeSettingsPanel";
import { WorkflowSettingsDrawer } from "./settings/WorkflowSettingsDrawer";
import type { WorkflowTemplate } from "./templates";
import { useConfigHistory } from "./use-config-history";
import { useUndoRedoHotkeys } from "./use-undo-redo-hotkeys";
import { useUnsavedGuard } from "./use-unsaved-guard";
import type { AnchorTarget } from "./validation/anchor-target";
import { useGraphValidation } from "./validation/useGraphValidation";
import { ValidationDrawer } from "./validation/ValidationDrawer";
import { validationButtonState } from "./validation/validation-button-label";
import { CompareToHeadModal } from "./versioning/CompareToHeadModal";
import { VersionHistoryDrawer } from "./versioning/VersionHistoryDrawer";
import { WorkflowSwitcher } from "./WorkflowSwitcher";
import { WorkflowTitleField } from "./WorkflowTitleField";

/** Router-state payload accepted by /workflows/create when launched
 *  from the templates picker. */
interface CreateV2LocationState {
  template?: WorkflowTemplate;
}

const EMPTY_CONFIG: GraphWorkflowConfig = {
  schemaVersion: "1.0",
  metadata: { name: "New workflow", version: "1.0.0" },
  ctx: {
    documentId: { type: "string" },
    blobKey: { type: "string" },
  },
  nodes: {},
  edges: [],
  entryNodeId: "",
};

interface WorkflowEditorV2PageProps {
  mode: "create" | "edit";
}

/** Notification id for the draft-save toast, so its own action can dismiss it. */
const SAVED_DRAFT_TOAST_ID = "workflow-saved-draft";

/**
 * Draft-save (UX walkthrough item 3): saving always persists, and the
 * backend's verdict decides the toast — green when clean, amber when the
 * saved config still has blocking issues. The amber copy names the count and
 * points at what stays gated (running), because "Saved" alone would read as
 * "ready to run".
 *
 * P-6 (2026-08-03): the amber toast used to paste up to three
 * `path — message` pairs plus "…and N more" into the notification. That is
 * validator output, not a message — the paths are internal (`nodes.b.inputs.
 * fileData`), a toast cannot be scrolled, filtered or clicked through to the
 * offending node, and it disappears on a timer. One user-facing line and a
 * **Review issues** action instead: the ValidationDrawer is the surface built
 * for the detail, and it is one click away rather than transcribed badly.
 */
function showSavedToast(
  title: string,
  message: string,
  validation: WorkflowSaveValidation,
  onReviewIssues: () => void,
): void {
  const errorCount = validation.errors.filter(
    (issue) => issue.severity !== "warning",
  ).length;
  if (errorCount === 0) {
    notifications.show({ color: "green", title, message });
    return;
  }
  notifications.show({
    id: SAVED_DRAFT_TOAST_ID,
    color: "yellow",
    title: `${title} as a draft`,
    message: (
      <Stack gap={6} align="flex-start">
        <Text size="sm">
          {message} {errorCount} {errorCount === 1 ? "issue" : "issues"} to fix
          before it can run.
        </Text>
        <Button
          size="compact-xs"
          variant="light"
          color="yellow"
          data-testid="saved-toast-review-issues"
          onClick={() => {
            notifications.hide(SAVED_DRAFT_TOAST_ID);
            onReviewIssues();
          }}
        >
          Review issues
        </Button>
      </Stack>
    ),
    autoClose: 10_000,
  });
}

/**
 * Public entry point. Mounts `RunStateProvider` ABOVE the editor body so the
 * body itself can read run state — G-004 needs `isReplay` + `replayVersion`
 * at the top of the editor to render the historical graph, and a component
 * cannot consume a context it renders. (US-149's reason for hoisting the
 * provider to wrap the whole editor is unchanged; this just moves it one
 * level further out, which also means it is mounted during the loading
 * state instead of only after.)
 */
export function WorkflowEditorV2Page({ mode }: WorkflowEditorV2PageProps) {
  const { workflowId } = useParams<{ workflowId: string }>();
  /**
   * P-6 — "Review issues" on the draft-save toast has to outlive the remount
   * below. Saving a NEW workflow navigates to its edit route, which changes
   * the key and replaces the body, so an action that closed over the saving
   * instance's state setter would already be a dead button by the time the
   * toast is on screen. This ref is owned out here, where the remount cannot
   * reach it; whichever body is mounted registers itself into it.
   */
  const openValidationDrawerRef = useRef<(() => void) | null>(null);
  return (
    <RunStateProvider workflowId={workflowId ?? ""}>
      {/*
        Keyed by workflowId so the in-editor workflow switcher (the UX reviewer
        walkthrough 2026-07-29) gets a clean remount when navigating between
        two edit routes — name/config history are local state and would
        otherwise survive the param change.
      */}
      <WorkflowEditorV2PageBody
        key={workflowId ?? "create"}
        mode={mode}
        openValidationDrawerRef={openValidationDrawerRef}
      />
    </RunStateProvider>
  );
}

interface WorkflowEditorV2PageBodyProps extends WorkflowEditorV2PageProps {
  /** See `WorkflowEditorV2Page` — survives the keyed remount. */
  openValidationDrawerRef: RefObject<(() => void) | null>;
}

function WorkflowEditorV2PageBody({
  mode,
  openValidationDrawerRef,
}: WorkflowEditorV2PageBodyProps) {
  const navigate = useNavigate();
  const { workflowId } = useParams<{ workflowId: string }>();
  const location = useLocation();
  const isEditMode = mode === "edit";

  // G-004 — replay is a VIEW of a past run, on the graph that ran. The run's
  // own version is loaded here and rendered instead of the editing config;
  // the editing config, its undo stack and the unsaved-changes baseline are
  // never touched, so entering/leaving replay cannot lose the author's work.
  const { isReplay, replayVersion } = useRunState();
  const replayVersionQuery = useWorkflowVersion(
    workflowId ?? "",
    isReplay && replayVersion ? replayVersion.id : "",
  );
  const replayConfig =
    isReplay && replayVersion ? replayVersionQuery.data?.config : undefined;
  // The run's version could not be loaded (deleted, or the request failed).
  // Better to say so than to silently paint the run's statuses onto today's
  // graph, which is exactly the bug G-004 is about.
  const replayVersionUnavailable =
    isReplay && replayVersion != null && replayVersionQuery.isError;

  const { data: existingWorkflow, isLoading } = useWorkflow(
    isEditMode ? (workflowId ?? "") : "",
  );
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const revertWorkflow = useRevertWorkflowHead();

  // Template payload from the picker — consumed once on initial mount
  // for create mode, then cleared from history so a back/forward
  // doesn't accidentally re-hydrate.
  const incomingTemplate = !isEditMode
    ? (location.state as CreateV2LocationState | null)?.template
    : undefined;

  const [name, setName] = useState(incomingTemplate?.name ?? "New workflow");
  // US-050: when an incoming template has zero `metadata.position` values
  // across its nodes, run auto-layout once during initial hydration so
  // the editor doesn't open with everything stacked at the default
  // `x = 80 + i*220` position. Templates with full or partial positions
  // are passed through unchanged (Scenarios 2 + 3).
  // G-003: `config` lives in an undo/redo history stack rather than a plain
  // `useState`. `setConfig` records an undo step; `resetConfig` replaces state
  // WITHOUT recording one and is reserved for lifecycle updates (initial
  // load, server hydration, arrange-on-load) — see use-config-history.ts.
  // `undo` / `redo` below wrap the raw history steppers to keep the canvas's
  // rendered positions in sync; use those, not these.
  const {
    config,
    setConfig,
    resetConfig,
    undo: undoHistory,
    redo: redoHistory,
    canUndo,
    canRedo,
  } = useConfigHistory(() =>
    incomingTemplate
      ? resolveBindings(
          normaliseLocks(
            layoutGraphIfMissingPositions(incomingTemplate.config),
          ),
        )
      : EMPTY_CONFIG,
  );
  /**
   * P-3 / R-2 — the description left the top bar for the Workflow settings
   * drawer, where it has room to wrap instead of truncating mid-word at 280px.
   * It stopped being page state in the same move: `config.metadata.description`
   * is the single source of truth now. That is where `handleSave` already
   * mirrored it, where the templates picker already reads it from, and — the
   * point — a field the settings drawer can edit through the `config` /
   * `onConfigChange` pair it already has, exactly as version and tags do.
   */
  const description = config.metadata.description ?? "";
  const [selectedNodeId, setSelectedNodeIdState] = useState<string | null>(
    null,
  );
  // Tracks every node id currently selected on the canvas (marquee or
  // shift-click) so the top-bar "Group selected" action (US-041) can be
  // enabled/disabled correctly. xyflow's `onSelectionChange` fires on
  // every selection change, including clears — the empty-array case
  // resets this list and disables the button.
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  // US-042: tracks the currently-active group id so the right-rail can
  // mount the `GroupNodeSettings` body. Node selection wins — picking a
  // node clears `activeGroupId`, and creating/selecting a group clears
  // `selectedNodeId`.
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  // US-043: top-bar "Simplified view" Switch — when ON, the canvas
  // collapses each `nodeGroups[<id>]` entry into a single chip.
  const [simplifiedView, setSimplifiedView] = useState(false);

  /**
   * Wraps `setSimplifiedView` so flipping the toggle OFF also clears any
   * `activeGroupId` — the right-rail returns to its empty state instead
   * of stranding the user on a group-settings body when no chips are on
   * the canvas anymore (US-043).
   */
  const handleSimplifiedViewChange = useCallback((next: boolean) => {
    setSimplifiedView(next);
    if (!next) {
      setActiveGroupId(null);
    }
  }, []);

  /**
   * G-091 — `deleteGroup` writes `nodeGroups` and nothing else, so the right
   * rail was left mounted on a group that no longer existed and fell through
   * to its "Group not found. It may have been deleted or renamed." placeholder
   * — a dead end reached by the panel's own Delete button.
   *
   * Guarded on derived state rather than inside `deleteGroup`, so it holds for
   * every path that can remove a group: the panel, an undo, an agent write, or
   * a group emptied by `pruneNodesFromGroups` during a node delete.
   */
  useEffect(() => {
    if (activeGroupId === null) return;
    if (config.nodeGroups?.[activeGroupId]) return;
    setActiveGroupId(null);
  }, [activeGroupId, config.nodeGroups]);

  /**
   * Wraps `setSelectedNodeId` so any non-null node selection also clears
   * the active group (Node selection wins over the group panel per
   * US-042).
   */
  const setSelectedNodeId = useCallback((id: string | null) => {
    setSelectedNodeIdState(id);
    if (id !== null) {
      setActiveGroupId(null);
    }
  }, []);

  /**
   * The mirror of the rule above, and it was missing.
   *
   * `NodeSettingsPanel` renders the group body only when `!node &&
   * activeGroupId`, so a lingering node selection outranks the group. Opening a
   * group therefore has to clear the node — otherwise clicking a group header
   * (G-1's headline affordance) silently did nothing whenever any step was
   * selected, which is the state you are in almost all the time. The container
   * is `selectable: false`, so xyflow fires no selection change of its own to
   * clear it either.
   *
   * xyflow's own `selected` flags are cleared too: leaving a card visibly
   * highlighted while the rail shows a different object's settings is the
   * contradiction this is fixing, not a separate nicety.
   */
  const openGroupPanel = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    setSelectedNodeIdState(null);
    reactFlowRef.current?.setNodes((ns) =>
      ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
    );
    // ...and again after the selection round trip.
    //
    // Clearing xyflow's `selected` flags makes it fire `onSelectionChange`,
    // which the canvas routes back through `onSelectNode`. That lands AFTER
    // this handler returns, and the canvas compares against a `selectedNodeId`
    // prop still holding the pre-click value — so it emits one more selection
    // update, which clears the group we just set. This is the same "the panel
    // we just asked for is closed before it renders" trap `handleGroupSelected`
    // documents.
    //
    // Re-asserting is deliberate rather than only deferring: the synchronous
    // set is what every caller and test sees immediately, and the microtask is
    // what survives the round trip. Setting the same id twice is a no-op for
    // React when nothing intervened.
    queueMicrotask(() => setActiveGroupId(groupId));
  }, []);
  // Deep-link target for a problems-badge / drawer click: select the node AND
  // ask the settings panel to open the source picker for the offending input.
  // Cleared once the panel consumes it so it fires exactly once.
  const [focusInput, setFocusInput] = useState<{
    nodeId: string;
    port: string;
  } | null>(null);
  // Item 6X — the producer node currently highlighted because the user is
  // hovering its input row in the settings panel. Passed to the canvas,
  // which applies an emphasis outline. `null` = nothing highlighted.
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(
    null,
  );
  // Select a node so it STICKS: go through xyflow's own selection store via the
  // ReactFlow instance. A plain `setSelectedNodeId` alone doesn't hold — xyflow
  // reasserts its internal (empty) selection on the next change event and
  // clobbers it (the long-standing reason drawer/programmatic selection never
  // focused a node). Falls back to state-only before the instance is ready.
  const selectNodeSticky = useCallback(
    (nodeId: string) => {
      reactFlowRef.current?.setNodes((ns) =>
        ns.map((n) => ({ ...n, selected: n.id === nodeId })),
      );
      setSelectedNodeId(nodeId);
    },
    [setSelectedNodeId],
  );
  const handleFixNodeInput = useCallback(
    (nodeId: string, port: string) => {
      selectNodeSticky(nodeId);
      setFocusInput({ nodeId, port });
    },
    [selectNodeSticky],
  );
  const clearFocusInput = useCallback(() => setFocusInput(null), []);
  // G-010 — bring node(s) into view on the live ReactFlow instance. One node:
  // `setCenter` on its measured centre (keeps the current zoom — a gentle
  // pan). Several, or a node the instance can't resolve: `fitView` scoped to
  // them. A selection the user can't see is the same bug as no selection.
  const revealNodes = useCallback((nodeIds: readonly string[]) => {
    const instance = reactFlowRef.current;
    if (!instance || nodeIds.length === 0) return;
    if (nodeIds.length === 1) {
      const nodeId = nodeIds[0];
      const node = instance.getNode?.(nodeId);
      const pos =
        node?.position ??
        (
          configRef.current.nodes[nodeId]?.metadata as
            | { position?: { x: number; y: number } }
            | undefined
        )?.position;
      if (pos) {
        const width = node?.measured?.width ?? node?.width ?? 0;
        const height = node?.measured?.height ?? node?.height ?? 0;
        const zoom = instance.getZoom?.() ?? 1;
        instance.setCenter(pos.x + width / 2, pos.y + height / 2, {
          zoom,
          duration: 300,
        });
        return;
      }
    }
    instance.fitView({
      padding: 0.2,
      duration: 300,
      nodes: nodeIds.map((id) => ({ id })),
    });
  }, []);
  // Select a node so the selection sticks (same helper the problems deep-link
  // uses) and pan it into view. The one "take me to that node" path: used by
  // the settings-panel producer rows (item 6X), by the find-a-node box and by
  // the ctx-references list (G-009). A second mechanism would be a regression.
  const selectAndRevealNode = useCallback(
    (nodeId: string) => {
      selectNodeSticky(nodeId);
      revealNodes([nodeId]);
    },
    [selectNodeSticky, revealNodes],
  );
  /**
   * G-010 — a validation row was clicked. Take the user to whatever its
   * anchor names: select + pan for a node, the source picker for an input,
   * the connection itself for an edge, the group panel for a group, the
   * workflow-settings drawer for a ctx / entry / library-port field.
   */
  const handleValidationNavigate = useCallback(
    (target: AnchorTarget) => {
      switch (target.kind) {
        case "nodeInput":
          handleFixNodeInput(target.nodeId, target.port);
          revealNodes([target.nodeId]);
          return;
        case "node":
          selectNodeSticky(target.nodeId);
          revealNodes([target.nodeId]);
          return;
        case "edge": {
          const edge = configRef.current.edges.find(
            (e) => e.id === target.edgeId,
          );
          // Same stickiness problem as nodes — go through xyflow's own store.
          reactFlowRef.current?.setEdges((es) =>
            es.map((e) => ({ ...e, selected: e.id === target.edgeId })),
          );
          reactFlowRef.current?.setNodes((ns) =>
            ns.map((n) => ({ ...n, selected: false })),
          );
          setSelectedNodeId(null);
          if (edge) revealNodes([edge.source, edge.target]);
          return;
        }
        case "group": {
          setActiveGroupId(target.groupId);
          setSelectedNodeIdState(null);
          const members =
            configRef.current.nodeGroups?.[target.groupId]?.nodeIds ?? [];
          revealNodes(members);
          return;
        }
        case "workflowSettings":
          setSettingsOpen(true);
          return;
      }
    },
    [handleFixNodeInput, selectNodeSticky, revealNodes, setSelectedNodeId],
  );
  // Item 6X — hover a real-producer input row (node id) / leave it (`null`).
  const handleHoverProducer = useCallback(
    (nodeId: string | null) => setHighlightedNodeId(nodeId),
    [],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [saveAsLibraryOpen, setSaveAsLibraryOpen] = useState(false);
  // Batch-four item 8 (2026-08-08): the top bar used to carry TWO buttons
  // ("Try" and "Run this workflow") that opened this one drawer on
  // different tabs — the same surface behind two doors, which is what
  // Inderdeep objected to. There is now ONE entry point, so the state is
  // a plain open/closed flag and the tab is pre-selected from the
  // workflow's own inputs (`runDrawerOpenMode` below).
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  // US-081: version-history drawer open/close state. The drawer body
  // (`VersionHistoryDrawer`) is mounted in US-082; this story owns the
  // top-bar button + state plumbing. The state is read by the inline
  // placeholder drawer below so React's exhaustive-deps stays clean.
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  // US-153 — Phase 4 run-history drawer open/close state. The drawer
  // body (`RunHistoryDrawer`) is mounted below; the top-bar button
  // toggles `runHistoryDrawerOpen`. Disabled in create mode (no
  // `workflowId` yet) with a Tooltip "Save the workflow first".
  const [runHistoryDrawerOpen, setRunHistoryDrawerOpen] = useState(false);
  // US-084: state for the compare-to-head modal. `null` = closed; an
  // object describes the selected (non-head) version being compared
  // against the editor's already-loaded head workflow.
  const [compareState, setCompareState] = useState<{
    versionId: string;
    versionNumber: number;
    createdAt: string;
  } | null>(null);
  const [validationFocusNodeId, setValidationFocusNodeId] = useState<
    string | null
  >(null);
  // Node-scoped ValidationDrawer: when set, the drawer shows ONLY this node's
  // problems (canvas badge path). `null` = full global list (top-bar path).
  const [validationFilterNodeId, setValidationFilterNodeId] = useState<
    string | null
  >(null);
  const validation = useGraphValidation(config);

  /**
   * Open the ValidationDrawer on the FULL list — the top-bar validity button's
   * action, and (P-6) the draft-save toast's "Review issues" action. Both mean
   * "show me everything wrong with this graph", so both clear the node filter
   * a canvas badge may have left behind.
   */
  const openValidationDrawer = useCallback(() => {
    setValidationFocusNodeId(null);
    setValidationFilterNodeId(null);
    setValidationOpen(true);
  }, []);
  // Register this instance as the live opener (see `WorkflowEditorV2Page`).
  useEffect(() => {
    openValidationDrawerRef.current = openValidationDrawer;
    return () => {
      // Only clear what we put there — on a keyed remount the replacement
      // registers before this cleanup runs, and it must not be wiped.
      if (openValidationDrawerRef.current === openValidationDrawer) {
        openValidationDrawerRef.current = null;
      }
    };
  }, [openValidationDrawer, openValidationDrawerRef]);
  /**
   * The toast's action, routed through the ref so it always reaches whichever
   * editor body is mounted when the user clicks it.
   */
  const reviewSavedIssues = useCallback(() => {
    openValidationDrawerRef.current?.();
  }, [openValidationDrawerRef]);

  // Render-time synthesis of map-body groups (Spec §6).
  // Synthetic entries are NEVER persisted; they're stripped from any config
  // update the canvas dispatches back through `onConfigChange`.
  const displayConfig = useMemo<GraphWorkflowConfig>(() => {
    // G-004 — while replaying, the canvas renders the version that RAN.
    // Falls back to the editing config until the version resolves (and when
    // it can't be resolved at all, which the banner calls out).
    const base = replayConfig ?? config;
    const synthetic = synthesizeMapBodyGroups(base);
    if (Object.keys(synthetic).length === 0) return base;
    return {
      ...base,
      nodeGroups: mergeNodeGroups(base.nodeGroups ?? {}, synthetic),
    };
  }, [config, replayConfig]);

  const handleCanvasConfigChange = useCallback(
    (next: GraphWorkflowConfig) => {
      // G-004 — replay is a view. Never let a canvas/settings edit made
      // while looking at a historical graph land in the editing config; that
      // would silently overwrite the author's work with an old version.
      if (isReplay) return;
      const stripped = next.nodeGroups
        ? { ...next, nodeGroups: stripSyntheticMapBodyGroups(next.nodeGroups) }
        : next;
      setConfig(resolveBindings(stripped));
    },
    [setConfig, isReplay],
  );

  // Live xyflow instance from the inner canvas — populated by
  // `onReactFlowReady`. Used by the "Auto-arrange" top-bar button to
  // re-fit the viewport after the layout helper stamps new positions.
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const handleReactFlowReady = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance;
  }, []);

  // Bumped whenever `metadata.position` changes without any structural
  // change, so the canvas re-applies config positions its structural
  // fingerprint would otherwise ignore (§4.2). Auto-arrange bumps it; so does
  // every undo/redo, since a history step can restore a position-only diff.
  const [layoutNonce, setLayoutNonce] = useState(0);

  /**
   * G-003: the raw history steppers, wrapped so a restored layout is actually
   * SEEN. Undo can reverse a position-only change — a manual Auto-arrange, or
   * a node drag — and the canvas's structural fingerprint deliberately
   * excludes `metadata.position` (§4.2), so without a nonce bump the restored
   * positions would persist to config while the rendered nodes stayed put.
   * Bumping on every step re-applies them; it is a no-op when the step changed
   * no positions.
   */
  // G-004 — replay is a view, and undo/redo are the one edit path that can do
  // damage invisibly: they rewind the EDITING config while the canvas is
  // showing the historical graph, so nothing on screen moves and the author
  // only discovers the loss after leaving replay. Refusing at the two wrappers
  // covers every entry point at once — the top-bar buttons, the Ctrl+Z /
  // Ctrl+Shift+Z hotkeys, and the canvas's own `onUndo` all call these.
  //
  // Both wrappers also retire the orphaned-delete toast. That toast is a
  // statement about ONE history step — "Deleted <node> — N variables lost their
  // source" — with an Undo link bound to this same `undo`. Once the history has
  // moved by any other route (the top-bar buttons, Ctrl+Z, the canvas), the
  // sentence is false and the link is worse than useless: clicking it would
  // rewind a DIFFERENT, unrelated edit. It also sits over the top bar's
  // right-hand controls for its full 8s life, so a stale one blocks the very
  // buttons the author just used. `hide` on an absent id is a no-op, which is
  // why this needs no "was it showing" bookkeeping.
  const undo = useCallback(() => {
    if (isReplay) return;
    notifications.hide(ORPHANED_DELETE_TOAST_ID);
    undoHistory();
    setLayoutNonce((n) => n + 1);
  }, [isReplay, undoHistory]);
  const redo = useCallback(() => {
    if (isReplay) return;
    notifications.hide(ORPHANED_DELETE_TOAST_ID);
    redoHistory();
    setLayoutNonce((n) => n + 1);
  }, [isReplay, redoHistory]);

  // Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z / Ctrl+Y. Mounted with the editor, and
  // inert while focus is in a text field so native text undo still works in
  // every settings input. See use-undo-redo-hotkeys.ts.
  useUndoRedoHotkeys({ undo, redo });

  /**
   * The shared body of both arrange paths. `persist` is what decides whether
   * the new layout becomes an undo step — the ONLY difference between the two
   * callers, and the reason they are separate callbacks rather than one.
   */
  const runAutoArrange = useCallback(
    (persist: (next: GraphWorkflowConfig) => void) => {
      // Feed dagre each card's REAL rendered width, read from the live xyflow
      // instance, so a narrow card gets a narrow slot and the horizontal gap
      // between adjacent cards collapses to ~ranksep instead of every card
      // reserving the widest card's fixed footprint. Nodes xyflow hasn't
      // measured yet are simply omitted — layoutGraph falls back to its
      // default width for those.
      const nodeWidths = new Map<string, number>();
      for (const node of reactFlowRef.current?.getNodes() ?? []) {
        const width = node.measured?.width ?? node.width;
        if (typeof width === "number" && width > 0) {
          nodeWidths.set(node.id, width);
        }
      }
      // G-4 — arrange the graph the author is LOOKING at. With groups
      // collapsed, that is the projected chips-plus-ungrouped-nodes graph, not
      // the member graph: laying out members only slid each chip to the centre
      // of its own member chain, so nothing on screen moved. Expanded, the
      // member graph IS the graph on screen and the clustering wrapper stands
      // (it also keeps each map body's container box wrapping its own members
      // instead of sprawling after arrange).
      persist(
        simplifiedView
          ? layoutGraphSimplified(configRef.current, { nodeWidths })
          : layoutGraphWithMapBodies(configRef.current, { nodeWidths }),
      );
      // §4.2: the canvas's structural fingerprint excludes metadata.position,
      // so this config-only position change won't re-project on its own. Bump
      // the layout nonce so the canvas re-applies the new positions to its
      // internal xyflow nodes (otherwise the rendered nodes never move even
      // though the new layout persists to config).
      setLayoutNonce((n) => n + 1);
      // Defer the fit so the canvas's structural projection effect has run.
      // 0ms is enough — xyflow updates its internal node store
      // synchronously inside its sibling effect on the same tick.
      setTimeout(() => {
        reactFlowRef.current?.fitView({ padding: 0.15, duration: 300 });
      }, 0);
    },
    [simplifiedView],
  );

  /**
   * The top-bar **Auto-arrange** action (in the view group since P-3; it was
   * behind More until 2026-08-03). A deliberate authoring edit —
   * the author asked for this layout and will reach for Ctrl+Z if they don't
   * like it — so it goes through `setConfig` and IS an undo step. Undoing it
   * restores the previous positions from the snapshot; it does not re-run the
   * layout algorithm.
   */
  const handleAutoArrange = useCallback(
    () => runAutoArrange(setConfig),
    [runAutoArrange, setConfig],
  );

  /**
   * P-3's "fit" control. Purely a viewport move — it stamps no positions, so
   * unlike Auto-arrange it is not an edit and never enters the undo stack.
   * The two sit together in the view group precisely because they are easy to
   * confuse: one tidies the graph, the other only points the camera at it.
   */
  const handleFitView = useCallback(() => {
    reactFlowRef.current?.fitView({ padding: 0.15, duration: 300 });
  }, []);

  /**
   * The config as last hydrated from the server (or as last saved). `isDirty`
   * is "the current config differs from this", so anything that rewrites the
   * config WITHOUT the author asking must re-base it — see
   * `handleArrangeOnLoad`.
   */
  const lastHydratedConfigRef = useRef<GraphWorkflowConfig | null>(null);

  /**
   * The `metadata.arrangeOnLoad` path. Fires by itself ~1.5s after a demo
   * opens, with nobody asking for it, so it goes through `resetConfig` and is
   * NOT an undo step — otherwise every demo would open with a phantom entry
   * already at the bottom of its undo stack, and the author's first Ctrl+Z
   * would scramble the layout they were shown.
   *
   * Same layout, different persistence. That is the whole distinction.
   */
  const handleArrangeOnLoad = useCallback(
    () =>
      runAutoArrange((next) => {
        resetConfig(next);
        // ...and re-base the unsaved-changes baseline. Every demo ships
        // `arrangeOnLoad`, so without this the editor is "dirty" the moment it
        // opens, before the author has touched anything — which made the
        // leave-guard warn on a workflow nobody edited and, once Try/Run began
        // refusing a dirty graph (D-16), disabled them on every demo. `isDirty`
        // has to keep meaning "the AUTHOR changed something".
        lastHydratedConfigRef.current = next;
      }),
    [runAutoArrange, resetConfig],
  );

  // "Open demos in the auto-arranged view" (metadata.arrangeOnLoad). The
  // measured-width Auto-arrange needs the cards to be mounted AND measured, so
  // we can't run it during hydration — we poll the live instance across
  // animation frames and fire once every node reports a width. `arrangedForRef`
  // guards it to once per workflow id so the agent-chat refetch loop (§4.4)
  // can't re-trigger it. Bounded so a never-settling measure can't spin.
  const arrangedForRef = useRef<string | null>(null);
  const scheduleArrangeOnLoad = useCallback(() => {
    let frames = 0;
    const MAX_FRAMES = 90; // ~1.5s at 60fps — give up if measurement stalls
    const tick = () => {
      if (nodesAllMeasured(reactFlowRef.current?.getNodes() ?? [])) {
        handleArrangeOnLoad();
        return;
      }
      if (frames++ < MAX_FRAMES) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, [handleArrangeOnLoad]);

  /**
   * Handler for the "Group selected" top-bar action (US-041). Calls the
   * pure `createGroupFromSelection` helper and pushes the result through
   * `setConfig`. Then (US-042) surfaces the new group in the right-rail
   * by setting `activeGroupId` and clearing the per-node selection so
   * the panel mounts `GroupNodeSettings`.
   *
   * Computes the new config + new group id eagerly off the current
   * `config` snapshot rather than inside a `setConfig` updater callback
   * so we can pipe the id into `setActiveGroupId` in the same handler
   * tick (React batches both updates into one render).
   */
  const handleGroupSelected = useCallback(() => {
    const eligibleIds = filterOutSyntheticBodyMembers(config, selectedNodeIds);
    if (eligibleIds.length < 2) {
      notifications.show({
        color: "yellow",
        title: "Group selected",
        message:
          "Need 2+ selectable nodes. Map body members are grouped automatically.",
      });
      return;
    }
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      eligibleIds,
    );
    setConfig(nextConfig);
    setSelectedNodeIdState(null);
    setActiveGroupId(newGroupId);
    // Clear xyflow's own selection too. Without this the grouped nodes stay
    // selected on the canvas, the config change re-projects, xyflow re-fires
    // `onSelectionChange` with those still-selected nodes, and the host routes
    // that back through `setSelectedNodeId` — which clears `activeGroupId`
    // again. The panel we just asked for is closed before it renders, so
    // grouping appears to do nothing at all.
    reactFlowRef.current?.setNodes((ns) =>
      ns.map((n) => (n.selected ? { ...n, selected: false } : n)),
    );
    // G-3 (2026-08-03) — grouping no longer flips the canvas into simplified
    // view. It did because the only expanded-view cue was a faint dashed ring
    // per card, so a toast was genuinely all the feedback there was and
    // collapsing to a chip was the one way to show something had happened.
    // G-1 draws a titled box around the members instead: the feedback is now
    // on the canvas, in place, without changing what the author is looking at.
    notifications.show({
      color: "green",
      title: "Grouped",
      message: `${eligibleIds.length} steps grouped. Drag the box's header to move them together.`,
    });
  }, [config, selectedNodeIds, setConfig]);

  // Clicking a node's problems badge ALWAYS opens the ValidationDrawer scoped
  // to that node — naming every problem (input-unsatisfied, unreachable, …)
  // with an inline fix where one exists. It never blind-jumps into the bare
  // source picker (the picker is reachable from the drawer's input rows) nor
  // dumps the whole workflow's issue list. Selecting the node keeps the canvas
  // and the settings panel in sync with what the drawer is scoped to.
  const handleProblemBadgeClick = useCallback(
    (nodeId: string) => {
      selectNodeSticky(nodeId);
      setValidationFocusNodeId(null);
      setValidationFilterNodeId(nodeId);
      setValidationOpen(true);
    },
    [selectNodeSticky],
  );

  // Clear the template from history.state so future back/forward
  // navigations land on a blank editor (not the templated one).
  useEffect(() => {
    if (incomingTemplate) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Only fires once on mount; deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Always-current snapshot of `config`, read by the hydration guard below
  // without putting `config` in that effect's deps (which would loop, since
  // the hydration path itself calls `setConfig`). Assigning a ref during
  // render is the standard "latest value" pattern.
  const configRef = useRef(config);
  configRef.current = config;
  // The config we last took as the "matches what's persisted" baseline.
  // `null` until the first hydration (or after an edit-mode save, which
  // re-baselines by clearing it and letting the follow-up refetch re-adopt).
  // §4.4.
  // Create mode never hydrates from the server, so seed the baseline with the
  // config the editor opened on (blank, or the picked template). Without this
  // G-027 could not tell an untouched new workflow from an edited one, and
  // would either warn on every exit or on none.
  if (!isEditMode && lastHydratedConfigRef.current === null) {
    lastHydratedConfigRef.current = config;
  }

  /**
   * The editor's single notion of "the author has edits that aren't
   * persisted": the live config is no longer the object we baselined against.
   * A local edit always replaces `config` with a new object, so a reference
   * compare is both cheap and exact.
   *
   * Read by the §4.4 hydration guard (don't let a background refetch stomp
   * unsaved work) AND by the G-027 leave-guard. Deliberately a getter over
   * refs: `handleSave` re-baselines and navigates in the same tick, before
   * React re-renders, and the leave-guard must see the re-baseline.
   */
  const hasUnsavedChanges = useCallback(
    () =>
      lastHydratedConfigRef.current !== null &&
      configRef.current !== lastHydratedConfigRef.current,
    [],
  );
  // Render-time mirror of the same compare, for anything that needs to react
  // to it (the beforeunload registration).
  const isDirty =
    lastHydratedConfigRef.current !== null &&
    config !== lastHydratedConfigRef.current;

  // G-027: warn before a reload / tab close / in-app navigation discards the
  // session. Reuses the dirty signal above — no second source of truth.
  useUnsavedGuard({ isDirty, isDirtyNow: hasUnsavedChanges });

  /**
   * Why Try / Run are unavailable, or `null` when they are. Doubles as the
   * tooltip, so the button can never be disabled without saying why.
   *
   * D-11 and D-16 are the same defect wearing two hats — the canvas asserting
   * one thing while the run does another:
   *
   *   - **D-11**: a graph with validation errors was still runnable. A deleted
   *     `dyn.*` lineage is diagnosed at author time (red Deleted badge,
   *     "not registered") and the run then dies at
   *     `dynamicNode.resolveLineage`. The plan's own invariant is "a state the
   *     runtime cannot satisfy is reported at author time" — so refuse here.
   *     Warnings are advisory and deliberately do NOT block.
   *   - **D-16**: with unsaved edits, Try ran the PREVIOUSLY SAVED graph and
   *     said nothing. Refusing while dirty keeps version history meaningful
   *     (the alternative, auto-saving, mints a version on every Try) and makes
   *     "what you see is what runs" true again.
   */
  const runBlockedReason: string | null =
    !isEditMode || !workflowId
      ? "Save the workflow first"
      : validation.errorCount > 0
        ? `Fix ${validation.errorCount} validation ${validation.errorCount === 1 ? "error" : "errors"} first — this graph cannot run as it stands`
        : isDirty
          ? "Save your changes first — a run always executes the saved graph, not the canvas"
          : null;

  // Hydrate state when the workflow loads in edit mode.
  // Run auto-layout when the loaded config carries no node positions — e.g.
  // seeded workflows (docs-md/workflows/templates/*.json) and any
  // workflow authored via the API/agent without positions. Without this they
  // render stacked/out-of-order on the canvas. Configs that already have
  // positions pass through unchanged (layoutGraphIfMissingPositions is a no-op
  // when any position exists), so editor-saved workflows are untouched. This
  // mirrors the create-from-template hydration above.
  //
  // §4.4: the agent chat drawer invalidates `['workflow']` after every write
  // tool + stream finish, so `useWorkflow` refetches frequently. Hydrating
  // unconditionally would stomp the user's unsaved canvas edits with the
  // server copy. We therefore hydrate only when the local config has NOT
  // diverged from the last hydrated snapshot (no unsaved edits) — a local
  // edit replaces `config` with a new object, so a reference compare detects
  // it cheaply. When there are no local edits it's safe to adopt the new
  // server state (e.g. the agent's write). `handleSave` re-baselines.
  useEffect(() => {
    if (!isEditMode || !existingWorkflow) return;
    if (hasUnsavedChanges()) return;
    const hydrated = resolveBindings(
      normaliseLocks(layoutGraphIfMissingPositions(existingWorkflow.config)),
    );
    // R-2 — the description is edited as `metadata.description` now, but the
    // lineage's own `description` column is what the workflows list renders and
    // what the API exposes, and a config written by something other than this
    // editor (the agent, a direct API create) need not carry the mirror. Seed
    // it from the column when the config has none, so opening and re-saving a
    // workflow can never blank a description that was visible on the list.
    const incoming: GraphWorkflowConfig =
      hydrated.metadata.description === undefined &&
      existingWorkflow.description
        ? {
            ...hydrated,
            metadata: {
              ...hydrated.metadata,
              description: existingWorkflow.description,
            },
          }
        : hydrated;
    lastHydratedConfigRef.current = incoming;
    setName(existingWorkflow.name);
    // G-003: `resetConfig` — adopting the server's copy is a lifecycle
    // update, not an author edit. Undo must never walk backwards INTO a
    // hydration; it walks back through what the author did.
    resetConfig(incoming);
    // Open in the tidy measured-width Auto-arrange view, once per workflow id,
    // after the canvas has measured the cards.
    //
    // P-1 (2026-08-03) — two triggers, one behaviour:
    //
    //   1. `metadata.arrangeOnLoad`, which the demo seeder stamps.
    //   2. ANY config that arrived from the server with no authored positions.
    //
    // (2) is the fix for "it loads more spread out than it should and gets
    // better after I hit Auto-arrange". A position-less config is laid out
    // during hydration by `layoutGraphIfMissingPositions`, which runs BEFORE
    // anything is mounted and so has no measured widths — dagre gives every
    // card the uniform `DEFAULT_NODE_WIDTH` fallback (482px). The top-bar
    // button feeds dagre each card's REAL rendered width, which collapses the
    // gaps to ~ranksep. Same graph, two layouts, and the loose one is the one
    // you were shown. Re-running the measured pass after mount makes the
    // opening view the one the button would have produced.
    //
    // Note this reads `existingWorkflow.config` — the RAW server copy. Reading
    // `incoming` would always report positions, because hydration just stamped
    // them.
    //
    // A workflow whose author saved a layout has positions, so (2) is false and
    // nothing touches it. Both paths go through `handleArrangeOnLoad`, so
    // neither is an undo step and neither marks the editor dirty.
    if (
      workflowId &&
      arrangedForRef.current !== workflowId &&
      (configWantsArrangeOnLoad(existingWorkflow.config) ||
        !configHasAnyPosition(existingWorkflow.config))
    ) {
      arrangedForRef.current = workflowId;
      scheduleArrangeOnLoad();
    }
  }, [
    existingWorkflow,
    isEditMode,
    workflowId,
    scheduleArrangeOnLoad,
    resetConfig,
    hasUnsavedChanges,
  ]);

  // Both add handlers compute the new id from the current `config`
  // closure and call `setConfig` + `setSelectedNodeId` in the same
  // event-handler tick. React 18 automatic batching collapses the two
  // updates into a single render, so the canvas's structural
  // projection effect sees both new state pieces at once and projects
  // the new node with `selected: true` from the start. (Earlier
  // attempts to sync external `selectedNodeId` into xyflow's internal
  // node-selected flag from a later effect deadlocked against xyflow's
  // StoreUpdater.)
  const addActivity = useCallback(
    (activityType: string, position?: { x: number; y: number }) => {
      const entry = ACTIVITY_CATALOG[activityType] as
        | ActivityCatalogEntry
        | undefined;
      if (!entry) return;
      const id = makeNodeId(config, activityType);
      const pos = position ?? defaultStaggerPosition(config);
      // A freshly dropped node carries NO port bindings. The auto-wire
      // resolver owns input binding: it auto-binds each typed input to the
      // nearest compatible upstream producer (synthesising the producer's
      // output binding on demand), or leaves the port honestly "unsatisfied"
      // when none exists. Stamping placeholder bindings (`ctxKey = portName`)
      // + matching ctx vars would defeat the resolver — a non-`__auto.*` ctx
      // key reads as a user-authored override, so the node would never
      // auto-wire and the settings panel would show a misleading "from
      // <portname>" source. See input-row-resolution.ts.
      const newNode: ActivityNode = {
        id,
        type: "activity",
        label: entry.displayName ?? entry.activityType,
        activityType,
        inputs: [],
        outputs: [],
        parameters: {},
        metadata: {
          position: pos,
        },
      };
      setConfig((prev) => {
        const nextEntryNodeId = prev.entryNodeId === "" ? id : prev.entryNodeId;
        const nextNodes = { ...prev.nodes, [id]: newNode };
        return {
          ...prev,
          nodes: nextNodes,
          entryNodeId: nextEntryNodeId,
        };
      });
      setSelectedNodeId(id);
    },
    [config],
  );

  const addControlFlowNode = useCallback(
    (type: ControlFlowNodeType, position?: { x: number; y: number }) => {
      const id = makeNodeId(config, type);
      const pos = position ?? defaultStaggerPosition(config);
      const skeleton = buildControlFlowSkeleton(type, id);
      // Mutate the freshly-built skeleton's metadata in place — this is
      // safe because the skeleton was just constructed and is not yet
      // referenced anywhere else. Avoids losing discriminated-union
      // narrowing that a spread of `GraphNode` would.
      const newNode: GraphNode = skeleton;
      newNode.metadata = {
        ...(newNode.metadata ?? {}),
        position: pos,
      };
      setConfig((prev) => {
        const nextEntryNodeId = prev.entryNodeId === "" ? id : prev.entryNodeId;
        const nextNodes = { ...prev.nodes, [id]: newNode };
        return {
          ...prev,
          nodes: nextNodes,
          entryNodeId: nextEntryNodeId,
        };
      });
      setSelectedNodeId(id);
    },
    [config],
  );

  /**
   * Adds a fresh `SourceNode` to the canvas (US-118). The subtype's
   * catalog entry supplies the display name + `parametersSchema`; we
   * call `parametersSchema.parse({})` so Zod fills in the documented
   * defaults (e.g. `fields: []` for `source.api`,
   * `{ allowedMimeTypes, maxFileSizeMB, ctxKey }` for `source.upload`).
   * Position reuses the same `x = 80 + i*240, y = 100 + (i%3)*140`
   * stagger the activity / control-flow add paths share.
   *
   * US-121: when the canvas is empty BEFORE this drop
   * (`Object.keys(prev.nodes).length === 0`), the new source becomes the
   * workflow's entry node automatically. In every other case
   * (additional drops, existing workflows opened with an entryNodeId
   * already set to an activity, etc.), `entryNodeId` is left alone — the
   * runtime treats `entryNodeId`-pointing-at-source as a no-op and
   * starts at the source's outbound-edge target (per
   * DOCUMENT_SOURCES_DESIGN.md §5).
   */
  const addSource = useCallback(
    (sourceType: string, position?: { x: number; y: number }) => {
      const entry = getSourceCatalogEntry(sourceType);
      if (!entry) return;
      const id = makeNodeId(config, sourceType);
      const pos = position ?? defaultStaggerPosition(config);
      // `.parse({})` is the documented way to materialise the catalog
      // defaults — the schema is the single source of truth for
      // save-time validation, so the dropped node is guaranteed
      // structurally valid out of the gate.
      const defaults = entry.parametersSchema.parse({}) as Record<
        string,
        unknown
      >;
      const newNode: SourceNode = {
        id,
        type: "source",
        // SourceCatalogEntry has a required `displayName`; no fallback needed.
        label: entry.displayName,
        sourceType,
        parameters: defaults,
        metadata: {
          position: pos,
        },
      };
      setConfig((prev) => {
        // US-121: autoset entryNodeId only when the canvas was empty
        // BEFORE this drop. This is the documented precondition in the
        // story's technical note — checked against `prev.nodes` (not the
        // already-mutated next state) so a non-empty canvas never
        // accidentally rewrites the user's chosen entry.
        const wasEmpty = Object.keys(prev.nodes).length === 0;
        const nextEntryNodeId = wasEmpty ? id : prev.entryNodeId;
        const nextNodes = { ...prev.nodes, [id]: newNode };
        return {
          ...prev,
          nodes: nextNodes,
          entryNodeId: nextEntryNodeId,
        };
      });
      setSelectedNodeId(id);
    },
    [config],
  );

  /**
   * Adds a fresh dynamic-node activity to the canvas (Phase 6 US-182).
   * Resolves the merged catalog entry by `dyn.<slug>` activityType,
   * materialises `parameters` defaults from the entry's `paramsSchema`,
   * and inserts an `ActivityNode` at the next free position. Matches
   * the static activity add path's behaviour (id generation, ctx-key
   * seeding for declared ports, entryNodeId autoset on empty canvas).
   */
  const mergedCatalog = useActivityCatalog();
  // 14.8 — the palette's "New custom node" modal publishes and then asks the
  // canvas to drop `dyn.<slug>` immediately. Two things make the rendered
  // catalog the wrong thing to read at that moment:
  //
  //   1. the modal's callback is a closure captured BEFORE the publish, so a
  //      callback closing over `mergedCatalog.entries` sees the pre-publish
  //      array; and
  //   2. even after the publish awaits its cache invalidation, React has not
  //      re-rendered this component yet, so a ref updated during render is
  //      still a commit behind.
  //
  // The TanStack cache, by contrast, is correct the instant the refetch
  // settles — so read that first and fall back to what is rendered. Without
  // this the lookup below found nothing and `addDynamicNode` returned
  // silently: modal closed, green "Published" toast, canvas unchanged.
  const catalogEntriesRef = useRef(mergedCatalog.entries);
  catalogEntriesRef.current = mergedCatalog.entries;
  const queryClient = useQueryClient();
  const findCatalogEntry = useCallback(
    (activityType: string) => {
      const cached = queryClient
        .getQueriesData<ActivityCatalogResponse>({
          queryKey: ACTIVITY_CATALOG_QUERY_KEY,
        })
        .flatMap(([, data]) => data?.entries ?? []);
      return (
        cached.find((e) => e.activityType === activityType) ??
        catalogEntriesRef.current.find((e) => e.activityType === activityType)
      );
    },
    [queryClient],
  );

  const addDynamicNode = useCallback(
    (slug: string, position?: { x: number; y: number }) => {
      const activityType = `dyn.${slug}`;
      const entry = findCatalogEntry(activityType);
      if (!entry) return;
      const id = makeNodeId(config, activityType);
      const pos = position ?? defaultStaggerPosition(config);
      const parameters = materialiseParamDefaults(entry.paramsSchema);
      // Like the static activity path, a freshly dropped dynamic node carries
      // NO port bindings — the auto-wire resolver owns input binding and
      // synthesises producer output bindings on demand. See `addActivity`.
      const newNode: ActivityNode = {
        id,
        type: "activity",
        label: entry.displayName ?? slug,
        activityType,
        inputs: [],
        outputs: [],
        parameters,
        metadata: {
          position: pos,
        },
      };
      setConfig((prev) => {
        const nextEntryNodeId = prev.entryNodeId === "" ? id : prev.entryNodeId;
        const nextNodes = { ...prev.nodes, [id]: newNode };
        return {
          ...prev,
          nodes: nextNodes,
          entryNodeId: nextEntryNodeId,
        };
      });
      setSelectedNodeId(id);
    },
    [config, findCatalogEntry, setSelectedNodeId],
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    // G-002: deleting the sole writer of a ctx variable that other steps still
    // read is the one moment "this key lost its source" is knowable — after
    // the delete, a declared-but-unwritten key is indistinguishable from a
    // workflow input. The prune lives inside the shared
    // `removeNodesFromConfig` so no delete path can forget it; the toast names
    // what broke. Described BEFORE the write, while the writers still exist.
    const removedIds = new Set([selectedNodeId]);
    setConfig((prev) => removeNodesFromConfig(prev, removedIds));
    setSelectedNodeId(null);
    showOrphanedDeleteToast(config, removedIds, undo);
  }, [config, selectedNodeId, setConfig, undo]);

  const handleSave = useCallback(async () => {
    const cleanedName = name.trim() || "Untitled workflow";
    const cleanedDescription = description.trim();
    const persisted = stripRedundantLocks(config);
    const dto: CreateWorkflowDto = {
      name: cleanedName,
      description: cleanedDescription || undefined,
      config: {
        ...persisted,
        metadata: {
          ...persisted.metadata,
          name: cleanedName,
          description: cleanedDescription || undefined,
        },
      },
    };
    try {
      if (isEditMode && workflowId) {
        // G-063 — the version this editor loaded IS the base these edits sit
        // on. Sending it lets the backend refuse a save that would silently
        // overwrite one another tab (or the agent) landed in the meantime.
        if (existingWorkflow === undefined) {
          throw new Error(
            "Still loading this workflow — try saving again in a moment.",
          );
        }
        const saved = await updateWorkflow.mutateAsync({
          id: workflowId,
          dto: { ...dto, expectedVersion: existingWorkflow.version },
        });
        // §4.4: the save invalidates ['workflow'] → refetch. Re-baseline so
        // the post-save hydration re-adopts the (now-saved) server config and
        // future agent writes can hydrate again.
        lastHydratedConfigRef.current = null;
        showSavedToast(
          "Saved",
          `Updated "${cleanedName}".`,
          saved.validation,
          reviewSavedIssues,
        );
      } else {
        const created = await createWorkflow.mutateAsync(dto);
        showSavedToast(
          "Created",
          `Workflow "${cleanedName}" saved.`,
          created.validation,
          reviewSavedIssues,
        );
        // G-027: re-baseline BEFORE navigating, or the leave-guard would
        // challenge the very navigation that follows a successful save.
        lastHydratedConfigRef.current = configRef.current;
        navigate(`/workflows/${created.workflow.id}/edit`, { replace: true });
      }
    } catch (err) {
      // G-063 — a stale base is not a config problem, so it gets its own
      // message. Telling the author to check their graph would send them
      // looking for a fault that is not there.
      if (err instanceof WorkflowVersionConflictError) {
        notifications.show({
          color: "orange",
          title: "Someone else saved first",
          message: `This workflow moved from v${err.expectedVersion} to v${err.currentVersion} while you were editing. Reload to see their changes — your edits are still on screen, so copy anything you need first.`,
          autoClose: false,
          style: { whiteSpace: "pre-line" },
        });
        return;
      }
      // The validator answers with the exact node + field it objected to.
      // Repeating the headline alone ("Invalid workflow configuration") throws
      // that away and leaves the author to go looking for it.
      const issues = err instanceof WorkflowSaveError ? err.issues : [];
      const headline = err instanceof Error ? err.message : "Unknown error.";
      const shown = issues.slice(0, 3);
      const detail = shown.map((i) => `${i.path} — ${i.message}`).join("\n");
      const more =
        issues.length > shown.length
          ? `\n…and ${issues.length - shown.length} more.`
          : "";
      notifications.show({
        color: "red",
        title: "Save failed",
        message: detail ? `${headline}\n${detail}${more}` : headline,
        autoClose: detail ? 10_000 : undefined,
        style: { whiteSpace: "pre-line" },
      });
    }
  }, [
    config,
    createWorkflow,
    description,
    existingWorkflow,
    isEditMode,
    name,
    navigate,
    reviewSavedIssues,
    updateWorkflow,
    workflowId,
  ]);

  const handleSaveAsLibrary = useCallback(
    async (submission: SaveAsLibrarySubmission): Promise<void> => {
      const cleanedName = submission.name.trim() || "Untitled library";
      const cleanedDescription = submission.description.trim();
      const persisted = stripRedundantLocks(config);
      const dto: CreateWorkflowDto = {
        name: cleanedName,
        description: cleanedDescription || undefined,
        kind: "library",
        config: {
          ...persisted,
          metadata: {
            ...persisted.metadata,
            name: cleanedName,
            description: cleanedDescription || undefined,
            kind: "library",
            inputs: submission.inputs,
            outputs: submission.outputs,
          },
        },
      };
      try {
        await createWorkflow.mutateAsync(dto);
        notifications.show({
          color: "green",
          title: "Saved as library",
          message: `Library "${cleanedName}" created. Open it from the library picker on any childWorkflow node.`,
        });
        setSaveAsLibraryOpen(false);
      } catch (err) {
        notifications.show({
          color: "red",
          title: "Save as library failed",
          message: err instanceof Error ? err.message : "Unknown error.",
        });
        throw err;
      }
    },
    [config, createWorkflow],
  );

  /**
   * Revert-to-version handler (US-083). Opens a confirm modal warning the
   * user the in-flight canvas state will be replaced with the selected
   * version's config. On confirm, calls `useRevertWorkflowHead`; on
   * success, closes the history drawer and notifies. The query
   * invalidation inside the hook causes `useWorkflow(workflowId)` to
   * refetch, which is then synced into canvas state by the existing
   * `useEffect` above (the one that depends on `existingWorkflow`).
   */
  const handleRevert = useCallback(
    (versionId: string, versionNumber: number, createdAt: string) => {
      if (!workflowId) return;
      const created = new Date(createdAt);
      const createdLabel = Number.isNaN(created.getTime())
        ? createdAt
        : created.toLocaleString();
      modals.openConfirmModal({
        title: "Revert to this version?",
        children: (
          <Text size="sm">
            Reverting will replace the current head with v{versionNumber},
            created {createdLabel}. Any unsaved canvas changes will be
            discarded. Continue?
          </Text>
        ),
        labels: { confirm: "Revert", cancel: "Cancel" },
        confirmProps: { color: "red", "data-testid": "revert-confirm-button" },
        cancelProps: { "data-testid": "revert-cancel-button" },
        onConfirm: async () => {
          try {
            await revertWorkflow.mutateAsync({
              lineageId: workflowId,
              workflowVersionId: versionId,
            });
            setHistoryDrawerOpen(false);
            notifications.show({
              color: "green",
              title: `Reverted to v${versionNumber}`,
              message: "The editor now reflects the reverted version.",
            });
          } catch (err) {
            notifications.show({
              color: "red",
              title: "Revert failed",
              message: err instanceof Error ? err.message : "Unknown error.",
            });
          }
        },
      });
    },
    [workflowId, revertWorkflow],
  );

  /**
   * Compare-to-head handler (US-084). Stores the selected (non-head)
   * version into local state; the modal renders only when this state
   * is non-null and `existingWorkflow` is available (we reuse the
   * already-loaded head from `useWorkflow` — no extra fetch).
   */
  const handleCompare = useCallback(
    (versionId: string, versionNumber: number, createdAt: string) => {
      setCompareState({ versionId, versionNumber, createdAt });
    },
    [],
  );

  const isSaving = createWorkflow.isPending || updateWorkflow.isPending;
  const nodeCount = useMemo(
    () => Object.keys(config.nodes).length,
    [config.nodes],
  );

  // Which tab the one Run… button opens on. Until batch-four item 8 this
  // same input analysis decided whether the separate "Try" button was
  // shown at all (US-148); with one entry point it decides the DEFAULT
  // TAB instead, which is what the decision doc asked for
  // (feature-docs/20260806-inderdeep-ux-review-batch-four/DECISIONS/08-try-vs-run.md):
  // pre-select from the workflow, not from which button was pressed.
  //
  // "Try on canvas" is meaningful whenever there is an input path that is
  // NOT a file upload — a source.api node or an isInput-flagged ctx key,
  // or no source.upload at all. When source.upload is the SOLE input path
  // there is nothing to type into a Try, so the drawer opens on "Call
  // from outside" and the upload dropzone below the tabs (plus the source
  // node's own "Upload & Try") is the way in. Walks `config.nodes` for
  // source subtype and inspects `config.ctx` for `isInput: true` — the
  // same detection the RunWorkflowDrawer applies to the backend's
  // `/run-spec` payload (US-123).
  const runDrawerOpenMode = useMemo<RunWorkflowDrawerOpenMode>(() => {
    let hasSourceApi = false;
    let hasSourceUpload = false;
    for (const node of Object.values(config.nodes)) {
      if (node.type !== "source") continue;
      if (node.sourceType === "source.api") hasSourceApi = true;
      else if (node.sourceType === "source.upload") hasSourceUpload = true;
    }
    const hasIsInputCtx = Object.values(config.ctx).some(
      (decl) => decl.isInput === true,
    );
    const canvasTryMeaningful =
      hasSourceApi || hasIsInputCtx || !hasSourceUpload;
    return canvasTryMeaningful ? "try" : "run";
  }, [config.nodes, config.ctx]);

  if (isEditMode && isLoading) {
    return (
      <Stack align="center" justify="center" mih="60vh">
        <Loader />
        <Text size="sm" c="dimmed">
          Loading workflow…
        </Text>
      </Stack>
    );
  }

  return (
    <Stack
      gap={0}
      style={{
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        gap="md"
        p="sm"
        style={{
          borderBottom:
            "1px solid var(--mantine-color-default-border, #2c2e33)",
          background: "var(--mantine-color-body, #1a1b1e)",
        }}
      >
        {/*
          P-3 (ruling R-2, 2026-08-03) — one row, one baseline, four
          divider-separated groups:

            [ name ⌄ · counts ] │ [ find · simplified · arrange · fit ] │
            [ undo/redo · validity ] │ [ Save · Try · Run · More ]

          What it replaces: Name and Description as labelled `TextInput`s. Their
          labels sat ABOVE them, so the row was ~1.5× taller than its buttons
          needed and nothing shared a baseline; Description truncated mid-word
          at 280px, unreadable while editing; and four consecutive input boxes
          (switcher, Name, Description, find-a-node) read as one form, which
          made node search look like workflow metadata. Name is a click-to-edit
          title now and Description moved to Workflow settings, which is ~560px
          reclaimed — enough room to bring the two mode controls out of the
          overflow menu. The dividers are what say which group a control is in.

          Simplified view and Auto-arrange left the More menu. Simplified view
          changes what you are LOOKING at, which is not a menu item's job, and
          Auto-arrange is used often enough that two clicks was one too many.
          Both keep their `topbar-menu-*` testids: e2e reaches for them by id
          and the id is a name, not an address.

          The `topbar-zone-*` testids also survive the reshuffle —
          `topbar-zone-right` now wraps BOTH right-hand groups, because the
          validation e2e scopes its "Valid" / "1 warning" button lookup to it
          to avoid colliding with the identically-labelled node badges.

          ── How the row survives a narrow window (2026-08-06 batch, the
          overflow defect the screenshot script documents) ───────────────
          Measured in Chromium at the widths below: from 1512px down the bar
          overflowed and the disabled Undo button sat ON TOP of the Simplified
          switch. Three flex mistakes, all in the styles just below:

            · the LEFT zone was `flexShrink: 0`, so a 448px zone whose content
              is mostly a truncatable title never gave a pixel back;
            · the CENTRE zone was `minWidth: 0`, which lets a nowrap flex
              container shrink BELOW its own content — the children do not
              shrink with it, they spill out of the box and under the next
              zone. That spill is the overlap;
            · the RIGHT zone had no shrink rule at all.

          So the shrink order is now stated explicitly. Right (the actions) is
          `flexShrink: 0` and never yields. Centre may shrink but is floored at
          `min-content`, so its children can never spill. Left absorbs all the
          remaining pressure, and its two shrinkable children truncate — the
          counts first (`flexShrink: 3`), the title second, because a squeezed
          "12 nodes · 11 edges" costs less than a squeezed name.

          Nothing is hidden and nothing is duplicated into a menu: every
          control stays where it was, it just gets narrower. jsdom runs no
          layout, so the tests can only pin these rules; the evidence is the
          browser measurement recorded in WORKLOG.
        */}
        <Group
          gap="xs"
          wrap="nowrap"
          style={{ minWidth: 0, flexShrink: 1 }}
          data-testid="topbar-zone-left"
        >
          {/*
              UX walkthrough 2026-08-06 item 14 — the name is the leftmost
              thing (click it to rename) and the chevron beside it opens the
              switcher. They sit in their own tight group so the chevron reads
              as belonging to the name rather than as a separate control.
            */}
          <Group gap={2} wrap="nowrap" style={{ minWidth: 0 }}>
            <WorkflowTitleField value={name} onChange={setName} />
            <WorkflowSwitcher currentWorkflowId={workflowId ?? null} />
          </Group>
          <Text
            size="xs"
            c="dimmed"
            truncate="end"
            style={{ flexShrink: 3, minWidth: 0 }}
          >
            {nodeCount} node{nodeCount === 1 ? "" : "s"} · {config.edges.length}{" "}
            edge
            {config.edges.length === 1 ? "" : "s"}
            {isEditMode ? " · editing" : " · creating"}
          </Text>
        </Group>

        <TopBarDivider />

        <Group
          gap="xs"
          wrap="nowrap"
          style={{ flex: "1 1 auto", minWidth: "min-content" }}
          data-testid="topbar-zone-center"
        >
          {/*
              G-009 — find a node in THIS graph. Sits with the view controls
              rather than in the palette, because the palette's search answers
              the other question (what can I add?). Picking a result goes
              through the batch-8 select+reveal helpers.
            */}
          <NodeSearchBox config={config} onSelectNode={selectAndRevealNode} />
          <Switch
            size="xs"
            label="Simplified"
            labelPosition="left"
            checked={simplifiedView}
            onChange={(e) =>
              handleSimplifiedViewChange(e.currentTarget.checked)
            }
            aria-label="Toggle simplified view"
            data-testid="simplified-view-toggle"
            styles={{
              track: { cursor: "pointer" },
              label: { whiteSpace: "nowrap" },
            }}
            wrapperProps={{ "data-testid": "topbar-menu-simplified-view" }}
          />
          <Tooltip label="Auto-arrange the graph" withArrow>
            <Button
              variant="default"
              size="xs"
              px={8}
              onClick={handleAutoArrange}
              disabled={nodeCount === 0}
              aria-label="Auto-arrange"
              data-testid="topbar-menu-auto-arrange"
              data-disabled={nodeCount === 0}
            >
              <IconLayoutDistributeHorizontal size={16} />
            </Button>
          </Tooltip>
          <Tooltip label="Fit the whole graph in view" withArrow>
            <Button
              variant="default"
              size="xs"
              px={8}
              onClick={handleFitView}
              disabled={nodeCount === 0}
              aria-label="Fit view"
              data-testid="topbar-fit-view"
              data-disabled={nodeCount === 0}
            >
              <IconMaximize size={16} />
            </Button>
          </Tooltip>
        </Group>

        <TopBarDivider />

        <Group
          gap="sm"
          wrap="nowrap"
          style={{ flexShrink: 0 }}
          data-testid="topbar-zone-right"
        >
          <Group gap="xs" wrap="nowrap" data-testid="topbar-group-state">
            {/*
                G-003 — visible undo/redo. The shortcuts exist too, but a
                keyboard-only affordance is undiscoverable, which is the same
                class of gap this batch closes.
              */}
            <Button.Group>
              <Tooltip label="Undo (Ctrl+Z)" withArrow>
                <Button
                  variant="default"
                  size="xs"
                  px={8}
                  onClick={undo}
                  disabled={!canUndo || isReplay}
                  aria-label="Undo"
                  data-testid="undo-button"
                >
                  <IconArrowBackUp size={16} />
                </Button>
              </Tooltip>
              <Tooltip label="Redo (Ctrl+Shift+Z)" withArrow>
                <Button
                  variant="default"
                  size="xs"
                  px={8}
                  onClick={redo}
                  disabled={!canRedo || isReplay}
                  aria-label="Redo"
                  data-testid="redo-button"
                >
                  <IconArrowForwardUp size={16} />
                </Button>
              </Tooltip>
            </Button.Group>
            <ValidationButton
              errorCount={validation.errorCount}
              warningCount={validation.warningCount}
              isPending={validation.isPending}
              onClick={openValidationDrawer}
            />
          </Group>

          <TopBarDivider />

          <Group gap="xs" wrap="nowrap" data-testid="topbar-group-actions">
            <Button
              leftSection={<IconDeviceFloppy size={14} />}
              onClick={handleSave}
              loading={isSaving}
              size="xs"
              data-testid="save-button"
            >
              Save
            </Button>
            {/*
            Draft save (2026-08-02) made "why is Run off?" a question users
            actually ask — before it, an unrunnable graph could not be saved in
            the first place. A disabled button fires no pointer events, so
            neither a Mantine Tooltip nor a native `title` on the button itself
            reaches the user; both render nothing at the moment the reason
            matters most. The inline-flex span is the hover target that does
            fire, so the tooltip works disabled or not.
          */}
            {/*
            Batch-four item 8 (2026-08-08): one button, not two. "Try" and
            "Run this workflow" opened the SAME drawer on different tabs,
            so the top bar offered a choice the drawer then offered again
            one click later. The choice now lives where it belongs — on
            the drawer's two tabs — and the button says only that a run is
            about to be configured.
          */}
            <Tooltip
              label={
                runBlockedReason ??
                "Try this workflow on the canvas, or call it from outside"
              }
            >
              <span style={{ display: "inline-flex" }}>
                <Button
                  variant="light"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => setRunDrawerOpen(true)}
                  size="xs"
                  data-testid="run-this-workflow-button"
                  disabled={runBlockedReason !== null}
                >
                  Run…
                </Button>
              </span>
            </Tooltip>
            <Menu position="bottom-end" withArrow shadow="md">
              <Menu.Target>
                <Button
                  variant="light"
                  leftSection={<IconDots size={14} />}
                  size="xs"
                  data-testid="topbar-more-button"
                >
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconHistory size={14} />}
                  disabled={!workflowId}
                  onClick={() => setHistoryDrawerOpen(true)}
                  data-testid="topbar-menu-history"
                  data-disabled={!workflowId}
                  title={!workflowId ? "Save the workflow first" : undefined}
                >
                  History
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconClipboardList size={14} />}
                  disabled={!workflowId}
                  onClick={() => setRunHistoryDrawerOpen(true)}
                  data-testid="topbar-menu-run-history"
                  data-disabled={!workflowId}
                  title={!workflowId ? "Save the workflow first" : undefined}
                >
                  Run history
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconBookmark size={14} />}
                  disabled={nodeCount === 0}
                  onClick={() => setSaveAsLibraryOpen(true)}
                  data-testid="topbar-menu-save-as-library"
                  data-disabled={nodeCount === 0}
                  title={
                    nodeCount === 0
                      ? "Add at least one node before saving as a library"
                      : undefined
                  }
                >
                  Save as library
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconUsersGroup size={14} />}
                  disabled={selectedNodeIds.length < 2}
                  onClick={handleGroupSelected}
                  data-testid="topbar-menu-group-selected"
                  data-disabled={selectedNodeIds.length < 2}
                  title={
                    selectedNodeIds.length < 2
                      ? "Select 2+ nodes to group them"
                      : undefined
                  }
                >
                  Group selected
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconSettings size={14} />}
                  onClick={() => setSettingsOpen(true)}
                  data-testid="topbar-menu-workflow-settings"
                >
                  Workflow settings
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconHelp size={14} />}
                  component="a"
                  href="/workflows/dev-form-preview"
                  target="_blank"
                  data-testid="topbar-menu-form-preview"
                >
                  Form preview
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Group>

      {/*
        UX walkthrough 2026-08-06 item 13 — replay announces itself here,
        between the bar and the canvas it makes read-only, instead of as a
        chip among the buttons it disables. Rendered only while replaying, so
        it costs no vertical space in normal editing; while it is up, the
        canvas below (flex: 1) simply gets that much shorter.
      */}
      <ReplayModeBanner versionUnavailable={replayVersionUnavailable} />

      <WorkflowSettingsDrawer
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onConfigChange={setConfig}
        onSelectNode={selectAndRevealNode}
      />

      <ValidationDrawer
        opened={validationOpen}
        onClose={() => {
          setValidationOpen(false);
          // Reset the node filter so the next top-bar open is global.
          setValidationFilterNodeId(null);
        }}
        result={validation}
        config={config}
        onNavigate={handleValidationNavigate}
        focusedNodeId={validationFocusNodeId}
        filterNodeId={validationFilterNodeId}
        onShowAll={() => setValidationFilterNodeId(null)}
      />

      <SaveAsLibraryModal
        opened={saveAsLibraryOpen}
        onClose={() => setSaveAsLibraryOpen(false)}
        initialName={name}
        initialDescription={description}
        isSaving={createWorkflow.isPending}
        onSubmit={handleSaveAsLibrary}
      />

      {isEditMode && workflowId && (
        <RunWorkflowDrawer
          opened={runDrawerOpen}
          onClose={() => setRunDrawerOpen(false)}
          workflowId={workflowId}
          headVersionId={existingWorkflow?.workflowVersionId}
          openMode={runDrawerOpenMode}
        />
      )}

      {/*
        US-081 mounted the open/close plumbing for the version-history
        drawer; US-082 fills the drawer body with the real
        `VersionHistoryDrawer` list. The `<Drawer>` wrapper itself stays
        here so the editor owns drawer-open state in one place. The
        Revert / Compare click handlers are wired in US-083 and US-084.
      */}
      <Drawer
        opened={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        position="right"
        title="Version history"
        data-testid="history-drawer"
      >
        {workflowId && (
          <VersionHistoryDrawer
            lineageId={workflowId}
            headVersionId={existingWorkflow?.workflowVersionId}
            onRevert={handleRevert}
            onCompare={handleCompare}
          />
        )}
      </Drawer>

      {/*
          US-153 — Phase 4 Run-history drawer. Right-side, large, mounted
          here so the editor owns drawer-open state in one place
          (sibling to the Version-history drawer above). Body
          (`RunHistoryDrawer`) handles filters + infinite-scroll list.
        */}
      <Drawer
        opened={runHistoryDrawerOpen}
        onClose={() => setRunHistoryDrawerOpen(false)}
        position="right"
        size="lg"
        title="Run history"
        data-testid="run-history-drawer-wrapper"
      >
        {workflowId && (
          <RunHistoryDrawerBody
            workflowId={workflowId}
            headVersionId={existingWorkflow?.workflowVersionId}
            onClose={() => setRunHistoryDrawerOpen(false)}
          />
        )}
      </Drawer>

      {compareState && existingWorkflow && workflowId && (
        <CompareToHeadModal
          opened={true}
          onClose={() => setCompareState(null)}
          lineageId={workflowId}
          selectedVersionId={compareState.versionId}
          selectedVersionNumber={compareState.versionNumber}
          selectedCreatedAt={compareState.createdAt}
          headWorkflow={existingWorkflow}
        />
      )}

      <Box
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
        }}
      >
        <ActivityPalette
          onAddActivity={addActivity}
          onAddControlFlowNode={addControlFlowNode}
          onAddSource={addSource}
          onAddDynamicNode={addDynamicNode}
        />
        <Box
          style={{ flex: 1, minWidth: 0, position: "relative" }}
          data-testid="workflow-editor-canvas-drop"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData(
              "application/x-workflow-palette",
            );
            if (!raw) return;
            e.preventDefault();
            let payload: unknown;
            try {
              payload = JSON.parse(raw);
            } catch {
              return;
            }
            if (!payload || typeof payload !== "object") return;
            const p = payload as {
              kind?: string;
              activityType?: string;
              type?: string;
              sourceType?: string;
              slug?: string;
            };
            const instance = reactFlowRef.current;
            const position =
              instance && typeof instance.screenToFlowPosition === "function"
                ? instance.screenToFlowPosition({
                    x: e.clientX,
                    y: e.clientY,
                  })
                : undefined;
            switch (p.kind) {
              case "activity":
                if (p.activityType) addActivity(p.activityType, position);
                break;
              case "controlFlow":
                if (p.type)
                  addControlFlowNode(p.type as ControlFlowNodeType, position);
                break;
              case "source":
                if (p.sourceType) addSource(p.sourceType, position);
                break;
              case "dynamic":
                if (p.slug) addDynamicNode(p.slug, position);
                break;
              default:
                break;
            }
          }}
        >
          {nodeCount === 0 && (
            <Box
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              <Stack
                gap={4}
                align="center"
                style={{
                  background: "rgba(0,0,0,0.5)",
                  padding: "12px 24px",
                  borderRadius: 8,
                  pointerEvents: "auto",
                }}
              >
                <Text size="sm" c="dimmed">
                  Click an activity in the palette to start your workflow.
                </Text>
              </Stack>
            </Box>
          )}
          <WorkflowEditorCanvas
            config={displayConfig}
            selectedNodeId={selectedNodeId}
            onConfigChange={handleCanvasConfigChange}
            onSelectNode={setSelectedNodeId}
            onSelectionChangeMany={setSelectedNodeIds}
            onGroupSelection={handleGroupSelected}
            errorsByNode={validation.errorsByNode}
            onNodeBadgeClick={handleProblemBadgeClick}
            onReactFlowReady={handleReactFlowReady}
            simplifiedView={simplifiedView}
            onGroupChipClick={openGroupPanel}
            onSelectMapBodyNode={selectNodeSticky}
            layoutNonce={layoutNonce}
            onFixNodeInput={handleFixNodeInput}
            highlightedNodeId={highlightedNodeId}
            onUndo={undo}
          />
        </Box>
        <NodeSettingsPanel
          config={displayConfig}
          selectedNodeId={selectedNodeId}
          activeGroupId={activeGroupId}
          onConfigChange={handleCanvasConfigChange}
          onDeleteSelected={deleteSelected}
          workflowId={isEditMode ? workflowId : undefined}
          focusInput={focusInput}
          onFocusInputConsumed={clearFocusInput}
          onJumpToProducer={selectAndRevealNode}
          onHoverProducer={handleHoverProducer}
        />
      </Box>
    </Stack>
  );
}

/**
 * The rule between two top-bar groups (P-3). Height is explicit because the
 * bar's `<Group>` centres its children — a vertical `Divider` left to stretch
 * in a centred flex row collapses to nothing.
 */
function TopBarDivider() {
  return (
    <Divider
      orientation="vertical"
      style={{ height: 24, alignSelf: "center" }}
    />
  );
}

interface ValidationButtonProps {
  errorCount: number;
  warningCount: number;
  isPending: boolean;
  onClick: () => void;
}

function ValidationButton({
  errorCount,
  warningCount,
  isPending,
  onClick,
}: ValidationButtonProps) {
  // Severity split lives in `validationButtonState` (G-097) so it can be
  // tested without mounting this page.
  const { tone: color, label } = validationButtonState(
    errorCount,
    warningCount,
  );
  const Icon =
    color === "red"
      ? IconExclamationCircle
      : color === "yellow"
        ? IconAlertTriangle
        : IconCircleCheck;
  return (
    <Button
      variant="light"
      color={color}
      leftSection={<Icon size={14} />}
      onClick={onClick}
      size="xs"
      title={isPending ? "Re-checking…" : label}
    >
      {label}
    </Button>
  );
}

/**
 * Replay-mode banner (US-154; reshaped by the 2026-08-06 UX walkthrough,
 * item 13). Renders a full-width strip between the top bar and the canvas
 * when `isReplay === true`; otherwise renders nothing. "Leave replay"
 * restores live mode by resetting both `activeRunId` and `isReplay` on
 * `RunStateContext`. Must be mounted inside the `RunStateProvider` subtree.
 *
 * Why a banner and not the chip it replaces (DECISIONS/13-replay-mode.md):
 * this was a filled Mantine `Badge` parked in the top bar's action row, and
 * Alex read it as a stray tag — *"there's like a weird tag there … it makes
 * sense for it to be an indicator somewhere, but perhaps not there and not
 * like that."* Two things were wrong with the chip beyond where it sat.
 * First, replay is a MODE that silently swallows work — Undo/Redo are
 * disabled and config edits hit `if (isReplay) return;` in three handlers —
 * so an author drags a node, types in a field, presses Ctrl+Z, and nothing
 * happens with no explanation. A badge is not proportionate to that.
 * Second, the badge was already carrying a full sentence with a caveat in a
 * control sized for a word: the orange state means the run's version could
 * not be loaded, so **the graph on screen is the current one while the run
 * came from an older one** — the single most important thing the editor can
 * say at that moment, and it was squeezed into a chip. Here each state is a
 * sentence with room to be one.
 *
 * Layout: a `flexShrink: 0` sibling of the top bar inside the page's
 * height-100% column, so the space it takes comes out of the canvas below
 * and nothing overflows. It is deliberately NOT in the top bar, which is
 * where the controls it explains the deadness of live, and whose horizontal
 * budget item 14 has just finished reclaiming.
 */
function ReplayModeBanner({
  versionUnavailable,
}: {
  versionUnavailable?: boolean;
}) {
  const { isReplay, replayVersion, setActiveRunId, setIsReplay } =
    useRunState();
  if (!isReplay) return null;
  const handleClear = () => {
    setActiveRunId(null);
    setIsReplay(false);
  };
  // G-004 — an author who cannot tell WHICH graph they are looking at has
  // the same problem in a new form, so name the version and say plainly when
  // it could not be loaded.
  // A run started without a version memo reports `versionNumber: 0` (the
  // API's `?? 0` fallback). v0 is not a version that exists, so say the
  // version is unknown rather than inventing one — same rule as RunRow.
  const namedVersion =
    replayVersion && replayVersion.versionNumber > 0 ? replayVersion : null;
  const headline = versionUnavailable
    ? namedVersion
      ? `Replay mode — v${namedVersion.versionNumber} could not be loaded, so this is the current graph`
      : "Replay mode — the run's version could not be loaded, so this is the current graph"
    : namedVersion
      ? `Replay mode — you are looking at v${namedVersion.versionNumber}, the graph this run used`
      : "Replay mode — version unknown, so this is the graph the run recorded";
  const detail = versionUnavailable
    ? namedVersion
      ? `This run was executed on v${namedVersion.versionNumber}, but that version could not be fetched. What you see is the workflow as it stands today, which may differ from what actually ran — nodes may have been added, removed or reconfigured since. The canvas is read-only: edits, Undo and Redo do nothing until you leave replay.`
      : "The version this run was executed on could not be fetched. What you see is the workflow as it stands today, which may differ from what actually ran. The canvas is read-only: edits, Undo and Redo do nothing until you leave replay."
    : namedVersion
      ? `The canvas is read-only while you are here: edits, Undo and Redo do nothing until you leave replay. Leaving returns you to the workflow you were editing, with your unsaved changes intact.`
      : "This run did not record which version it used, so the version on screen cannot be named. The canvas is read-only: edits, Undo and Redo do nothing until you leave replay.";
  const accent = versionUnavailable ? "orange" : "blue";
  return (
    <Box
      data-testid="replay-mode-indicator"
      data-version-number={replayVersion?.versionNumber ?? ""}
      data-version-unavailable={versionUnavailable ? "true" : "false"}
      role="status"
      px="sm"
      py={8}
      style={{
        flexShrink: 0,
        borderBottom: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderLeft: `3px solid var(--mantine-color-${accent}-6)`,
        background: `var(--mantine-color-${accent}-light)`,
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        {versionUnavailable ? (
          <IconAlertTriangle
            size={18}
            style={{ flexShrink: 0, marginTop: 2 }}
            color={`var(--mantine-color-${accent}-6)`}
          />
        ) : (
          <IconRewindBackward10
            size={18}
            style={{ flexShrink: 0, marginTop: 2 }}
            color={`var(--mantine-color-${accent}-6)`}
          />
        )}
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} c={`${accent}.8`}>
            {headline}
          </Text>
          <Text size="xs" c="dimmed">
            {detail}
          </Text>
        </Stack>
        <Button
          variant="default"
          size="xs"
          onClick={handleClear}
          data-testid="replay-mode-clear"
          aria-label="Leave replay mode"
          style={{ flexShrink: 0 }}
        >
          Leave replay
        </Button>
      </Group>
    </Box>
  );
}

/**
 * Inner wrapper around `<RunHistoryDrawer>` that bridges the drawer's
 * replay callback into `RunStateContext` and the editor's drawer-open
 * state (US-154):
 *
 *   1. Sets `activeRunId = runId` + `isReplay = true` on the context.
 *   2. Closes the drawer via the supplied `onClose` callback.
 *
 * Mounted inside the `RunStateProvider` subtree so `useRunState()`
 * resolves to the same provider that wraps the canvas.
 */
function RunHistoryDrawerBody({
  workflowId,
  headVersionId,
  onClose,
}: {
  workflowId: string;
  headVersionId?: string;
  onClose: () => void;
}) {
  const { startReplay } = useRunState();
  // G-004 — carry the run's own version into replay so the canvas renders
  // the graph that actually ran, not whatever is on screen now.
  const handleReplay = (runId: string, version: ReplayVersionRef) => {
    startReplay(runId, version);
    onClose();
  };
  return (
    <RunHistoryDrawer
      workflowId={workflowId}
      headVersionId={headVersionId}
      onReplay={handleReplay}
    />
  );
}

function makeNodeId(config: GraphWorkflowConfig, activityType: string): string {
  const base = activityType.replace(/[^A-Za-z0-9]+/g, "_");
  let suffix = 1;
  let id = `${base}_${suffix}`;
  while (config.nodes[id]) {
    suffix += 1;
    id = `${base}_${suffix}`;
  }
  return id;
}

/**
 * Default stagger position used by every add-* handler when the caller does
 * not supply an explicit `position`. Matches the formula the click-to-add
 * paths have shipped with since the palette landed; extracted so the
 * drop-from-palette path can fall back to the same behaviour for callers
 * that don't pass coords.
 */
function defaultStaggerPosition(config: GraphWorkflowConfig): {
  x: number;
  y: number;
} {
  const offsetIndex = Object.keys(config.nodes).length;
  return {
    x: 80 + offsetIndex * 240,
    y: 100 + (offsetIndex % 3) * 140,
  };
}
