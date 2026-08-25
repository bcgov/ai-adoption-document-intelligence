/**
 * PollUntilNodeSettings — pollUntil-specific body for the right-rail
 * node-settings panel.
 *
 * Edits the pollUntil-only fields of a `PollUntilNode`:
 *   - `activityType` — Mantine `Select` populated from `ACTIVITY_CATALOG`,
 *     grouped by `CatalogCategory`. Selecting a type swaps the parameters
 *     editor below to that activity's `parametersSchema` rendered via the
 *     existing `JsonSchemaForm`.
 *   - `parameters` — `JsonSchemaForm` driven by the chosen activity's JSON
 *     Schema (only shown once an activity type is selected).
 *   - `condition` — `ConditionExpressionEditor` (FR-1c) describing the loop
 *     termination predicate.
 *   - `interval` — `TextInput` validated as a Temporal duration string;
 *     surfaces an inline error and withholds the value from
 *     `onConfigChange` while invalid.
 *   - `maxAttempts` — optional integer `NumberInput` (>= 1).
 *   - `initialDelay`, `timeout` — optional `TextInput` Temporal durations,
 *     each with the same inline validation as `interval`.
 *
 * The common header (label / type badge / delete) and footer
 * (input / output port bindings) live in the shared `NodeSettingsPanel`;
 * this component renders only the pollUntil-specific body.
 */

