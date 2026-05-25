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
 * Coexists with the old JSON-driven editor at `/workflows/:id/edit`.
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
} from "@ai-di/graph-workflow";
import {
  Box,
  Button,
  Drawer,
  Group,
  Loader,
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
  IconBookmark,
  IconCircleCheck,
  IconDeviceFloppy,
  IconExclamationCircle,
  IconHelp,
  IconHistory,
  IconLayoutDistributeHorizontal,
  IconPlayerPlay,
  IconSettings,
  IconUsersGroup,
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
import {
  layoutGraph,
  layoutGraphIfMissingPositions,
} from "./canvas/auto-layout";
import { WorkflowEditorCanvas } from "./canvas/WorkflowEditorCanvas";
import { createGroupFromSelection } from "./group/create-group";
import {
  SaveAsLibraryModal,
  type SaveAsLibrarySubmission,
} from "./library/SaveAsLibraryModal";
import { ActivityPalette } from "./palette/ActivityPalette";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "./palette/control-flow-skeletons";
import { RunStateProvider } from "./run/RunStateContext";
import { RunWorkflowDrawer } from "./run/RunWorkflowDrawer";
import { NodeSettingsPanel } from "./settings/NodeSettingsPanel";
import { WorkflowSettingsDrawer } from "./settings/WorkflowSettingsDrawer";
import type { WorkflowTemplate } from "./templates";
import { useGraphValidation } from "./validation/useGraphValidation";
import { ValidationDrawer } from "./validation/ValidationDrawer";
import { CompareToHeadModal } from "./versioning/CompareToHeadModal";
import { VersionHistoryDrawer } from "./versioning/VersionHistoryDrawer";

/** Router-state payload accepted by /workflows/create-v2 when launched
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
  const [config, setConfig] = useState<GraphWorkflowConfig>(() =>
    incomingTemplate
      ? layoutGraphIfMissingPositions(incomingTemplate.config)
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [saveAsLibraryOpen, setSaveAsLibraryOpen] = useState(false);
  const [runDrawerOpen, setRunDrawerOpen] = useState(false);
  // US-081: version-history drawer open/close state. The drawer body
  // (`VersionHistoryDrawer`) is mounted in US-082; this story owns the
  // top-bar button + state plumbing. The state is read by the inline
  // placeholder drawer below so React's exhaustive-deps stays clean.
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
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
  const validation = useGraphValidation(config);

  // Live xyflow instance from the inner canvas — populated by
  // `onReactFlowReady`. Used by the "Auto-arrange" top-bar button to
  // re-fit the viewport after the layout helper stamps new positions.
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const handleReactFlowReady = useCallback((instance: ReactFlowInstance) => {
    reactFlowRef.current = instance;
  }, []);

  const handleAutoArrange = useCallback(() => {
    setConfig((prev) => layoutGraph(prev));
    // Defer the fit so the canvas's structural projection effect has run.
    // 0ms is enough — xyflow updates its internal node store
    // synchronously inside its sibling effect on the same tick.
    setTimeout(() => {
      reactFlowRef.current?.fitView({ padding: 0.25, duration: 300 });
    }, 0);
  }, []);

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
    if (selectedNodeIds.length < 2) return;
    const { config: nextConfig, newGroupId } = createGroupFromSelection(
      config,
      selectedNodeIds,
    );
    setConfig(nextConfig);
    setSelectedNodeIdState(null);
    setActiveGroupId(newGroupId);
  }, [config, selectedNodeIds]);

  const openValidationDrawerForNode = useCallback((nodeId: string) => {
    setValidationFocusNodeId(nodeId);
    setValidationOpen(true);
  }, []);

  // Clear the template from history.state so future back/forward
  // navigations land on a blank editor (not the templated one).
  useEffect(() => {
    if (incomingTemplate) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // Only fires once on mount; deps intentionally empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate state when the workflow loads in edit mode.
  useEffect(() => {
    if (!isEditMode || !existingWorkflow) return;
    setName(existingWorkflow.name);
    setDescription(existingWorkflow.description ?? "");
    setConfig(existingWorkflow.config);
  }, [existingWorkflow, isEditMode]);

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
    (activityType: string) => {
      const entry = ACTIVITY_CATALOG[activityType] as
        | ActivityCatalogEntry
        | undefined;
      if (!entry) return;
      const id = makeNodeId(config, activityType);
      const offsetIndex = Object.keys(config.nodes).length;
      const inputs = entry.inputs.map((p) => ({
        port: p.name,
        ctxKey: p.name,
      }));
      const outputs = entry.outputs.map((p) => ({
        port: p.name,
        ctxKey: p.name,
      }));
      const newNode: ActivityNode = {
        id,
        type: "activity",
        label: entry.displayName,
        activityType,
        inputs,
        outputs,
        parameters: {},
        metadata: {
          position: {
            x: 80 + offsetIndex * 240,
            y: 100 + (offsetIndex % 3) * 140,
          },
        },
      };
      setConfig((prev) => {
        const nextEntryNodeId = prev.entryNodeId === "" ? id : prev.entryNodeId;
        const nextNodes = { ...prev.nodes, [id]: newNode };
        const nextCtx = { ...prev.ctx };
        for (const binding of [...inputs, ...outputs]) {
          if (!nextCtx[binding.ctxKey]) {
            nextCtx[binding.ctxKey] = { type: "string" };
          }
        }
        return {
          ...prev,
          nodes: nextNodes,
          ctx: nextCtx,
          entryNodeId: nextEntryNodeId,
        };
      });
      setSelectedNodeId(id);
    },
    [config],
  );

  const addControlFlowNode = useCallback(
    (type: ControlFlowNodeType) => {
      const id = makeNodeId(config, type);
      const offsetIndex = Object.keys(config.nodes).length;
      const skeleton = buildControlFlowSkeleton(type, id);
      // Mutate the freshly-built skeleton's metadata in place — this is
      // safe because the skeleton was just constructed and is not yet
      // referenced anywhere else. Avoids losing discriminated-union
      // narrowing that a spread of `GraphNode` would.
      const newNode: GraphNode = skeleton;
      newNode.metadata = {
        ...(newNode.metadata ?? {}),
        position: {
          x: 80 + offsetIndex * 240,
          y: 100 + (offsetIndex % 3) * 140,
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
    (sourceType: string) => {
      const entry = getSourceCatalogEntry(sourceType);
      if (!entry) return;
      const id = makeNodeId(config, sourceType);
      const offsetIndex = Object.keys(config.nodes).length;
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
        label: entry.displayName,
        sourceType,
        parameters: defaults,
        metadata: {
          position: {
            x: 80 + offsetIndex * 240,
            y: 100 + (offsetIndex % 3) * 140,
          },
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

  const deleteSelected = useCallback(() => {
    if (!selectedNodeId) return;
    setConfig((prev) => {
      const next = { ...prev.nodes };
      delete next[selectedNodeId];
      const filteredEdges = prev.edges.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId,
      );
      const nextEntryNodeId =
        prev.entryNodeId === selectedNodeId
          ? (Object.keys(next)[0] ?? "")
          : prev.entryNodeId;
      return {
        ...prev,
        nodes: next,
        edges: filteredEdges,
        entryNodeId: nextEntryNodeId,
      };
    });
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  const handleSave = useCallback(async () => {
    const cleanedName = name.trim() || "Untitled workflow";
    const cleanedDescription = description.trim();
    const dto: CreateWorkflowDto = {
      name: cleanedName,
      description: cleanedDescription || undefined,
      config: {
        ...config,
        metadata: {
          ...config.metadata,
          name: cleanedName,
          description: cleanedDescription || undefined,
        },
      },
    };
    try {
      if (isEditMode && workflowId) {
        await updateWorkflow.mutateAsync({ id: workflowId, dto });
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
        navigate(`/workflows/${created.id}/edit-v2`, { replace: true });
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
      const dto: CreateWorkflowDto = {
        name: cleanedName,
        description: cleanedDescription || undefined,
        kind: "library",
        config: {
          ...config,
          metadata: {
            ...config.metadata,
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
        height: "calc(100vh - 60px)",
        overflow: "hidden",
      }}
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        gap="sm"
        p="sm"
        style={{
          borderBottom:
            "1px solid var(--mantine-color-default-border, #2c2e33)",
          background: "var(--mantine-color-body, #1a1b1e)",
        }}
      >
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Title order={5} m={0}>
            Workflow editor (visual)
          </Title>
          <Text size="xs" c="dimmed">
            {nodeCount} node{nodeCount === 1 ? "" : "s"} · {config.edges.length}{" "}
            edge
            {config.edges.length === 1 ? "" : "s"}
            {isEditMode ? " · editing" : " · creating"}
          </Text>
        </Stack>
        <Group gap="xs" wrap="nowrap">
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            size="xs"
            style={{ minWidth: 200 }}
          />
          <TextInput
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            size="xs"
            style={{ minWidth: 200 }}
          />
          <ValidationButton
            errorCount={validation.errorCount}
            warningCount={validation.warningCount}
            isPending={validation.isPending}
            onClick={() => {
              setValidationFocusNodeId(null);
              setValidationOpen(true);
            }}
          />
          <Button
            variant="light"
            leftSection={<IconLayoutDistributeHorizontal size={14} />}
            onClick={handleAutoArrange}
            size="xs"
            data-testid="auto-arrange-button"
            disabled={nodeCount === 0}
          >
            Auto-arrange
          </Button>
          <Switch
            label="Simplified view"
            size="xs"
            checked={simplifiedView}
            onChange={(e) =>
              handleSimplifiedViewChange(e.currentTarget.checked)
            }
            data-testid="simplified-view-toggle"
          />
          <Button
            variant="light"
            leftSection={<IconUsersGroup size={14} />}
            onClick={handleGroupSelected}
            size="xs"
            data-testid="group-selected-btn"
            disabled={selectedNodeIds.length < 2}
            title={
              selectedNodeIds.length < 2
                ? "Select 2+ nodes to group them"
                : "Group selected nodes"
            }
          >
            Group selected
          </Button>
          <Button
            variant="light"
            leftSection={<IconSettings size={14} />}
            onClick={() => setSettingsOpen(true)}
            size="xs"
          >
            Settings
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={14} />}
            onClick={handleSave}
            loading={isSaving}
            size="xs"
            data-testid="save-button"
          >
            Save
          </Button>
          <Tooltip label="Save the workflow first" disabled={!!workflowId}>
            <Button
              variant="light"
              leftSection={<IconHistory size={14} />}
              onClick={() => setHistoryDrawerOpen(true)}
              size="xs"
              data-testid="history-button"
              disabled={!workflowId}
            >
              History
            </Button>
          </Tooltip>
          <Button
            variant="light"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => setRunDrawerOpen(true)}
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
          <Button
            variant="light"
            leftSection={<IconBookmark size={14} />}
            onClick={() => setSaveAsLibraryOpen(true)}
            size="xs"
            data-testid="save-as-library-button"
            disabled={nodeCount === 0}
            title={
              nodeCount === 0
                ? "Add at least one node before saving as a library"
                : "Save the current workflow as a reusable library"
            }
          >
            Save as library
          </Button>
          <Button
            variant="subtle"
            leftSection={<IconHelp size={14} />}
            component="a"
            href="/workflows/dev-form-preview"
            target="_blank"
            size="xs"
          >
            Form preview
          </Button>
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
        onClose={() => setValidationOpen(false)}
        result={validation}
        config={config}
        onSelectNode={setSelectedNodeId}
        focusedNodeId={validationFocusNodeId}
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
        />
        <Box style={{ flex: 1, minWidth: 0, position: "relative" }}>
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
          <RunStateProvider workflowId={workflowId ?? ""}>
            <WorkflowEditorCanvas
              config={config}
              selectedNodeId={selectedNodeId}
              onConfigChange={setConfig}
              onSelectNode={setSelectedNodeId}
              onSelectionChangeMany={setSelectedNodeIds}
              errorsByNode={validation.errorsByNode}
              onNodeBadgeClick={openValidationDrawerForNode}
              onReactFlowReady={handleReactFlowReady}
              simplifiedView={simplifiedView}
              onGroupChipClick={setActiveGroupId}
            />
          </RunStateProvider>
        </Box>
        <NodeSettingsPanel
          config={config}
          selectedNodeId={selectedNodeId}
          activeGroupId={activeGroupId}
          onConfigChange={setConfig}
          onDeleteSelected={deleteSelected}
          workflowId={isEditMode ? workflowId : undefined}
        />
      </Box>
    </Stack>
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
