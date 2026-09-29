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
  Alert,
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
import {
  IconArrowMerge,
  IconArrowsSplit,
  IconExternalLink,
  IconHandStop,
  IconInfoCircle,
  IconRefresh,
  IconRoute,
  IconStar,
  IconTrash,
} from "@tabler/icons-react";
import { type ComponentType, useMemo, useState } from "react";
import type {
  ActivityNode,
  GraphNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../../../types/workflow";
import { getActivityVisualHints } from "../catalog-utils";
import {
  declareCtxKey,
  resolveProducerKindFor,
  VariablePicker,
} from "../graph-widgets";
import { JsonSchemaForm, type JsonSchemaProperty } from "../json-schema-form";
import { replaceNode } from "../replace-node";
import { useOptionalRunState } from "../run/RunStateContext";
import { SourceNodeSettings } from "../sources/SourceNodeSettings";
import { getSourceVisualHints } from "../sources/source-catalog-utils";
import {
  ChildWorkflowNodeSettings,
  HumanGateNodeSettings,
  JoinNodeSettings,
  MapNodeSettings,
  PollUntilNodeSettings,
  SwitchNodeSettings,
} from "./control-flow";
import { DynamicNodeSettings } from "./dynamic-node/DynamicNodeSettings";
import { ErrorPolicySection, supportsErrorPolicy } from "./ErrorPolicySection";
import { GroupNodeSettings } from "./group/GroupNodeSettings";
import { InputsSection } from "./InputsSection";
import {
  findOrphanedParameterKeys,
  removeParameterKeys,
} from "./orphaned-parameters";

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
  /**
   * Lineage id of the workflow being edited, when in edit mode.
   * `undefined` in create mode — forwarded to type-specific bodies
   * that need it (e.g. `SourceNodeSettings`'s "Test upload" button).
   */
  workflowId?: string;
  /**
   * Status-dot deep-link: when this targets the selected node, the Inputs
   * section opens the source picker for `port`. Cleared via
   * `onFocusInputConsumed` so it fires once.
   */
  focusInput?: { nodeId: string; port: string } | null;
  onFocusInputConsumed?: () => void;
  /**
   * Item 6X — a real-producer input row was clicked; select + pan/center
   * that producer node on the canvas. Threaded down to `InputsSection`.
   */
  onJumpToProducer?: (nodeId: string) => void;
  /**
   * Item 6X — a real-producer input row is hovered (node id) / unhovered
   * (`null`); highlight that producer node on the canvas.
   */
  onHoverProducer?: (nodeId: string | null) => void;
}

