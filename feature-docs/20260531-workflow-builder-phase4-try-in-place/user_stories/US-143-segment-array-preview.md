# US-143: `SegmentArrayPreview` widget

**As a** user iterating on a segmenting workflow (`document.split`, `document.splitAndClassify`, etc.),
**I want** the preview pane under a `Segment[]`-producing node to show the parent document with semi-transparent polygon overlays colour-coded by segment kind,
**So that** I can see at a glance which regions were segmented and how they're classified — the "paging" surface from NOTES.md §1.5.

## Acceptance Criteria

- [ ] **Scenario 1**: Component signature + base render
    - **Given** `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.tsx` (new file)
    - **When** read
    - **Then** it exports `function SegmentArrayPreview({ value }: { value: unknown })`
    - **And** when `value` is an array of Segment objects (each with `parentDocId` + `polygon`), it renders the segments
    - **And** when `value` is malformed (not an array, empty, or missing required fields), it renders "No segments to preview"

- [ ] **Scenario 2**: Parent document rendered at display size with overlays
    - **Given** an array of segments all referencing the same `parentDocId`
    - **When** rendered
    - **Then** the parent document's first page renders via `<BlobImage>` (looked up by `parentDocId`)
    - **And** each segment's `polygon` overlays as a semi-transparent box (`fillOpacity: 0.25`, `stroke`: `kindColor(segment.kind)`)
    - **And** the colour palette matches Phase 3 §1: Text→gray, Table→blue, Figure→violet, Form→green, KeyValue→amber, Signature→pink, Header→teal

- [ ] **Scenario 3**: Segment pagination — > 6 segments
    - **Given** an array with 12 segments
    - **When** rendered
    - **Then** the first 6 overlays render together
    - **And** a small `<Pagination size="xs">` control at the bottom cycles through pages of 6 segments
    - **And** the active page's segments highlight (full opacity stroke); other pages dim

- [ ] **Scenario 4**: Mixed parent documents
    - **Given** an array where segments reference 2+ distinct `parentDocId` values
    - **When** rendered
    - **Then** a small `<Select>` at the top of the widget lets the user switch which parent doc to view
    - **And** only segments matching the selected parent doc render as overlays
    - **And** the Select is hidden when all segments share a single parent doc

- [ ] **Scenario 5**: Hover tooltip on each overlay
    - **Given** a rendered segment overlay
    - **When** hovered
    - **Then** a Mantine `<Tooltip>` shows `Kind: <segment.kind> · Confidence: <segment.confidence?.toFixed(2)>`
    - **And** clicking the overlay opens a larger modal preview of just that segment's region (reuses the modal pattern from US-142 Scenario 5 if helpful)

- [ ] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.test.tsx`
    - **When** tests run
    - **Then** at least 5 cases pass: single-parent renders overlays, pagination renders on 7+ segments, multi-parent shows Select, kind→colour mapping verified for each of the 7 kinds, malformed value falls back to "No segments to preview"

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/preview/SegmentArrayPreview.test.tsx` — tests
- `apps/frontend/src/features/workflow-builder/preview/segment-kind-colors.ts` — small palette helper shared with Phase 3's existing segment-colour code where possible

## Technical notes

- Overlay rendering: a wrapping `<div style={{ position: "relative" }}>` containing the `<BlobImage>` at known dimensions, with absolutely-positioned `<svg>` rectangles per segment polygon. Polygon coordinates are in image-space (pixels relative to the source page); the wrapper scales them with CSS transforms.
- The parent document lookup: a segment's `parentDocId` is the canonical doc id; fetch its `blobKey` via the existing `useDocument(docId)` hook (Phase 1A) or a thin wrapper. If multiple segments reference the same parent, dedupe to one fetch.
- Phase 5 (segmentation node pack) will produce richer Segment artifacts that this widget already handles. No Phase 4 work needs to anticipate Phase 5.
- After landing: no Vite restart (frontend-only).
