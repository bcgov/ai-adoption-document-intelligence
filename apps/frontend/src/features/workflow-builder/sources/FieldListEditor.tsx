/**
 * FieldListEditor — rich x-widget editor for the `source.api`
 * `fields[]` parameter (US-120).
 *
 * Each row authors one `FieldDescriptor`:
 *   - `name` — URL-safe identifier (TextInput, regex-validated)
 *   - `type` — JSON Schema 7 primitive (Select: string|number|boolean|object|array)
 *   - `kind` — optional Phase 3 typed-I/O kind (shared `<KindSelect>`)
 *   - `required` — Checkbox
 *   - `description` — optional human-readable description (TextInput)
 *   - `defaultValue` — optional JSON value (JsonInput, parse-on-blur)
 *
 * Validation surfaces inline:
 *   - Invalid name regex → `"Field name must match /^[a-zA-Z_][a-zA-Z0-9_]*$/"`
 *   - Duplicate name within the source → `"Field name must be unique within this source"`
 *   - Invalid JSON in `defaultValue` → JS parse error message
 *
 * The "Add field" button is disabled while any row is invalid (regex, dup
 * name, or unparseable JSON) so users can't pile up broken rows. Per-row
 * delete confirms only when the row has a non-empty name (preventing
 * accidental loss of work); empty rows delete immediately.
 *
 * `onChange` writes back the FULL `fields[]` array atomically — matches
 * how other rich-widget editors (`KeywordPatternEditor`,
 * `ValidationRuleEditor`) propagate changes.
 */

import type { FieldDescriptor, KindRef } from "@ai-di/graph-workflow";
import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Group,
  JsonInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { KindSelect } from "../settings/KindSelect";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * URL-safe identifier regex — mirrors the source.api catalog Zod regex at
 * `packages/graph-workflow/src/catalog/sources/source-api.ts`.
 */
const FIELD_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const FIELD_NAME_REGEX_ERROR =
  "Field name must match /^[a-zA-Z_][a-zA-Z0-9_]*$/";

const FIELD_NAME_DUPLICATE_ERROR =
  "Field name must be unique within this source";

const FIELD_TYPE_OPTIONS = [
  "string",
  "number",
  "boolean",
  "object",
  "array",
] as const;

