/**
 * ClassificationRuleEditor — list shell + per-rule pattern rows for the
 * `document.classify.rules` array.
 *
 * US-037 scope: the list shell — add a rule, remove a rule, expose
 * top-level `name` + `resultType` TextInputs, and dispatch to the
 * `ClassificationPatternRows` body editor.
 *
 * US-038 scope: the per-rule `ClassificationPatternRows` body — Select
 * inputs for `scope` / `operator` driven by the catalog enums, a TextInput
 * for `value`, and add / remove pattern rows. The catalog requires
 * `patterns.min(1)`, so the trash icon on the last remaining row is
 * disabled.
 *
 * The component imports `ClassificationRule` / `ClassificationPattern`
 * from `@ai-di/graph-workflow` — the catalog's Zod schema is the single
 * source of truth for rule + pattern shape.
 */

import {
  CLASSIFICATION_PATTERN_OPERATORS,
  CLASSIFICATION_PATTERN_SCOPES,
  type ClassificationPattern,
  type ClassificationRule,
} from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

// ---------------------------------------------------------------------------
// Catalog-derived enum unions — kept as type-level mirrors of the imported
// readonly tuples so the Select onChange callbacks can be narrowed.
// ---------------------------------------------------------------------------

type PatternScope = (typeof CLASSIFICATION_PATTERN_SCOPES)[number];
type PatternOperator = (typeof CLASSIFICATION_PATTERN_OPERATORS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ClassificationRuleEditorProps {
  /** Current rules array. */
  value: ClassificationRule[];
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: ClassificationRule[]) => void;
}

// ---------------------------------------------------------------------------
// Defaults — derived from the catalog (first enum value for each Select).
// ---------------------------------------------------------------------------

/**
 * Returns a fresh default pattern using the first scope + operator declared
 * in the catalog. The empty `value` is required by the catalog (`.min(1)`)
 * but the user populates it after adding — Zod validates at save time.
 */
export function defaultClassificationPattern(): ClassificationPattern {
  return {
    scope: CLASSIFICATION_PATTERN_SCOPES[0],
    operator: CLASSIFICATION_PATTERN_OPERATORS[0],
    value: "",
  };
}

/**
 * Returns a fresh default rule with one default pattern. `name` and
 * `resultType` default to empty strings — the user fills them after adding.
 */
