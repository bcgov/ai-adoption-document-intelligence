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
} from "@ai-di/graph-workflow";
import {
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDeviceFloppy,
  IconExclamationCircle,
  IconHelp,
  IconSettings,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  type CreateWorkflowDto,
  useCreateWorkflow,
  useUpdateWorkflow,
  useWorkflow,
} from "../../data/hooks/useWorkflows";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
} from "../../types/workflow";
import { WorkflowEditorCanvas } from "./canvas/WorkflowEditorCanvas";
import { ActivityPalette } from "./palette/ActivityPalette";
import {
  buildControlFlowSkeleton,
  type ControlFlowNodeType,
} from "./palette/control-flow-skeletons";
import { NodeSettingsPanel } from "./settings/NodeSettingsPanel";
import { WorkflowSettingsDrawer } from "./settings/WorkflowSettingsDrawer";
import type { WorkflowTemplate } from "./templates";
import { useGraphValidation } from "./validation/useGraphValidation";
import { ValidationDrawer } from "./validation/ValidationDrawer";

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
  const [config, setConfig] = useState<GraphWorkflowConfig>(
    incomingTemplate ? incomingTemplate.config : EMPTY_CONFIG,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [validationOpen, setValidationOpen] = useState(false);
  const [validationFocusNodeId, setValidationFocusNodeId] = useState<
    string | null
  >(null);
  const validation = useGraphValidation(config);

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
          >
            Save
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
          <WorkflowEditorCanvas
            config={config}
            selectedNodeId={selectedNodeId}
            onConfigChange={setConfig}
            onSelectNode={setSelectedNodeId}
            errorsByNode={validation.errorsByNode}
            onNodeBadgeClick={openValidationDrawerForNode}
          />
        </Box>
        <NodeSettingsPanel
          config={config}
          selectedNodeId={selectedNodeId}
          onConfigChange={setConfig}
          onDeleteSelected={deleteSelected}
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
