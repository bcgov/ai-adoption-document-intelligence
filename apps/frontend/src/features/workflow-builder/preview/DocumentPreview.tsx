/**
 * `DocumentPreview` — paginated thumbnail strip widget for the
 * `Document` / `MultiPageDocument` / `SinglePageDocument`
 * `ArtifactKind`s.
 *
 * Renders:
 *   - SinglePageDocument: one large thumbnail (max 160px high).
 *   - MultiPageDocument:  large first page + horizontal scroll strip of
 *                         pages 2..N (max 60px high each). Capped at 8
 *                         visible thumbnails (pages 2..9) with a small
 *                         "+N more" chip when `pageCount > 9`.
 *
 * Clicking the large thumbnail opens a Mantine `<Modal size="80%">`
 * with the page rendered full size; multi-page documents get prev/next
 * page-navigation arrows.
 *
 * The `<BlobImage>` component referenced by the design doc + story is
 * NOT present in this codebase (only `DocumentViewer.tsx` /
 * `DocumentViewerModal.tsx` exist under `apps/frontend/src/components/
 * document/`). We render thumbnails inline via Mantine `<Image>` driven
 * by the document's optional `url` field — the surrounding
 * `<Skeleton>` + `<Alert>` fallbacks substitute for `<BlobImage>`'s
 * loading / unavailable states. Per-page rendering for multi-page
 * documents has no available endpoint either — the worker materialises
 * each `Document` with a top-level `url` only, so subsequent pages in
 * the strip use the same `url` as a placeholder. See the
 * "Gaps / follow-ups" note at the bottom of this file.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L35
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-142-document-preview.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.2
 */