export function defaultClassificationRule(): ClassificationRule {
  return {
    name: "",
    resultType: "",
    patterns: [defaultClassificationPattern()],
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ClassificationRuleEditor({
  value,
  onChange,
}: ClassificationRuleEditorProps) {
  const addRule = () => {
    onChange([...value, defaultClassificationRule()]);
  };

  const removeRuleAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const setRuleAt = (index: number, next: ClassificationRule) => {
    onChange(value.map((r, i) => (i === index ? next : r)));
  };

  return (
    <Stack gap="md" data-testid="classification-rule-editor">
      <Box>
        <Group justify="space-between" align="center" mb={4}>
          <Title order={5} style={{ margin: 0 }}>
            Classification rules
          </Title>
        </Group>

        {value.length === 0 ? (
          <Text size="xs" c="dimmed">
            No rules — click Add rule to start authoring classification rules.
          </Text>
        ) : (
          <Stack gap="md">
            {value.map((rule, index) => (
              <RuleRow
                // Index-based key is intentional: rules have no stable id and
                // are an ordered list editable by index.
                key={`rule-${index}`}
                index={index}
                value={rule}
                onChange={(next) => setRuleAt(index, next)}
                onRemove={() => removeRuleAt(index)}
              />
            ))}
          </Stack>
        )}
      </Box>

      <Group>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addRule}
          data-testid="classification-rule-editor-add"
        >
          Add rule
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-rule row — header (Rule N + remove), name + resultType inputs, and the
// nested pattern-rows body.
// ---------------------------------------------------------------------------

interface RuleRowProps {
  index: number;
  value: ClassificationRule;
  onChange: (next: ClassificationRule) => void;
  onRemove: () => void;
}

function RuleRow({ index, value, onChange, onRemove }: RuleRowProps) {
  const testIdBase = `classification-rule-editor-row-${index}`;

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
          Rule {index + 1}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          aria-label={`Remove rule ${index + 1}`}
          data-testid={`classification-rule-editor-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          label="Rule name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.currentTarget.value })}
          withAsterisk
          data-testid={`classification-rule-editor-name-${index}`}
        />

        <TextInput
          label="Result type"
          description="Document type to assign if this rule matches."
          value={value.resultType}
          onChange={(e) =>
            onChange({ ...value, resultType: e.currentTarget.value })
          }
          withAsterisk
          data-testid={`classification-rule-editor-result-type-${index}`}
        />

        <ClassificationPatternRows
          index={index}
          value={value.patterns}
          onChange={(next) => onChange({ ...value, patterns: next })}
        />
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ClassificationPatternRows — sub-list editor for `patterns[]`.
// ---------------------------------------------------------------------------

export interface ClassificationPatternRowsProps {
  /** Index of the parent rule — used to namespace stable test-ids. */
  index: number;
  /** Current patterns array. */
  value: ClassificationPattern[];
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: ClassificationPattern[]) => void;
}

export function ClassificationPatternRows({
  index,
  value,
  onChange,
}: ClassificationPatternRowsProps) {
  const addRow = () => {
    onChange([...value, defaultClassificationPattern()]);
  };

  const removeAt = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const updateAt = (i: number, next: ClassificationPattern) => {
    onChange(value.map((p, idx) => (idx === i ? next : p)));
  };

  // Catalog declares `patterns.min(1)`, so disable the trash icon when only
  // one row remains.
  const disableRemove = value.length <= 1;

  return (
    <Box data-testid={`classification-pattern-rows-${index}`}>
      <Text size="sm" fw={500} mb={4}>
        Patterns
        <Text component="span" c="red" inherit>
          {" "}
          *
        </Text>
      </Text>
      <Stack gap="xs">
        {value.map((pattern, i) => (
          <PatternRow
            key={`pattern-${i}`}
            ruleIndex={index}
            rowIndex={i}
            value={pattern}
            disableRemove={disableRemove}
            onChange={(next) => updateAt(i, next)}
            onRemove={() => removeAt(i)}
          />
        ))}
      </Stack>
      <Group mt={4}>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addRow}
          data-testid={`classification-pattern-add-${index}`}
        >
          Add pattern
        </Button>
      </Group>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Per-pattern row
// ---------------------------------------------------------------------------

interface PatternRowProps {
  ruleIndex: number;
  rowIndex: number;
  value: ClassificationPattern;
  disableRemove: boolean;
  onChange: (next: ClassificationPattern) => void;
  onRemove: () => void;
}

function PatternRow({
  ruleIndex,
  rowIndex,
  value,
  disableRemove,
  onChange,
  onRemove,
}: PatternRowProps) {
  return (
    <Box
      data-testid={`classification-pattern-row-${rowIndex}-${ruleIndex}`}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <Select
            label="Where to look"
            data={CLASSIFICATION_PATTERN_SCOPES.map((s) => ({
              value: s,
              label: s,
            }))}
            value={value.scope}
            onChange={(v) => {
              if (v === null) return;
              if (!isPatternScope(v)) return;
              onChange({ ...value, scope: v });
            }}
            withAsterisk
            allowDeselect={false}
            data-testid={`classification-pattern-scope-${rowIndex}-${ruleIndex}`}
          />
        </Box>
        <Box style={{ flex: 1 }}>
          <Select
            label="Operator"
            data={CLASSIFICATION_PATTERN_OPERATORS.map((o) => ({
              value: o,
              label: o,
            }))}
            value={value.operator}
            onChange={(v) => {
              if (v === null) return;
              if (!isPatternOperator(v)) return;
              onChange({ ...value, operator: v });
            }}
            withAsterisk
            allowDeselect={false}
            data-testid={`classification-pattern-operator-${rowIndex}-${ruleIndex}`}
          />
        </Box>
        <Box style={{ flex: 1 }}>
          <TextInput
            label="Value"
            value={value.value}
            onChange={(e) =>
              onChange({ ...value, value: e.currentTarget.value })
            }
            withAsterisk
            data-testid={`classification-pattern-value-${rowIndex}-${ruleIndex}`}
          />
        </Box>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          disabled={disableRemove}
          onClick={onRemove}
          aria-label={`Remove pattern ${rowIndex + 1}`}
          data-testid={`classification-pattern-remove-${rowIndex}-${ruleIndex}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Narrowing helpers — guard string-typed Select onChange callbacks.
// ---------------------------------------------------------------------------

function isPatternScope(v: string): v is PatternScope {
  return (CLASSIFICATION_PATTERN_SCOPES as readonly string[]).includes(v);
}

function isPatternOperator(v: string): v is PatternOperator {
  return (CLASSIFICATION_PATTERN_OPERATORS as readonly string[]).includes(v);
}
