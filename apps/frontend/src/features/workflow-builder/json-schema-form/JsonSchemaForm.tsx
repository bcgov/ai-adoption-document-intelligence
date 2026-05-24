/**
 * JSON Schema → Mantine form renderer.
 *
 * Walks a JSON Schema (typically produced by Zod 4's `z.toJSONSchema()`)
 * and renders Mantine widgets. The renderer is intentionally small — it
 * handles primitives + enums + combobox hints + discriminated unions
 * (root-level `anyOf` with a shared `const`-valued discriminator) + arrays
 * of primitives / simple objects. Complex widgets (rule-list editors,
 * validation-rule editors, condition-tree editors) are written as
 * hand-rolled overrides elsewhere; this renderer is the default for
 * everything else.
 *
 * See ./types.ts for the supported JSON Schema subset and the `x-*` UI
 * hint vocabulary.
 */

import type {
  ClassificationRule,
  FieldDescriptor,
  ValidationRule,
} from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Autocomplete,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  ClassificationRuleEditor,
  type ConfusionMap,
  ConfusionMapEditor,
  type KeywordPattern,
  KeywordPatternEditor,
  type PageRange,
  PageRangeListEditor,
  ValidationRuleEditor,
} from "../settings/rich-widgets";
import { FieldListEditor } from "../sources/FieldListEditor";
import {
  detectDiscriminatedUnion,
  isObjectSchema,
  type JsonSchemaObject,
  type JsonSchemaProperty,
} from "./types";

