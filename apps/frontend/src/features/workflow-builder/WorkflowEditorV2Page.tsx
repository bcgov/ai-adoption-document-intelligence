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
  ActionIcon,
  Badge,
  Box,
  Button,
  Drawer,
  Group,
  Loader,
  Menu,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBolt,
  IconBookmark,
  IconCircleCheck,
  IconClipboardList,
  IconDeviceFloppy,
  IconDots,
  IconExclamationCircle,
  IconHelp,
  IconHistory,
  IconLayoutDistributeHorizontal,
  IconPlayerPlay,
  IconRewindBackward10,
  IconSettings,
  IconUsersGroup,
  IconX,
} from "@tabler/icons-react";
import type { ReactFlowInstance } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  type CreateWorkflowDto,
  useCreateWorkflow,
  useRevertWorkflowHead,
  useUpdateWorkflow,
  useWorkflow,
} from "../../data/hooks/useWorkflows";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
  SourceNode,
} from "../../types/workflow";
import { configWantsArrangeOnLoad, nodesAllMeasured } from "./arrange-on-load";
import {
  layoutGraphIfMissingPositions,
  layoutGraphWithMapBodies,
} from "./canvas/auto-layout";
import {
  mergeNodeGroups,
  stripSyntheticMapBodyGroups,
  synthesizeMapBodyGroups,
} from "./canvas/map-body-groups";
import { removeNodesFromConfig } from "./canvas/remove-nodes";
import { WorkflowEditorCanvas } from "./canvas/WorkflowEditorCanvas";
import { showOrphanedDeleteToast } from "./delete-orphan-toast";
import { materialiseParamDefaults, useActivityCatalog } from "./dynamic-nodes";
import {
  createGroupFromSelection,
  filterOutSyntheticBodyMembers,
} from "./group/create-group";
import {
  SaveAsLibraryModal,
  type SaveAsLibrarySubmission,
} from "./library/SaveAsLibraryModal";
import { ActivityPalette } from "./palette/ActivityPalette";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "./palette/control-flow-skeletons";
import { RunStateProvider, useRunState } from "./run/RunStateContext";
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
import { useGraphValidation } from "./validation/useGraphValidation";
import { ValidationDrawer } from "./validation/ValidationDrawer";
import { CompareToHeadModal } from "./versioning/CompareToHeadModal";
import { VersionHistoryDrawer } from "./versioning/VersionHistoryDrawer";

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