export function NodeSettingsPanel({
  config,
  selectedNodeId,
  activeGroupId,
  onConfigChange,
  onDeleteSelected,
  workflowId,
  focusInput,
  onFocusInputConsumed,
  onJumpToProducer,
  onHoverProducer,
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
      workflowId={workflowId}
      focusPort={focusInput?.nodeId === node.id ? focusInput.port : null}
      onFocusConsumed={onFocusInputConsumed}
      onJumpToProducer={onJumpToProducer}
      onHoverProducer={onHoverProducer}
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
  workflowId?: string;
  focusPort?: string | null;
  onFocusConsumed?: () => void;
  onJumpToProducer?: (nodeId: string) => void;
  onHoverProducer?: (nodeId: string | null) => void;
}

function NodeSettings({
  node,
  config,
  onConfigChange,
  onDeleteSelected,
  workflowId,
  focusPort,
  onFocusConsumed,
  onJumpToProducer,
  onHoverProducer,
}: NodeSettingsProps) {
  const updateNode = (next: GraphNode) => {
    onConfigChange(replaceNode(config, node.id, next));
  };

  const createCtxKey = (key: string) =>
    onConfigChange(declareCtxKey(config, key));

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
      case "source":
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
      case "source":
        // Source nodes MUST keep `inputs` empty — see the design
        // (DOCUMENT_SOURCES_DESIGN.md §1) and the validator (US-109).
        // The PortBindingsFooter doesn't surface an input editor for
        // source nodes, but defensive-no-op here so a stray call from
        // a future caller doesn't sneak inputs onto a source.
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
      case "source":
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
            workflowId={workflowId}
          />

          {/* G-001. `switch` / `source` never mount an error handle, so the
              section (and its divider) stay out of their panels entirely
              rather than leaving a stray rule behind. */}
          {supportsErrorPolicy(node) && (
            <>
              <Divider />
              <ErrorPolicySection
                node={node}
                config={config}
                onConfigChange={onConfigChange}
              />
            </>
          )}

          <Divider />
          <InputsSection
            config={config}
            nodeId={node.id}
            onConfigChange={onConfigChange}
            focusPort={focusPort}
            onFocusConsumed={onFocusConsumed}
            onJumpToProducer={onJumpToProducer}
            onHoverProducer={onHoverProducer}
          />
          <Divider />
          <AdvancedBindingsToggle
            node={node}
            config={config}
            onInputsChange={setInputBindings}
            onOutputsChange={setOutputBindings}
            onCreateCtxKey={createCtxKey}
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
  // a neutral icon. Source nodes (US-118) resolve their display strings
  // through the source catalog; US-119 will replace this header with a
  // dedicated source-settings shell.
  const display = useMemo(() => {
    if (node.type === "activity") {
      const entry = ACTIVITY_CATALOG[node.activityType];
      const hints = getActivityVisualHints(node.activityType);
      return {
        title: entry?.displayName ?? node.activityType,
        Icon: hints.Icon,
        subtitle: node.activityType,
        description: hints.description,
      };
    }
    if (node.type === "source") {
      const hints = getSourceVisualHints(node.sourceType);
      return {
        title: node.label || hints.displayName,
        Icon: hints.Icon,
        subtitle: node.sourceType,
        description: hints.description,
      };
    }
    return {
      title: node.label || node.type,
      Icon: CONTROL_FLOW_ICONS[node.type],
      subtitle: node.type,
      description: CONTROL_FLOW_DESCRIPTIONS[node.type],
    };
  }, [node]);

  return (
    <Stack gap={4}>
      <ReplayModeWarning />
      <Group gap="xs" wrap="nowrap">
        <Text span size="lg" style={{ lineHeight: 1 }} aria-hidden>
          <display.Icon size={20} />
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

/**
 * Header-strip icons for control-flow nodes. Tabler components, matching
 * the activity header (`catalog-utils`), the source header
 * (`source-catalog-utils`) and the palette's own control-flow table —
 * every icon surface renders an SVG rather than a platform-dependent
 * emoji glyph. Source nodes resolve their icon through the source
 * catalog directly, so they need no table here.
 */
const CONTROL_FLOW_ICONS: Record<
  Exclude<GraphNode["type"], "activity" | "source">,
  ComponentType<{ size?: number | string }>
> = {
  switch: IconRoute,
  map: IconArrowsSplit,
  join: IconArrowMerge,
  childWorkflow: IconExternalLink,
  pollUntil: IconRefresh,
  humanGate: IconHandStop,
};

const CONTROL_FLOW_DESCRIPTIONS: Record<
  Exclude<GraphNode["type"], "activity" | "source">,
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
  workflowId?: string;
}

function NodeBody({ node, config, onConfigChange, workflowId }: NodeBodyProps) {
  switch (node.type) {
    case "activity":
      // Phase 6 (US-184): dyn.* activities get the dedicated dynamic-node
      // settings body — version pin + Edit script modal + JsonSchemaForm
      // sourced from the merged catalog (not ACTIVITY_CATALOG which only
      // has the 41 static entries).
      if (node.activityType.startsWith("dyn.")) {
        return (
          <DynamicNodeSettings
            node={node}
            config={config}
            onConfigChange={onConfigChange}
          />
        );
      }
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
    case "source":
      return (
        <SourceNodeSettings
          node={node}
          config={config}
          onConfigChange={onConfigChange}
          workflowId={workflowId}
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
    // Phase 6 dynamic-node entries carry `paramsSchema` (JSON Schema 7) and
    // own their own publish-time validation — no Zod schema to safeParse.
    if (!entry.parametersSchema) return null;
    const parsed = entry.parametersSchema.safeParse(node.parameters ?? {});
    return parsed;
  }, [entry, node.parameters]);

  const setParameters = (parameters: Record<string, unknown>) =>
    onConfigChange(replaceNode(config, node.id, { ...node, parameters }));

  // G-099 — values the current schema no longer declares are invisible in the
  // form (it renders from `schema.properties`) and survive every edit, because
  // the write-back spreads the existing object. Name them and offer removal
  // rather than pruning silently: a `dyn.` version pin can legitimately drop a
  // property while the value is still wanted.
  // No schema means the activity is unregistered, not that it declares
  // nothing — claiming every saved value is unused would be a false alarm on
  // exactly the node the author most needs to trust.
  const orphanedParamKeys = useMemo(
    () =>
      paramsSchema
        ? findOrphanedParameterKeys(node.parameters, paramsSchema.properties)
        : [],
    [node.parameters, paramsSchema],
  );

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
      {orphanedParamKeys.length > 0 && (
        <Alert
          color="gray"
          variant="light"
          mt={8}
          p={8}
          data-testid="orphaned-parameters"
        >
          <Text size="10px">
            {orphanedParamKeys.length} saved setting
            {orphanedParamKeys.length === 1 ? "" : "s"} this step no longer
            uses: <b>{orphanedParamKeys.join(", ")}</b>. They are ignored when
            the workflow runs.
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            mt={4}
            data-testid="orphaned-parameters-remove"
            onClick={() =>
              setParameters(
                removeParameterKeys(node.parameters ?? {}, orphanedParamKeys),
              )
            }
          >
            Remove {orphanedParamKeys.length === 1 ? "it" : "them"}
          </Button>
        </Alert>
      )}
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
// Advanced bindings toggle — wraps PortBindingsFooter behind a "Show advanced"
// button so the raw port → ctxKey editor is hidden by default.
// ---------------------------------------------------------------------------

interface AdvancedBindingsToggleProps {
  node: GraphNode;
  config: GraphWorkflowConfig;
  onInputsChange: (next: PortBinding[]) => void;
  onOutputsChange: (next: PortBinding[]) => void;
  onCreateCtxKey: (key: string) => void;
}

function AdvancedBindingsToggle({
  node,
  config,
  onInputsChange,
  onOutputsChange,
  onCreateCtxKey,
}: AdvancedBindingsToggleProps) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap={4}>
      <Button
        variant="subtle"
        size="compact-xs"
        onClick={() => setOpen((v) => !v)}
        data-testid="node-settings-advanced-toggle"
      >
        {open ? "Hide advanced" : "Show advanced"}
      </Button>
      {open && (
        <PortBindingsFooter
          node={node}
          config={config}
          onInputsChange={onInputsChange}
          onOutputsChange={onOutputsChange}
          onCreateCtxKey={onCreateCtxKey}
        />
      )}
    </Stack>
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
  onCreateCtxKey: (key: string) => void;
}

function PortBindingsFooter({
  node,
  config,
  onInputsChange,
  onOutputsChange,
  onCreateCtxKey,
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
        onCreateCtxKey={onCreateCtxKey}
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
  /** Threaded to the input VariablePicker so a new ctx key can be declared inline. */
  onCreateCtxKey?: (key: string) => void;
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
  onCreateCtxKey,
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
                onCreateCtxKey={onCreateCtxKey}
                expectedKind={port.kind}
                resolveProducerKind={(ctxKey) =>
                  resolveProducerKindFor(ctxKey, config, currentNodeId)
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

/**
 * In-replay edit warning (US-154 Scenario 5). Renders an inline Alert at the
 * top of the settings panel when the editor is in replay mode, so the user
 * understands that edits will not retroactively affect the displayed
 * historical preview.
 */
function ReplayModeWarning() {
  const runState = useOptionalRunState();
  if (!runState?.isReplay) {
    return null;
  }
  return (
    <Alert
      color="yellow"
      variant="light"
      icon={<IconInfoCircle size={16} />}
      data-testid="settings-replay-warning"
      mb={4}
    >
      Editing in replay mode — changes will not affect the displayed historical
      preview. Save + Try to see new results.
    </Alert>
  );
}
