# US-028: Dataset Version & Sample Preview UI

**As a** user,
**I want to** view dataset versions, manage their lifecycle, and preview samples,
**So that** I can verify dataset contents and publish versions for use in benchmarks.

## Acceptance Criteria
- [ ] **Scenario 1**: Version list within dataset detail view
    - **Given** a dataset with multiple versions
    - **When** the user views the dataset detail page
    - **Then** a version list is displayed with columns: version label, status (draft/published/archived), document count, git revision (truncated), published date, and created date

- [ ] **Scenario 2**: Publish version action
    - **Given** a dataset version with status `draft`
    - **When** the user clicks the "Publish" action button
    - **Then** the version status transitions to `published` and the UI updates to reflect the new status

- [ ] **Scenario 3**: Archive version action
    - **Given** a dataset version with status `published`
    - **When** the user clicks the "Archive" action button
    - **Then** the version status transitions to `archived` and the UI updates accordingly

- [ ] **Scenario 4**: Sample preview with pagination
    - **Given** a dataset version with samples
    - **When** the user clicks on a version to view its details
    - **Then** a paginated list of samples is displayed showing sample ID, input file references, ground truth preview, and sample metadata

- [ ] **Scenario 5**: Ground truth JSON viewer
    - **Given** a sample with JSON ground truth
    - **When** the user clicks to preview a sample's ground truth
    - **Then** the ground truth JSON is displayed in a formatted, read-only JSON viewer

- [ ] **Scenario 6**: File upload interface
    - **Given** the user is on the dataset detail page
    - **When** the user clicks "Upload Files"
    - **Then** a file upload interface appears allowing drag-and-drop or file picker for documents and ground truth files, with progress indication during upload

- [ ] **Scenario 7**: Status badges with color coding
    - **Given** versions with different statuses
    - **When** the version list is rendered
    - **Then** status badges are color-coded: draft (yellow/warning), published (green/success), archived (gray/muted)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/frontend/src/pages/benchmarking/DatasetDetailPage.tsx`, `apps/frontend/src/components/benchmarking/VersionList.tsx`, `apps/frontend/src/components/benchmarking/SamplePreview.tsx`, `apps/frontend/src/components/benchmarking/FileUpload.tsx`
- Sample preview uses `GET /api/benchmark/datasets/:id/versions/:versionId/samples`
- File upload uses `POST /api/benchmark/datasets/:id/upload` with multipart form data
- See Requirements Section 10.1 (Phase 1 -- Dataset UI)
