/**
 * Right-rail node-settings panel.
 *
 * Schema-driven for activity nodes — pulls the activity's catalog entry
 * and renders the static-parameter form via JsonSchemaForm. Also
 * surfaces the node's label, input port bindings, and output port
 * bindings. The settings panel is the only place a workflow author edits
 * a single node's per-instance config.
 */

import {
  ACTIVITY_CATALOG,
  getActivityParametersJsonSchema,
} from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconStar, IconTrash } from "@tabler/icons-react";
import { useMemo } from "react";
import type {
  ActivityNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";
import { VariablePicker } from "../graph-widgets";
import { JsonSchemaForm, type JsonSchemaProperty } from "../json-schema-form";

interface NodeSettingsPanelProps {
  config: GraphWorkflowConfig;
  selectedNodeId: string | null;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onDeleteSelected: () => void;
}

export function NodeSettingsPanel({
  config,
  selectedNodeId,
  onConfigChange,
  onDeleteSelected,
}: NodeSettingsPanelProps) {
  const node = selectedNodeId ? config.nodes[selectedNodeId] : null;

  if (!node) {
    return (
      <PanelShell>
        <Stack gap="xs" p="md" h="100%" justify="center" align="center">
          <Text size="sm" c="dimmed" ta="center">
            Select a node on the canvas to edit its settings, or pick an
            activity from the palette to add one.
          </Text>
        </Stack>
      </PanelShell>
    );
  }

  if (node.type !== "activity") {
    return (
      <PanelShell>
        <Stack p="md">
          <Title order={5}>{node.label}</Title>
          <Text size="xs" c="dimmed">
            Settings for {node.type} nodes are not yet supported in V2. Switch
            to the JSON editor to configure this node.
          </Text>
        </Stack>
      </PanelShell>
    );
  }

  return (
    <ActivityNodeSettings
      node={node}
      config={config}
      onConfigChange={onConfigChange}
      onDeleteSelected={onDeleteSelected}
    />
  );
}

interface ActivityNodeSettingsProps {
  node: ActivityNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onDeleteSelected: () => void;
}

function ActivityNodeSettings({
  node,
  config,
  onConfigChange,
  onDeleteSelected,
}: ActivityNodeSettingsProps) {
  const entry = ACTIVITY_CATALOG[node.activityType];
  const hints = getActivityVisualHints(node.activityType);
  const isEntry = config.entryNodeId === node.id;

  const paramsSchema = useMemo(
    () =>
      getActivityParametersJsonSchema(node.activityType) as
        | JsonSchemaProperty
        | undefined,
    [node.activityType],
  );

  const validation = useMemo(() => {
    if (!entry) return null;
    const parsed = entry.parametersSchema.safeParse(node.parameters ?? {});
    return parsed;
  }, [entry, node.parameters]);

  const updateNode = (next: ActivityNode) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: next },
    });
  };

  const setLabel = (label: string) => updateNode({ ...node, label });

  const setParameters = (parameters: Record<string, unknown>) =>
    updateNode({ ...node, parameters });

  const setEntryNode = () => {
    onConfigChange({ ...config, entryNodeId: node.id });
  };

  const setInputBindings = (next: PortBinding[]) =>
    updateNode({ ...node, inputs: next });

  const setOutputBindings = (next: PortBinding[]) =>
    updateNode({ ...node, outputs: next });

  return (
    <PanelShell>
      <ScrollArea style={{ flex: 1, height: "100%" }} type="auto">
        <Stack gap="md" p="md">
          <Stack gap={4}>
            <Group gap="xs" wrap="nowrap">
              <Text size="lg" style={{ lineHeight: 1 }}>
                {hints.icon}
              </Text>
              <Title order={5} style={{ margin: 0 }}>
                {entry?.displayName ?? node.activityType}
              </Title>
              {isEntry && (
                <Badge size="xs" color="blue" variant="filled">
                  ENTRY
                </Badge>
              )}
            </Group>
            <Text size="xs" c="dimmed" ff="monospace">
              {node.activityType}
            </Text>
            {hints.description && (
              <Text size="xs" c="dimmed">
                {hints.description}
              </Text>
            )}
            <Group gap="xs" mt={4}>
              {!isEntry && (
                <Tooltip label="Make this node the entry point" withArrow>
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconStar size={12} />}
                    onClick={setEntryNode}
                  >
                    Set as entry
                  </Button>
                </Tooltip>
              )}
              <Tooltip label="Delete this node" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  onClick={onDeleteSelected}
                  aria-label="Delete node"
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Stack>

          <Divider />

          <TextInput
            label="Node label"
            description="Shown on the canvas and in error messages."
            value={node.label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            size="xs"
          />

          <Divider />

          <Box>
            <Text size="xs" fw={600} mb={4}>
              Parameters
            </Text>
            <JsonSchemaForm
              schema={paramsSchema}
              value={node.parameters ?? {}}
              onChange={setParameters}
            />
            {validation && !validation.success && (
              <Text size="10px" c="red" mt={6}>
                {validation.error.issues.length} validation issue
                {validation.error.issues.length === 1 ? "" : "s"}
              </Text>
            )}
          </Box>

          <Divider />

          <PortBindingsEditor
            label="Input bindings"
            description="Each input reads from a ctx key."
            ports={entry?.inputs ?? []}
            bindings={node.inputs ?? []}
            onChange={setInputBindings}
            config={config}
            currentNodeId={node.id}
            useVariablePicker
          />

          <Divider />

          <PortBindingsEditor
            label="Output bindings"
            description="Each output writes to a ctx key."
            ports={entry?.outputs ?? []}
            bindings={node.outputs ?? []}
            onChange={setOutputBindings}
            config={config}
            currentNodeId={node.id}
          />
        </Stack>
      </ScrollArea>
    </PanelShell>
  );
}

