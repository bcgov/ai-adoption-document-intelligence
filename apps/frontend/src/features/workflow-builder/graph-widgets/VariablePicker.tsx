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
 */
import { Autocomplete } from "@mantine/core";
import { useMemo } from "react";
import type { GraphWorkflowConfig } from "../../../types/workflow";

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
}: VariablePickerProps) {
  const options = useMemo(
    () => buildVariableOptions(config, currentNodeId),
    [config, currentNodeId],
  );

  return (
    <Autocomplete
      label={label}
      description={description}
      placeholder={placeholder}
      withAsterisk={required}
      size="xs"
      value={value}
      data={options}
      data-testid={testId}
      onChange={onChange}
    />
  );
}
