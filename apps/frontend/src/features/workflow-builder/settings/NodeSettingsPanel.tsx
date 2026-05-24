/**
 * Right-rail node-settings panel.
 *
 * Two layers:
 *   1. A shared chrome (label / type badge / delete affordance at the top,
 *      port-binding editors at the bottom) that all node types share.
 *   2. A type-specific body in the middle:
 *        - "activity"      → schema-driven `JsonSchemaForm`
 *        - "switch"        → `SwitchNodeSettings`
 *        - "map"           → `MapNodeSettings`
 *        - "join"          → `JoinNodeSettings`
 *        - "childWorkflow" → `ChildWorkflowNodeSettings`
 *        - "pollUntil"     → `PollUntilNodeSettings`
 *        - "humanGate"     → `HumanGateNodeSettings`
 *
 * TypeScript discriminated-union narrowing on `node.type` lets each
 * per-type form receive the correctly-typed node prop.
 */

import {
  ACTIVITY_CATALOG,
  getActivityParametersJsonSchema,
  type KindRef,
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
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";
import { resolveProducerKindFor, VariablePicker } from "../graph-widgets";
import { JsonSchemaForm, type JsonSchemaProperty } from "../json-schema-form";
import {
  ChildWorkflowNodeSettings,
  HumanGateNodeSettings,
  JoinNodeSettings,
  MapNodeSettings,
  PollUntilNodeSettings,
  SwitchNodeSettings,
} from "./control-flow";
import { GroupNodeSettings } from "./group/GroupNodeSettings";

interface NodeSettingsPanelProps {
  config: GraphWorkflowConfig;
  selectedNodeId: string | null;
  /**
   * When set (and no node is selected), the panel renders the
   * `GroupNodeSettings` body for this group id. Node selection wins
   * over the group panel — the page sets one of these to null when
   * the other becomes active.
   */
  activeGroupId?: string | null;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onDeleteSelected: () => void;
}

export function NodeSettingsPanel({
  config,
  selectedNodeId,
  activeGroupId,
  onConfigChange,
  onDeleteSelected,
}: NodeSettingsPanelProps) {
  const node = selectedNodeId ? config.nodes[selectedNodeId] : null;

  if (!node && activeGroupId) {
    return (
      <PanelShell>
        <ScrollArea style={{ flex: 1, height: "100%" }} type="auto">
          <GroupNodeSettings
            groupId={activeGroupId}
            config={config}
            onConfigChange={onConfigChange}
          />
        </ScrollArea>
      </PanelShell>
    );
  }

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

  return (
    <NodeSettings
      node={node}
      config={config}
      onConfigChange={onConfigChange}
      onDeleteSelected={onDeleteSelected}
    />
  );
}

// ---------------------------------------------------------------------------
// Top-level per-node panel — composes shared header + type-specific body +
// shared port-bindings footer.
// ---------------------------------------------------------------------------

interface NodeSettingsProps {
  node: GraphNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onDeleteSelected: () => void;
}

function NodeSettings({
  node,
  config,
  onConfigChange,
  onDeleteSelected,
}: NodeSettingsProps) {
  const updateNode = (next: GraphNode) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: next },
    });
  };

  const setLabel = (label: string) => {
    // Discriminated-union-safe label update: rebuild the node literally so
    // the union's narrow members are preserved on the type level.
    switch (node.type) {
      case "activity":
        updateNode({ ...node, label });
        return;
      case "switch":
        updateNode({ ...node, label });
        return;
      case "map":
        updateNode({ ...node, label });
        return;
      case "join":
        updateNode({ ...node, label });
        return;
      case "childWorkflow":
        updateNode({ ...node, label });
        return;
      case "pollUntil":
        updateNode({ ...node, label });
        return;
      case "humanGate":
        updateNode({ ...node, label });
        return;
    }
  };

  const setInputBindings = (next: PortBinding[]) => {
    switch (node.type) {
      case "activity":
        updateNode({ ...node, inputs: next });
        return;
      case "switch":
        updateNode({ ...node, inputs: next });
        return;
      case "map":
        updateNode({ ...node, inputs: next });
        return;
      case "join":
        updateNode({ ...node, inputs: next });
        return;
      case "childWorkflow":
        updateNode({ ...node, inputs: next });
        return;
      case "pollUntil":
        updateNode({ ...node, inputs: next });
        return;
      case "humanGate":
        updateNode({ ...node, inputs: next });
        return;
    }
  };

  const setOutputBindings = (next: PortBinding[]) => {
    switch (node.type) {
      case "activity":
        updateNode({ ...node, outputs: next });
        return;
      case "switch":
        updateNode({ ...node, outputs: next });
        return;
      case "map":
        updateNode({ ...node, outputs: next });
        return;
      case "join":
        updateNode({ ...node, outputs: next });
        return;
      case "childWorkflow":
        updateNode({ ...node, outputs: next });
        return;
      case "pollUntil":
        updateNode({ ...node, outputs: next });
        return;
      case "humanGate":
        updateNode({ ...node, outputs: next });
        return;
    }
  };

  return (
    <PanelShell>
      <ScrollArea style={{ flex: 1, height: "100%" }} type="auto">
        <Stack gap="md" p="md">
          <NodeHeader
            node={node}
            config={config}
            onConfigChange={onConfigChange}
            onDeleteSelected={onDeleteSelected}
          />

          <Divider />

          <TextInput
            label="Node label"
            description="Shown on the canvas and in error messages."
            value={node.label}
            onChange={(e) => setLabel(e.currentTarget.value)}
            size="xs"
            data-testid="node-settings-label"
          />

          <Divider />

          <NodeBody
            node={node}
            config={config}
            onConfigChange={onConfigChange}
          />

          <Divider />

          <PortBindingsFooter
            node={node}
            config={config}
            onInputsChange={setInputBindings}
            onOutputsChange={setOutputBindings}
          />
        </Stack>
      </ScrollArea>
    </PanelShell>
  );
}

