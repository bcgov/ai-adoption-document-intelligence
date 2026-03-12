# US-027: Dataset List & Create UI

**As a** user,
**I want to** view a list of datasets and create new ones through the UI,
**So that** I can manage evaluation datasets without needing to use the API directly.

## Acceptance Criteria
- [ ] **Scenario 1**: Dataset list page displays all datasets
    - **Given** datasets exist in the system
    - **When** the user navigates to `/benchmarking/datasets`
    - **Then** a table is displayed with columns: name, description, version count, created date, and action buttons

- [ ] **Scenario 2**: Create dataset dialog
    - **Given** the user is on the dataset list page
    - **When** the user clicks the "Create Dataset" button
    - **Then** a dialog/form appears with fields for name (required), description (optional), and metadata fields (key-value pairs)

- [ ] **Scenario 3**: Dataset is created successfully
    - **Given** the create dataset form is filled with valid data
    - **When** the user submits the form
    - **Then** the dataset is created via `POST /api/benchmark/datasets`, the dialog closes, and the dataset list refreshes to show the new dataset

- [ ] **Scenario 4**: Validation errors are displayed
    - **Given** the create dataset form is submitted without a name
    - **When** validation runs
    - **Then** an error message is displayed on the name field indicating it is required

- [ ] **Scenario 5**: Dataset detail view navigation
    - **Given** the dataset list is displayed
    - **When** the user clicks on a dataset row or name
    - **Then** the user is navigated to the dataset detail page (`/benchmarking/datasets/:id`) showing versions and metadata

- [ ] **Scenario 6**: Empty state
    - **Given** no datasets exist
    - **When** the user navigates to `/benchmarking/datasets`
    - **Then** an empty state message is displayed with a prompt to create the first dataset

- [ ] **Scenario 7**: Loading state
    - **Given** datasets are being fetched from the API
    - **When** the page loads
    - **Then** a loading indicator is displayed until the data arrives

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/frontend/src/pages/benchmarking/DatasetListPage.tsx`, `apps/frontend/src/components/benchmarking/CreateDatasetDialog.tsx`
- API hooks for dataset CRUD operations
- Uses existing UI component library/patterns from the frontend app
- See Requirements Section 10.1 (Phase 1 -- Dataset UI)
