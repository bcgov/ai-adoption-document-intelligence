/**
 * PageRangeListEditor — list editor for the `document.split.custom-ranges`
 * `customRanges` array (US-031).
 *
 * Each row is a `{ start, end }` 1-based inclusive page range. The catalog
 * Zod schema lives at
 * `packages/graph-workflow/src/catalog/activities/document-split.ts` and
 * requires `start >= 1`, `end >= 1`, and `customRanges.min(1)`.
 *
 * Surface-only validation: an inline error is rendered below a row when
 * `start > end`, but `onChange` still fires with the new value — Zod
 * remains the source of truth at save time.
 */

import {
  ActionIcon,
  Box,
  Button,
  Group,
  NumberInput,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageRange {
  start: number;
  end: number;
}

export interface PageRangeListEditorProps {
  /** Current page-range array. */
  value: PageRange[];
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: PageRange[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Returns a fresh default `{ start: 1, end: 1 }` row — mirrors the Zod
 * `min(1)` constraint on both fields.
 */
export function defaultPageRange(): PageRange {
  return { start: 1, end: 1 };
}

export function PageRangeListEditor({
  value,
  onChange,
}: PageRangeListEditorProps) {
  const addRow = () => {
    onChange([...value, defaultPageRange()]);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateAt = (index: number, next: PageRange) => {
    onChange(value.map((r, i) => (i === index ? next : r)));
  };

  return (
    <Stack gap="md" data-testid="page-range-list-editor">
      <Stack gap="xs">
        {value.map((range, index) => (
          <PageRangeRow
            // Index-based key is intentional: ranges have no stable id and
            // are an ordered list editable by index.
            key={`range-${index}`}
            index={index}
            value={range}
            disableRemove={value.length <= 1}
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
          data-testid="page-range-list-editor-add"
        >
          Add range
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-row editor
// ---------------------------------------------------------------------------

interface PageRangeRowProps {
  index: number;
  value: PageRange;
  disableRemove: boolean;
  onChange: (next: PageRange) => void;
  onRemove: () => void;
}

function PageRangeRow({
  index,
  value,
  disableRemove,
  onChange,
  onRemove,
}: PageRangeRowProps) {
  const hasError = value.end < value.start;

  return (
    <Box
      data-testid={`page-range-list-editor-row-${index}`}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <NumberInput
            label="Start"
            min={1}
            clampBehavior="strict"
            allowDecimal={false}
            withAsterisk
            value={value.start}
            onChange={(v) => {
              if (typeof v !== "number") return;
              onChange({ ...value, start: v });
            }}
            data-testid={`page-range-list-editor-start-${index}`}
          />
        </Box>
        <Box style={{ flex: 1 }}>
          <NumberInput
            label="End"
            min={1}
            clampBehavior="strict"
            allowDecimal={false}
            withAsterisk
            value={value.end}
            onChange={(v) => {
              if (typeof v !== "number") return;
              onChange({ ...value, end: v });
            }}
            data-testid={`page-range-list-editor-end-${index}`}
          />
        </Box>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          disabled={disableRemove}
          onClick={onRemove}
          aria-label={`Remove range ${index + 1}`}
          data-testid={`page-range-list-editor-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      {hasError && (
        <Text
          size="xs"
          c="red"
          mt={4}
          data-testid={`page-range-list-editor-error-${index}`}
        >
          End must be greater than or equal to start.
        </Text>
      )}
    </Box>
  );
}
