# US-039: In-App Artifact Viewer

**As a** user,
**I want to** view benchmark artifacts directly in the application,
**So that** I can inspect outputs, diffs, and reports without switching to the MLflow UI for common artifact types.

## Acceptance Criteria
- [ ] **Scenario 1**: View JSON artifacts
    - **Given** a benchmark artifact of type JSON
    - **When** the user clicks on the artifact
    - **Then** the JSON content is displayed in a formatted, syntax-highlighted, read-only viewer

- [ ] **Scenario 2**: View image artifacts
    - **Given** a benchmark artifact of type image (JPEG, PNG)
    - **When** the user clicks on the artifact
    - **Then** the image is displayed inline with zoom and pan controls

- [ ] **Scenario 3**: View PDF artifacts
    - **Given** a benchmark artifact of type PDF
    - **When** the user clicks on the artifact
    - **Then** the PDF is rendered in an embedded viewer

- [ ] **Scenario 4**: View text artifacts
    - **Given** a benchmark artifact of type text (plain text, CSV, log files)
    - **When** the user clicks on the artifact
    - **Then** the text content is displayed with line numbers and optional word wrap

- [ ] **Scenario 5**: Diff viewer for comparison artifacts
    - **Given** a diff_report artifact containing before/after comparison
    - **When** the user clicks on the artifact
    - **Then** a side-by-side or inline diff viewer shows the differences with color-coded additions, deletions, and modifications

- [ ] **Scenario 6**: Deep-links to MLflow artifacts
    - **Given** an artifact stored in the MLflow artifact store
    - **When** the user clicks "Open in MLflow"
    - **Then** the MLflow UI opens at the specific artifact path for the run

- [ ] **Scenario 7**: Download artifact
    - **Given** any artifact type
    - **When** the user clicks "Download"
    - **Then** the artifact file is downloaded to the user's machine

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/components/benchmarking/ArtifactViewer.tsx`
- Artifacts are fetched from MinIO via the backend proxy (or directly if CORS allows)
- JSON viewer can reuse existing JSON editor component in read-only mode
- PDF viewer can use `react-pdf` or similar library
- Diff viewer can use `react-diff-viewer` or similar library
- See Requirements Section 10.3 (Phase 2 -- Artifact Viewer)
- MLflow artifact deep-link format: `http://localhost:5000/#/experiments/{expId}/runs/{runId}/artifacts/{artifactPath}`
