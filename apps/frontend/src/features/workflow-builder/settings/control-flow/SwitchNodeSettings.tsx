/**
 * SwitchNodeSettings — switch-specific body for the right-rail
 * node-settings panel.
 *
 * Edits the two switch-only fields:
 *   - `cases: SwitchCase[]` — a list of rows, each containing a
 *     `ConditionExpressionEditor` for `condition` and an `EdgePicker`
 *     for `edgeId` (scoped to edges originating from this switch node).
 *   - `defaultEdge?: string` — an `EdgePicker` (also scoped to edges
 *     from this node).
 *
 * The common header (label / type badge / delete) and footer (input /
 * output port bindings) live in the shared `NodeSettingsPanel`; this
 * component renders only the switch-specific body.
 */

import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type {
  ConditionExpression,
  GraphWorkflowConfig,
  SwitchCase,
  SwitchNode,
} from "../../../../types/workflow";
import { ConditionExpressionEditor, EdgePicker } from "../../graph-widgets";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SwitchNodeSettingsProps {
  /** The narrowed switch node being edited. */
  node: SwitchNode;
  /** Full graph config — used for the `EdgePicker` + nested variable pickers. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `SwitchNode`. Matches the mutation contract used by `NodeSettingsPanel`
   * for activity nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// Default seed for a fresh case row
// ---------------------------------------------------------------------------

const EMPTY_CONDITION: ConditionExpression = {
  operator: "equals",
  left: { ref: "" },
  right: { ref: "" },
};

function emptyCase(): SwitchCase {
  return {
    condition: { ...EMPTY_CONDITION },
    edgeId: "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwitchNodeSettings({
  node,
  config,
  onConfigChange,
}: SwitchNodeSettingsProps) {
  const updateNode = (next: SwitchNode) => {
    onConfigChange({
      ...config,
      nodes: { ...config.nodes, [node.id]: next },
    });
  };

  const setCases = (cases: SwitchCase[]) => updateNode({ ...node, cases });

  const setCaseAt = (index: number, next: SwitchCase) => {
    setCases(node.cases.map((c, i) => (i === index ? next : c)));
  };

  const addCase = () => setCases([...node.cases, emptyCase()]);

  const removeCaseAt = (index: number) =>
    setCases(node.cases.filter((_, i) => i !== index));

  const setDefaultEdge = (edgeId: string | null) => {
    if (edgeId === null) {
      const next: SwitchNode = { ...node };
      delete next.defaultEdge;
      updateNode(next);
      return;
    }
    updateNode({ ...node, defaultEdge: edgeId });
  };

  return (
    <Stack gap="md" data-testid="switch-node-settings" data-node-id={node.id}>
      <Box>
        <Group justify="space-between" align="center" mb={4}>
          <Title order={5} style={{ margin: 0 }}>
            Cases
          </Title>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconPlus size={12} />}
            onClick={addCase}
            data-testid="switch-node-settings-add-case"
          >
            Add Case
          </Button>
        </Group>
        <Text size="10px" c="dimmed" mb="xs">
          Each case pairs a condition with the outgoing edge to follow when the
          condition is true. Cases are evaluated in order.
        </Text>

        {node.cases.length === 0 ? (
          <Text size="xs" c="dimmed">
            No cases. Click Add Case to start authoring switch branches.
          </Text>
        ) : (
          <Stack gap="md">
            {node.cases.map((switchCase, index) => (
              <CaseRow
                // Index-based key is intentional: cases have no stable id and
                // are an ordered list editable by index.
                key={`case-${index}`}
                index={index}
                value={switchCase}
                config={config}
                fromNodeId={node.id}
                onChange={(next) => setCaseAt(index, next)}
                onRemove={() => removeCaseAt(index)}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Divider />

      <Box>
        <Title order={5} mb={4}>
          Default edge
        </Title>
        <Text size="10px" c="dimmed" mb="xs">
          Followed when no case matches. Leave empty to fail-closed on
          fall-through.
        </Text>
        <EdgePicker
          config={config}
          fromNodeId={node.id}
          value={node.defaultEdge ?? null}
          onChange={setDefaultEdge}
          edgeTypes={["conditional"]}
          placeholder="Pick a default edge…"
          data-testid="switch-node-settings-default-edge"
        />
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-case row
// ---------------------------------------------------------------------------

interface CaseRowProps {
  index: number;
  value: SwitchCase;
  config: GraphWorkflowConfig;
  fromNodeId: string;
  onChange: (next: SwitchCase) => void;
  onRemove: () => void;
}

function CaseRow({
  index,
  value,
  config,
  fromNodeId,
  onChange,
  onRemove,
}: CaseRowProps) {
  const testIdBase = `switch-node-settings-case-${index}`;

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
          Case {index + 1}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          aria-label={`Remove case ${index + 1}`}
          data-testid={`${testIdBase}-remove`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>
      <Stack gap="xs">
        <Box>
          <Text size="xs" fw={500} mb={4}>
            Condition
          </Text>
          <ConditionExpressionEditor
            value={value.condition}
            onChange={(nextCondition) =>
              onChange({
                ...value,
                condition: nextCondition ?? { ...EMPTY_CONDITION },
              })
            }
            config={config}
            currentNodeId={fromNodeId}
            data-testid={`${testIdBase}-condition`}
          />
        </Box>
        <EdgePicker
          config={config}
          fromNodeId={fromNodeId}
          value={value.edgeId === "" ? null : value.edgeId}
          onChange={(nextEdgeId) =>
            onChange({ ...value, edgeId: nextEdgeId ?? "" })
          }
          edgeTypes={["conditional"]}
          label="Edge"
          placeholder="Pick the outgoing edge…"
          data-testid={`${testIdBase}-edge`}
        />
      </Stack>
    </Box>
  );
}
