/**
 * ValidationRuleEditor — list shell for the `document.validateFields.rules`
 * discriminated-union array.
 *
 * US-027 scope: list-level scaffolding only — add a rule, remove a rule,
 * switch a rule's variant.
 * US-028 scope: field-match + array-match variant body editors.
 * US-029 scope: arithmetic variant body editor (incl. nested expression).
 *
 * The component imports `validationRuleSchema` / `ValidationRule` from
 * `@ai-di/graph-workflow` — the catalog's Zod schema is the single source
 * of truth for rule shape.
 */

import type { ValidationRule } from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

// ---------------------------------------------------------------------------
// Enum option constants — mirror the catalog's Zod schema at
// packages/graph-workflow/src/catalog/activities/document-validate-fields.ts.
// Keep these lists in sync if new variants/operators are added there.
// ---------------------------------------------------------------------------

const MATCH_OPERATOR_OPTIONS = ["equals", "approximately"] as const;
const FIELD_TYPE_OPTIONS = ["text", "number", "currency"] as const;
const MATCH_TYPE_OPTIONS = ["any", "all"] as const;
const OPERATION_OPTIONS = ["sum", "difference", "product"] as const;

type MatchOperator = (typeof MATCH_OPERATOR_OPTIONS)[number];
type FieldType = (typeof FIELD_TYPE_OPTIONS)[number];
type MatchType = (typeof MATCH_TYPE_OPTIONS)[number];
type Operation = (typeof OPERATION_OPTIONS)[number];

type FieldMatchRule = Extract<ValidationRule, { type: "field-match" }>;
type ArithmeticRule = Extract<ValidationRule, { type: "arithmetic" }>;
type ArrayMatchRule = Extract<ValidationRule, { type: "array-match" }>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ValidationRuleEditorProps {
  /** Current rules array. */
  value: ValidationRule[];
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: ValidationRule[]) => void;
}

// ---------------------------------------------------------------------------
// Variant defaults — `name`-preserving schema defaults per the catalog's
// Zod schema.
// ---------------------------------------------------------------------------

type RuleType = ValidationRule["type"];

const RULE_TYPE_OPTIONS: RuleType[] = [
  "field-match",
  "arithmetic",
  "array-match",
];

/**
 * Returns a fresh rule of the given variant with schema-default shape and
 * the caller's `name`. The defaults mirror the Zod schema in
 * `packages/graph-workflow/src/catalog/activities/document-validate-fields.ts`:
 *   - optional `tolerance` is omitted (undefined),
 *   - `operator` defaults to the first enum value `"equals"`,
 *   - `fieldType` defaults to the first enum value `"text"`.
 */
