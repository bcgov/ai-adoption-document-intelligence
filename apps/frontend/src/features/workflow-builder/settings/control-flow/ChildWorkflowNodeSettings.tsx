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
  Badge,
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
import { IconBook2, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import {
  useWorkflow,
  useWorkflowVersion,
  useWorkflowVersions,
  type WorkflowVersionSummary,
} from "../../../../data/hooks/useWorkflows";
import type {
  ChildWorkflowNode,
  GraphMetadata,
  GraphWorkflowConfig,
  LibraryPortDescriptor,
  PortBinding,
} from "../../../../types/workflow";
import { KindDot, VariablePicker } from "../../graph-widgets";
import { formatLibraryPortSummary } from "../../library/format-library-port-summary";
import { LibraryPickerModal } from "../../library/LibraryPickerModal";

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

  const setLibraryRef = (selection: {
    workflowId: string;
    version?: number;
  }) => {
    if (node.workflowRef.type !== "library") return;
    // Build the new library ref object so `version` is only present when
    // the picker returned an explicit pinned version. Existing configs
    // without `version` continue to mean "follow head" (REQUIREMENTS D3 /
    // schema US-076).
    const nextRef: ChildWorkflowNode["workflowRef"] = {
      type: "library",
      workflowId: selection.workflowId,
    };
    if (selection.version !== undefined) {
      nextRef.version = selection.version;
    }
    updateNode({
      ...node,
      workflowRef: nextRef,
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
        <LibraryRefBody
          workflowId={node.workflowRef.workflowId}
          version={node.workflowRef.version}
          onPick={setLibraryRef}
        />
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

// ---------------------------------------------------------------------------
// Library reference body — opens LibraryPickerModal, shows the picked
// library's signature read-only (US-063).
// ---------------------------------------------------------------------------

interface LibraryRefBodyProps {
  workflowId: string;
  /**
   * The currently pinned `WorkflowVersion.versionNumber` on the node's
   * `workflowRef.library.version`. `undefined` means "follow head"
   * (REQUIREMENTS D3 — absence is the on-disk shape for head).
   */
  version: number | undefined;
  onPick: (selection: { workflowId: string; version?: number }) => void;
}

/**
 * Resolves a pinned `WorkflowVersion.versionNumber` to its version *id*
 * by scanning the lineage's version summaries. The node pins a version
 * *number* (REQUIREMENTS D3) but `useWorkflowVersion` is keyed by id, so
 * this bridges the two. Returns `undefined` when the number isn't found
 * (summaries still loading, or a stale pin to a pruned version) — the
 * caller then falls back to the head signature.
 *
 * Pure + exported for unit testing.
 */
export function resolveVersionIdByNumber(
  summaries: WorkflowVersionSummary[] | undefined,
  versionNumber: number | undefined,
): string | undefined {
  if (versionNumber === undefined || !summaries) return undefined;
  return summaries.find((s) => s.versionNumber === versionNumber)?.id;
}

function LibraryRefBody({ workflowId, version, onPick }: LibraryRefBodyProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: headLibrary, isLoading: isLoadingHead } =
    useWorkflow(workflowId);

  // When the node pins a version *number*, resolve it to the version *id*
  // (via the lineage's version summaries) and fetch THAT version's config
  // so the signature summary reflects the pinned version — not the lineage
  // head (Item 31). When unpinned (`version === undefined`) we follow head.
  const versionsQuery = useWorkflowVersions(
    version === undefined ? undefined : workflowId,
  );
  const pinnedVersionId = resolveVersionIdByNumber(versionsQuery.data, version);
  const pinnedVersionQuery = useWorkflowVersion(
    version === undefined ? undefined : workflowId,
    pinnedVersionId,
  );

  // Head path → headLibrary. Pinned path → the pinned version's config.
  const pickedLibrary =
    version === undefined ? headLibrary : pinnedVersionQuery.data;
  const isLoadingLibrary =
    version === undefined
      ? isLoadingHead
      : versionsQuery.isLoading || pinnedVersionQuery.isLoading;

  const metadata = pickedLibrary?.config.metadata as GraphMetadata | undefined;
  const declaredInputs: LibraryPortDescriptor[] = metadata?.inputs ?? [];
  const declaredOutputs: LibraryPortDescriptor[] = metadata?.outputs ?? [];

  return (
    <Box data-testid="child-workflow-node-settings-library-body">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Title order={6} style={{ margin: 0 }}>
            Library workflow
          </Title>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconBook2 size={12} />}
            onClick={() => setPickerOpen(true)}
            data-testid="child-workflow-node-settings-pick-library"
          >
            {workflowId ? "Change library" : "Pick library workflow"}
          </Button>
        </Group>
        {!workflowId && (
          <Text size="xs" c="dimmed">
            Click "Pick library workflow" to select an existing library by
            signature.
          </Text>
        )}
        {workflowId && (
          <Box
            data-testid="child-workflow-node-settings-library-summary"
            style={{
              border: "1px solid var(--mantine-color-default-border, #2c2e33)",
              borderRadius: 4,
              padding: 8,
            }}
          >
            {isLoadingLibrary ? (
              <Text size="xs" c="dimmed">
                Loading library signature…
              </Text>
            ) : pickedLibrary ? (
              <Stack gap={4}>
                <Group gap={6} wrap="nowrap">
                  <Text size="xs" fw={600}>
                    {pickedLibrary.name}
                  </Text>
                  {/*
                   * Version badge — gray "head" when no pin (de-emphasized
                   * implicit reference), blue "v{N}" when explicitly pinned
                   * (load-bearing — author chose this version on purpose).
                   * REQUIREMENTS D3 + US-087.
                   */}
                  {version === undefined ? (
                    <Badge
                      size="xs"
                      variant="light"
                      color="gray"
                      data-testid="child-workflow-node-settings-version-badge"
                    >
                      head
                    </Badge>
                  ) : (
                    <Badge
                      size="xs"
                      variant="light"
                      color="blue"
                      data-testid="child-workflow-node-settings-version-badge"
                    >
                      v{version}
                    </Badge>
                  )}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setPickerOpen(true)}
                    data-testid="child-workflow-node-settings-change-version"
                  >
                    Change version
                  </Button>
                  <Badge size="xs" variant="light" color="blue">
                    {declaredInputs.length} input
                    {declaredInputs.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge size="xs" variant="light" color="grape">
                    {declaredOutputs.length} output
                    {declaredOutputs.length === 1 ? "" : "s"}
                  </Badge>
                </Group>
                <Text size="10px" c="dimmed" ff="monospace">
                  {pickedLibrary.slug} · {workflowId}
                </Text>
                {declaredInputs.length > 0 && (
                  <Box data-testid="child-workflow-node-settings-inputs">
                    <Text size="10px" c="dimmed" fw={600}>
                      Inputs:
                    </Text>
                    <Stack gap={2}>
                      {declaredInputs.map((port) => (
                        <SignaturePortRow
                          key={`in-${port.path}-${port.label}`}
                          port={port}
                          testId={`child-workflow-node-settings-input-port-${port.label}`}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
                {declaredOutputs.length > 0 && (
                  <Box data-testid="child-workflow-node-settings-outputs">
                    <Text size="10px" c="dimmed" fw={600}>
                      Outputs:
                    </Text>
                    <Stack gap={2}>
                      {declaredOutputs.map((port) => (
                        <SignaturePortRow
                          key={`out-${port.path}-${port.label}`}
                          port={port}
                          testId={`child-workflow-node-settings-output-port-${port.label}`}
                        />
                      ))}
                    </Stack>
                  </Box>
                )}
              </Stack>
            ) : (
              <Stack gap={4}>
                <Text size="xs" c="orange">
                  Library not found (id may be stale).
                </Text>
                <Text size="10px" c="dimmed" ff="monospace">
                  {workflowId}
                </Text>
              </Stack>
            )}
          </Box>
        )}
      </Stack>
      <LibraryPickerModal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(selection) => {
          onPick(selection);
          setPickerOpen(false);
        }}
        initialWorkflowId={workflowId || undefined}
        initialVersion={version}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// SignaturePortRow — renders one row of the library signature summary
// (US-100 Scenario 2). Each row prefixes a KindDot (rendered only when
// `port.kind` is defined) and surfaces the formatted "label (type, kind)"
// or "label (type)" text via the shared `formatLibraryPortSummary` helper.
// ---------------------------------------------------------------------------

interface SignaturePortRowProps {
  port: LibraryPortDescriptor;
  testId: string;
}

function SignaturePortRow({ port, testId }: SignaturePortRowProps) {
  return (
    <Group gap={4} wrap="nowrap" data-testid={testId}>
      <KindDot kind={port.kind} size={6} />
      <Text size="10px" c="dimmed">
        {formatLibraryPortSummary(port)}
      </Text>
    </Group>
  );
}
