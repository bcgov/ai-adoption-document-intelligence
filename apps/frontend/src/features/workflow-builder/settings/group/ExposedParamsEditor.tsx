/**
 * ExposedParamsEditor — list editor for the `exposedParams[]` array
 * inside a `nodeGroups[<id>]` entry (US-044).
 *
 * Each row carries:
 *   - `label` (TextInput, required)
 *   - `nodeId` (Select scoped to the group's `nodeIds`; the option label
 *      uses the member node's `config.nodes[id].label`)
 *   - `path` (free-form TextInput; VariablePicker integration is
 *      deferred per the story)
 *   - `type` (Select: `string` / `number` / `boolean` / `select` — the
 *      `select` option corresponds to the story spec's "enum" wording
 *      and is surfaced with the user-friendly "Enum" label)
 *   - when `type === "select"`: a sub-list editor for `options[]`
 *      (TextInput rows + Add + per-row Remove)
 *   - per-row trash
 *
 * Rows whose `nodeId` does not appear in the supplied `nodeIds` are still
 * rendered so the user can repair the reference, but with a stale-warning
 * line. Active pruning on group-member removal happens in the parent
 * (`GroupNodeSettings`).
 */

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type {
  ExposedParam,
  GraphWorkflowConfig,
} from "../../../../types/workflow";

// ---------------------------------------------------------------------------
// Type narrowing helpers — keep the editor's option lists in sync with the
// underlying `ExposedParam["type"]` union. The story spec uses the word
// "enum" but the wire-level value is "select"; the editor surfaces "Enum"
// as the user-facing label while keeping `select` on the wire.
// ---------------------------------------------------------------------------

type ExposedParamType = ExposedParam["type"];

interface TypeOption {
  value: ExposedParamType;
  label: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "select", label: "Enum" },
];

const TYPE_VALUES = TYPE_OPTIONS.map((o) => o.value);