import {
  ACTIVITY_CATALOG,
  type CatalogCategory,
  getActivityParametersJsonSchema,
} from "@ai-di/graph-workflow";
import {
  Anchor,
  Box,
  Collapse,
  Divider,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import type {
  ConditionExpression,
  GraphWorkflowConfig,
  PollUntilNode,
} from "../../../../types/workflow";
import { ConditionExpressionEditor, declareCtxKey } from "../../graph-widgets";
import { ensureConditionProducerBindings } from "../../graph-widgets/condition-producer-binding";
import {
  JsonSchemaForm,
  type JsonSchemaProperty,
} from "../../json-schema-form";
import { replaceNode } from "../../replace-node";
import {
  isValidTemporalDuration,
  TEMPORAL_DURATION_HELP_TEXT,
} from "./duration-validation";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PollUntilNodeSettingsProps {
  /** The narrowed pollUntil node being edited. */
  node: PollUntilNode;
  /** Full graph config — used by the nested `ConditionExpressionEditor`. */
  config: GraphWorkflowConfig;
  /**
   * Fires with a new config whose `nodes[node.id]` is the updated
   * `PollUntilNode`. Matches the mutation contract used by
   * `NodeSettingsPanel` for activity nodes today.
   */
  onConfigChange: (next: GraphWorkflowConfig) => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Used when the user has not yet authored a condition. Picked to match the
 * `SwitchNodeSettings` seed so the two forms feel consistent.
 */
const EMPTY_CONDITION: ConditionExpression = {
  operator: "equals",
  left: { ref: "" },
  right: { ref: "" },
};

// ---------------------------------------------------------------------------
// Grouped activity-type options
// ---------------------------------------------------------------------------

interface ActivityTypeOption {
  value: string;
  label: string;
}

interface GroupedActivityTypeOptions {
  group: CatalogCategory;
  items: ActivityTypeOption[];
}

function buildActivityTypeOptions(): GroupedActivityTypeOptions[] {
  const byCategory = new Map<CatalogCategory, ActivityTypeOption[]>();
  // Iterating ACTIVITY_CATALOG (the static catalog), so `category` is always a
  // narrow CatalogCategory and `displayName` is always set. Casts bridge the
  // Phase 6 widening of ActivityCatalogEntry that admits dynamic entries with
  // free-form `category: string` and missing `displayName`.
  for (const entry of Object.values(ACTIVITY_CATALOG)) {
    const category = entry.category as CatalogCategory;
    const list = byCategory.get(category) ?? [];
    list.push({
      value: entry.activityType,
      label: entry.displayName ?? entry.activityType,
    });
    byCategory.set(category, list);
  }
  const groups: GroupedActivityTypeOptions[] = [];
  for (const [group, items] of byCategory.entries()) {
    items.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({ group, items });
  }
  groups.sort((a, b) => a.group.localeCompare(b.group));
  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PollUntilNodeSettings({
  node,
  config,
  onConfigChange,
}: PollUntilNodeSettingsProps) {
  const updateNode = (next: PollUntilNode) => {
    onConfigChange(
      ensureConditionProducerBindings(
        replaceNode(config, node.id, next),
        node.id,
      ),
    );
  };

  const createCtxKey = (key: string) =>
    onConfigChange(declareCtxKey(config, key));

  // ── Activity-type Select (grouped by CatalogCategory) ──────────────────
  const activityTypeOptions = useMemo(buildActivityTypeOptions, []);

  const setActivityType = (next: string | null) => {
    // Switching the activity type invalidates any existing `parameters`
    // (each activity has its own schema), so drop them when the type
    // changes. Selecting the same value is a no-op.
    if ((next ?? "") === node.activityType) return;
    const cleared: PollUntilNode = { ...node, activityType: next ?? "" };
    delete cleared.parameters;
    updateNode(cleared);
  };

  // ── Parameters via JsonSchemaForm ──────────────────────────────────────
  const parametersSchema = useMemo<JsonSchemaProperty | undefined>(() => {
    if (!node.activityType) return undefined;
    return getActivityParametersJsonSchema(node.activityType) as
      | JsonSchemaProperty
      | undefined;
  }, [node.activityType]);

  const setParameters = (parameters: Record<string, unknown>) => {
    if (Object.keys(parameters).length === 0) {
      const cleared: PollUntilNode = { ...node };
      delete cleared.parameters;
      updateNode(cleared);
      return;
    }
    updateNode({ ...node, parameters });
  };

  // ── Condition ──────────────────────────────────────────────────────────
  const setCondition = (next: ConditionExpression | undefined) => {
    updateNode({
      ...node,
      condition: next ?? { ...EMPTY_CONDITION },
    });
  };

  // ── Interval (Temporal duration, required) ─────────────────────────────
  // `interval` is required on the node, so we keep a local draft so the
  // user can type invalid values briefly and see an inline error without
  // the form propagating broken values into the graph config.
  const [intervalDraft, setIntervalDraft] = useState(node.interval);
  useEffect(() => {
    setIntervalDraft(node.interval);
  }, [node.interval]);

  const intervalDraftValid = isValidTemporalDuration(intervalDraft);
  const intervalError =
    !intervalDraftValid && intervalDraft.length > 0
      ? "Enter a Temporal duration like 30s, 5m, 1h."
      : intervalDraft.length === 0
        ? "Interval is required."
        : null;

  const commitInterval = (raw: string) => {
    setIntervalDraft(raw);
    if (!isValidTemporalDuration(raw)) return;
    if (raw === node.interval) return;
    updateNode({ ...node, interval: raw });
  };

  // ── Max attempts (optional integer >= 1) ───────────────────────────────
  const setMaxAttempts = (next: number | string) => {
    if (next === "" || next === null || next === undefined) {
      const cleared: PollUntilNode = { ...node };
      delete cleared.maxAttempts;
      updateNode(cleared);
      return;
    }
    if (typeof next !== "number" || !Number.isFinite(next)) return;
    if (next < 1 || !Number.isInteger(next)) return;
    updateNode({ ...node, maxAttempts: next });
  };

  // ── D30 — the three optional limits, folded by default ─────────────────
  // Anything already set is named in the toggle's own label, so folding can
  // never conceal a configured value; and a node that arrives with one set
  // opens the section rather than making the reader find it.
  const setLimits: string[] = [];
  if (node.maxAttempts !== undefined) {
    setLimits.push(`max ${node.maxAttempts} attempts`);
  }
  if (node.initialDelay !== undefined) {
    setLimits.push(`starts after ${node.initialDelay}`);
  }
  if (node.timeout !== undefined) {
    setLimits.push(`gives up after ${node.timeout}`);
  }
  const limitsSummary =
    setLimits.length > 0 ? setLimits.join(", ") : "none set, engine defaults";
  const [limitsOpen, setLimitsOpen] = useState(setLimits.length > 0);

  return (
    <Stack
      gap="md"
      data-testid="poll-until-node-settings"
      data-node-id={node.id}
    >
      {/*
        D30 — "Why does a node like Poll OCR Results have so many more fields
        than something like Extract OCR Results?" Because it is not the same
        shape of thing: this card is a LOOP that wraps a step, so it carries
        the loop's own settings on top of the step's. Saying so once at the top
        costs one line and answers the question before it is asked.
      */}
      <Text size="xs" c="dimmed" data-testid="poll-until-node-settings-intro">
        This is a loop, not a single step. It runs the activity below over and
        over until the condition is met, so the sections underneath are the
        loop's own settings — the activity itself has only the fields it would
        have on its own card.
      </Text>

      <Box>
        <Title order={5} mb="xs">
          Activity
        </Title>
        <Select
          label="Activity type"
          description="The activity invoked on each poll iteration."
          placeholder="Pick an activity…"
          size="xs"
          searchable
          clearable
          allowDeselect={false}
          data={activityTypeOptions}
          value={node.activityType === "" ? null : node.activityType}
          onChange={setActivityType}
          data-testid="poll-until-node-settings-activity-type"
        />
        {node.activityType && parametersSchema && (
          <Box mt="sm" data-testid="poll-until-node-settings-parameters">
            <Text size="xs" fw={600} mb={4}>
              Parameters
            </Text>
            <JsonSchemaForm
              schema={parametersSchema}
              value={node.parameters ?? {}}
              onChange={setParameters}
            />
          </Box>
        )}
      </Box>

      <Divider />

      <Box>
        <Title order={5} mb="xs">
          Termination condition
        </Title>
        <Text size="10px" c="dimmed" mb="xs">
          Polling stops when this condition evaluates to true.
        </Text>
        <ConditionExpressionEditor
          value={node.condition}
          onChange={setCondition}
          config={config}
          onCreateCtxKey={createCtxKey}
          currentNodeId={node.id}
          data-testid="poll-until-node-settings-condition"
        />
      </Box>

      <Divider />

      <Box>
        <Title order={5} mb="xs">
          Schedule
        </Title>
        <Stack gap="xs">
          <TextInput
            label="Interval"
            description={TEMPORAL_DURATION_HELP_TEXT}
            placeholder="e.g. 30s"
            size="xs"
            withAsterisk
            value={intervalDraft}
            error={intervalError}
            onChange={(event) => commitInterval(event.currentTarget.value)}
            data-testid="poll-until-node-settings-interval"
          />
          {/*
            D30 — the three limits below all have engine defaults and are the
            fields a reader least often sets, so they fold away. Folded, NOT
            dropped: the panel is shorter by default and every control is one
            click away, and the summary line names anything already set so a
            configured limit can never hide behind a collapsed section.
          */}
          <Anchor
            component="button"
            type="button"
            size="xs"
            onClick={() => setLimitsOpen((open) => !open)}
            data-testid="poll-until-node-settings-limits-toggle"
          >
            {limitsOpen ? "Hide limits" : `Show limits — ${limitsSummary}`}
          </Anchor>
          <Collapse in={limitsOpen}>
            <Stack gap="xs" data-testid="poll-until-node-settings-limits">
              <NumberInput
                label="Max attempts (optional)"
                description="Upper bound on polling iterations. Leave empty for the engine default."
                placeholder="e.g. 10"
                size="xs"
                min={1}
                step={1}
                allowDecimal={false}
                allowNegative={false}
                value={node.maxAttempts ?? ""}
                onChange={setMaxAttempts}
                data-testid="poll-until-node-settings-max-attempts"
              />
              <DurationTextInput
                label="Initial delay (optional)"
                placeholder="e.g. 5s"
                value={node.initialDelay}
                onCommit={(next) => {
                  if (next === undefined) {
                    const cleared: PollUntilNode = { ...node };
                    delete cleared.initialDelay;
                    updateNode(cleared);
                    return;
                  }
                  updateNode({ ...node, initialDelay: next });
                }}
                testId="poll-until-node-settings-initial-delay"
              />
              <DurationTextInput
                label="Timeout (optional)"
                placeholder="e.g. 10m"
                value={node.timeout}
                onCommit={(next) => {
                  if (next === undefined) {
                    const cleared: PollUntilNode = { ...node };
                    delete cleared.timeout;
                    updateNode(cleared);
                    return;
                  }
                  updateNode({ ...node, timeout: next });
                }}
                testId="poll-until-node-settings-timeout"
              />
            </Stack>
          </Collapse>
        </Stack>
      </Box>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Optional Temporal-duration TextInput
// ---------------------------------------------------------------------------

interface DurationTextInputProps {
  label: string;
  placeholder: string;
  /** Current persisted value on the node (undefined when unset). */
  value: string | undefined;
  /**
   * Fires with the next persisted value:
   *   - a valid duration string when the user enters one,
   *   - `undefined` when the field is cleared.
   * Invalid drafts are kept local and surfaced as an inline error; they
   * never reach `onCommit`.
   */
  onCommit: (next: string | undefined) => void;
  testId: string;
}

function DurationTextInput({
  label,
  placeholder,
  value,
  onCommit,
  testId,
}: DurationTextInputProps) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const hasContent = draft.length > 0;
  const valid = !hasContent || isValidTemporalDuration(draft);
  const error =
    hasContent && !valid ? "Enter a Temporal duration like 30s, 5m, 1h." : null;

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (raw.length === 0) {
      if (value !== undefined) onCommit(undefined);
      return;
    }
    if (!isValidTemporalDuration(raw)) return;
    if (raw === value) return;
    onCommit(raw);
  };

  return (
    <TextInput
      label={label}
      description={TEMPORAL_DURATION_HELP_TEXT}
      placeholder={placeholder}
      size="xs"
      value={draft}
      error={error}
      onChange={(event) => handleChange(event.currentTarget.value)}
      data-testid={testId}
    />
  );
}
