/**
 * JSON Schema → Mantine form renderer.
 *
 * Walks a JSON Schema (typically produced by Zod 4's `z.toJSONSchema()`)
 * and renders Mantine widgets. The renderer is intentionally small — it
 * handles primitives + enums + combobox hints, which covers most activity
 * parameter schemas. Complex widgets (rule-list editors, validation-rule
 * editors, condition-tree editors) are written as hand-rolled overrides
 * elsewhere; this renderer is the default for everything else.
 *
 * See ./types.ts for the supported JSON Schema subset and the `x-*` UI
 * hint vocabulary.
 */

import {
  Autocomplete,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { isObjectSchema, type JsonSchemaProperty } from "./types";

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
  if (!isObjectSchema(schema)) {
    return (
      <Text c="dimmed" size="sm">
        No parameters to configure.
      </Text>
    );
  }

  const required = new Set(schema.required ?? []);
  const entries = Object.entries(schema.properties);

  if (entries.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No parameters to configure.
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
        max={fieldSchema.maximum}
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

  return (
    <Text c="red" size="xs">
      Unsupported field schema for "{fieldName}": {JSON.stringify(fieldSchema)}
    </Text>
  );
}
