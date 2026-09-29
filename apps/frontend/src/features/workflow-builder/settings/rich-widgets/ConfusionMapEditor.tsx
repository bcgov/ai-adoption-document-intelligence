/**
 * ConfusionMapEditor — row-based editor for the `ocr.characterConfusion`
 * `customConfusionMap` parameter (US-033).
 *
 * Wire shape is `Record<string, string>`, but editing an object keyed by
 * the value the user is currently typing is unstable (renaming a key
 * unmounts the input, reorders entries, etc.). The editor keeps an
 * internal ordered array of `{ from, to }` rows and converts to/from the
 * `Record` shape at the API boundary:
 *
 *   - object → rows: `Object.entries(value)` on first render. Insertion
 *     order is the canonical order.
 *   - rows → object: `Object.fromEntries(rows.filter(r => r.from !== ""))`
 *     — empty `from` keys are dropped before serialisation; duplicate
 *     `from` keys collapse last-write-wins (Object.fromEntries
 *     semantics). The duplicate case surfaces an inline per-row warning
 *     so the author isn't surprised by silent loss.
 *
 * The catalog schema lives at
 * `packages/graph-workflow/src/catalog/activities/ocr-character-confusion.ts`
 * and allows an empty `Record` (the field is `.optional()`), so trash on
 * the last row is enabled.
 */

import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfusionMap = Record<string, string>;

interface ConfusionMapRow {
  from: string;
  to: string;
}

export interface ConfusionMapEditorProps {
  /** Current confusion map — an object keyed by the "from" character(s). */
  value: ConfusionMap;
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: ConfusionMap) => void;
}

// ---------------------------------------------------------------------------
// Object ↔ rows helpers
// ---------------------------------------------------------------------------

function objectToRows(value: ConfusionMap): ConfusionMapRow[] {
  return Object.entries(value).map(([from, to]) => ({ from, to }));
}

/**
 * Builds the serialised `Record<string, string>`:
 * - Rows with an empty `from` key are skipped.
 * - Duplicate `from` keys collapse via `Object.fromEntries` (last write
 *   wins).
 */
function rowsToObject(rows: ConfusionMapRow[]): ConfusionMap {
  return Object.fromEntries(
    rows.filter((r) => r.from !== "").map((r) => [r.from, r.to]),
  );
}

/**
 * Returns true when the two `Record<string, string>` values are structurally
 * equal. Used to detect external `value` changes that should re-seed the
 * internal row order (avoiding clobbering an in-flight `from` rename, where
 * the rebuilt object is identical to the parent's tracked value).
 */
function recordEquals(a: ConfusionMap, b: ConfusionMap): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!(k in b)) return false;
    if (a[k] !== b[k]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConfusionMapEditor({
  value,
  onChange,
}: ConfusionMapEditorProps) {
  // Internal row state: seeded from `value` on mount, kept in sync across
  // local edits. We track the last `value` we emitted so an external `value`
  // change (load from disk, undo, etc.) re-syncs the row order, while our
  // own emits don't ping-pong.
  const [rows, setRows] = useState<ConfusionMapRow[]>(() =>
    objectToRows(value),
  );
  const lastEmittedRef = useRef<ConfusionMap>(
    rowsToObject(objectToRows(value)),
  );

  useEffect(() => {
    if (!recordEquals(value, lastEmittedRef.current)) {
      const nextRows = objectToRows(value);
      setRows(nextRows);
      lastEmittedRef.current = rowsToObject(nextRows);
    }
  }, [value]);

  const commit = (nextRows: ConfusionMapRow[]) => {
    setRows(nextRows);
    const serialised = rowsToObject(nextRows);
    lastEmittedRef.current = serialised;
    onChange(serialised);
  };

  const addRow = () => {
    commit([...rows, { from: "", to: "" }]);
  };

  const removeAt = (index: number) => {
    commit(rows.filter((_, i) => i !== index));
  };

  const updateAt = (index: number, next: ConfusionMapRow) => {
    commit(rows.map((r, i) => (i === index ? next : r)));
  };

  // Pre-compute which rows are duplicates of an earlier row's `from`. Empty
  // `from` values are excluded (they're dropped on serialisation anyway).
  const duplicateFlags: boolean[] = [];
  const seenFroms = new Set<string>();
  for (const row of rows) {
    if (row.from === "") {
      duplicateFlags.push(false);
      continue;
    }
    duplicateFlags.push(seenFroms.has(row.from));
    seenFroms.add(row.from);
  }

  return (
    <Stack gap="md" data-testid="confusion-map-editor">
      {rows.length === 0 && (
        <Text size="xs" c="dimmed" fs="italic">
          No pairs yet — click "Add pair" to create one.
        </Text>
      )}

      <Stack gap="xs">
        {rows.map((row, index) => (
          <ConfusionMapRowEditor
            // Index-based key is intentional: rows have no stable id and are
            // an ordered list editable by index.
            key={`row-${index}`}
            index={index}
            value={row}
            isDuplicate={duplicateFlags[index]}
            onChange={(next) => updateAt(index, next)}
            onRemove={() => removeAt(index)}
          />
        ))}
      </Stack>

      <Group>
        <Button
          variant="light"
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={addRow}
          data-testid="confusion-map-editor-add"
        >
          Add pair
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-row editor
// ---------------------------------------------------------------------------

interface ConfusionMapRowEditorProps {
  index: number;
  value: ConfusionMapRow;
  isDuplicate: boolean;
  onChange: (next: ConfusionMapRow) => void;
  onRemove: () => void;
}

function ConfusionMapRowEditor({
  index,
  value,
  isDuplicate,
  onChange,
  onRemove,
}: ConfusionMapRowEditorProps) {
  return (
    <Box
      data-testid={`confusion-map-editor-row-${index}`}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <TextInput
            label="From"
            value={value.from}
            onChange={(e) =>
              onChange({ ...value, from: e.currentTarget.value })
            }
            data-testid={`confusion-map-editor-from-${index}`}
          />
        </Box>
        <Box style={{ flex: 1 }}>
          <TextInput
            label="To"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.currentTarget.value })}
            data-testid={`confusion-map-editor-to-${index}`}
          />
        </Box>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          onClick={onRemove}
          aria-label={`Remove pair ${index + 1}`}
          data-testid={`confusion-map-editor-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      {isDuplicate && (
        <Text
          size="xs"
          c="orange"
          mt={4}
          data-testid={`confusion-map-editor-warning-${index}`}
        >
          Duplicate key — only the last value will be saved.
        </Text>
      )}
    </Box>
  );
}
