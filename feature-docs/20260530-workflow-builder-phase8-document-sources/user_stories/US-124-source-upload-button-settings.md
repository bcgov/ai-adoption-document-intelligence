# US-124: `SourceUploadButton` on `source.upload` settings panel

**As a** workflow author who just configured a `source.upload` node,
**I want** a "Test upload" button on the source.upload settings panel,
**So that** I can verify the upload constraints (MIME / size / ctxKey) by picking a file right from the canvas-side panel without opening the Run drawer.

## Acceptance Criteria

- [x] **Scenario 1**: Button visible only on `source.upload` panel
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.tsx` (new) and `SourceNodeSettings.tsx` (US-119)
    - **When** the settings panel renders for a `source.upload` node
    - **Then** a "Test upload" button appears below the parameters form
    - **And** for `source.api` (or any other source subtype future-shipped), the button is NOT rendered

- [x] **Scenario 2**: Clicking opens OS file picker + POSTs via `useSourceUpload`
    - **Given** the button rendered for a saved source.upload node
    - **When** the user clicks the button
    - **Then** an OS file picker opens (`<input type="file" accept={parameters.allowedMimeTypes.join(",")} />` programmatically clicked)
    - **And** selecting a file calls `useSourceUpload(workflowId, sourceNodeId).mutateAsync(file)` from US-122
    - **And** while in-flight, the button shows a `<Loader size="xs" />` + is disabled

- [x] **Scenario 3**: Success surface
    - **Given** the upload returns `{ "documentUrl": "<blob URL>" }` (or whichever ctxKey is configured)
    - **When** the mutation resolves
    - **Then** the button section shows a green `<Alert>` displaying the ctxKey + URL in a `<Code>` block + a copy button
    - **And** a Mantine notification fires: "Test upload succeeded — workflow can now use this URL via the Run drawer"
    - **And** the Run drawer's Upload section (US-123) does NOT auto-open; this is a settings-panel-side test only

- [x] **Scenario 4**: 4xx surface
    - **Given** the upload returns 400 (e.g. MIME mismatch) or 413 (oversized)
    - **When** the mutation errors out
    - **Then** the button section shows a red `<Alert>` with the backend's error message + status code
    - **And** the button re-enables for retry

- [x] **Scenario 5**: Button disabled when source.upload node is unsaved
    - **Given** the user drops a NEW source.upload node and opens its settings panel before saving
    - **When** the button renders
    - **Then** it's disabled with tooltip "Save the workflow first" (mirrors the existing pattern for Phase 2 Track 3's History button in create mode)
    - **And** once the workflow is saved (the source has a stable id known to the backend), the button enables

- [x] **Scenario 6**: Frontend vitest coverage
    - **Given** `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.test.tsx` (new)
    - **When** the test runs
    - **Then** Scenarios 1–5 are asserted (visibility, picker open, mutation invocation, success Alert + notification, error Alert, disabled state)
    - **And** SourceNodeSettings.test.tsx is extended to assert the button is present for source.upload + absent for source.api

## Priority
- [x] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.tsx` — new
- `apps/frontend/src/features/workflow-builder/sources/SourceUploadButton.test.tsx` — new
- `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.tsx` — render `<SourceUploadButton>` conditionally below the parameters form when `node.sourceType === "source.upload"`
- `apps/frontend/src/features/workflow-builder/sources/SourceNodeSettings.test.tsx` — extend with the source.api-vs-source.upload button-visibility assertion

## Technical notes

- The file picker is implemented as a hidden `<input type="file">` triggered by `inputRef.current?.click()` — standard pattern, matches how the existing JSON workflow editor's "Open file" button works.
- The MIME `accept` attribute is `parameters.allowedMimeTypes.join(",")`. For glob entries like `"image/*"` the browser handles them natively; no JS glob expansion needed.
- This story closes Milestone E. After US-124 lands, the click-and-play surface for Phase 8 is complete; Milestone F's Playwright walkthrough (US-125) is the verification.
- Surface for Alex: drop source.upload → save → click Test upload → pick a PDF → see the green Alert with the documentUrl + copy button. This is what makes Phase 8 feel "done" from the user's POV before the canvas-side Run drawer scenarios are exercised.
