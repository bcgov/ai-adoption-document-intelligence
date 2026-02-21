# US-017: Implement Document Split Activity

**As a** developer,
**I want to** have a `document.split` Temporal activity that splits multi-page PDF documents into segments,
**So that** workflow graphs can process large documents by splitting them into manageable segments for parallel OCR and classification.

## Acceptance Criteria
- [ ] **Scenario 1**: Per-page splitting
    - **Given** a 10-page PDF and `strategy: "per-page"`
    - **When** the split activity runs
    - **Then** 10 segments are produced, each containing a single page, with correct `pageRange`, `blobKey`, and `pageCount`

- [ ] **Scenario 2**: Fixed-range splitting
    - **Given** a 23-page PDF and `strategy: "fixed-range"` with `fixedRangeSize: 5`
    - **When** the split activity runs
    - **Then** 5 segments are produced with page ranges 1-5, 6-10, 11-15, 16-20, 21-23

- [ ] **Scenario 3**: Boundary detection splitting
    - **Given** a multi-page PDF and `strategy: "boundary-detection"`
    - **When** the split activity runs
    - **Then** the two-pass approach is applied: quick OCR to extract text, then rule-based heuristics to detect document boundaries (page 1 indicators, blank pages, format changes)

- [ ] **Scenario 4**: Segments are written to blob storage
    - **Given** a source PDF is split
    - **When** each segment is extracted
    - **Then** the segment file is written to the blob storage with a key following the pattern `documents/{documentId}/segments/segment-{NNN}-pages-{start}-{end}.pdf`

- [ ] **Scenario 5**: qpdf is used for PDF extraction
    - **Given** a split operation needs to extract page ranges
    - **When** pages are extracted
    - **Then** `qpdf` CLI is used to create segment files from the source PDF

- [ ] **Scenario 6**: Handles documents up to 2000 pages
    - **Given** a PDF with 2000 pages
    - **When** the split activity runs
    - **Then** the operation completes successfully within the activity timeout, producing the correct number of segments

- [ ] **Scenario 7**: Output conforms to DocumentSegment interface
    - **Given** any split operation
    - **When** the result is returned
    - **Then** each segment in the output array includes `segmentIndex`, `pageRange` (1-based inclusive start/end), `blobKey`, and `pageCount`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/temporal/src/activities/split-document.ts`
- Registered in the activity registry as `document.split`
- Uses `qpdf` (installed as a system dependency) per Section 6.1
- Boundary detection heuristics in Section 6.2: page 1 indicators, blank pages, barcode sheets, format/layout changes
- The `SplitDocumentInput` and `SplitDocumentOutput` interfaces are defined in Section 6.1
- Uses the BlobStorageService (US-016) for reading source and writing segments
- Tests should verify correct splitting for all three strategies and verify the 2000-page upper bound (Section 15.4)