function isExposedParamType(v: string): v is ExposedParamType {
  return (TYPE_VALUES as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ExposedParamsEditorProps {
  /** Current exposed-params array (may be empty). */
  value: ExposedParam[];
  /** Group-member node ids the `nodeId` Select is restricted to. */
  nodeIds: string[];
  /** Full graph config — used to resolve member-node labels for display. */
  config: GraphWorkflowConfig;
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: ExposedParam[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Returns a fresh default exposed-param row. `type` defaults to the first
 * option ("string"); other optional fields are left undefined so the
 * resulting object is canonical.
 */
function defaultExposedParam(): ExposedParam {
  return {
    label: "",
    path: "",
    type: "string",
  };
}

export function ExposedParamsEditor({
  value,
  nodeIds,
  config,
  onChange,
}: ExposedParamsEditorProps) {
  const addRow = () => {
    onChange([...value, defaultExposedParam()]);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateAt = (index: number, next: ExposedParam) => {
    onChange(value.map((row, i) => (i === index ? next : row)));
  };

  return (
    <Stack gap="xs" data-testid="exposed-params-editor">
      {value.length === 0 ? (
        <Text size="xs" c="dimmed">
          No exposed parameters — click Add parameter to surface a value from
          one of the group's nodes.
        </Text>
      ) : (
        <Stack gap="xs">
          {value.map((row, index) => (
            <ExposedParamRow
              // Index-based key — rows have no stable id.
              key={`exposed-${index}`}
              index={index}
              value={row}
              nodeIds={nodeIds}
              config={config}
              onChange={(next) => updateAt(index, next)}
              onRemove={() => removeAt(index)}
            />
          ))}
        </Stack>
      )}

      <Group>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addRow}
          data-testid="exposed-params-editor-add"
        >
          Add parameter
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-row editor
// ---------------------------------------------------------------------------

interface ExposedParamRowProps {
  index: number;
  value: ExposedParam;
  nodeIds: string[];
  config: GraphWorkflowConfig;
  onChange: (next: ExposedParam) => void;
  onRemove: () => void;
}

function ExposedParamRow({
  index,
  value,
  nodeIds,
  config,
  onChange,
  onRemove,
}: ExposedParamRowProps) {
  const nodeOptions = nodeIds.map((id) => {
    const member = config.nodes[id];
    const label = member?.label ? member.label : id;
    return { value: id, label };
  });

  const stale =
    typeof value.nodeId === "string" &&
    value.nodeId.length > 0 &&
    !nodeIds.includes(value.nodeId);

  const setType = (nextType: ExposedParamType) => {
    if (nextType === "select") {
      // Switching TO enum from a non-enum type defaults options to [].
      if (value.type === "select") {
        onChange({ ...value, type: nextType });
        return;
      }
      onChange({ ...value, type: nextType, options: [] });
      return;
    }
    // Switching AWAY from enum drops the options key.
    if (value.type === "select") {
      const { options: _omitted, ...rest } = value;
      void _omitted;
      onChange({ ...rest, type: nextType });
      return;
    }
    onChange({ ...value, type: nextType });
  };

  const setOptions = (next: string[]) => {
    onChange({ ...value, options: next });
  };

  return (
    <Box
      data-testid={`exposed-params-row-${index}`}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Group justify="space-between" align="center" mb={4}>
        <Text size="xs" fw={600}>
          Parameter {index + 1}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          aria-label={`Remove exposed parameter ${index + 1}`}
          data-testid={`exposed-params-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          label="Label"
          size="xs"
          withAsterisk
          value={value.label}
          onChange={(e) => onChange({ ...value, label: e.currentTarget.value })}
          data-testid={`exposed-params-label-${index}`}
        />

        <Select
          label="Node"
          description="Which group-member node owns this parameter."
          size="xs"
          data={nodeOptions}
          value={value.nodeId ?? null}
          onChange={(v) => {
            if (v === null) {
              const { nodeId: _omitted, ...rest } = value;
              void _omitted;
              onChange({ ...rest });
              return;
            }
            onChange({ ...value, nodeId: v });
          }}
          allowDeselect
          data-testid={`exposed-params-node-${index}`}
        />

        {stale ? (
          <Text
            size="10px"
            c="orange"
            data-testid={`exposed-params-stale-${index}`}
          >
            Node "{value.nodeId}" is no longer a member of this group. Re-pick a
            node or remove this parameter.
          </Text>
        ) : null}

        <TextInput
          label="Param path"
          description="Dot-separated path into the workflow config (e.g. nodes.n1.parameters.timeout)."
          size="xs"
          value={value.path}
          onChange={(e) => onChange({ ...value, path: e.currentTarget.value })}
          data-testid={`exposed-params-path-${index}`}
        />

        <Select
          label="Type"
          size="xs"
          data={TYPE_OPTIONS}
          value={value.type}
          onChange={(v) => {
            if (v === null) return;
            if (!isExposedParamType(v)) return;
            setType(v);
          }}
          allowDeselect={false}
          withAsterisk
          data-testid={`exposed-params-type-${index}`}
        />

        {value.type === "select" ? (
          <OptionsListEditor
            rowIndex={index}
            value={value.options ?? []}
            onChange={setOptions}
          />
        ) : null}
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Options sub-editor — shown when `type === "select"`. Each option is a
// free-form string with per-row Remove + an Add button below.
// ---------------------------------------------------------------------------

interface OptionsListEditorProps {
  rowIndex: number;
  value: string[];
  onChange: (next: string[]) => void;
}

function OptionsListEditor({
  rowIndex,
  value,
  onChange,
}: OptionsListEditorProps) {
  const updateAt = (i: number, next: string) => {
    const out = value.slice();
    out[i] = next;
    onChange(out);
  };

  const removeAt = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const addOption = () => {
    onChange([...value, ""]);
  };

  return (
    <Box data-testid={`exposed-params-options-${rowIndex}`}>
      <Text size="xs" fw={500} mb={4}>
        Options
      </Text>
      <Stack gap={4}>
        {value.map((option, i) => (
          <Group key={`opt-${i}`} gap="xs" align="center" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <TextInput
                size="xs"
                value={option}
                onChange={(e) => updateAt(i, e.currentTarget.value)}
                data-testid={`exposed-params-options-${rowIndex}-${i}`}
              />
            </Box>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => removeAt(i)}
              aria-label={`Remove option ${i + 1}`}
              data-testid={`exposed-params-options-${rowIndex}-remove-${i}`}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        ))}
      </Stack>
      <Group mt={4}>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addOption}
          data-testid={`exposed-params-options-${rowIndex}-add`}
        >
          Add option
        </Button>
      </Group>
    </Box>
  );
}
