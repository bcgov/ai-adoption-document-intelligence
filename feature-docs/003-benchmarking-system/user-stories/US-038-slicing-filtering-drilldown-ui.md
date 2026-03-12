# US-038: Slicing, Filtering & Drill-Down UI

**As a** user,
**I want to** filter benchmark results by metadata dimensions and drill down into per-sample details,
**So that** I can understand performance across different document types, languages, and other dimensions.

## Acceptance Criteria
- [ ] **Scenario 1**: Filter by metadata dimensions
    - **Given** a completed benchmark run with samples having metadata
    - **When** the user selects filter values for dimensions (e.g., docType="invoice", language="en")
    - **Then** the results view updates to show metrics computed only for the filtered subset of samples

- [ ] **Scenario 2**: Available filter dimensions
    - **Given** the sample metadata in the dataset
    - **When** the filter panel renders
    - **Then** filter options are dynamically generated from available metadata keys: document type, language, page count ranges, source, and any custom metadata fields

- [ ] **Scenario 3**: Drill-down panels
    - **Given** the filtered results view
    - **When** the user clicks on a specific sample
    - **Then** a drill-down panel opens showing the sample's input file references, workflow output, ground truth, evaluation result, and per-field comparison

- [ ] **Scenario 4**: Per-sample result view
    - **Given** the drill-down panel for a specific sample
    - **When** the panel renders
    - **Then** the user can see: input file preview, prediction output, ground truth, field-by-field comparison with match/mismatch indicators, and the sample's individual metrics

- [ ] **Scenario 5**: Metrics breakdown by dimension
    - **Given** a metadata dimension is selected for slicing
    - **When** the breakdown view renders
    - **Then** a table/chart shows metrics (F1, precision, recall) per value of the selected dimension (e.g., F1 by document type)

- [ ] **Scenario 6**: Pluggable drill-down panels
    - **Given** the drill-down system
    - **When** custom panel components are registered
    - **Then** workflow-specific visualization panels can be added without modifying the core drill-down framework

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/pages/benchmarking/ResultsDrillDownPage.tsx`
- Drill-down data fetched from: `GET /api/benchmark/projects/:id/runs/:runId/drill-down`
- Filtering can be client-side for small datasets or server-side with query parameters for large ones
- See Requirements Section 10.3 (Phase 2 -- Slicing & Filtering, Drill-Down Panels)
- Plugin system for drill-down panels uses React component registry pattern
