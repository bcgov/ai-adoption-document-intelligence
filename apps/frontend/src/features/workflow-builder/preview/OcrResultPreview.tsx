/**
 * `OcrResultPreview` — structured K/V table widget for the `OcrResult`
 * and `OcrFields` `ArtifactKind`s.
 *
 * Renders top-level keys as Mantine `<Table>` rows. Primitive values
 * render verbatim (numbers `.toFixed(2)` when fractional; booleans as
 * yes/no). A one-level nested object with ≤ 4 primitive entries renders
 * as an inline summary (`name: Acme · id: v-7`); deeper nesting or any
 * non-primitive child collapses to `{...}` with a "View raw" link that
 * opens the full nested JSON in a `<JsonInput readOnly>` modal. Long
 * strings (> 60 chars) truncate to a 60-char prefix + ellipsis with a
 * `<Tooltip>` for the full value and a small Copy button.
 *
 * `OcrResult` values may carry `pages[].fields`; when present the
 * widget renders the first page's fields by default and offers a small
 * page-selector chip when `pages.length > 1`. Otherwise the widget
 * treats the value as a flat fields object.
 *
 * Generic by design — no document-specific field names are referenced.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L37
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-144-ocr-result-preview.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.4
 */

import {
  Anchor,
  Box,
  Button,
  Chip,
  CopyButton,
  Group,
  JsonInput,
  Modal,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useMemo, useState } from "react";

export interface OcrResultPreviewProps {
  value: unknown;
}

const LONG_STRING_LIMIT = 60;
const INLINE_NESTED_MAX_KEYS = 4;

interface RawModalState {
  parentKey: string;
  value: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isPrimitive(v: unknown): boolean {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function formatPrimitive(v: unknown): string {
  if (v === null) {
    return "null";
  }
  if (typeof v === "boolean") {
    return v ? "yes" : "no";
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      return String(v);
    }
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return String(v);
}

function canInlineNested(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length === 0 || keys.length > INLINE_NESTED_MAX_KEYS) {
    return false;
  }
  return keys.every((k) => isPrimitive(obj[k]));
}

function inlineNestedSummary(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${formatPrimitive(v)}`)
    .join(" · ");
}

interface ValueCellProps {
  parentKey: string;
  value: unknown;
  onViewRaw: (s: RawModalState) => void;
}

function ValueCell({ parentKey, value, onViewRaw }: ValueCellProps): ReactNode {
  if (Array.isArray(value)) {
    return (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed">{`[${value.length} items]`}</Text>
        <Anchor
          component="button"
          type="button"
          size="xs"
          onClick={() => onViewRaw({ parentKey, value })}
          data-testid={`ocr-preview-view-raw-${parentKey}`}
        >
          View raw
        </Anchor>
      </Group>
    );
  }

  if (isPlainObject(value)) {
    if (canInlineNested(value)) {
      return (
        <Text size="sm" data-testid={`ocr-preview-inline-${parentKey}`}>
          {inlineNestedSummary(value)}
        </Text>
      );
    }
    return (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" c="dimmed">
          {"{...}"}
        </Text>
        <Anchor
          component="button"
          type="button"
          size="xs"
          onClick={() => onViewRaw({ parentKey, value })}
          data-testid={`ocr-preview-view-raw-${parentKey}`}
        >
          View raw
        </Anchor>
      </Group>
    );
  }

  if (typeof value === "string" && value.length > LONG_STRING_LIMIT) {
    const truncated = `${value.slice(0, LONG_STRING_LIMIT)}…`;
    return (
      <Group gap="xs" wrap="nowrap">
        <Tooltip multiline w={400} label={value} withArrow>
          <Text size="sm" data-testid={`ocr-preview-truncated-${parentKey}`}>
            {truncated}
          </Text>
        </Tooltip>
        <CopyButton value={value}>
          {({ copied, copy }) => (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={copy}
              data-testid={`ocr-preview-copy-${parentKey}`}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          )}
        </CopyButton>
      </Group>
    );
  }

  return (
    <Text size="sm" data-testid={`ocr-preview-value-${parentKey}`}>
      {formatPrimitive(value)}
    </Text>
  );
}

interface PageInfo {
  fields: Record<string, unknown>;
  pageCount: number;
}

function resolvePages(value: Record<string, unknown>): PageInfo[] | null {
  const pages = value.pages;
  if (!Array.isArray(pages) || pages.length === 0) {
    return null;
  }
  const resolved: PageInfo[] = [];
  for (const page of pages) {
    if (!isPlainObject(page)) {
      return null;
    }
    const fields = page.fields;
    if (!isPlainObject(fields)) {
      return null;
    }
    resolved.push({ fields, pageCount: pages.length });
  }
  return resolved;
}

export function OcrResultPreview({ value }: OcrResultPreviewProps): ReactNode {
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [rawModal, setRawModal] = useState<RawModalState | null>(null);
  const [opened, { open, close }] = useDisclosure(false);

  const pages = useMemo(
    () => (isPlainObject(value) ? resolvePages(value) : null),
    [value],
  );

  const fields = useMemo<Record<string, unknown> | null>(() => {
    if (!isPlainObject(value)) {
      return null;
    }
    if (pages !== null) {
      const idx = Math.min(activePageIndex, pages.length - 1);
      return pages[idx].fields;
    }
    return value;
  }, [value, pages, activePageIndex]);

  if (fields === null) {
    return (
      <Text size="sm" c="dimmed" data-testid="ocr-preview-empty">
        No OCR data
      </Text>
    );
  }

  const openRaw = (s: RawModalState): void => {
    setRawModal(s);
    open();
  };

  const entries = Object.entries(fields);

  return (
    <Stack gap="xs" data-testid="ocr-preview-root">
      {pages !== null && pages.length > 1 && (
        <Group gap="xs" data-testid="ocr-preview-page-chips">
          {pages.map((_, i) => (
            <Chip
              key={i}
              checked={activePageIndex === i}
              onChange={() => setActivePageIndex(i)}
              size="xs"
              data-testid={`ocr-preview-page-chip-${i}`}
            >
              {`Page ${i + 1}`}
            </Chip>
          ))}
        </Group>
      )}
      <Box style={{ overflow: "auto" }}>
        <Table verticalSpacing="xs" striped data-testid="ocr-preview-table">
          <Table.Tbody>
            {entries.map(([key, v]) => (
              <Table.Tr key={key} data-testid={`ocr-preview-row-${key}`}>
                <Table.Td style={{ width: "30%", fontWeight: 500 }}>
                  {key}
                </Table.Td>
                <Table.Td>
                  <ValueCell parentKey={key} value={v} onViewRaw={openRaw} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Modal
        opened={opened}
        onClose={close}
        size="md"
        title={rawModal !== null ? `${rawModal.parentKey} — full content` : ""}
        data-testid="ocr-preview-raw-modal"
      >
        {rawModal !== null && (
          <JsonInput
            readOnly
            autosize
            maxRows={30}
            value={JSON.stringify(rawModal.value, null, 2)}
            data-testid="ocr-preview-raw-json"
          />
        )}
      </Modal>
    </Stack>
  );
}