export function defaultValueForRule(
  type: RuleType,
  name: string,
): ValidationRule {
  switch (type) {
    case "field-match":
      return {
        type: "field-match",
        name,
        primaryField: "",
        attachmentField: "",
        operator: "equals",
        fieldType: "text",
      };
    case "arithmetic":
      return {
        type: "arithmetic",
        name,
        expression: { operation: "sum", fields: [""], equals: "" },
        operator: "equals",
        fieldType: "text",
      };
    case "array-match":
      return {
        type: "array-match",
        name,
        primaryFields: [""],
        attachmentFields: [""],
        matchType: "any",
        operator: "equals",
        fieldType: "text",
      };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ValidationRuleEditor({
  value,
  onChange,
}: ValidationRuleEditorProps) {
  const addRule = () => {
    onChange([...value, defaultValueForRule("field-match", "")]);
  };

  const removeRuleAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const setRuleAt = (index: number, next: ValidationRule) => {
    onChange(value.map((r, i) => (i === index ? next : r)));
  };

  const switchTypeAt = (index: number, nextType: RuleType) => {
    const prev = value[index];
    setRuleAt(index, defaultValueForRule(nextType, prev.name));
  };

  return (
    <Stack gap="md" data-testid="validation-rule-editor">
      <Box>
        <Group justify="space-between" align="center" mb={4}>
          <Title order={5} style={{ margin: 0 }}>
            Validation rules
          </Title>
        </Group>

        {value.length === 0 ? (
          <Text size="xs" c="dimmed">
            No rules — click Add rule to start authoring validation rules.
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
                onTypeSwitch={(nextType) => switchTypeAt(index, nextType)}
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
          data-testid="validation-rule-editor-add"
        >
          Add rule
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-rule row — header (type selector + remove) + variant body dispatch.
// ---------------------------------------------------------------------------

interface RuleRowProps {
  index: number;
  value: ValidationRule;
  onChange: (next: ValidationRule) => void;
  onTypeSwitch: (nextType: RuleType) => void;
  onRemove: () => void;
}

function RuleRow({
  index,
  value,
  onChange,
  onTypeSwitch,
  onRemove,
}: RuleRowProps) {
  const testIdBase = `validation-rule-editor-row-${index}`;

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
          data-testid={`validation-rule-editor-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <Select
          label="Type"
          data={RULE_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
          value={value.type}
          onChange={(v) => {
            if (v === null) return;
            if (
              v === "field-match" ||
              v === "arithmetic" ||
              v === "array-match"
            ) {
              onTypeSwitch(v);
            }
          }}
          allowDeselect={false}
          withAsterisk
          data-testid={`validation-rule-editor-type-${index}`}
        />

        <VariantBody rule={value} index={index} onChange={onChange} />
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Variant body dispatcher — discriminated-union switch.
// ---------------------------------------------------------------------------

interface VariantBodyProps {
  rule: ValidationRule;
  index: number;
  onChange: (next: ValidationRule) => void;
}

function VariantBody({ rule, index, onChange }: VariantBodyProps) {
  switch (rule.type) {
    case "field-match":
      return (
        <FieldMatchRuleBody value={rule} index={index} onChange={onChange} />
      );
    case "arithmetic":
      return (
        <ArithmeticRuleBody value={rule} index={index} onChange={onChange} />
      );
    case "array-match":
      return (
        <ArrayMatchRuleBody value={rule} index={index} onChange={onChange} />
      );
  }
}

// ---------------------------------------------------------------------------
// Tolerance helpers — both `amount` and `percentage` are optional. When BOTH
// are blank, omit the `tolerance` key entirely (matching the catalog Zod
// schema's `toleranceSchema.optional()`).
// ---------------------------------------------------------------------------

function mergeTolerance(
  prev: { amount?: number; percentage?: number } | undefined,
  patch: { amount?: number; percentage?: number },
): { amount?: number; percentage?: number } | undefined {
  const merged = { ...(prev ?? {}), ...patch };
  // Drop keys whose value is undefined so the resulting object is canonical.
  const cleaned: { amount?: number; percentage?: number } = {};
  if (merged.amount !== undefined) cleaned.amount = merged.amount;
  if (merged.percentage !== undefined) cleaned.percentage = merged.percentage;
  if (cleaned.amount === undefined && cleaned.percentage === undefined) {
    return undefined;
  }
  return cleaned;
}

function applyToleranceUpdate<
  T extends FieldMatchRule | ArithmeticRule | ArrayMatchRule,
>(rule: T, patch: { amount?: number; percentage?: number }): T {
  const nextTolerance = mergeTolerance(rule.tolerance, patch);
  // Build the result without including the key at all when nextTolerance is
  // undefined.
  if (nextTolerance === undefined) {
    const { tolerance: _omitted, ...rest } = rule;
    void _omitted;
    return { ...rest } as T;
  }
  return { ...rule, tolerance: nextTolerance };
}

// ---------------------------------------------------------------------------
// FieldMatchRuleBody — full editor for the `field-match` variant.
// ---------------------------------------------------------------------------

interface FieldMatchBodyProps {
  value: FieldMatchRule;
  index: number;
  onChange: (next: FieldMatchRule) => void;
}

function FieldMatchRuleBody({ value, index, onChange }: FieldMatchBodyProps) {
  return (
    <Box data-testid="field-match-body">
      <Stack gap="xs">
        <TextInput
          label="Rule name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.currentTarget.value })}
          withAsterisk
          data-testid={`field-match-name-${index}`}
        />

        <TextInput
          label="Primary field path"
          value={value.primaryField}
          onChange={(e) =>
            onChange({ ...value, primaryField: e.currentTarget.value })
          }
          withAsterisk
          data-testid={`field-match-primary-field-${index}`}
        />

        <TextInput
          label="Attachment field path"
          value={value.attachmentField}
          onChange={(e) =>
            onChange({ ...value, attachmentField: e.currentTarget.value })
          }
          withAsterisk
          data-testid={`field-match-attachment-field-${index}`}
        />

        <Select
          label="Operator"
          data={MATCH_OPERATOR_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.operator}
          onChange={(v) => {
            if (v === null) return;
            if (!isMatchOperator(v)) return;
            onChange({ ...value, operator: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`field-match-operator-${index}`}
        />

        <Group grow align="flex-start">
          <NumberInput
            label="Tolerance amount"
            value={value.tolerance?.amount ?? ""}
            onChange={(v) =>
              onChange(
                applyToleranceUpdate(value, {
                  amount: typeof v === "number" ? v : undefined,
                }),
              )
            }
            data-testid={`field-match-tolerance-amount-${index}`}
          />
          <NumberInput
            label="Tolerance %"
            min={0}
            max={100}
            value={value.tolerance?.percentage ?? ""}
            onChange={(v) =>
              onChange(
                applyToleranceUpdate(value, {
                  percentage: typeof v === "number" ? v : undefined,
                }),
              )
            }
            data-testid={`field-match-tolerance-percentage-${index}`}
          />
        </Group>

        <Select
          label="Field type"
          data={FIELD_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.fieldType}
          onChange={(v) => {
            if (v === null) return;
            if (!isFieldType(v)) return;
            onChange({ ...value, fieldType: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`field-match-field-type-${index}`}
        />
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ArithmeticRuleBody — full editor for the `arithmetic` variant, including a
// nested expression sub-form (operation + fields[] + equals).
// ---------------------------------------------------------------------------

interface ArithmeticBodyProps {
  value: ArithmeticRule;
  index: number;
  onChange: (next: ArithmeticRule) => void;
}

function ArithmeticRuleBody({ value, index, onChange }: ArithmeticBodyProps) {
  const setExpressionFields = (next: string[]) => {
    onChange({ ...value, expression: { ...value.expression, fields: next } });
  };

  return (
    <Box data-testid="arithmetic-body">
      <Stack gap="xs">
        <TextInput
          label="Rule name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.currentTarget.value })}
          withAsterisk
          data-testid={`arithmetic-name-${index}`}
        />

        <Box
          data-testid={`arithmetic-expression-${index}`}
          style={{
            border: "1px solid var(--mantine-color-default-border, #2c2e33)",
            borderRadius: 4,
            padding: 8,
          }}
        >
          <Title order={6} style={{ margin: 0, marginBottom: 8 }}>
            Expression
          </Title>
          <Stack gap="xs">
            <Select
              label="Operation"
              data={OPERATION_OPTIONS.map((o) => ({ value: o, label: o }))}
              value={value.expression.operation}
              onChange={(v) => {
                if (v === null) return;
                if (!isOperation(v)) return;
                onChange({
                  ...value,
                  expression: { ...value.expression, operation: v },
                });
              }}
              withAsterisk
              allowDeselect={false}
              data-testid={`arithmetic-expression-operation-${index}`}
            />

            <StringArrayEditor
              label="Operand field paths"
              values={value.expression.fields}
              onChange={setExpressionFields}
              testIdBase={`arithmetic-expression-fields`}
              rowIndex={index}
              required
            />

            <TextInput
              label="Expected field path"
              value={value.expression.equals}
              onChange={(e) =>
                onChange({
                  ...value,
                  expression: {
                    ...value.expression,
                    equals: e.currentTarget.value,
                  },
                })
              }
              withAsterisk
              data-testid={`arithmetic-expression-equals-${index}`}
            />
          </Stack>
        </Box>

        <Select
          label="Operator"
          data={MATCH_OPERATOR_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.operator}
          onChange={(v) => {
            if (v === null) return;
            if (!isMatchOperator(v)) return;
            onChange({ ...value, operator: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`arithmetic-operator-${index}`}
        />

        <Group grow align="flex-start">
          <NumberInput
            label="Tolerance amount"
            value={value.tolerance?.amount ?? ""}
            onChange={(v) =>
              onChange(
                applyToleranceUpdate(value, {
                  amount: typeof v === "number" ? v : undefined,
                }),
              )
            }
            data-testid={`arithmetic-tolerance-amount-${index}`}
          />
          <NumberInput
            label="Tolerance %"
            min={0}
            max={100}
            value={value.tolerance?.percentage ?? ""}
            onChange={(v) =>
              onChange(
                applyToleranceUpdate(value, {
                  percentage: typeof v === "number" ? v : undefined,
                }),
              )
            }
            data-testid={`arithmetic-tolerance-percentage-${index}`}
          />
        </Group>

        <Select
          label="Field type"
          data={FIELD_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.fieldType}
          onChange={(v) => {
            if (v === null) return;
            if (!isFieldType(v)) return;
            onChange({ ...value, fieldType: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`arithmetic-field-type-${index}`}
        />
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ArrayMatchRuleBody — full editor for the `array-match` variant.
// ---------------------------------------------------------------------------

interface ArrayMatchBodyProps {
  value: ArrayMatchRule;
  index: number;
  onChange: (next: ArrayMatchRule) => void;
}

function ArrayMatchRuleBody({ value, index, onChange }: ArrayMatchBodyProps) {
  const updateStringArray = (
    key: "primaryFields" | "attachmentFields",
    next: string[],
  ) => {
    onChange({ ...value, [key]: next });
  };

  return (
    <Box data-testid="array-match-body">
      <Stack gap="xs">
        <TextInput
          label="Rule name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.currentTarget.value })}
          withAsterisk
          data-testid={`array-match-name-${index}`}
        />

        <StringArrayEditor
          label="Primary field paths"
          values={value.primaryFields}
          onChange={(next) => updateStringArray("primaryFields", next)}
          testIdBase={`array-match-primary-fields`}
          rowIndex={index}
          required
        />

        <StringArrayEditor
          label="Attachment field paths"
          values={value.attachmentFields}
          onChange={(next) => updateStringArray("attachmentFields", next)}
          testIdBase={`array-match-attachment-fields`}
          rowIndex={index}
          required
        />

        <Select
          label="Match type"
          data={MATCH_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.matchType}
          onChange={(v) => {
            if (v === null) return;
            if (!isMatchType(v)) return;
            onChange({ ...value, matchType: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`array-match-match-type-${index}`}
        />

        <Select
          label="Operator"
          data={MATCH_OPERATOR_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.operator}
          onChange={(v) => {
            if (v === null) return;
            if (!isMatchOperator(v)) return;
            onChange({ ...value, operator: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`array-match-operator-${index}`}
        />

        <Group grow align="flex-start">
          <NumberInput
            label="Tolerance amount"
            value={value.tolerance?.amount ?? ""}
            onChange={(v) =>
              onChange(
                applyToleranceUpdate(value, {
                  amount: typeof v === "number" ? v : undefined,
                }),
              )
            }
            data-testid={`array-match-tolerance-amount-${index}`}
          />
          <NumberInput
            label="Tolerance %"
            min={0}
            max={100}
            value={value.tolerance?.percentage ?? ""}
            onChange={(v) =>
              onChange(
                applyToleranceUpdate(value, {
                  percentage: typeof v === "number" ? v : undefined,
                }),
              )
            }
            data-testid={`array-match-tolerance-percentage-${index}`}
          />
        </Group>

        <Select
          label="Field type"
          data={FIELD_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
          value={value.fieldType}
          onChange={(v) => {
            if (v === null) return;
            if (!isFieldType(v)) return;
            onChange({ ...value, fieldType: v });
          }}
          withAsterisk
          allowDeselect={false}
          data-testid={`array-match-field-type-${index}`}
        />
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Inline string-array editor — TextInput rows + add / remove.
// Zod requires `min(1)`, so the last remaining row's trash is disabled.
// ---------------------------------------------------------------------------

interface StringArrayEditorProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  testIdBase: string;
  rowIndex: number;
  required: boolean;
}

function StringArrayEditor({
  label,
  values,
  onChange,
  testIdBase,
  rowIndex,
  required,
}: StringArrayEditorProps) {
  const updateAt = (i: number, next: string) => {
    const out = values.slice();
    out[i] = next;
    onChange(out);
  };

  const removeAt = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const addRow = () => {
    onChange([...values, ""]);
  };

  return (
    <Box>
      <Text size="sm" fw={500} mb={4}>
        {label}
        {required ? (
          <Text component="span" c="red" inherit>
            {" "}
            *
          </Text>
        ) : null}
      </Text>
      <Stack gap={4}>
        {values.map((item, i) => (
          <Group key={i} gap="xs" align="center" wrap="nowrap">
            <Box style={{ flex: 1 }}>
              <TextInput
                value={item}
                onChange={(e) => updateAt(i, e.currentTarget.value)}
                data-testid={`${testIdBase}-item-${i}-${rowIndex}`}
              />
            </Box>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              disabled={values.length <= 1}
              onClick={() => removeAt(i)}
              aria-label={`Remove ${label} ${i + 1}`}
              data-testid={`${testIdBase}-remove-${i}-${rowIndex}`}
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
          onClick={addRow}
          data-testid={`${testIdBase}-add-${rowIndex}`}
        >
          Add
        </Button>
      </Group>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Narrowing helpers — guard string-typed Select onChange callbacks.
// ---------------------------------------------------------------------------

function isMatchOperator(v: string): v is MatchOperator {
  return (MATCH_OPERATOR_OPTIONS as readonly string[]).includes(v);
}

function isFieldType(v: string): v is FieldType {
  return (FIELD_TYPE_OPTIONS as readonly string[]).includes(v);
}

function isMatchType(v: string): v is MatchType {
  return (MATCH_TYPE_OPTIONS as readonly string[]).includes(v);
}

function isOperation(v: string): v is Operation {
  return (OPERATION_OPTIONS as readonly string[]).includes(v);
}
