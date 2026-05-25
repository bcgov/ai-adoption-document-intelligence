# US-142: `DocumentPreview` widget

**As a** user iterating on a workflow with Document-producing nodes,
**I want** a paginated thumbnail strip showing the document's pages under each node that outputs a Document,
**So that** I can verify the document looks right (correct page count, orientation, etc.) without leaving the canvas.

## Acceptance Criteria

- [ ] **Scenario 1**: Component signature + base render
    - **Given** `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.tsx` (new file)
    - **When** read
    - **Then** it exports `function DocumentPreview({ value }: { value: unknown })`
    - **And** when `value` is a Document object (has `blobKey: string`), it renders the document
    - **And** when `value` is malformed or missing `blobKey`, it renders a small "Document unavailable" placeholder

- [ ] **Scenario 2**: MultiPageDocument — first page large + horizontal strip
    - **Given** a value with `mimeType: "application/pdf"` AND `pageCount: 5`
    - **When** rendered
    - **Then** the first page renders as a large thumbnail (max 160px high)
    - **And** below it, a horizontal scroll strip shows pages 2 → 5 as small thumbnails (max 60px high)
    - **And** if `pageCount > 9`, the strip is capped at 8 visible thumbnails with a small "+N more" chip at the end

- [ ] **Scenario 3**: SinglePageDocument — one large thumbnail
    - **Given** a value with `pageCount: 1` OR `mimeType: "image/*"`
    - **When** rendered
    - **Then** a single large thumbnail renders (max 160px high)
    - **And** no horizontal strip

- [ ] **Scenario 4**: Reuses existing `<BlobImage>` component
    - **Given** `apps/frontend/src/components/document/BlobImage.tsx` (existing)
    - **When** the new widget is read
    - **Then** thumbnails are rendered via `<BlobImage blobKey={value.blobKey} page={i} />` — no new image-fetching code
    - **And** the existing `<BlobImage>` loading + error states surface through (Skeleton during fetch, "Unavailable" on 404)

- [ ] **Scenario 5**: Click large thumbnail → full-size modal
    - **Given** the large thumbnail
    - **When** clicked
    - **Then** a Mantine `<Modal size="80%">` opens with the page rendered at full size
    - **And** if multi-page, the modal has prev/next page-navigation arrows
    - **And** the modal's existing pattern from `DocumentViewerModal.tsx` is reused if possible (or a thin new Modal — implementer's call)

- [ ] **Scenario 6**: Component test
    - **Given** `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.test.tsx`
    - **When** tests run
    - **Then** at least 4 cases pass: multi-page renders strip, single-page renders one thumbnail, malformed value renders placeholder, click opens modal

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/preview/DocumentPreview.test.tsx` — tests

## Technical notes

- The Document shape in ctx is (typically): `{ blobKey: string, mimeType?: string, pageCount?: number, url?: string, ... }`. If `pageCount` is absent, infer single-page from `mimeType.startsWith("image/")` OR fall back to single-page.
- `<BlobImage>` already handles the per-org blob bucket convention and presigned URLs — no auth wiring needed here.
- This widget mounts INSIDE `PreviewWidget`'s `maxH={200}` constraint — the large thumbnail is capped at 160px so the strip + thumbnail fit together.
- After landing: no Vite restart (frontend-only).
