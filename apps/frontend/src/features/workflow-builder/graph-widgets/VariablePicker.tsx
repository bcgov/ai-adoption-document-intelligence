/**
 * VariablePicker — graph-aware autocomplete for choosing a ctx variable
 * from the current workflow graph.
 *
 * Purely presentational. Sources options from two groups:
 *  1. Workflow-level ctx declarations (`config.ctx` keys).
 *  2. ctxKeys other nodes write to via their output bindings,
 *     minus anything already listed in the first group.
 *
 * Used by activity-node input port bindings and by the
 * `ConditionExpressionEditor`'s Ref-mode `ValueRef` field so the author
 * sees the same options regardless of where they're picking a variable.
 *
 * Typed-I/O sort (US-097): when an `expectedKind` prop is supplied the
 * picker sorts compatible variables first, inserts a labelled divider
 * (`"Incompatible with this port"`), and dims + tooltips incompatibles
 * with the exact mismatch reason. Clicking an incompatible row STILL
 * binds the variable — save-time validation is the hard gate, the
 * picker only steers. When `expectedKind` is undefined the picker
 * renders today's flat grouped list (legacy / pre-Phase-3 UX).
 */

import type { KindRef } from "@ai-di/graph-workflow";
import type {
  ComboboxLikeRenderOptionInput,
  ComboboxStringItem,
} from "@mantine/core";
import { Autocomplete, Text, Tooltip } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";
import {
  sortVariablesByCompatibility,
  type VariablePickerEntry,
} from "./variable-picker-utils";

export interface VariablePickerProps {
  /** Full graph config. Options are sourced from `config.ctx` + node outputs. */
  config: GraphWorkflowConfig;
  /**
   * The id of the node the picker is being rendered for. Outputs from this
   * node are excluded from the "Other nodes' outputs" group — a node should
   * not bind an input to its own output.
   */
  currentNodeId?: string;
  /** Currently-selected ctx key (free-text, empty string means unset). */
  value: string;
  /** Fires with the chosen ctx key (free-text). */
  onChange: (next: string) => void;
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
  /**
   * Typed-I/O: when set the picker sorts compatible options first and
   * dims + tooltips incompatibles. Omit (the default) for the legacy
   * flat grouped render.
   */
  expectedKind?: KindRef;
  /**
   * Typed-I/O: caller-supplied resolver for the producer kind of a ctx
   * key. Only consulted when `expectedKind` is set. When omitted (or it
   * returns `undefined`) the variable is treated as the `Artifact`
   * wildcard and lands in the compatible group.
   */
  resolveProducerKind?: (ctxKey: string) => KindRef | undefined;
}

/**
 * Build grouped Autocomplete suggestions for variable bindings.
 * Group 1: workflow-level ctx declarations.
 * Group 2: ctxKeys other nodes write to via their output bindings,
 * minus anything already listed in group 1.
 */
export function buildVariableOptions(
  config: GraphWorkflowConfig,
  currentNodeId?: string,
): { group: string; items: string[] }[] {
  const ctxDeclared = Object.keys(config.ctx).sort();
  const declaredSet = new Set(ctxDeclared);
  const otherOutputs = new Set<string>();
  for (const [id, n] of Object.entries(config.nodes)) {
    if (currentNodeId && id === currentNodeId) continue;
    if (n.type !== "activity") continue;
    for (const binding of n.outputs ?? []) {
      if (binding.ctxKey && !declaredSet.has(binding.ctxKey)) {
        otherOutputs.add(binding.ctxKey);
      }
    }
  }
  const groups: { group: string; items: string[] }[] = [];
  if (ctxDeclared.length > 0) {
    groups.push({ group: "Workflow context", items: ctxDeclared });
  }
  if (otherOutputs.size > 0) {
    groups.push({
      group: "Other nodes' outputs",
      items: [...otherOutputs].sort(),
    });
  }
  return groups;
}

/**
 * Flatten the grouped option list into a single ctxKey array, preserving
 * the existing display ordering (workflow ctx first, then other nodes'
 * outputs). Used as the input list to `sortVariablesByCompatibility`.
 */
function flattenGroupedOptions(
  groups: { group: string; items: string[] }[],
): string[] {
  const out: string[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      out.push(item);
    }
  }
  return out;
}

const INCOMPATIBLE_GROUP_LABEL = "Incompatible with this port";

export function VariablePicker({
  config,
  currentNodeId,
  value,
  onChange,
  label,
  description,
  placeholder = "ctx key (e.g. preparedData)",
  required,
  "data-testid": testId,
  expectedKind,
  resolveProducerKind,
}: VariablePickerProps) {
  const groupedOptions = useMemo(
    () => buildVariableOptions(config, currentNodeId),
    [config, currentNodeId],
  );

  // Legacy / Scenario 3 path: no `expectedKind` → render the existing
  // grouped flat list unchanged. No sort, no divider, no dimming.
  if (expectedKind === undefined) {
    return (
      <Autocomplete
        label={label}
        description={description}
        placeholder={placeholder}
        withAsterisk={required}
        size="xs"
        value={value}
        data={groupedOptions}
        data-testid={testId}
        onChange={onChange}
      />
    );
  }

  // Typed-I/O path (Scenarios 1, 2, 4, 5). Build the compatibility split
  // off the flattened option list, then re-project into grouped form so
  // the Autocomplete renders compatible options first followed by a
  // labelled `INCOMPATIBLE_GROUP_LABEL` divider group.
  const flatCtxKeys = flattenGroupedOptions(groupedOptions);
  const entries: VariablePickerEntry[] = flatCtxKeys.map((ctxKey) => ({
    id: ctxKey,
    label: ctxKey,
    ctxKey,
    producerKind: resolveProducerKind?.(ctxKey),
  }));
  const { compatible, incompatible, reasons } = sortVariablesByCompatibility(
    entries,
    expectedKind,
  );

  const sortedGroups: { group: string; items: string[] }[] = [];
  if (compatible.length > 0) {
    sortedGroups.push({
      group: "Compatible",
      items: compatible.map((e) => e.ctxKey),
    });
  }
  if (incompatible.length > 0) {
    sortedGroups.push({
      group: INCOMPATIBLE_GROUP_LABEL,
      items: incompatible.map((e) => e.ctxKey),
    });
  }

  const incompatibleIds = new Set(incompatible.map((e) => e.id));

  const renderOption = ({
    option,
  }: ComboboxLikeRenderOptionInput<ComboboxStringItem>) => {
    const isIncompatible = incompatibleIds.has(option.value);
    if (!isIncompatible) {
      return (
        <Text size="xs" data-testid={`variable-picker-option-${option.value}`}>
          {option.value}
        </Text>
      );
    }
    const reason = reasons.get(option.value) ?? "";
    return (
      <Tooltip label={reason} withinPortal>
        <Text
          size="xs"
          style={{ opacity: 0.5, width: "100%" }}
          data-testid={`variable-picker-option-${option.value}`}
          data-incompatible="true"
          data-incompatible-reason={reason}
        >
          {option.value}
        </Text>
      </Tooltip>
    );
  };

  return (
    <Autocomplete
      label={label}
      description={description}
      placeholder={placeholder}
      withAsterisk={required}
      size="xs"
      value={value}
      data={sortedGroups}
      data-testid={testId}
      renderOption={renderOption}
      onChange={onChange}
    />
  );
}
