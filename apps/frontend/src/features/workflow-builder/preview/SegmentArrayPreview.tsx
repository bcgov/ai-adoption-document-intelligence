/**
 * `SegmentArrayPreview` — region-overlay widget for the `Segment[]`
 * `ArtifactKind` (US-143).
 *
 * Renders the parent document at its display size with one
 * semi-transparent polygon overlay per segment, colour-coded by
 * `segment.kind` (see `segment-kind-colors.ts`). Behaviour:
 *
 *   1. Detect a non-empty array of `Segment` objects (each with a
 *      `parentDocId: string` + `polygon: number[]`). Otherwise render
 *      "No segments to preview".
 *   2. Look up the parent document(s) via the existing `useDocuments()`
 *      hook (no dedicated `useDocument(docId)` helper exists yet; the
 *      hook returns a list and we filter client-side).
 *   3. When the array spans 2+ distinct `parentDocId`s, render a small
 *      `<Select>` at the top that switches which parent to view. Hide
 *      it when all segments share a single parent.
 *   4. When >6 segments are visible for the selected parent, paginate
 *      via Mantine `<Pagination size="xs">` (page size = 6). Active
 *      page's overlays use full-opacity stroke; off-page overlays dim.
 *   5. Each overlay shows a `<Tooltip>` on hover
 *      ("Kind: <kind> · Confidence: <confidence>") and opens a larger
 *      `<Modal>` preview of just that segment's region on click.
 *
 * **Gap notes.** The design doc + story call for a `<BlobImage>`
 * component in `apps/frontend/src/components/document/` and a
 * `useDocument(docId)` helper hook. Neither exists in the codebase
 * today; per the story's "If anything is ambiguous, STOP and report"
 * + the assignment's fallback rule, this widget renders the parent's
 * `file_url` (or `file_path`) via a plain `<img>` and uses the
 * existing `useDocuments()` list-fetch hook. When `BlobImage` /
 * `useDocument` land, swap them in here — the polygon-overlay logic
 * is decoupled from the underlying image renderer.
 *
 * Spec refs:
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/REQUIREMENTS.md L36
 *   - feature-docs/20260531-workflow-builder-phase4-try-in-place/user_stories/US-143-segment-array-preview.md
 *   - docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md §4.3
 */

import {
  Box,
  Modal,
  Pagination,
  Select,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { type ReactElement, useMemo, useState } from "react";

import { useDocuments } from "../../../data/hooks/useDocuments";
import type { Document } from "../../../shared/types";
import { segmentKindColor, segmentKindCssVar } from "./segment-kind-colors";

/** How many segments to render per overlay page. */
export const SEGMENTS_PER_PAGE = 6;

/**
 * Shape this widget recognises. Each entry must carry a `parentDocId`
 * + a numeric `polygon` (flat `[x1, y1, x2, y2, ...]` array — same
 * convention as `Document.boundingRegions[].polygon`). Anything else
 * fails the type-guard and the widget falls back to the empty state.
 */
interface SegmentLike {
  parentDocId: string;
  polygon: number[];
  kind?: string;
  confidence?: number;
}

export interface SegmentArrayPreviewProps {
  /** Raw `ctx.segments` slot from the preview-cache row. Type `unknown` per design doc §4.1. */
  value: unknown;
}

/**
 * Runtime guard for the `Segment[]` shape this widget consumes.
 * Verifies the value is a non-empty array AND every entry has a
 * string `parentDocId` + a numeric `polygon` of even length ≥ 8 (i.e.
 * at least 4 corner points — anything less can't form a 2D region).
 */
function isSegmentArray(value: unknown): value is SegmentLike[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }
  return value.every((entry): entry is SegmentLike => {
    if (entry === null || typeof entry !== "object") {
      return false;
    }
    const record = entry as Record<string, unknown>;
    if (
      typeof record.parentDocId !== "string" ||
      record.parentDocId.length === 0
    ) {
      return false;
    }
    if (!Array.isArray(record.polygon)) {
      return false;
    }
    if (record.polygon.length < 8 || record.polygon.length % 2 !== 0) {
      return false;
    }
    return record.polygon.every(
      (n) => typeof n === "number" && Number.isFinite(n),
    );
  });
}

/**
 * Compute the (minX, minY, maxX, maxY) bounding box of a flat polygon
 * array. Used both for the rect overlay AND the modal's zoomed view.
 */
