# Test Plan: US-027 - Dataset List & Create UI

**Source**: `user-stories/US-027-dataset-list-create-ui.md`
**Requirement Section**: Section 10.1 (Phase 1 -- Dataset UI)
**Priority**: High

## User Story
**As a** user,
**I want to** view a list of datasets and create new ones through the UI,
**So that** I can manage evaluation datasets without needing to use the API directly.

## Acceptance Criteria
- Dataset list page displays all datasets
- Create dataset dialog
- Dataset is created successfully
- Validation errors are displayed
- Dataset detail view navigation
- Empty state
- Loading state

## Test Scenarios

### Scenario 1: Dataset List Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Multiple datasets exist in the system
**When**: User navigates to `/benchmarking/datasets`
**Then**:
- Table is displayed with columns: name, description, version count, created date
- Action buttons are visible for each dataset
- All dataset data is correctly displayed
- Table is sortable by columns

**Affected Pages**: Dataset list page
**Data Requirements**: At least 3-5 datasets with varying data
**Prerequisites**: User logged in, datasets created via API

### Scenario 2: Open Create Dataset Dialog
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on the dataset list page
**When**: User clicks the "Create Dataset" button
**Then**:
- Dialog/modal appears
- Form fields are visible: name (required), description (optional), metadata fields
- Submit and Cancel buttons are present
- Name field is focused

**Affected Pages**: Dataset list page (modal overlay)
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 3: Create Dataset Success
- **Type**: Happy Path
- **Priority**: High

**Given**: Create dataset dialog is open
**When**: User fills in name "Test Dataset", description "Test description", and submits
**Then**:
- POST request to `/api/benchmark/datasets` is sent with correct data
- Dialog closes
- Success notification appears
- Dataset list refreshes showing the new dataset
- New dataset appears at the top/bottom of the list

**Affected Pages**: Dataset list page
**Data Requirements**: Valid dataset name and description
**Prerequisites**: User logged in, API endpoint available

### Scenario 4: Create Dataset with Metadata
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Create dataset dialog is open
**When**: User adds metadata key-value pairs (e.g., "domain": "invoices", "language": "en") and submits
**Then**:
- Dataset is created with metadata included in POST request
- Metadata is displayed in the dataset list or detail view
- Dialog closes successfully

**Affected Pages**: Dataset list page
**Data Requirements**: Valid metadata key-value pairs
**Prerequisites**: User logged in

### Scenario 5: Validation - Missing Required Name
- **Type**: Error Case
- **Priority**: High

**Given**: Create dataset dialog is open
**When**: User leaves name field empty and clicks submit
**Then**:
- Error message appears on the name field: "Name is required"
- Form does not submit
- Dialog remains open
- Other fields retain their values

**Affected Pages**: Dataset list page (dialog)
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 6: Validation - Name Too Long
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Create dataset dialog is open
**When**: User enters a name with 300 characters and submits
**Then**:
- Error message appears: "Name must be less than X characters"
- Form does not submit
- User can edit the name

**Affected Pages**: Dataset list page (dialog)
**Data Requirements**: Very long string (300+ chars)
**Prerequisites**: User logged in

### Scenario 7: Cancel Dialog
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Create dataset dialog is open with partial data entered
**When**: User clicks Cancel or X button
**Then**:
- Dialog closes
- No dataset is created
- Dataset list remains unchanged
- Form data is discarded

**Affected Pages**: Dataset list page
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 8: Navigate to Dataset Detail
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset list is displayed with multiple datasets
**When**: User clicks on a dataset row or name
**Then**:
- Navigation to `/benchmarking/datasets/{datasetId}` occurs
- Dataset detail page loads
- Page shows dataset metadata, versions, and sample preview

**Affected Pages**: Dataset list, Dataset detail pages
**Data Requirements**: At least one dataset
**Prerequisites**: User logged in

### Scenario 9: Empty State Display
- **Type**: Happy Path
- **Priority**: High

**Given**: No datasets exist in the system
**When**: User navigates to `/benchmarking/datasets`
**Then**:
- Empty state message is displayed
- Message prompts user to create the first dataset
- "Create Dataset" button is visible and functional
- No table is shown

**Affected Pages**: Dataset list page
**Data Requirements**: Empty database (no datasets)
**Prerequisites**: User logged in

### Scenario 10: Loading State
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User navigates to `/benchmarking/datasets`
**When**: Data is being fetched from the API
**Then**:
- Loading spinner/skeleton is displayed
- Loading indicator disappears when data loads
- No flash of empty state before data appears

**Affected Pages**: Dataset list page
**Data Requirements**: Simulated slow API response
**Prerequisites**: User logged in

### Scenario 11: API Error Handling
- **Type**: Error Case
- **Priority**: High

**Given**: User attempts to create a dataset
**When**: API returns a 500 error
**Then**:
- Error notification is displayed with helpful message
- Dialog remains open with user's data preserved
- User can retry submission
- Dataset list does not update

**Affected Pages**: Dataset list page (dialog)
**Data Requirements**: Simulated API error
**Prerequisites**: User logged in

### Scenario 12: Duplicate Dataset Name
- **Type**: Edge Case
- **Priority**: Medium

**Given**: A dataset named "Production Data" exists
**When**: User tries to create another dataset with the same name
**Then**:
- Either creation succeeds (if duplicates allowed) OR
- Error message indicates name must be unique
- Behavior matches backend validation rules

**Affected Pages**: Dataset list page (dialog)
**Data Requirements**: Existing dataset with known name
**Prerequisites**: User logged in

### Scenario 13: Pagination (if implemented)
- **Type**: Happy Path
- **Priority**: Low

**Given**: More than 20 datasets exist
**When**: User is on the dataset list page
**Then**:
- Pagination controls are visible
- Only first page of results is displayed
- User can navigate between pages
- Page size selector is available (optional)

**Affected Pages**: Dataset list page
**Data Requirements**: 50+ datasets
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (list display, create, navigate)
- ✅ Edge cases covered (validation, long names, duplicates)
- ✅ Error handling covered (API errors, required fields)
- ✅ Empty and loading states covered
- ⚠️ Missing: Concurrent user creation scenarios
- ⚠️ Missing: Performance with very large dataset lists (1000+)
