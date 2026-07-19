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
import { Autocomplete, Button, Text, Tooltip } from "@mantine/core";
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { GraphWorkflowConfig, MapNode } from "../../../types/workflow";
import { analyzeMapBody } from "../settings/control-flow/map-body-analysis";
import { resolveProducerKindFor } from "./resolve-producer-kind";
import {
  expandVariableOptions,
  resolveValuePathKind,
  type VariablePathInfo,
} from "./variable-field-options";
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
  /**
   * When provided, the picker offers an inline "+ Create variable" button
   * once the typed `value` is a valid new identifier that isn't already an
   * option — declaring a ctx key in place so binding to it doesn't require a
   * detour to Workflow Settings (an undeclared ctx key on a port binding is a
   * save-blocking validation error). Consumers wire this to
   * `declareCtxKey(config, key)` via `onConfigChange`.
   */
  onCreateCtxKey?: (key: string) => void;
}

/** A simple, dot-free identifier the "+ Create" affordance is offered for. */
const NEW_CTX_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Loop variables (a map's item / index ctx key) that are in scope for
 * `currentNodeId` — i.e. that node sits inside the map's body. Body membership
 * uses the SAME forward entry→exit reachability as the canvas body group and
 * the runtime (`analyzeMapBody`), so a node visually inside the green body box
 * — including dead-end branch nodes that never reach the exit — is offered the
 * loop variables. (A prior ancestor-of-exit test silently excluded dead-end
 * branches, disagreeing with the canvas and the runtime.) These keys are
 * declared on the map node, never on `config.ctx` or an activity output
 * binding, so the picker would otherwise never offer them — and the item's
 * fields (e.g. a `TypedSegment` map item's `.confidence`) would never drill.
 */
function loopVariablesInScope(
  config: GraphWorkflowConfig,
  currentNodeId: string,
): string[] {
  const keys: string[] = [];
  for (const node of Object.values(config.nodes)) {
    if (node.type !== "map") continue;
    const mapNode = node as MapNode;
    const { bodyNodeIds } = analyzeMapBody(
      config,
      mapNode.bodyEntryNodeId,
      mapNode.bodyExitNodeId,
    );
    if (!bodyNodeIds.includes(currentNodeId)) continue;
    if (mapNode.itemCtxKey) keys.push(mapNode.itemCtxKey);
    if (mapNode.indexCtxKey) keys.push(mapNode.indexCtxKey);
  }
  return keys;
}

/**
 * Build grouped Autocomplete suggestions for variable bindings.
 * Group 1: workflow-level ctx declarations.
 * Group 2: loop variables (map item / index) in scope for the current node.
 * Group 3: ctxKeys other nodes write to via their output bindings,
 * minus anything already listed in earlier groups.
 */
export function buildVariableOptions(
  config: GraphWorkflowConfig,
  currentNodeId?: string,
): { group: string; items: string[] }[] {
  const ctxDeclared = Object.keys(config.ctx).sort();
  const declaredSet = new Set(ctxDeclared);
  const loopVars = currentNodeId
    ? [...new Set(loopVariablesInScope(config, currentNodeId))]
        .filter((k) => !declaredSet.has(k))
        .sort()
    : [];
  const loopSet = new Set(loopVars);
  const otherOutputs = new Set<string>();
  for (const [id, n] of Object.entries(config.nodes)) {
    if (currentNodeId && id === currentNodeId) continue;
    if (n.type !== "activity") continue;
    for (const binding of n.outputs ?? []) {
      if (
        binding.ctxKey &&
        !declaredSet.has(binding.ctxKey) &&
        !loopSet.has(binding.ctxKey)
      ) {
        otherOutputs.add(binding.ctxKey);
      }
    }
  }
  const groups: { group: string; items: string[] }[] = [];
  if (ctxDeclared.length > 0) {
    groups.push({ group: "Workflow context", items: ctxDeclared });
  }
  if (loopVars.length > 0) {
    groups.push({ group: "Loop variables", items: loopVars });
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
  onCreateCtxKey,
}: VariablePickerProps) {
  const baseGroups = useMemo(
    () => buildVariableOptions(config, currentNodeId),
    [config, currentNodeId],
  );
  // Base ctx keys (bare producers/ctx/loop vars), as opposed to drilled
  // `key.field` rows. Membership — not "contains a dot" — is the correct
  // discriminator: `__auto.<node>.<port>` base keys legitimately contain dots.
  const knownBaseKeys = useMemo(
    () => baseGroups.flatMap((g) => g.items),
    [baseGroups],
  );
  // Field drill-down (KIND_FIELD_SCHEMAS_DESIGN.md §5): re-expands as the
  // typed value establishes deeper drillable prefixes.
  const { groups: groupedOptions, meta: pathMeta } = useMemo(
    () => expandVariableOptions(baseGroups, config, value, currentNodeId),
    [baseGroups, config, value, currentNodeId],
  );

  // Inline "+ Create variable" affordance — offered once the typed value is a
  // valid new identifier that isn't already an option. Rendered beneath the
  // input in BOTH render paths (undeclared ctx keys error on either).
  const existingOptionValues = useMemo(
    () => new Set(flattenGroupedOptions(groupedOptions)),
    [groupedOptions],
  );
  const showCreate =
    onCreateCtxKey !== undefined &&
    NEW_CTX_KEY_RE.test(value) &&
    !existingOptionValues.has(value);
  const createButton = showCreate ? (
    <Button
      variant="subtle"
      size="compact-xs"
      mt={4}
      data-testid="variable-picker-create"
      onClick={() => onCreateCtxKey?.(value)}
    >
      + Create variable "{value}"
    </Button>
  ) : null;

  // Caption text for a drilled field row ("string · optional", "object ·
  // Segment"). Base keys get no caption — tested by membership, not by "has a
  // dot", so dotted base keys (`__auto.<node>.<port>`) stay caption-free.
  const captionFor = (optionValue: string): string | null => {
    if (knownBaseKeys.includes(optionValue)) return null;
    const info: VariablePathInfo | undefined = pathMeta.get(optionValue);
    if (info === undefined) return null;
    const parts: string[] = [];
    if (info.type !== undefined) parts.push(info.type);
    if (info.kind !== undefined) parts.push(info.kind);
    if (info.required === false) parts.push("optional");
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  const renderFieldAwareOption = (
    optionValue: string,
    body?: ReactNode,
  ): ReactNode => {
    const caption = captionFor(optionValue);
    return (
      <div style={{ width: "100%" }}>
        {body ?? (
          <Text size="xs" data-testid={`variable-picker-option-${optionValue}`}>
            {optionValue}
          </Text>
        )}
        {caption !== null && (
          <Text
            size="10px"
            c="dimmed"
            data-testid={`variable-picker-caption-${optionValue}`}
          >
            {caption}
          </Text>
        )}
      </div>
    );
  };

  // Legacy / Scenario 3 path: no `expectedKind` → render the existing
  // grouped flat list unchanged. No sort, no divider, no dimming.
  if (expectedKind === undefined) {
    return (
      <>
        <Autocomplete
          label={label}
          description={description}
          placeholder={placeholder}
          withAsterisk={required}
          size="xs"
          value={value}
          data={groupedOptions}
          data-testid={testId}
          renderOption={({ option }) => renderFieldAwareOption(option.value)}
          onChange={onChange}
        />
        {createButton}
      </>
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
    // Base keys (incl. dotted `__auto.*` ones) keep the caller-supplied
    // resolver, falling back to the config resolver; drilled `key.field` rows
    // sort by their LEAF kind. Discriminate on membership, not on "has a dot".
    producerKind: knownBaseKeys.includes(ctxKey)
      ? (resolveProducerKind?.(ctxKey) ??
        resolveProducerKindFor(ctxKey, config, currentNodeId))
      : resolveValuePathKind(ctxKey, config, knownBaseKeys, currentNodeId),
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
      return renderFieldAwareOption(option.value);
    }
    const reason = reasons.get(option.value) ?? "";
    return renderFieldAwareOption(
      option.value,
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
      </Tooltip>,
    );
  };

  return (
    <>
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
      {createButton}
    </>
  );
}