function polygonBounds(polygon: number[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  let minX = polygon[0];
  let minY = polygon[1];
  let maxX = polygon[0];
  let maxY = polygon[1];
  for (let i = 2; i < polygon.length; i += 2) {
    const x = polygon[i];
    const y = polygon[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Resolve a Document → renderable image URL. Prefers the API-returned
 * `file_url` (signed blob URL), falling back to `file_path` for
 * legacy rows where only the raw key is stored.
 */
function documentImageUrl(doc: Document | undefined): string | null {
  if (!doc) return null;
  if (typeof doc.file_url === "string" && doc.file_url.length > 0) {
    return doc.file_url;
  }
  if (typeof doc.file_path === "string" && doc.file_path.length > 0) {
    return doc.file_path;
  }
  return null;
}

/**
 * Render the empty-state placeholder. Centralised so all the
 * malformed-value paths return an identical surface (matches Scenario
 * 1's "renders 'No segments to preview'" expectation).
 */
function EmptyState(): ReactElement {
  return (
    <Box data-testid="segment-array-preview-empty" p="sm">
      <Text size="sm" c="dimmed">
        No segments to preview
      </Text>
    </Box>
  );
}

export function SegmentArrayPreview({
  value,
}: SegmentArrayPreviewProps): ReactElement {
  // ---------------------------------------------------------------------
  // 1. Shape guard
  // ---------------------------------------------------------------------
  const segments = useMemo(
    () => (isSegmentArray(value) ? value : null),
    [value],
  );

  // ---------------------------------------------------------------------
  // 2. Distinct parent docs + Select state (must be declared before any
  //    early return so hook order stays stable across renders).
  // ---------------------------------------------------------------------
  const parentDocIds = useMemo(() => {
    if (segments === null) return [] as string[];
    return Array.from(new Set(segments.map((s) => s.parentDocId)));
  }, [segments]);

  const [selectedParentDocId, setSelectedParentDocId] = useState<string | null>(
    null,
  );
  const activeParentDocId = selectedParentDocId ?? parentDocIds[0] ?? null;

  // Filter to the currently-selected parent doc.
  const visibleSegments = useMemo(() => {
    if (segments === null || activeParentDocId === null) return [];
    return segments.filter((s) => s.parentDocId === activeParentDocId);
  }, [segments, activeParentDocId]);

  // Pagination
  const [page, setPage] = useState(1);
  const totalPages = Math.max(
    1,
    Math.ceil(visibleSegments.length / SEGMENTS_PER_PAGE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * SEGMENTS_PER_PAGE;
  const pageEnd = pageStart + SEGMENTS_PER_PAGE;

  // Modal state for the click-to-zoom interaction.
  const [modalOpened, modalHandlers] = useDisclosure(false);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number | null>(null);

  // ---------------------------------------------------------------------
  // 3. Parent-doc lookup (always fires; see Gap notes in file header).
  // ---------------------------------------------------------------------
  const { data: documents } = useDocuments();
  const parentDoc = useMemo<Document | undefined>(() => {
    if (activeParentDocId === null || documents === undefined) return undefined;
    return documents.find((d) => d.id === activeParentDocId);
  }, [documents, activeParentDocId]);
  const parentImageUrl = documentImageUrl(parentDoc);

  // ---------------------------------------------------------------------
  // 4. Bail out for malformed input AFTER all hooks have been registered.
  // ---------------------------------------------------------------------
  if (segments === null) {
    return <EmptyState />;
  }

  const showParentSelect = parentDocIds.length > 1;

  const activeSegment =
    activeSegmentIdx !== null ? visibleSegments[activeSegmentIdx] : undefined;
  const activeSegmentBounds =
    activeSegment !== undefined ? polygonBounds(activeSegment.polygon) : null;

  return (
    <Stack
      gap="xs"
      p="sm"
      data-testid="segment-array-preview"
      data-segment-count={segments.length}
      data-parent-doc-id={activeParentDocId ?? ""}
    >
      {showParentSelect ? (
        <Select
          data-testid="segment-array-preview-parent-select"
          size="xs"
          label="Parent document"
          value={activeParentDocId}
          onChange={(next) => {
            setSelectedParentDocId(next);
            setPage(1);
            setActiveSegmentIdx(null);
          }}
          data={parentDocIds.map((id) => {
            const doc = documents?.find((d) => d.id === id);
            return { value: id, label: doc?.title ?? id };
          })}
          allowDeselect={false}
        />
      ) : null}

      <Box
        data-testid="segment-array-preview-canvas"
        style={{ position: "relative", maxWidth: "100%" }}
      >
        {parentImageUrl !== null ? (
          <img
            src={parentImageUrl}
            alt={parentDoc?.title ?? "Parent document"}
            data-testid="segment-array-preview-parent-image"
            style={{
              display: "block",
              maxWidth: "100%",
              height: "auto",
              border: "1px solid var(--mantine-color-gray-3)",
            }}
          />
        ) : (
          <Box
            data-testid="segment-array-preview-no-parent"
            p="md"
            style={{
              border: "1px dashed var(--mantine-color-gray-4)",
              borderRadius: 4,
              minHeight: 80,
            }}
          >
            <Text size="xs" c="dimmed">
              No parent doc available
            </Text>
          </Box>
        )}

        {parentImageUrl !== null ? (
          <Box
            data-testid="segment-array-preview-overlay-layer"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            {visibleSegments.map((segment, idx) => {
              const onCurrentPage = idx >= pageStart && idx < pageEnd;
              const color = segmentKindColor(segment.kind);
              const bounds = polygonBounds(segment.polygon);
              const width = bounds.maxX - bounds.minX;
              const height = bounds.maxY - bounds.minY;
              const stroke = segmentKindCssVar(color, 6);
              const fill = segmentKindCssVar(color, 4);
              const tooltipKind = segment.kind ?? "Unknown";
              const tooltipConfidence =
                typeof segment.confidence === "number"
                  ? segment.confidence.toFixed(2)
                  : "—";
              const fillOpacity = onCurrentPage ? 0.25 : 0.05;
              const strokeOpacity = onCurrentPage ? 1 : 0.25;
              const handleClick = (): void => {
                setActiveSegmentIdx(idx);
                modalHandlers.open();
              };
              const handleKeyDown = (event: React.KeyboardEvent): void => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleClick();
                }
              };
              return (
                <Tooltip
                  key={`${idx}-${segment.kind ?? "Unknown"}`}
                  label={`Kind: ${tooltipKind} · Confidence: ${tooltipConfidence}`}
                  withinPortal
                  withArrow
                  onClick={handleClick}
                >
                  <Box
                    component="button"
                    type="button"
                    data-testid={`segment-array-preview-overlay-${idx}`}
                    data-kind={segment.kind ?? "Unknown"}
                    data-on-current-page={onCurrentPage ? "true" : "false"}
                    data-stroke-color={color}
                    data-fill-opacity={fillOpacity}
                    data-stroke-opacity={strokeOpacity}
                    aria-label={`Segment ${idx + 1}: ${tooltipKind}`}
                    onKeyDown={handleKeyDown}
                    style={{
                      position: "absolute",
                      left: bounds.minX,
                      top: bounds.minY,
                      width,
                      height,
                      // Reduced overall opacity dims both the border AND
                      // the background when this overlay is off-page.
                      // On-page overlays get fillOpacity=0.25 directly
                      // through alpha-blending the background colour;
                      // off-page overlays scale to 0.05/0.25 of that.
                      opacity: onCurrentPage ? 1 : fillOpacity / 0.25,
                      border: `2px solid ${stroke}`,
                      borderColor: stroke,
                      backgroundColor: fill,
                      padding: 0,
                      margin: 0,
                      cursor: "pointer",
                      pointerEvents: "auto",
                      boxSizing: "border-box",
                    }}
                  />
                </Tooltip>
              );
            })}
          </Box>
        ) : null}
      </Box>

      {totalPages > 1 ? (
        <Pagination
          data-testid="segment-array-preview-pagination"
          size="xs"
          value={currentPage}
          onChange={setPage}
          total={totalPages}
        />
      ) : null}

      <Modal
        data-testid="segment-array-preview-modal"
        opened={modalOpened}
        onClose={() => {
          modalHandlers.close();
          setActiveSegmentIdx(null);
        }}
        title={
          activeSegment !== undefined
            ? `Segment — ${activeSegment.kind ?? "Unknown"}`
            : "Segment"
        }
        size="lg"
        centered
      >
        {activeSegment !== undefined && activeSegmentBounds !== null ? (
          <Stack gap="xs">
            <Text size="sm">
              Kind:{" "}
              <Text component="span" fw={600}>
                {activeSegment.kind ?? "Unknown"}
              </Text>
            </Text>
            <Text size="sm">
              Confidence:{" "}
              <Text component="span" fw={600}>
                {typeof activeSegment.confidence === "number"
                  ? activeSegment.confidence.toFixed(2)
                  : "—"}
              </Text>
            </Text>
            <Box
              data-testid="segment-array-preview-modal-zoom"
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: `${Math.max(1, activeSegmentBounds.maxX - activeSegmentBounds.minX)} / ${Math.max(1, activeSegmentBounds.maxY - activeSegmentBounds.minY)}`,
                overflow: "hidden",
                border: "1px solid var(--mantine-color-gray-3)",
              }}
            >
              {parentImageUrl !== null ? (
                <img
                  src={parentImageUrl}
                  alt={`Segment ${activeSegment.kind ?? "Unknown"}`}
                  style={{
                    position: "absolute",
                    // Translate so the segment's top-left corner sits at
                    // the modal viewport origin; the aspect-ratio above
                    // crops everything outside the segment bounds.
                    left: `-${activeSegmentBounds.minX}px`,
                    top: `-${activeSegmentBounds.minY}px`,
                    maxWidth: "none",
                  }}
                />
              ) : null}
            </Box>
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
