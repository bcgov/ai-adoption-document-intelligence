/**
 * ChildWorkflowNodeSettings — childWorkflow-specific body for the
 * right-rail node-settings panel.
 *
 * Edits the childWorkflow-only fields of a `ChildWorkflowNode`:
 *   - `workflowRef.type` — `SegmentedControl` toggles between `library`
 *     (the typical "invoke a stored workflow by id" mode) and `inline`
 *     (a nested graph stored on the node itself).
 *   - `workflowRef.workflowId` — `TextInput` shown when the ref type is
 *     `library`. (Future: dropdown sourced from the workflow list API —
 *     out of scope here.)
 *   - `workflowRef.graph` — read-only JSON preview shown when the ref
 *     type is `inline`, with a dimmed hint that inline graph editing is
 *     out of scope in V2.
 *   - `inputMappings` / `outputMappings` — list editors of `PortBinding`
 *     rows (`port` `TextInput` + `ctxKey` `VariablePicker`), each with
 *     Add Row + Remove affordances.
 *
 * The common header (label / type badge / delete) and footer
 * (input / output port bindings) live in the shared `NodeSettingsPanel`;
 * this component renders only the childWorkflow-specific body.
 */

import {
  ActionIcon,
  Box,
  Button,
  Code,
  Divider,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type {
  ChildWorkflowNode,
  GraphWorkflowConfig,
  PortBinding,
} from "../../../../types/workflow";
import { VariablePicker } from "../../graph-widgets";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChildWorkflowNodeSettingsProps {
  /** The narrowed childWorkflow node being edited. */
  node: ChildWorkflowNode;
  /** Full graph config — used for the nested VariablePicker option sources. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `ChildWorkflowNode`. Matches the mutation contract used by
   * `NodeSettingsPanel` for activity nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// Defaults for ref-type swap
// ---------------------------------------------------------------------------

const REF_TYPE_OPTIONS: Array<{
  value: ChildWorkflowNode["workflowRef"]["type"];
  label: string;
}> = [
  { value: "library", label: "Library" },
  { value: "inline", label: "Inline" },
];

function freshLibraryRef(): ChildWorkflowNode["workflowRef"] {
  return { type: "library", workflowId: "" };
}

function freshInlineRef(): ChildWorkflowNode["workflowRef"] {
  return {
    type: "inline",
    graph: {
      schemaVersion: "1.0",
      metadata: {},
      nodes: {},
      edges: [],
      entryNodeId: "",
      ctx: {},
    },
  };
}

function emptyMapping(): PortBinding {
  return { port: "", ctxKey: "" };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChildWorkflowNodeSettings({
  node,
  config,
  onConfigChange,
}: ChildWorkflowNodeSettingsProps) {
  const updateNode = (next: ChildWorkflowNode) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: next },
    });
  };

  const setRefType = (value: string) => {
    // SegmentedControl's data is locked to the workflowRef.type literals,
    // but its onChange signature is `(value: string) => void`. Narrow back
    // before forwarding so the rest of the form keeps the strict union.
    if (value !== "library" && value !== "inline") return;
    if (value === node.workflowRef.type) return;
    const nextRef = value === "library" ? freshLibraryRef() : freshInlineRef();
    updateNode({ ...node, workflowRef: nextRef });
  };

  const setWorkflowId = (workflowId: string) => {
    if (node.workflowRef.type !== "library") return;
    updateNode({
      ...node,
      workflowRef: { type: "library", workflowId },
    });
  };

  const setInputMappings = (next: PortBinding[]) => {
    if (next.length === 0) {
      const cleared: ChildWorkflowNode = { ...node };
      delete cleared.inputMappings;
      updateNode(cleared);
      return;
    }
    updateNode({ ...node, inputMappings: next });
  };

  const setOutputMappings = (next: PortBinding[]) => {
    if (next.length === 0) {
      const cleared: ChildWorkflowNode = { ...node };
      delete cleared.outputMappings;
      updateNode(cleared);
      return;
    }
    updateNode({ ...node, outputMappings: next });
  };

  const inputMappings = node.inputMappings ?? [];
  const outputMappings = node.outputMappings ?? [];

  return (
    <Stack
      gap="md"
      data-testid="child-workflow-node-settings"
      data-node-id={node.id}
    >
      <Box>
        <Title order={5} mb={4}>
          Workflow reference
        </Title>
        <Text size="10px" c="dimmed" mb="xs">
          Choose “Library” to invoke an existing workflow by id, or “Inline” to
          nest a graph directly on this node.
        </Text>
        <SegmentedControl
          size="xs"
          value={node.workflowRef.type}
          data={REF_TYPE_OPTIONS}
          onChange={setRefType}
          data-testid="child-workflow-node-settings-ref-type"
        />
      </Box>

      {node.workflowRef.type === "library" ? (
        <Box data-testid="child-workflow-node-settings-library-body">
          <TextInput
            label="Workflow id"
            description="The id of a stored workflow this node should invoke as a child."
            placeholder="e.g. invoice-approval"
            size="xs"
            value={node.workflowRef.workflowId}
            onChange={(event) => setWorkflowId(event.currentTarget.value)}
            data-testid="child-workflow-node-settings-workflow-id"
          />
        </Box>
      ) : (
        <Box data-testid="child-workflow-node-settings-inline-body">
          <Text size="xs" c="dimmed" mb="xs">
            Inline graph editing is not yet supported in V2; switch to JSON
            editor to author.
          </Text>
          <Code block data-testid="child-workflow-node-settings-inline-preview">
            {JSON.stringify(node.workflowRef.graph, null, 2)}
          </Code>
        </Box>
      )}

      <Divider />

      <MappingsEditor
        title="Input mappings"
        description="Bind a port name to a ctx key passed into the child workflow."
        addLabel="Add Input Mapping"
        config={config}
        currentNodeId={node.id}
        mappings={inputMappings}
        onChange={setInputMappings}
        testIdBase="child-workflow-node-settings-input"
      />

      <Divider />

      <MappingsEditor
        title="Output mappings"
        description="Bind a port name from the child workflow to a ctx key in this workflow."
        addLabel="Add Output Mapping"
        config={config}
        currentNodeId={node.id}
        mappings={outputMappings}
        onChange={setOutputMappings}
        testIdBase="child-workflow-node-settings-output"
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Mappings list editor (shared between input + output mappings)
// ---------------------------------------------------------------------------

interface MappingsEditorProps {
  title: string;
  description: string;
  addLabel: string;
  config: GraphWorkflowConfig;
  currentNodeId: string;
  mappings: PortBinding[];
  onChange: (next: PortBinding[]) => void;
  testIdBase: string;
}

function MappingsEditor({
  title,
  description,
  addLabel,
  config,
  currentNodeId,
  mappings,
  onChange,
  testIdBase,
}: MappingsEditorProps) {
  const addRow = () => onChange([...mappings, emptyMapping()]);

  const removeRowAt = (index: number) =>
    onChange(mappings.filter((_, i) => i !== index));

  const setRowAt = (index: number, next: PortBinding) =>
    onChange(mappings.map((row, i) => (i === index ? next : row)));

  return (
    <Box>
      <Group justify="space-between" align="center" mb={4}>
        <Title order={5} style={{ margin: 0 }}>
          {title}
        </Title>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={12} />}
          onClick={addRow}
          data-testid={`${testIdBase}-add`}
        >
          {addLabel}
        </Button>
      </Group>
      <Text size="10px" c="dimmed" mb="xs">
        {description}
      </Text>

      {mappings.length === 0 ? (
        <Text size="xs" c="dimmed">
          No mappings. Click {addLabel} to start.
        </Text>
      ) : (
        <Stack gap="xs">
          {mappings.map((row, index) => (
            <MappingRow
              // Index-based key is intentional: mappings have no stable id
              // and are an ordered list editable by index.
              key={`mapping-${index}`}
              index={index}
              value={row}
              config={config}
              currentNodeId={currentNodeId}
              testIdBase={`${testIdBase}-row-${index}`}
              onChange={(next) => setRowAt(index, next)}
              onRemove={() => removeRowAt(index)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

interface MappingRowProps {
  index: number;
  value: PortBinding;
  config: GraphWorkflowConfig;
  currentNodeId: string;
  testIdBase: string;
  onChange: (next: PortBinding) => void;
  onRemove: () => void;
}

function MappingRow({
  index,
  value,
  config,
  currentNodeId,
  testIdBase,
  onChange,
  onRemove,
}: MappingRowProps) {
  return (
    <Box
      data-testid={testIdBase}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Group justify="space-between" align="center" mb="xs">
        <Text size="xs" fw={600}>
          Mapping {index + 1}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          aria-label={`Remove mapping ${index + 1}`}
          data-testid={`${testIdBase}-remove`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>
      <Stack gap="xs">
        <TextInput
          label="Port"
          placeholder="e.g. payload"
          size="xs"
          value={value.port}
          onChange={(event) =>
            onChange({ ...value, port: event.currentTarget.value })
          }
          data-testid={`${testIdBase}-port`}
        />
        <VariablePicker
          config={config}
          currentNodeId={currentNodeId}
          value={value.ctxKey}
          onChange={(nextCtxKey) => onChange({ ...value, ctxKey: nextCtxKey })}
          label="ctx key"
          data-testid={`${testIdBase}-ctx-key`}
        />
      </Stack>
    </Box>
  );
}