interface PortBindingsEditorProps {
  label: string;
  description?: string;
  ports: { name: string; label: string; required?: boolean }[];
  bindings: PortBinding[];
  onChange: (next: PortBinding[]) => void;
  config: GraphWorkflowConfig;
  currentNodeId: string;
  /**
   * When true, the editor renders the reusable `VariablePicker` (grouped
   * autocomplete over `ctx` + other nodes' outputs) instead of a free-text
   * `TextInput`. Used for input bindings; output bindings leave this off
   * so the user can declare a fresh ctx key.
   */
  useVariablePicker?: boolean;
}

function PortBindingsEditor({
  label,
  description,
  ports,
  bindings,
  onChange,
  config,
  currentNodeId,
  useVariablePicker,
}: PortBindingsEditorProps) {
  if (ports.length === 0) {
    return (
      <Box>
        <Text size="xs" fw={600}>
          {label}
        </Text>
        <Text size="10px" c="dimmed">
          None.
        </Text>
      </Box>
    );
  }
  const setBinding = (portName: string, ctxKey: string) => {
    const without = bindings.filter((b) => b.port !== portName);
    if (ctxKey === "") {
      onChange(without);
    } else {
      onChange([...without, { port: portName, ctxKey }]);
    }
  };
  return (
    <Box>
      <Text size="xs" fw={600}>
        {label}
      </Text>
      {description && (
        <Text size="10px" c="dimmed" mb={4}>
          {description}
        </Text>
      )}
      <Stack gap={4} mt={4}>
        {ports.map((port) => {
          const existing = bindings.find((b) => b.port === port.name);
          const fieldLabel = port.required ? `${port.label} *` : port.label;
          if (useVariablePicker) {
            return (
              <VariablePicker
                key={port.name}
                label={fieldLabel}
                value={existing?.ctxKey ?? ""}
                config={config}
                currentNodeId={currentNodeId}
                onChange={(v) => setBinding(port.name, v)}
              />
            );
          }
          return (
            <TextInput
              key={port.name}
              label={fieldLabel}
              placeholder="ctx key (e.g. preparedData)"
              value={existing?.ctxKey ?? ""}
              size="xs"
              onChange={(e) => setBinding(port.name, e.currentTarget.value)}
            />
          );
        })}
      </Stack>
    </Box>
  );
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <Stack
      gap={0}
      style={{
        height: "100%",
        width: 360,
        minWidth: 320,
        maxWidth: 400,
        borderLeft: "1px solid var(--mantine-color-default-border, #2c2e33)",
        background: "var(--mantine-color-body, #1a1b1e)",
      }}
    >
      {children}
    </Stack>
  );
}