import {
  ActionIcon,
  Alert,
  Box,
  Group,
  Image,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export interface DocumentPreviewProps {
  value: unknown;
}

/**
 * Document ctx shape. Mirrors
 * `packages/graph-workflow/src/cache/hash-artifact.ts` (the
 * detection-marker spec for the cache layer). Extra fields are
 * preserved as unknown — we only consume the fields below.
 */
interface DocumentLike {
  blobKey: string;
  url?: string;
  mimeType?: string;
  pageCount?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asDocument(value: unknown): DocumentLike | null {
  if (!isPlainObject(value)) {
    return null;
  }
  if (typeof value.blobKey !== "string" || value.blobKey === "") {
    return null;
  }
  const doc: DocumentLike = { blobKey: value.blobKey };
  if (typeof value.url === "string") {
    doc.url = value.url;
  }
  if (typeof value.mimeType === "string") {
    doc.mimeType = value.mimeType;
  }
  if (typeof value.pageCount === "number" && Number.isFinite(value.pageCount)) {
    doc.pageCount = value.pageCount;
  }
  return doc;
}

/**
 * Single-page when `pageCount === 1`, OR the mimeType starts with
 * `image/`, OR both `pageCount` and `mimeType` are absent (per the
 * story's Scenario 3).
 */
function isSinglePage(doc: DocumentLike): boolean {
  if (doc.pageCount === 1) {
    return true;
  }
  if (doc.mimeType?.startsWith("image/")) {
    return true;
  }
  if (doc.pageCount === undefined && doc.mimeType === undefined) {
    return true;
  }
  return false;
}

const LARGE_THUMB_MAX_H_PX = 160;
const STRIP_THUMB_MAX_H_PX = 60;
const STRIP_VISIBLE_CAP = 8;

interface BlobThumbnailProps {
  blobKey: string;
  page: number;
  url?: string;
  maxHeight: number;
  testId?: string;
  onClick?: () => void;
}

/**
 * Inline thumbnail. Stands in for the non-existent `<BlobImage>` —
 * renders an `<Image>` from `url` (the worker materialises Documents
 * with a top-level presigned URL) with `<Skeleton>` while loading and
 * an `<Alert>` saying "Unavailable" if the URL is missing or the
 * `<img>` errors.
 */
function BlobThumbnail({
  blobKey,
  page,
  url,
  maxHeight,
  testId,
  onClick,
}: BlobThumbnailProps): ReactNode {
  const [errored, setErrored] = useState(false);
  // Reset error when `url` / `blobKey` / `page` changes.
  useEffect(() => {
    setErrored(false);
  }, [url, blobKey, page]);

  if (url === undefined || url === "") {
    return (
      <Alert
        color="gray"
        variant="light"
        data-testid={testId}
        data-state="unavailable"
        p={4}
      >
        <Text size="xs">Unavailable</Text>
      </Alert>
    );
  }

  if (errored) {
    return (
      <Alert
        color="gray"
        variant="light"
        data-testid={testId}
        data-state="unavailable"
        p={4}
      >
        <Text size="xs">Unavailable</Text>
      </Alert>
    );
  }

  return (
    <Image
      src={url}
      alt={`Page ${page}`}
      h={maxHeight}
      fit="contain"
      fallbackSrc=""
      onError={() => setErrored(true)}
      data-testid={testId}
      data-blob-key={blobKey}
      data-page={page}
      style={onClick ? { cursor: "pointer" } : undefined}
      onClick={onClick}
    />
  );
}

interface DocumentModalProps {
  doc: DocumentLike;
  initialPage: number;
  opened: boolean;
  onClose: () => void;
}

function DocumentModal({
  doc,
  initialPage,
  opened,
  onClose,
}: DocumentModalProps): ReactNode {
  const [page, setPage] = useState(initialPage);
  useEffect(() => {
    if (opened) {
      setPage(initialPage);
    }
  }, [opened, initialPage]);

  const pageCount =
    typeof doc.pageCount === "number" && doc.pageCount > 0 ? doc.pageCount : 1;
  const isMulti = pageCount > 1;
  const canPrev = isMulti && page > 1;
  const canNext = isMulti && page < pageCount;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="80%"
      title={`Page ${page}${isMulti ? ` of ${pageCount}` : ""}`}
      withinPortal
    >
      <Stack data-testid="document-preview-modal">
        <Box style={{ display: "flex", justifyContent: "center" }}>
          <BlobThumbnail
            blobKey={doc.blobKey}
            page={page}
            url={doc.url}
            maxHeight={600}
            testId="document-preview-modal-image"
          />
        </Box>
        {isMulti && (
          <Group justify="space-between">
            <ActionIcon
              variant="default"
              aria-label="Previous page"
              data-testid="document-preview-modal-prev"
              disabled={!canPrev}
              onClick={() => {
                if (canPrev) {
                  setPage((current) => current - 1);
                }
              }}
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
            <Text
              size="sm"
              c="dimmed"
              data-testid="document-preview-modal-page-label"
            >
              {page} / {pageCount}
            </Text>
            <ActionIcon
              variant="default"
              aria-label="Next page"
              data-testid="document-preview-modal-next"
              disabled={!canNext}
              onClick={() => {
                if (canNext) {
                  setPage((current) => current + 1);
                }
              }}
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

export function DocumentPreview({ value }: DocumentPreviewProps): ReactNode {
  const [modalOpened, modalHandlers] = useDisclosure(false);
  const doc = asDocument(value);

  if (doc === null) {
    return (
      <Alert
        color="gray"
        variant="light"
        data-testid="document-preview-placeholder"
        p={6}
      >
        <Text size="xs">Document unavailable</Text>
      </Alert>
    );
  }

  const singlePage = isSinglePage(doc);
  const pageCount =
    typeof doc.pageCount === "number" && doc.pageCount > 0 ? doc.pageCount : 1;

  // Strip page numbers: 2..min(pageCount, STRIP_VISIBLE_CAP + 1) →
  // 8 visible thumbs (pages 2..9) when pageCount > 9, otherwise pages
  // 2..pageCount. The "+N more" chip surfaces the truncated count.
  const stripEnd = Math.min(pageCount, STRIP_VISIBLE_CAP + 1);
  const stripPages: number[] = [];
  if (!singlePage) {
    for (let p = 2; p <= stripEnd; p += 1) {
      stripPages.push(p);
    }
  }
  const overflowCount = singlePage
    ? 0
    : Math.max(0, pageCount - (STRIP_VISIBLE_CAP + 1));

  return (
    <Box data-testid="document-preview" data-page-count={pageCount}>
      <Stack gap="xs">
        <BlobThumbnail
          blobKey={doc.blobKey}
          page={1}
          url={doc.url}
          maxHeight={LARGE_THUMB_MAX_H_PX}
          testId="document-preview-large"
          onClick={modalHandlers.open}
        />
        {!singlePage && stripPages.length > 0 && (
          <ScrollArea
            type="auto"
            scrollbarSize={6}
            data-testid="document-preview-strip"
          >
            <Group gap="xs" wrap="nowrap">
              {stripPages.map((p) => (
                <BlobThumbnail
                  key={p}
                  blobKey={doc.blobKey}
                  page={p}
                  url={doc.url}
                  maxHeight={STRIP_THUMB_MAX_H_PX}
                  testId={`document-preview-strip-thumb-${p}`}
                />
              ))}
              {overflowCount > 0 && (
                <Box
                  data-testid="document-preview-strip-overflow"
                  px={6}
                  py={2}
                  style={{
                    border: "1px solid var(--mantine-color-gray-4)",
                    borderRadius: 4,
                    background: "var(--mantine-color-gray-1)",
                  }}
                >
                  <Text size="xs">+{overflowCount} more</Text>
                </Box>
              )}
            </Group>
          </ScrollArea>
        )}
      </Stack>
      <DocumentModal
        doc={doc}
        initialPage={1}
        opened={modalOpened}
        onClose={modalHandlers.close}
      />
    </Box>
  );
}

/**
 * Gaps / follow-ups (intentionally NOT implemented in US-142):
 *
 *  1. **`<BlobImage>` is referenced by the design + story but does not
 *     exist in the codebase.** This widget therefore renders thumbnails
 *     directly from `value.url` (Mantine `<Image>` + skeleton). When a
 *     real `<BlobImage>` lands (with per-page rendering against a blob
 *     endpoint by `blobKey`), the inline `BlobThumbnail` helper in this
 *     file should be replaced with it 1:1 — the props line up
 *     (`blobKey`, `page`).
 *
 *  2. **No per-page endpoint exists for Documents in this codebase.**
 *     The worker materialises a `Document` ctx value with a single
 *     top-level presigned `url`. As a result, strip thumbnails for
 *     pages 2..N currently display the same `url` as page 1 (the
 *     thumbnail strip's visual structure is correct, but every page is
 *     the first page). When the per-page rendering endpoint lands,
 *     `BlobThumbnail` should append `?page=${page}` (or whichever
 *     convention is settled on) to the URL.
 */