// ---------------------------------------------------------------------------
// Shared header: icon / display name / type badge / entry-point + delete
// affordances.
// ---------------------------------------------------------------------------

interface NodeHeaderProps {
  node: GraphNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
  onDeleteSelected: () => void;
}

function NodeHeader({
  node,
  config,
  onConfigChange,
  onDeleteSelected,
}: NodeHeaderProps) {
  const isEntry = config.entryNodeId === node.id;

  const setEntryNode = () => {
    onConfigChange({ ...config, entryNodeId: node.id });
  };

  // Activity nodes show the catalog's display name + icon; control-flow
  // nodes don't have a catalog entry, so fall back to the node's label and
  // a neutral icon.
  const display = useMemo(() => {
    if (node.type === "activity") {
      const entry = ACTIVITY_CATALOG[node.activityType];
      const hints = getActivityVisualHints(node.activityType);
      return {
        title: entry?.displayName ?? node.activityType,
        icon: hints.icon,
        subtitle: node.activityType,
        description: hints.description,
      };
    }
    return {
      title: node.label || node.type,
      icon: CONTROL_FLOW_ICONS[node.type],
      subtitle: node.type,
      description: CONTROL_FLOW_DESCRIPTIONS[node.type],
    };
  }, [node]);

  return (
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap">
        <Text size="lg" style={{ lineHeight: 1 }}>
          {display.icon}
        </Text>
        <Title order={5} style={{ margin: 0 }}>
          {display.title}
        </Title>
        <Badge
          size="xs"
          color="gray"
          variant="light"
          data-testid="node-settings-type-badge"
        >
          {node.type}
        </Badge>
        {isEntry && (
          <Badge size="xs" color="blue" variant="filled">
            ENTRY
          </Badge>
        )}
      </Group>
      <Text size="xs" c="dimmed" ff="monospace">
        {display.subtitle}
      </Text>
      {display.description && (
        <Text size="xs" c="dimmed">
          {display.description}
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
            data-testid="node-settings-delete"
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  );
}

const CONTROL_FLOW_ICONS: Record<
  Exclude<GraphNode["type"], "activity">,
  string
> = {
  switch: "◆",
  map: "⇉",
  join: "⇇",
  childWorkflow: "⊞",
  pollUntil: "⟳",
  humanGate: "🛂",
};

const CONTROL_FLOW_DESCRIPTIONS: Record<
  Exclude<GraphNode["type"], "activity">,
  string
> = {
  switch: "Branches the workflow on the first matching case.",
  map: "Fans out the workflow over each item in a collection.",
  join: "Collects iterations from a matching Map node.",
  childWorkflow: "Invokes a stored or inline child workflow.",
  pollUntil: "Repeats an activity until a termination condition is met.",
  humanGate: "Pauses the workflow waiting for a human signal.",
};

// ---------------------------------------------------------------------------
// Type-specific body — discriminated union narrows `node.type` so each
// per-type form receives the correctly narrowed `node` prop.
// ---------------------------------------------------------------------------

interface NodeBodyProps {
  node: GraphNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

function NodeBody({ node, config, onConfigChange }: NodeBodyProps) {
  switch (node.type) {
    case "activity":
      return (
        <ActivityNodeBody
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "switch":
      return (
        <SwitchNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "map":
      return (
        <MapNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "join":
      return (
        <JoinNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "childWorkflow":
      return (
        <ChildWorkflowNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "pollUntil":
      return (
        <PollUntilNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
    case "humanGate":
      return (
        <HumanGateNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
        />
      );
  }
}

// ---------------------------------------------------------------------------
// Activity body (was previously inlined in ActivityNodeSettings).
// ---------------------------------------------------------------------------

interface ActivityNodeBodyProps {
  node: ActivityNode;
  config: GraphWorkflowConfig;
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

function ActivityNodeBody({
  node,
  config,
  onConfigChange,
}: ActivityNodeBodyProps) {
  const entry = ACTIVITY_CATALOG[node.activityType];

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

  const setParameters = (parameters: Record<string, unknown>) =>
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: { ...node, parameters } },
    });

  return (
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
  );
}

// ---------------------------------------------------------------------------
// Shared footer: input + output port bindings.
//
// For activity nodes the port list comes from the catalog entry (so the
// editor renders a row per declared port even when the binding is empty).
// For control-flow nodes there's no catalog entry; we render rows per
// existing binding so the same UI shape is preserved without inventing
// ports that don't exist on the type.
// ---------------------------------------------------------------------------

interface PortBindingsFooterProps {
  node: GraphNode;
  config: GraphWorkflowConfig;
  onInputsChange: (next: PortBinding[]) => void;
  onOutputsChange: (next: PortBinding[]) => void;
}

function PortBindingsFooter({
  node,
  config,
  onInputsChange,
  onOutputsChange,
}: PortBindingsFooterProps) {
  const inputs = node.inputs ?? [];
  const outputs = node.outputs ?? [];

  const inputPorts = useMemo(
    () => portsForFooter(node, inputs, "inputs"),
    [node, inputs],
  );
  const outputPorts = useMemo(
    () => portsForFooter(node, outputs, "outputs"),
    [node, outputs],
  );

  return (
    <>
      <PortBindingsEditor
        label="Input bindings"
        description="Each input reads from a ctx key."
        ports={inputPorts}
        bindings={inputs}
        onChange={onInputsChange}
        config={config}
        currentNodeId={node.id}
        useVariablePicker
        testId="node-settings-input-bindings"
      />

      <Divider />

      <PortBindingsEditor
        label="Output bindings"
        description="Each output writes to a ctx key."
        ports={outputPorts}
        bindings={outputs}
        onChange={onOutputsChange}
        config={config}
        currentNodeId={node.id}
        testId="node-settings-output-bindings"
      />
    </>
  );
}

interface PortSpec {
  name: string;
  label: string;
  required?: boolean;
  /**
   * Catalog-declared typed-I/O kind for this port. Undefined for ports
   * with no declared kind (legacy / pre-Phase-3 catalog entries, and
   * control-flow ports which never carry a typed signature). The
   * VariablePicker treats `undefined` as "no opinion" and renders the
   * legacy flat list (US-097 Scenario 3).
   */
  kind?: KindRef;
}

function portsForFooter(
  node: GraphNode,
  currentBindings: PortBinding[],
  kind: "inputs" | "outputs",
): PortSpec[] {
  if (node.type === "activity") {
    const entry = ACTIVITY_CATALOG[node.activityType];
    const portsFromCatalog = (entry ? entry[kind] : []) ?? [];
    return portsFromCatalog.map((p) => ({
      name: p.name,
      label: p.label,
      required: p.required,
      kind: p.kind,
    }));
  }
  // Control-flow nodes don't have a catalog-defined port list; render one
  // row per currently bound port so existing bindings remain visible /
  // editable.
  return currentBindings.map((b) => ({ name: b.port, label: b.port }));
}

// ---------------------------------------------------------------------------
// Port bindings editor (shared between input + output footer sections).
// ---------------------------------------------------------------------------

interface PortBindingsEditorProps {
  label: string;
  description?: string;
  ports: PortSpec[];
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
  testId: string;
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
  testId,
}: PortBindingsEditorProps) {
  if (ports.length === 0) {
    return (
      <Box data-testid={testId}>
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
    <Box data-testid={testId}>
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
                expectedKind={port.kind}
                resolveProducerKind={(ctxKey) =>
                  resolveProducerKindFor(ctxKey, config)
                }
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
