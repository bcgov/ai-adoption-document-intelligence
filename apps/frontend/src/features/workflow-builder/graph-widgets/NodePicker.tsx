/**
 * NodePicker — graph-aware typeahead/select for choosing a node from the
 * current workflow graph.
 *
 * Purely presentational. Sources options from `config.nodes`, optionally
 * narrows by `filterType`, excludes the currently-selected node so a node
 * cannot reference itself, and surfaces an inline warning when the bound
 * value points to a node that no longer exists.
 *
 * Used by control-flow node settings forms to bind references like
 * `join.sourceMapNodeId`, `map.bodyEntryNodeId`, and `map.bodyExitNodeId`.
 */

import {
  Autocomplete,
  Badge,
  type ComboboxItem,
  type ComboboxLikeRenderOptionInput,
  type ComboboxStringItem,
  Group,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo } from "react";
import type {
  GraphNode,
  GraphWorkflowConfig,
  NodeType,
} from "../../../types/workflow";

/**
 * Threshold above which the picker uses an Autocomplete (typeahead) rather
 * than a plain Select. Mantine's Select gets unwieldy past a few dozen
 * options.
 */
const AUTOCOMPLETE_THRESHOLD = 20;

export interface NodePickerProps {
  /** Full graph config. Options are sourced from `config.nodes`. */
  config: GraphWorkflowConfig;
  /** Currently-selected node id, or null when unset. */
  value: string | null;
  /** Fires with the chosen node id, or null when the field is cleared. */
  onChange: (nodeId: string | null) => void;
  /**
   * When provided, only nodes whose `type` equals this value are listed.
   * Example: `filterType="map"` for `join.sourceMapNodeId`.
   */
  filterType?: NodeType;
  /**
   * The id of the node currently being edited. The picker excludes this
   * id from its options so a node can never reference itself.
   */
  currentNodeId?: string;
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

interface NodeOption extends ComboboxItem {
  value: string;
  label: string;
  nodeType: NodeType;
}

export function NodePicker({
  config,
  value,
  onChange,
  filterType,
  currentNodeId,
  label,
  description,
  placeholder = "Select a node…",
  required,
  "data-testid": testId,
}: NodePickerProps) {
  const allEntries = useMemo<Array<[string, GraphNode]>>(
    () => Object.entries(config.nodes),
    [config.nodes],
  );

  const options = useMemo<NodeOption[]>(() => {
    return allEntries
      .filter(([id, node]) => {
        if (currentNodeId && id === currentNodeId) return false;
        if (filterType && node.type !== filterType) return false;
        return true;
      })
      .map(([id, node]) => ({
        value: id,
        label: node.label && node.label.length > 0 ? node.label : id,
        nodeType: node.type,
      }));
  }, [allEntries, currentNodeId, filterType]);

  const missingReference = useMemo(() => {
    if (!value) return false;
    return !(value in config.nodes);
  }, [value, config.nodes]);

  const renderSelectOption = ({
    option,
  }: ComboboxLikeRenderOptionInput<ComboboxItem>) => {
    const typed = option as NodeOption;
    return (
      <Group gap="xs" wrap="nowrap" justify="space-between" w="100%">
        <Text size="xs" truncate>
          {typed.label}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          {typed.nodeType}
        </Badge>
      </Group>
    );
  };

  const useAutocomplete = allEntries.length > AUTOCOMPLETE_THRESHOLD;

  // Autocomplete works in terms of strings, so we render by looking up the
  // node type for the matched label.
  const labelToType = new Map<string, NodeType>();
  for (const opt of options) {
    labelToType.set(opt.label, opt.nodeType);
  }
  const renderAutocompleteOption = ({
    option,
  }: ComboboxLikeRenderOptionInput<ComboboxStringItem>) => {
    const nodeType = labelToType.get(option.value);
    return (
      <Group gap="xs" wrap="nowrap" justify="space-between" w="100%">
        <Text size="xs" truncate>
          {option.value}
        </Text>
        {nodeType && (
          <Badge size="xs" variant="light" color="gray">
            {nodeType}
          </Badge>
        )}
      </Group>
    );
  };

  const warning = missingReference ? (
    <Group
      gap={4}
      mt={4}
      wrap="nowrap"
      data-testid="node-picker-missing-warning"
    >
      <IconAlertTriangle
        size={12}
        color="var(--mantine-color-yellow-7, #d97706)"
      />
      <Text size="10px" c="yellow.7">
        Referenced node "{value}" no longer exists in the graph.
      </Text>
    </Group>
  ) : null;

  if (useAutocomplete) {
    // Autocomplete operates on its display string; map id <-> label so the
    // user types/sees labels but onChange still emits ids.
    const labelToId = new Map<string, string>();
    for (const opt of options) {
      labelToId.set(opt.label, opt.value);
    }
    const currentLabel = (() => {
      if (!value) return "";
      const node = config.nodes[value];
      if (!node) return value;
      return node.label && node.label.length > 0 ? node.label : value;
    })();

    return (
      <Stack gap={0}>
        <Autocomplete
          label={label}
          description={description}
          placeholder={placeholder}
          withAsterisk={required}
          size="xs"
          value={currentLabel}
          data={options.map((o) => o.label)}
          data-testid={testId}
          renderOption={renderAutocompleteOption}
          onChange={(displayValue) => {
            if (displayValue === "") {
              onChange(null);
              return;
            }
            const matchedId = labelToId.get(displayValue);
            onChange(matchedId ?? null);
          }}
        />
        {warning}
      </Stack>
    );
  }

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
        clearButtonProps={{ "aria-label": "Clear node selection" }}
        onChange={(next) => onChange(next ?? null)}
      />
      {warning}
    </Stack>
  );
}
