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
import { type ReactNode, useEffect, useMemo, useState } from "react";
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
   * When provided, only nodes whose id is in this set are listed (applied on
   * top of `filterType`). Example: restrict a map's body-exit picker to nodes
   * reachable from the body-entry, since an unreachable node can never be a
   * valid exit. Omit to list every node.
   */
  restrictToIds?: ReadonlySet<string>;
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
  restrictToIds,
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
        if (restrictToIds && !restrictToIds.has(id)) return false;
        return true;
      })
      .map(([id, node]) => ({
        value: id,
        label: node.label && node.label.length > 0 ? node.label : id,
        nodeType: node.type,
      }));
  }, [allEntries, currentNodeId, filterType, restrictToIds]);

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
      <NodePickerAutocomplete
        options={options}
        currentLabel={currentLabel}
        labelToId={labelToId}
        onChange={onChange}
        renderOption={renderAutocompleteOption}
        label={label}
        description={description}
        placeholder={placeholder}
        required={required}
        testId={testId}
        warning={warning}
      />
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

interface NodePickerAutocompleteProps {
  options: NodeOption[];
  /** Display label for the currently-bound id (empty string when unset). */
  currentLabel: string;
  labelToId: Map<string, string>;
  onChange: (nodeId: string | null) => void;
  renderOption: (
    input: ComboboxLikeRenderOptionInput<ComboboxStringItem>,
  ) => ReactNode;
  label?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  testId?: string;
  warning: ReactNode;
}

/**
 * Autocomplete variant used on large graphs (> AUTOCOMPLETE_THRESHOLD nodes).
 *
 * Keeps its own `search` string so the field is TYPEABLE: Mantine's
 * Autocomplete fires `onChange` on every keystroke with the partial text.
 * The previous controlled implementation mapped that partial to an id and
 * emitted `null` when it wasn't an exact label, which cleared the parent's
 * value and snapped the input back to empty on every character. Instead we
 * only commit an id when the typed text EXACTLY matches a known label (or
 * `null` on a full clear); partial strings just update local state so the
 * user can keep typing. External value changes re-sync via `currentLabel`.
 */
function NodePickerAutocomplete({
  options,
  currentLabel,
  labelToId,
  onChange,
  renderOption,
  label,
  description,
  placeholder,
  required,
  testId,
  warning,
}: NodePickerAutocompleteProps) {
  const [search, setSearch] = useState(currentLabel);

  // Re-sync the visible text when the bound value changes from outside
  // (programmatic set, or the referenced node's label changed).
  useEffect(() => {
    setSearch(currentLabel);
  }, [currentLabel]);

  return (
    <Stack gap={0}>
      <Autocomplete
        label={label}
        description={description}
        placeholder={placeholder}
        withAsterisk={required}
        size="xs"
        value={search}
        data={options.map((o) => o.label)}
        data-testid={testId}
        renderOption={renderOption}
        onChange={(displayValue) => {
          setSearch(displayValue);
          if (displayValue === "") {
            onChange(null);
            return;
          }
          const matchedId = labelToId.get(displayValue);
          // Only commit on an exact-label match; keep the current binding
          // for partial strings so the field stays typeable.
          if (matchedId !== undefined) {
            onChange(matchedId);
          }
        }}
      />
      {warning}
    </Stack>
  );
}
