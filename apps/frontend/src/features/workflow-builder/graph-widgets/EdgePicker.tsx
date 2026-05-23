/**
 * EdgePicker — graph-aware select for choosing an outgoing edge from a
 * specific node in the current workflow graph.
 *
 * Purely presentational. Sources options from `config.edges` filtered to
 * edges whose `source === fromNodeId`. Each option label shows the target
 * node's label (or id) as primary text plus the edge id as secondary text.
 * Surfaces an inline warning when the bound value points to an edge that
 * no longer exists or whose source no longer matches `fromNodeId`.
 *
 * Used by control-flow node settings forms to bind references like
 * `switch.cases[*].edgeId`, `switch.defaultEdge`,
 * `humanGate.fallbackEdgeId`, and `errorPolicy.fallbackEdgeId`.
 */

import {
  type ComboboxItem,
  type ComboboxLikeRenderOptionInput,
  Group,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo } from "react";
import type { GraphEdge, GraphWorkflowConfig } from "../../../types/workflow";

export interface EdgePickerProps {
  /** Full graph config. Edge options are sourced from `config.edges`. */
  config: GraphWorkflowConfig;
  /**
   * The node id from which the listed edges must originate. Only edges
   * with `source === fromNodeId` are presented.
   */
  fromNodeId: string;
  /** Currently-selected edge id, or null when unset. */
  value: string | null;
  /** Fires with the chosen edge id, or null when the field is cleared. */
  onChange: (edgeId: string | null) => void;
  /** Field label rendered above the input. */
  label?: string;
  /** Optional description rendered between the label and input. */
  description?: string;
  /** Placeholder shown when no value is selected. */
  placeholder?: string;
  /** When true, renders an asterisk after the label. */
  required?: boolean;
  /** Test-id for the underlying input (the Mantine root). */
  "data-testid"?: string;
}

interface EdgeOption extends ComboboxItem {
  value: string;
  label: string;
  targetLabel: string;
  edgeId: string;
}

function resolveTargetLabel(
  edge: GraphEdge,
  config: GraphWorkflowConfig,
): string {
  const targetNode = config.nodes[edge.target];
  if (!targetNode) return edge.target;
  return targetNode.label && targetNode.label.length > 0
    ? targetNode.label
    : edge.target;
}

export function EdgePicker({
  config,
  fromNodeId,
  value,
  onChange,
  label,
  description,
  placeholder = "Select an edge…",
  required,
  "data-testid": testId,
}: EdgePickerProps) {
  const options = useMemo<EdgeOption[]>(() => {
    return config.edges
      .filter((edge) => edge.source === fromNodeId)
      .map((edge) => {
        const targetLabel = resolveTargetLabel(edge, config);
        return {
          value: edge.id,
          label: targetLabel,
          targetLabel,
          edgeId: edge.id,
        };
      });
  }, [config, fromNodeId]);

  const staleReference = useMemo(() => {
    if (!value) return false;
    const edge = config.edges.find((e) => e.id === value);
    if (!edge) return true;
    return edge.source !== fromNodeId;
  }, [value, config.edges, fromNodeId]);

  const renderSelectOption = ({
    option,
  }: ComboboxLikeRenderOptionInput<ComboboxItem>) => {
    const typed = option as EdgeOption;
    return (
      <Group gap="xs" wrap="nowrap" justify="space-between" w="100%">
        <Text size="xs" truncate>
          {typed.targetLabel}
        </Text>
        <Text size="10px" c="dimmed">
          {typed.edgeId}
        </Text>
      </Group>
    );
  };

  const warning = staleReference ? (
    <Group gap={4} mt={4} wrap="nowrap" data-testid="edge-picker-stale-warning">
      <IconAlertTriangle
        size={12}
        color="var(--mantine-color-yellow-7, #d97706)"
      />
      <Text size="10px" c="yellow.7">
        Referenced edge "{value}" is stale — it no longer exists or its source
        has changed.
      </Text>
    </Group>
  ) : null;

  return (
    <Stack gap={0}>
      <Select
        label={label}
        description={description}
        placeholder={placeholder}
        withAsterisk={required}
        size="xs"
        clearable
        searchable
        data={options}
        value={value}
        data-testid={testId}
        renderOption={renderSelectOption}
        clearButtonProps={{ "aria-label": "Clear edge selection" }}
        onChange={(next) => onChange(next ?? null)}
      />
      {warning}
    </Stack>
  );
}