type FieldType = (typeof FIELD_TYPE_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FieldListEditorProps {
  /** Current fields[] (from `node.parameters.fields`). */
  value: FieldDescriptor[];
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: FieldDescriptor[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fresh default `FieldDescriptor` row with empty name, default
 * type `"string"`, and no kind / description / default. `required` defaults
 * to `false` — callers explicitly opt into required fields.
 */
export function defaultFieldDescriptor(): FieldDescriptor {
  return {
    name: "",
    type: "string",
    required: false,
  };
}

function isFieldType(v: string): v is FieldType {
  return (FIELD_TYPE_OPTIONS as readonly string[]).includes(v);
}

/**
 * Returns the regex / duplicate error for a given row's name, or `null` if
 * the name is currently valid in this row's context.
 *
 * `null` name (no value yet) is considered "incomplete" not "invalid" — the
 * "Add field" gate uses `isRowInvalid` which also treats empty names as
 * invalid, but row-local rendering doesn't show the regex error until the
 * user actually types something.
 */
function nameErrorFor(fields: FieldDescriptor[], index: number): string | null {
  const name = fields[index]?.name ?? "";
  if (name.length === 0) return null;
  if (!FIELD_NAME_REGEX.test(name)) return FIELD_NAME_REGEX_ERROR;
  const duplicate = fields.some((f, i) => i !== index && f.name === name);
  if (duplicate) return FIELD_NAME_DUPLICATE_ERROR;
  return null;
}

/**
 * Returns whether a row is invalid for the "Add field" disable gate.
 * Empty names + regex/duplicate failures + unparseable JSON defaults all
 * count as invalid.
 */
function isRowInvalid(
  fields: FieldDescriptor[],
  index: number,
  defaultJsonErrors: Record<number, string | null>,
): boolean {
  const name = fields[index]?.name ?? "";
  if (name.length === 0) return true;
  if (nameErrorFor(fields, index) !== null) return true;
  if (defaultJsonErrors[index]) return true;
  return false;
}

/**
 * Try to JSON.parse `raw`. Returns `{ ok: true, value }` on success and
 * `{ ok: false, error }` (JS error message) on parse failure. Empty / blank
 * strings parse to `undefined` (the caller drops the key entirely).
 */
function parseJsonOrError(
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw.trim().length === 0) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    if (error instanceof Error) return { ok: false, error: error.message };
    return { ok: false, error: String(error) };
  }
}

/**
 * Stringify a `defaultValue` back to a JsonInput-suitable string. `undefined`
 * → empty string (no value yet). Anything else gets pretty JSON-encoded.
 */
function stringifyDefault(value: unknown): string {
  if (value === undefined) return "";
  return JSON.stringify(value, null, 2);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FieldListEditor({ value, onChange }: FieldListEditorProps) {
  // Track per-row JSON parse errors. Cleared when the row is removed or its
  // raw input is reset to a parseable value.
  const [defaultJsonErrors, setDefaultJsonErrors] = useState<
    Record<number, string | null>
  >({});

  const updateDefaultJsonError = (index: number, error: string | null) => {
    setDefaultJsonErrors((prev) => ({ ...prev, [index]: error }));
  };

  const addRow = () => {
    onChange([...value, defaultFieldDescriptor()]);
  };

  const removeAt = (index: number) => {
    const next = value.filter((_, i) => i !== index);
    // Re-index per-row errors so they keep matching rows after the splice.
    setDefaultJsonErrors((prev) => {
      const out: Record<number, string | null> = {};
      for (const key of Object.keys(prev)) {
        const idx = Number(key);
        if (idx < index) out[idx] = prev[idx];
        else if (idx > index) out[idx - 1] = prev[idx];
      }
      return out;
    });
    onChange(next);
  };

  const updateAt = (index: number, next: FieldDescriptor) => {
    onChange(value.map((f, i) => (i === index ? next : f)));
  };

  const anyRowInvalid = value.some((_, idx) =>
    isRowInvalid(value, idx, defaultJsonErrors),
  );

  return (
    <Stack gap="md" data-testid="field-list-editor">
      <Box>
        <Group justify="space-between" align="center" mb={4}>
          <Title order={5} style={{ margin: 0 }}>
            Fields
          </Title>
        </Group>

        {value.length === 0 ? (
          <Text size="xs" c="dimmed">
            No fields — click "Add field" to declare the source's input shape.
          </Text>
        ) : (
          <Stack gap="md">
            {value.map((row, index) => (
              <FieldRow
                // Index-based key is intentional — fields have no stable id
                // and are an ordered list editable by index.
                key={`field-${index}`}
                index={index}
                value={row}
                nameError={nameErrorFor(value, index)}
                defaultJsonError={defaultJsonErrors[index] ?? null}
                onChange={(next) => updateAt(index, next)}
                onDefaultJsonError={(err) => updateDefaultJsonError(index, err)}
                onRemove={() => removeAt(index)}
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
          onClick={addRow}
          disabled={anyRowInvalid}
          data-testid="field-list-editor-add"
        >
          Add field
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-row editor
// ---------------------------------------------------------------------------

interface FieldRowProps {
  index: number;
  value: FieldDescriptor;
  nameError: string | null;
  defaultJsonError: string | null;
  onChange: (next: FieldDescriptor) => void;
  onDefaultJsonError: (error: string | null) => void;
  onRemove: () => void;
}

function FieldRow({
  index,
  value,
  nameError,
  defaultJsonError,
  onChange,
  onDefaultJsonError,
  onRemove,
}: FieldRowProps) {
  // Local raw-string state for the JsonInput so we don't re-encode on every
  // keystroke (which would break in-progress edits like typing `{`).
  const [rawDefault, setRawDefault] = useState<string>(() =>
    stringifyDefault(value.defaultValue),
  );

  const testIdBase = `field-list-editor-row-${index}`;

  const setName = (next: string) => {
    onChange({ ...value, name: next });
  };

  const setType = (next: FieldType) => {
    onChange({ ...value, type: next });
  };

  const setKind = (next: KindRef | undefined) => {
    if (next === undefined) {
      const { kind: _omitted, ...rest } = value;
      void _omitted;
      onChange({ ...rest });
    } else {
      onChange({ ...value, kind: next });
    }
  };

  const setRequired = (next: boolean) => {
    onChange({ ...value, required: next });
  };

  const setDescription = (next: string) => {
    if (next.length === 0) {
      const { description: _omitted, ...rest } = value;
      void _omitted;
      onChange({ ...rest });
    } else {
      onChange({ ...value, description: next });
    }
  };

  const handleDefaultBlur = () => {
    const parsed = parseJsonOrError(rawDefault);
    if (parsed.ok) {
      onDefaultJsonError(null);
      if (parsed.value === undefined) {
        const { defaultValue: _omitted, ...rest } = value;
        void _omitted;
        onChange({ ...rest });
      } else {
        onChange({ ...value, defaultValue: parsed.value });
      }
    } else {
      onDefaultJsonError(parsed.error);
    }
  };

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
          Field {index + 1}
        </Text>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          aria-label={`Remove field ${index + 1}`}
          data-testid={`field-list-editor-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      <Stack gap="xs">
        <TextInput
          label="Name"
          withAsterisk
          value={value.name}
          error={nameError ?? undefined}
          onChange={(e) => setName(e.currentTarget.value)}
          data-testid={`field-list-editor-name-${index}`}
        />

        <Group grow align="flex-start">
          <Select
            label="Type"
            data={FIELD_TYPE_OPTIONS.map((o) => ({ value: o, label: o }))}
            value={value.type}
            onChange={(v) => {
              if (v === null) return;
              if (!isFieldType(v)) return;
              setType(v);
            }}
            withAsterisk
            allowDeselect={false}
            data-testid={`field-list-editor-type-${index}`}
          />
          <KindSelect
            label="Kind"
            value={value.kind}
            onChange={setKind}
            data-testid={`field-list-editor-kind-${index}`}
          />
        </Group>

        <Checkbox
          label="Required"
          checked={value.required}
          onChange={(e) => setRequired(e.currentTarget.checked)}
          data-testid={`field-list-editor-required-${index}`}
        />

        <TextInput
          label="Description"
          value={value.description ?? ""}
          onChange={(e) => setDescription(e.currentTarget.value)}
          data-testid={`field-list-editor-description-${index}`}
        />

        <JsonInput
          label="Default value"
          description="Optional JSON literal. Parsed on blur — invalid JSON shows an inline error."
          autosize
          minRows={1}
          maxRows={4}
          value={rawDefault}
          error={defaultJsonError ?? undefined}
          onChange={(next) => {
            setRawDefault(next);
            // Clear stale error as soon as the user edits — they'll see a
            // fresh evaluation on the next blur.
            if (defaultJsonError !== null) onDefaultJsonError(null);
          }}
          onBlur={handleDefaultBlur}
          data-testid={`field-list-editor-default-${index}`}
        />
      </Stack>
    </Box>
  );
}