interface JsonSchemaFormProps {
  schema: JsonSchemaProperty | undefined;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function JsonSchemaForm({
  schema,
  value,
  onChange,
}: JsonSchemaFormProps) {
  // Top-level discriminated union (Zod's z.discriminatedUnion → anyOf)
  const discriminatedUnion = detectDiscriminatedUnion(schema);
  if (discriminatedUnion) {
    return (
      <DiscriminatedUnionRenderer
        union={discriminatedUnion}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (!isObjectSchema(schema)) {
    return (
      <Text c="dimmed" size="sm">
        No parameters to configure.
      </Text>
    );
  }

  return (
    <ObjectFieldsRenderer schema={schema} value={value} onChange={onChange} />
  );
}

interface ObjectFieldsRendererProps {
  schema: JsonSchemaObject;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  /** Fields to skip — used by the discriminated-union renderer to omit the discriminator. */
  skipFields?: ReadonlySet<string>;
}

function ObjectFieldsRenderer({
  schema,
  value,
  onChange,
  skipFields,
}: ObjectFieldsRendererProps) {
  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties).filter(
    ([name]) => !skipFields?.has(name),
  );

  if (entries.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No additional fields.
      </Text>
    );
  }

  return (
    <Stack gap="sm">
      {entries.map(([fieldName, fieldSchema]) => (
        <FieldRenderer
          key={fieldName}
          fieldName={fieldName}
          fieldSchema={fieldSchema}
          required={required.has(fieldName)}
          value={value[fieldName]}
          onChange={(v) => {
            const next = { ...value };
            if (v === undefined) {
              delete next[fieldName];
            } else {
              next[fieldName] = v;
            }
            onChange(next);
          }}
        />
      ))}
    </Stack>
  );
}

interface DiscriminatedUnionRendererProps {
  union: ReturnType<typeof detectDiscriminatedUnion> & object;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

function DiscriminatedUnionRenderer({
  union,
  value,
  onChange,
}: DiscriminatedUnionRendererProps) {
  const discriminatorValue = value[union.discriminator];
  const activeVariant = union.variants.find(
    (v) => v.literal === discriminatorValue,
  );

  const discriminatorSchema =
    union.variants[0].schema.properties[union.discriminator];

  const data = union.variants.map((v) => ({
    value: v.literal,
    label: v.label ?? v.literal,
  }));

  return (
    <Stack gap="sm">
      <Select
        label={discriminatorSchema?.title ?? union.discriminator}
        description={discriminatorSchema?.description}
        data={data}
        value={
          typeof discriminatorValue === "string" ? discriminatorValue : null
        }
        onChange={(v) => {
          if (!v) {
            onChange({});
            return;
          }
          // When the strategy changes, drop any fields that belong to the
          // previous variant — keep only the new discriminator value.
          onChange({ [union.discriminator]: v });
        }}
        withAsterisk
        allowDeselect={false}
      />

      {activeVariant && (
        <ObjectFieldsRenderer
          schema={activeVariant.schema}
          value={value}
          onChange={onChange}
          skipFields={new Set([union.discriminator])}
        />
      )}
    </Stack>
  );
}

interface FieldRendererProps {
  fieldName: string;
  fieldSchema: JsonSchemaProperty;
  required: boolean;
  value: unknown;
  onChange: (next: unknown) => void;
}

function FieldRenderer({
  fieldName,
  fieldSchema,
  required,
  value,
  onChange,
}: FieldRendererProps) {
  const label = fieldSchema.title ?? fieldName;
  const description = fieldSchema.description;
  const defaultHint = fieldSchema["x-default"] ?? fieldSchema.default;
  const placeholder =
    defaultHint !== undefined ? String(defaultHint) : undefined;
  const widget = fieldSchema["x-widget"];

  // ── string + combobox ─────────────────────────────────────────────────
  if (
    fieldSchema.type === "string" &&
    widget === "combobox" &&
    Array.isArray(fieldSchema["x-options"])
  ) {
    return (
      <Autocomplete
        label={label}
        description={description}
        placeholder={placeholder}
        data={fieldSchema["x-options"].map(String)}
        value={(value as string | undefined) ?? ""}
        onChange={(v) => onChange(v === "" ? undefined : v)}
        withAsterisk={required}
      />
    );
  }

  // ── string + enum ─────────────────────────────────────────────────────
  if (fieldSchema.type === "string" && Array.isArray(fieldSchema.enum)) {
    return (
      <Select
        label={label}
        description={description}
        placeholder={placeholder}
        data={fieldSchema.enum.map(String)}
        value={(value as string | undefined) ?? null}
        onChange={(v) => onChange(v ?? undefined)}
        withAsterisk={required}
        clearable={!required}
      />
    );
  }

  // ── plain string ──────────────────────────────────────────────────────
  if (fieldSchema.type === "string") {
    return (
      <TextInput
        label={label}
        description={description}
        placeholder={placeholder}
        value={(value as string | undefined) ?? ""}
        onChange={(e) => {
          const v = e.currentTarget.value;
          onChange(v === "" ? undefined : v);
        }}
        withAsterisk={required}
      />
    );
  }

  // ── number / integer ──────────────────────────────────────────────────
  if (fieldSchema.type === "number" || fieldSchema.type === "integer") {
    return (
      <NumberInput
        label={label}
        description={description}
        placeholder={placeholder}
        value={typeof value === "number" ? value : ""}
        min={fieldSchema.minimum}
        max={safeNumericMax(fieldSchema.maximum)}
        step={fieldSchema["x-step"]}
        decimalScale={fieldSchema.type === "integer" ? 0 : undefined}
        onChange={(v) => onChange(typeof v === "number" ? v : undefined)}
        withAsterisk={required}
      />
    );
  }

  // ── boolean ───────────────────────────────────────────────────────────
  if (fieldSchema.type === "boolean") {
    return (
      <Switch
        label={label}
        description={description}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  }

  // ── array + x-widget: classification-rule-editor ──────────────────────
  if (
    fieldSchema.type === "array" &&
    fieldSchema["x-widget"] === "classification-rule-editor"
  ) {
    const rules = Array.isArray(value) ? (value as ClassificationRule[]) : [];
    return (
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        <ClassificationRuleEditor
          value={rules}
          onChange={(next) => onChange(next.length === 0 ? undefined : next)}
        />
      </Box>
    );
  }

  // ── array + x-widget: validation-rule-editor ──────────────────────────
  if (
    fieldSchema.type === "array" &&
    fieldSchema["x-widget"] === "validation-rule-editor"
  ) {
    const rules = Array.isArray(value) ? (value as ValidationRule[]) : [];
    return (
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        <ValidationRuleEditor
          value={rules}
          onChange={(next) => onChange(next.length === 0 ? undefined : next)}
        />
      </Box>
    );
  }

  // ── object + x-widget: confusion-map-editor ───────────────────────────
  if (
    fieldSchema.type === "object" &&
    fieldSchema["x-widget"] === "confusion-map-editor"
  ) {
    const map =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as ConfusionMap)
        : {};
    return (
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        <ConfusionMapEditor
          value={map}
          onChange={(next) =>
            onChange(Object.keys(next).length === 0 ? undefined : next)
          }
        />
      </Box>
    );
  }

  // ── array + x-widget: keyword-pattern-editor ──────────────────────────
  if (
    fieldSchema.type === "array" &&
    fieldSchema["x-widget"] === "keyword-pattern-editor"
  ) {
    const patterns = Array.isArray(value) ? (value as KeywordPattern[]) : [];
    return (
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        <KeywordPatternEditor
          value={patterns}
          onChange={(next) => onChange(next.length === 0 ? undefined : next)}
        />
      </Box>
    );
  }

  // ── array + x-widget: field-list-editor ───────────────────────────────
  if (
    fieldSchema.type === "array" &&
    fieldSchema["x-widget"] === "field-list-editor"
  ) {
    const fields = Array.isArray(value) ? (value as FieldDescriptor[]) : [];
    return (
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        <FieldListEditor
          value={fields}
          onChange={(next) => onChange(next.length === 0 ? undefined : next)}
        />
      </Box>
    );
  }

  // ── array + x-widget: page-range-list ─────────────────────────────────
  if (
    fieldSchema.type === "array" &&
    fieldSchema["x-widget"] === "page-range-list"
  ) {
    const ranges = Array.isArray(value) ? (value as PageRange[]) : [];
    return (
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
        <PageRangeListEditor
          value={ranges}
          onChange={(next) => onChange(next.length === 0 ? undefined : next)}
        />
      </Box>
    );
  }

  // ── array ─────────────────────────────────────────────────────────────
  if (fieldSchema.type === "array" && fieldSchema.items) {
    return (
      <ArrayFieldRenderer
        label={label}
        description={description}
        required={required}
        itemSchema={fieldSchema.items}
        minItems={fieldSchema.minItems}
        value={Array.isArray(value) ? value : []}
        onChange={onChange}
      />
    );
  }

  return (
    <Text c="red" size="xs">
      Unsupported field schema for "{fieldName}": {JSON.stringify(fieldSchema)}
    </Text>
  );
}

interface ArrayFieldRendererProps {
  label: string;
  description?: string;
  required: boolean;
  itemSchema: JsonSchemaProperty;
  minItems?: number;
  value: unknown[];
  onChange: (next: unknown) => void;
}

function ArrayFieldRenderer({
  label,
  description,
  required,
  itemSchema,
  minItems,
  value,
  onChange,
}: ArrayFieldRendererProps) {
  const items = value;
  const min = minItems ?? 0;

  const addItem = () => {
    onChange([...items, defaultValueForSchema(itemSchema)]);
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onChange(next.length === 0 ? undefined : next);
  };

  const updateItem = (idx: number, nextItem: unknown) => {
    const next = items.slice();
    next[idx] = nextItem;
    onChange(next);
  };

  return (
    <Stack gap={6}>
      <Box>
        <Text size="sm" fw={500}>
          {label}
          {required ? (
            <Text component="span" c="red" inherit>
              {" "}
              *
            </Text>
          ) : null}
        </Text>
        {description && (
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        )}
      </Box>

      {items.length === 0 && (
        <Text size="xs" c="dimmed" fs="italic">
          No items yet — click "Add" to create one.
        </Text>
      )}

      <Stack gap="xs">
        {items.map((item, idx) => (
          <Paper key={idx} withBorder p="xs" radius="sm">
            <Group align="flex-start" gap="xs" wrap="nowrap">
              <Box style={{ flex: 1 }}>
                {isObjectSchema(itemSchema) ? (
                  <ObjectFieldsRenderer
                    schema={itemSchema}
                    value={(item ?? {}) as Record<string, unknown>}
                    onChange={(next) => updateItem(idx, next)}
                  />
                ) : (
                  <FieldRenderer
                    fieldName={`${label} ${idx + 1}`}
                    fieldSchema={itemSchema}
                    required={true}
                    value={item}
                    onChange={(next) => updateItem(idx, next)}
                  />
                )}
              </Box>
              <ActionIcon
                variant="subtle"
                color="red"
                onClick={() => removeItem(idx)}
                disabled={items.length <= min}
                aria-label={`Remove ${singularize(label)} ${idx + 1}`}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Paper>
        ))}
      </Stack>

      <Group>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addItem}
        >
          Add {singularize(label)}
        </Button>
      </Group>
    </Stack>
  );
}

function defaultValueForSchema(schema: JsonSchemaProperty): unknown {
  if (isObjectSchema(schema)) {
    const out: Record<string, unknown> = {};
    for (const [name, propSchema] of Object.entries(schema.properties)) {
      const def = propSchema["x-default"] ?? propSchema.default;
      if (def !== undefined) {
        out[name] = def;
      } else if (
        propSchema.type === "integer" ||
        propSchema.type === "number"
      ) {
        out[name] = propSchema.minimum ?? 1;
      } else if (propSchema.type === "string") {
        out[name] = "";
      } else if (propSchema.type === "boolean") {
        out[name] = false;
      }
    }
    return out;
  }
  if (schema["x-default"] !== undefined) return schema["x-default"];
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "integer" || schema.type === "number") {
    return schema.minimum ?? 1;
  }
  if (schema.type === "string") return "";
  if (schema.type === "boolean") return false;
  return undefined;
}

/**
 * Zod v4 emits `Number.MAX_SAFE_INTEGER` (9007199254740991) as `maximum` for
 * unbounded `.int()` schemas. Treat any value at or near that as "no max" so
 * Mantine NumberInput doesn't get confused.
 */
function safeNumericMax(max: number | undefined): number | undefined {
  if (max === undefined) return undefined;
  if (max >= Number.MAX_SAFE_INTEGER - 1) return undefined;
  return max;
}

function singularize(label: string): string {
  const trimmed = label.trim();
  if (/ies$/i.test(trimmed)) return trimmed.replace(/ies$/i, "y");
  if (/ses$/i.test(trimmed)) return trimmed.slice(0, -2);
  if (/s$/i.test(trimmed) && !/ss$/i.test(trimmed)) return trimmed.slice(0, -1);
  return trimmed;
}