export function WorkflowEditorV2Page({ mode }: WorkflowEditorV2PageProps) {
  const navigate = useNavigate();
  const { workflowId } = useParams<{ workflowId: string }>();
  const location = useLocation();
  const isEditMode = mode === "edit";

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
  const [description, setDescription] = useState(
    incomingTemplate?.description ?? "",
  );
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
  // Item 6X — click a real-producer input row: select the producer so its
  // selection sticks (same helper the problems deep-link uses) and pan/center
  // it into view via the live ReactFlow instance. Prefer `setCenter` (keeps
  // the current zoom, a gentle pan) using the node's measured center; fall
  // back to `fitView` on the single node when the instance can't resolve it.
  const handleJumpToProducer = useCallback(
    (nodeId: string) => {
      selectNodeSticky(nodeId);
      const instance = reactFlowRef.current;
      if (!instance) return;
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
      } else {
        instance.fitView({
          padding: 0.2,
          duration: 300,
          nodes: [{ id: nodeId }],
        });
      }
    },
    [selectNodeSticky],
  );
  // Item 6X — hover a real-producer input row (node id) / leave it (`null`).
  const handleHoverProducer = useCallback(
    (nodeId: string | null) => setHighlightedNodeId(nodeId),
    [],
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [saveAsLibraryOpen, setSaveAsLibraryOpen] = useState(false);
  // US-148: the Run drawer is shared by two top-bar buttons — "Run this
  // workflow" (Phase 2 Track 2) and the new "Try" button (Phase 4). A
  // single state slot tracks both: `null` means the drawer is closed;
  // a non-null value identifies which trigger opened it so US-149's tab
  // logic can pre-select the right tab via `RunWorkflowDrawer`'s
  // `openMode` prop.
  const [runDrawerMode, setRunDrawerMode] =
    useState<RunWorkflowDrawerOpenMode | null>(null);
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

  // Render-time synthesis of map-body groups (Spec §6).
  // Synthetic entries are NEVER persisted; they're stripped from any config
  // update the canvas dispatches back through `onConfigChange`.
  const displayConfig = useMemo<GraphWorkflowConfig>(() => {
    const synthetic = synthesizeMapBodyGroups(config);
    if (Object.keys(synthetic).length === 0) return config;
    return {
      ...config,
      nodeGroups: mergeNodeGroups(config.nodeGroups ?? {}, synthetic),
    };
  }, [config]);

  const handleCanvasConfigChange = useCallback(
    (next: GraphWorkflowConfig) => {
      const stripped = next.nodeGroups
        ? { ...next, nodeGroups: stripSyntheticMapBodyGroups(next.nodeGroups) }
        : next;
      setConfig(resolveBindings(stripped));
    },
    [setConfig],
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
  const undo = useCallback(() => {
    undoHistory();
    setLayoutNonce((n) => n + 1);
  }, [undoHistory]);
  const redo = useCallback(() => {
    redoHistory();
    setLayoutNonce((n) => n + 1);
  }, [redoHistory]);

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
      // Cluster each map's body members under dagre (and strip the synthetic
      // groups back out) so the body-container box wraps just its members
      // instead of sprawling after arrange. See layoutGraphWithMapBodies.
      persist(layoutGraphWithMapBodies(configRef.current, { nodeWidths }));
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
    [],
  );

  /**
   * The top-bar **More ▸ Auto-arrange** action. A deliberate authoring edit —
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
   * The `metadata.arrangeOnLoad` path. Fires by itself ~1.5s after a demo
   * opens, with nobody asking for it, so it goes through `resetConfig` and is
   * NOT an undo step — otherwise every demo would open with a phantom entry
   * already at the bottom of its undo stack, and the author's first Ctrl+Z
   * would scramble the layout they were shown.
   *
   * Same layout, different persistence. That is the whole distinction.
   */
  const handleArrangeOnLoad = useCallback(
    () => runAutoArrange(resetConfig),
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
  const lastHydratedConfigRef = useRef<GraphWorkflowConfig | null>(null);
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

  // Hydrate state when the workflow loads in edit mode.
  // Run auto-layout when the loaded config carries no node positions — e.g.
  // seeded workflows (docs-md/graph-workflows/templates/*.json) and any
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
    const incoming = resolveBindings(
      normaliseLocks(layoutGraphIfMissingPositions(existingWorkflow.config)),
    );
    lastHydratedConfigRef.current = incoming;
    setName(existingWorkflow.name);
    setDescription(existingWorkflow.description ?? "");
    // G-003: `resetConfig` — adopting the server's copy is a lifecycle
    // update, not an author edit. Undo must never walk backwards INTO a
    // hydration; it walks back through what the author did.
    resetConfig(incoming);
    // Demos ship with `metadata.arrangeOnLoad` so they open in the tidy
    // measured-width Auto-arrange view without the viewer clicking the button.
    // Fire once per workflow id, after the canvas measures the cards.
    if (
      workflowId &&
      arrangedForRef.current !== workflowId &&
      configWantsArrangeOnLoad(existingWorkflow.config)
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
  const addDynamicNode = useCallback(
    (slug: string, position?: { x: number; y: number }) => {
      const activityType = `dyn.${slug}`;
      const entry = mergedCatalog.entries.find(
        (e) => e.activityType === activityType,
      );
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
    [config, mergedCatalog.entries, setSelectedNodeId],
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
        await updateWorkflow.mutateAsync({ id: workflowId, dto });
        // §4.4: the save invalidates ['workflow'] → refetch. Re-baseline so
        // the post-save hydration re-adopts the (now-saved) server config and
        // future agent writes can hydrate again.
        lastHydratedConfigRef.current = null;
        notifications.show({
          color: "green",
          title: "Saved",
          message: `Updated "${cleanedName}".`,
        });
      } else {
        const created = await createWorkflow.mutateAsync(dto);
        notifications.show({
          color: "green",
          title: "Created",
          message: `Workflow "${cleanedName}" saved.`,
        });
        // G-027: re-baseline BEFORE navigating, or the leave-guard would
        // challenge the very navigation that follows a successful save.
        lastHydratedConfigRef.current = configRef.current;
        navigate(`/workflows/${created.id}/edit`, { replace: true });
      }
    } catch (err) {
      notifications.show({
        color: "red",
        title: "Save failed",
        message: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }, [
    config,
    createWorkflow,
    description,
    isEditMode,
    name,
    navigate,
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

  // US-148: the in-canvas "Try" button is the canvas-iteration trigger
  // for workflows whose input does NOT come from a source.upload (the
  // upload settings panel's "Upload & Try" button is the canonical
  // trigger for those). The button is hidden only when source.upload is
  // the SOLE input path — i.e. no source.api and no isInput-flagged
  // ctx. Walks `config.nodes` for source subtype and inspects
  // `config.ctx` for any `isInput: true` declaration; same detection
  // pattern the RunWorkflowDrawer uses (US-123 derives an equivalent
  // signal from the backend's `/run-spec` payload).
  const tryButtonVisible = useMemo(() => {
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
    // Visible whenever there's a non-upload-driven input path. Hidden
    // only when source.upload is the ONLY input.
    return hasSourceApi || hasIsInputCtx || !hasSourceUpload;
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
    // US-149: `RunStateProvider` wraps the entire editor so the
    // `RunWorkflowDrawer`'s Try tab can call `setActiveRunId` BEFORE
    // closing — the canvas's polling loops (US-138) need to see the
    // new run id before the drawer unmounts. Previously this provider
    // only wrapped the canvas Box; lifting it here keeps both the
    // canvas AND the drawer inside the same run-state scope.
    <RunStateProvider workflowId={workflowId ?? ""}>
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
          <Stack
            gap={2}
            style={{ minWidth: 0, flexShrink: 0 }}
            data-testid="topbar-zone-left"
          >
            <Title order={5} m={0}>
              Workflow editor (visual)
            </Title>
            <Text size="xs" c="dimmed">
              {nodeCount} node{nodeCount === 1 ? "" : "s"} ·{" "}
              {config.edges.length} edge
              {config.edges.length === 1 ? "" : "s"}
              {isEditMode ? " · editing" : " · creating"}
            </Text>
          </Stack>

          <Group
            gap="xs"
            wrap="nowrap"
            style={{ flex: 1, minWidth: 0 }}
            data-testid="topbar-zone-center"
          >
            <TextInput
              label="Name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              size="xs"
              style={{ flex: 1, minWidth: 160, maxWidth: 280 }}
            />
            <TextInput
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              size="xs"
              style={{ flex: 1, minWidth: 160, maxWidth: 280 }}
            />
          </Group>

          <Group gap="xs" wrap="nowrap" data-testid="topbar-zone-right">
            <TopBarReplayIndicator />
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
                  disabled={!canUndo}
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
                  disabled={!canRedo}
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
              onClick={() => {
                setValidationFocusNodeId(null);
                setValidationFilterNodeId(null);
                setValidationOpen(true);
              }}
            />
            <Button
              leftSection={<IconDeviceFloppy size={14} />}
              onClick={handleSave}
              loading={isSaving}
              size="xs"
              data-testid="save-button"
            >
              Save
            </Button>
            {tryButtonVisible && (
              <Tooltip
                label="Save the workflow first"
                disabled={isEditMode && !!workflowId}
              >
                <Button
                  variant="filled"
                  color="blue"
                  leftSection={<IconBolt size={14} />}
                  onClick={() => setRunDrawerMode("try")}
                  size="xs"
                  data-testid="try-button"
                  disabled={!isEditMode || !workflowId}
                >
                  Try
                </Button>
              </Tooltip>
            )}
            <Button
              variant="light"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={() => setRunDrawerMode("run")}
              size="xs"
              data-testid="run-this-workflow-button"
              disabled={!isEditMode || !workflowId}
              title={
                !isEditMode || !workflowId
                  ? "Save the workflow first to enable Run."
                  : "Open the run-trigger panel for this workflow"
              }
            >
              Run this workflow
            </Button>
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
                  leftSection={<IconLayoutDistributeHorizontal size={14} />}
                  disabled={nodeCount === 0}
                  onClick={handleAutoArrange}
                  data-testid="topbar-menu-auto-arrange"
                  data-disabled={nodeCount === 0}
                >
                  Auto-arrange
                </Menu.Item>
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
                <Menu.Item
                  leftSection={
                    <Switch
                      size="xs"
                      checked={simplifiedView}
                      onChange={(e) =>
                        handleSimplifiedViewChange(e.currentTarget.checked)
                      }
                      aria-label="Toggle simplified view"
                      data-testid="simplified-view-toggle"
                      styles={{ track: { cursor: "pointer" } }}
                    />
                  }
                  closeMenuOnClick={false}
                  data-testid="topbar-menu-simplified-view"
                >
                  Simplified view
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

        <WorkflowSettingsDrawer
          opened={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          config={config}
          onConfigChange={setConfig}
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
          onSelectNode={setSelectedNodeId}
          onFixNodeInput={handleFixNodeInput}
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
            opened={runDrawerMode !== null}
            onClose={() => setRunDrawerMode(null)}
            workflowId={workflowId}
            headVersionId={existingWorkflow?.workflowVersionId}
            openMode={runDrawerMode ?? "run"}
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
              errorsByNode={validation.errorsByNode}
              onNodeBadgeClick={handleProblemBadgeClick}
              onReactFlowReady={handleReactFlowReady}
              simplifiedView={simplifiedView}
              onGroupChipClick={setActiveGroupId}
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
            onJumpToProducer={handleJumpToProducer}
            onHoverProducer={handleHoverProducer}
          />
        </Box>
      </Stack>
    </RunStateProvider>
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
  const total = errorCount + warningCount;
  let color: "red" | "yellow" | "green" = "green";
  let Icon = IconCircleCheck;
  let label = "Valid";
  if (errorCount > 0) {
    color = "red";
    Icon = IconExclamationCircle;
    label = `${total} issue${total === 1 ? "" : "s"}`;
  } else if (warningCount > 0) {
    color = "yellow";
    Icon = IconAlertTriangle;
    label = `${total} warning${warningCount === 1 ? "" : "s"}`;
  }
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
 * Top-bar "Replay mode" indicator (US-154). Renders a small blue chip
 * with a "Clear" button when `isReplay === true`; otherwise renders
 * nothing. Clicking Clear restores live mode by resetting both
 * `activeRunId` and `isReplay` on `RunStateContext`.
 *
 * Lives next to the other top-bar buttons so the user sees at-a-glance
 * that the canvas is displaying historical state. Must be mounted
 * inside the `RunStateProvider` subtree.
 */
function TopBarReplayIndicator() {
  const { isReplay, setActiveRunId, setIsReplay } = useRunState();
  if (!isReplay) return null;
  const handleClear = () => {
    setActiveRunId(null);
    setIsReplay(false);
  };
  return (
    <Badge
      size="md"
      color="blue"
      variant="filled"
      leftSection={<IconRewindBackward10 size={12} />}
      rightSection={
        <Tooltip label="Clear replay mode" withArrow>
          <ActionIcon
            size="xs"
            variant="transparent"
            color="white"
            onClick={handleClear}
            data-testid="replay-mode-clear"
            aria-label="Clear replay mode"
          >
            <IconX size={12} />
          </ActionIcon>
        </Tooltip>
      }
      data-testid="replay-mode-indicator"
    >
      Replay mode
    </Badge>
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
  const { setActiveRunId, setIsReplay } = useRunState();
  const handleReplay = (runId: string) => {
    setActiveRunId(runId);
    setIsReplay(true);
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
