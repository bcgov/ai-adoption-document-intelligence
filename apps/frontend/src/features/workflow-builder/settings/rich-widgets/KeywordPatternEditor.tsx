/**
 * KeywordPatternEditor — list editor for the `document.splitAndClassify`
 * `keywordPatterns` array (US-035).
 *
 * Each row is a `{ pattern, segmentType }` pair. `pattern` is a regex
 * source; `segmentType` is a free-form required string used as the segment
 * label for pages matched by this pattern. The catalog Zod schema lives at
 * `packages/graph-workflow/src/catalog/activities/document-split-and-classify.ts`
 * and requires `pattern.min(1)`, `segmentType.min(1)`, and
 * `keywordPatterns.min(1)`.
 *
 * Surface-only validation: the regex is compiled via `new RegExp(pattern)`
 * inside a try/catch on `blur` (not on every keystroke — performance + ux).
 * An invalid regex surfaces an inline error with the JS error message, but
 * `onChange` still propagates the invalid value — Zod remains the source of
 * truth at save time.
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
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KeywordPattern {
  pattern: string;
  segmentType: string;
}

export interface KeywordPatternEditorProps {
  /** Current keyword-pattern array. */
  value: KeywordPattern[];
  /** Fires whenever a row is added, removed, or mutated. */
  onChange: (next: KeywordPattern[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a fresh default `{ pattern: "", segmentType: "" }` row. Both
 * fields are required by the catalog (`.min(1)`) but the user populates
 * them after adding — Zod validates at save time.
 */
export function defaultKeywordPattern(): KeywordPattern {
  return { pattern: "", segmentType: "" };
}

/**
 * Attempts to compile `pattern` as a JS regex. Returns the JS error message
 * if compilation throws, otherwise `null`.
 */
function regexErrorOrNull(pattern: string): string | null {
  try {
    // The pattern is a regex source — empty string is a valid (but useless)
    // regex that matches everywhere, so we don't bypass the try here. Zod
    // catches empty strings via `.min(1)` at save time.
    new RegExp(pattern);
    return null;
  } catch (error) {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KeywordPatternEditor({
  value,
  onChange,
}: KeywordPatternEditorProps) {
  const addRow = () => {
    onChange([...value, defaultKeywordPattern()]);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const updateAt = (index: number, next: KeywordPattern) => {
    onChange(value.map((r, i) => (i === index ? next : r)));
  };

  return (
    <Stack gap="md" data-testid="keyword-pattern-editor">
      <Stack gap="xs">
        {value.map((row, index) => (
          <KeywordPatternRow
            // Index-based key is intentional: rows have no stable id and
            // are an ordered list editable by index.
            key={`row-${index}`}
            index={index}
            value={row}
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
          data-testid="keyword-pattern-editor-add"
        >
          Add pattern
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Per-row editor
// ---------------------------------------------------------------------------

interface KeywordPatternRowProps {
  index: number;
  value: KeywordPattern;
  disableRemove: boolean;
  onChange: (next: KeywordPattern) => void;
  onRemove: () => void;
}

function KeywordPatternRow({
  index,
  value,
  disableRemove,
  onChange,
  onRemove,
}: KeywordPatternRowProps) {
  // Regex error is computed on blur — not on every keystroke — to avoid
  // distracting the user mid-edit and to keep the cost of compiling
  // regexes on a hot path under control.
  const [regexError, setRegexError] = useState<string | null>(null);

  const handlePatternBlur = () => {
    setRegexError(regexErrorOrNull(value.pattern));
  };

  return (
    <Box
      data-testid={`keyword-pattern-editor-row-${index}`}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 4,
        padding: 8,
      }}
    >
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <Box style={{ flex: 1 }}>
          <TextInput
            label="Pattern"
            withAsterisk
            value={value.pattern}
            error={regexError ?? undefined}
            onChange={(e) => {
              const next = e.currentTarget.value;
              // Clear stale error as soon as the user edits — they'll see
              // a fresh evaluation on the next blur.
              if (regexError !== null) setRegexError(null);
              onChange({ ...value, pattern: next });
            }}
            onBlur={handlePatternBlur}
            data-testid={`keyword-pattern-editor-pattern-${index}`}
          />
        </Box>
        <Box style={{ flex: 1 }}>
          <TextInput
            label="Segment type"
            withAsterisk
            value={value.segmentType}
            onChange={(e) =>
              onChange({ ...value, segmentType: e.currentTarget.value })
            }
            data-testid={`keyword-pattern-editor-segment-type-${index}`}
          />
        </Box>
        <ActionIcon
          size="sm"
          variant="subtle"
          color="red"
          disabled={disableRemove}
          onClick={onRemove}
          aria-label={`Remove pattern ${index + 1}`}
          data-testid={`keyword-pattern-editor-remove-${index}`}
        >
          <IconTrash size={14} />
        </ActionIcon>
      </Group>

      {regexError !== null && (
        <Text
          size="xs"
          c="red"
          mt={4}
          data-testid={`keyword-pattern-editor-error-${index}`}
        >
          {regexError}
        </Text>
      )}
    </Box>
  );
}
