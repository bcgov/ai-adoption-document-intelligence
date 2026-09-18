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
 *   - docs-md/workflows/TRY_IN_PLACE_DESIGN.md §4.2
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
  /** Storage path (blob key). May be empty for a bare reference. */
  blobKey: string;
  /** Only a directly-renderable image URL (`http(s):` / `data:`). */
  url?: string;
  mimeType?: string;
  pageCount?: number;
  /** Original file name, when the value carries one (e.g. PreparedFile). */
  fileName?: string;
  /** Coarse file type (e.g. `image`, `pdf`), when present. */
  fileType?: string;
  /** Document record id, when the value is a DocumentRef. */
  documentId?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v !== "") return v;
  }
  return undefined;
}

/** A directly-renderable image URL — NOT a bare storage path / blob key. */
function isRenderableUrl(u: string | undefined): u is string {
  return u !== undefined && /^(https?:|data:)/i.test(u);
}

/**
 * Parse a Document-family ctx value into the fields we can display. The
 * cache stores different shapes across the family:
 *   - `PreparedFile`  → `{ blobKey, fileName, contentType, fileType, ... }`
 *   - `DocumentRef`   → `{ documentId, documentUrl }`, or (when a single
 *                        output binding points at the URL key) the bare
 *                        `documentUrl` string
 *   - `Document`      → `{ blobKey, url, mimeType, pageCount }` (the shape the
 *                        thumbnail path renders)
 * We read a storage path from `blobKey` / `documentUrl`, but only treat a value
 * as a renderable `url` when it's an actual `http(s):` / `data:` URL — a bare
 * blob key is a path, not something an `<img>` can load. Returns `null` only
 * when there is nothing identifying at all (render silently in that case).
 */
function asDocument(value: unknown): DocumentLike | null {
  // A bare string binding (e.g. a source's `documentUrl`) is a storage path.
  if (typeof value === "string") {
    if (value === "") return null;
    return isRenderableUrl(value)
      ? { blobKey: "", url: value }
      : { blobKey: value };
  }
  if (!isPlainObject(value)) {
    return null;
  }
  const blobKey = firstString(value, ["blobKey", "documentUrl", "storageKey"]);
  const rawUrl = firstString(value, ["url"]);
  const mimeType = firstString(value, ["mimeType", "contentType"]);
  const fileName = firstString(value, ["fileName", "name"]);
  const fileType = firstString(value, ["fileType"]);
  const documentId = firstString(value, ["documentId"]);
  const pageCount =
    typeof value.pageCount === "number" && Number.isFinite(value.pageCount)
      ? value.pageCount
      : undefined;

  // Nothing identifying → let the caller render nothing.
  if (
    blobKey === undefined &&
    !isRenderableUrl(rawUrl) &&
    fileName === undefined &&
    documentId === undefined
  ) {
    return null;
  }

  const doc: DocumentLike = { blobKey: blobKey ?? "" };
  if (isRenderableUrl(rawUrl)) doc.url = rawUrl;
  if (mimeType !== undefined) doc.mimeType = mimeType;
  if (fileName !== undefined) doc.fileName = fileName;
  if (fileType !== undefined) doc.fileType = fileType;
  if (documentId !== undefined) doc.documentId = documentId;
  if (pageCount !== undefined) doc.pageCount = pageCount;
  return doc;
}

/**
 * Compact, honest summary shown when the value has no directly-renderable
 * image URL (the common case today — the worker stores a blob key / document
 * reference, not a presigned URL). Rendering the actual page image needs a
 * group-scoped blob-serving endpoint (see "Gaps / follow-ups" below); until
 * that lands we surface the file's real metadata instead of a dead
 * "unavailable" box.
 */
function DocumentMetaSummary({ doc }: { doc: DocumentLike }): ReactNode {
  const basename =
    doc.fileName ??
    (doc.blobKey !== "" ? doc.blobKey.split("/").pop() : undefined);
  const typeLabel = doc.mimeType ?? doc.fileType;
  const rows: Array<{ label: string; value: string }> = [];
  if (basename) rows.push({ label: "File", value: basename });
  if (typeLabel) rows.push({ label: "Type", value: typeLabel });
  if (doc.pageCount !== undefined)
    rows.push({ label: "Pages", value: String(doc.pageCount) });
  if (doc.documentId) rows.push({ label: "Document", value: doc.documentId });

  return (
    <Box
      data-testid="document-preview-meta"
      p={8}
      style={{
        border: "1px solid var(--mantine-color-default-border, #2c2e33)",
        borderRadius: 6,
      }}
    >
      <Stack gap={2}>
        {rows.map((r) => (
          <Group key={r.label} gap={6} wrap="nowrap" align="baseline">
            <Text size="10px" c="dimmed" style={{ minWidth: 54 }}>
              {r.label}
            </Text>
            <Text size="xs" style={{ wordBreak: "break-all" }}>
              {r.value}
            </Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
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

  // Nothing identifying in the value → render nothing (no dead "unavailable"
  // box cluttering the canvas).
  if (doc === null) {
    return null;
  }

  // No directly-renderable image URL (the common case — the cache stores a blob
  // key / document reference, not a presigned URL). Show the file's real
  // metadata instead of a broken thumbnail. Rendering the actual page image
  // needs a blob-serving endpoint (see "Gaps / follow-ups").
  if (!isRenderableUrl(doc.url)) {
    return <DocumentMetaSummary doc={doc} />;
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
