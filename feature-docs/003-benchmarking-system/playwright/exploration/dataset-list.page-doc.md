# Page: Dataset List

**URL Pattern**: `/benchmarking/datasets`
**Purpose**: Display all benchmark datasets and provide interface to create new datasets

## Key Elements

### Navigation
- **Benchmarking Nav**: `[data-testid="benchmarking-nav"]` - Expands benchmarking submenu
- **Datasets Link**: `[data-testid="datasets-nav-link"]` - Navigates to dataset list page

### Header Section
- **Header Container**: `[data-testid="datasets-header"]` - Contains title and create button
- **Page Title**: `heading "Datasets"` - Main page heading
- **Page Description**: `"Manage benchmark datasets and versions"` - Subtitle text
- **Create Button**: `[data-testid="create-dataset-btn"]` - Opens create dataset dialog

### Empty State (when no datasets exist)
- **Empty State Card**: `[data-testid="datasets-empty-state"]` - Displayed when datasets.length === 0
- **Empty Icon**: `IconDatabase` - Database icon
- **Empty Message**: `"No datasets yet"` - Main message
- **Empty Submessage**: `"Create your first benchmark dataset to get started"` - Guidance text
- **Create Button**: `[data-testid="create-dataset-empty-btn"]` - Opens create dialog from empty state

### Datasets Table (when datasets exist)
- **Table**: `[data-testid="datasets-table"]` - Main table element
- **Table Headers**:
  - Name
  - Description
  - Version Count
  - Created Date
- **Dataset Rows**: `[data-testid="dataset-row-{datasetId}"]` - Each row is clickable
  - **Name Cell**: Dataset name (bold text)
  - **Description Cell**: Dataset description or "—" if empty (dimmed, truncated to 1 line)
  - **Version Count**: Number of versions (defaults to 0)
  - **Created Date**: Formatted as locale date string

### Create Dataset Dialog
- **Dialog**: `[data-testid="create-dataset-dialog"]` - Modal dialog
- **Dialog Title**: `"Create New Dataset"` - Modal header
- **Close Button**: X icon button in header - Closes dialog and resets form

#### Form Fields
- **Name Input**: `[data-testid="dataset-name-input"]` - Required text input
  - Placeholder: "Enter dataset name"
  - Error: "Dataset name is required" (displayed below field when empty on submit)
- **Description Input**: `[data-testid="dataset-description-input"]` - Optional textarea
  - Placeholder: "Enter dataset description (optional)"
  - Rows: 3
- **Repository URL Input**: `[data-testid="dataset-repository-url-input"]` - Required text input
  - Placeholder: "Enter DVC repository URL"
  - Error: "Repository URL is required" (displayed below field when empty on submit)
  - Supports tilde paths: `~/path/to/repo`
  - Supports file:// URLs: `file://~/path/to/repo`
  - Supports remote URLs: `https://github.com/org/repo.git`

#### Metadata Section
- **Metadata Container**: `[data-testid="dataset-metadata-section"]` - Contains all metadata UI
- **Metadata Label**: `"Metadata (optional)"` - Section label
- **Metadata Items**: `[data-testid="metadata-item-{key}"]` - Each added metadata entry
  - Format: `{key}: {value}` (key is bold)
  - **Remove Button**: `[data-testid="remove-metadata-{key}-btn"]` - Removes the metadata entry
- **Metadata Key Input**: `[data-testid="metadata-key-input"]` - Text input for key
  - Placeholder: "Key"
  - Cleared after adding
- **Metadata Value Input**: `[data-testid="metadata-value-input"]` - Text input for value
  - Placeholder: "Value"
  - Cleared after adding
- **Add Metadata Button**: `[data-testid="add-metadata-btn"]` - Adds key-value pair
  - Disabled when key or value is empty

#### Action Buttons
- **Cancel Button**: `[data-testid="cancel-dataset-btn"]` - Closes dialog without saving
  - Disabled when form is submitting
  - Resets all form fields
- **Submit Button**: `[data-testid="submit-dataset-btn"]` - Creates dataset
  - Text: "Create Dataset"
  - Shows loading spinner when `isCreating` is true
  - Validates required fields before submission

## State Behaviors

### Loading State
- **Loading Indicator**: `<Loader size="lg" />` - Centered loader shown while fetching datasets
- Displayed at center of viewport (h="70vh")

### Validation
- **Name validation**: Shows error message below field when empty and submit is clicked
- **Repository URL validation**: Shows error message below field when empty and submit is clicked
- **Metadata validation**: Add button disabled until both key and value have non-empty trimmed values
- **Error persistence**: Errors remain visible until field is corrected
- **Error clearing**: Errors clear automatically when user types valid input

### Form State
- **Form reset on close**: All fields cleared when dialog is closed (via Cancel, X, or after successful creation)
- **Metadata management**: Metadata entries can be added/removed dynamically
- **Field trimming**: Name, description, and repository URL are trimmed before submission

### Table Interaction
- **Row hover**: Table rows highlight on hover
- **Row click**: Clicking any part of a row navigates to `/benchmarking/datasets/{datasetId}`
- **Cursor**: Rows show pointer cursor to indicate clickability

## Navigation Flows
- **To Dataset Detail**: Click any dataset row → navigates to `/benchmarking/datasets/{datasetId}`
- **From Benchmarking Menu**: Sidebar "Benchmarking" → expand → "Datasets" → dataset list page
- **Dialog Open**: Click "Create Dataset" button (header or empty state) → dialog opens
- **Dialog Close**: Click Cancel, X button, or create dataset successfully → dialog closes

## API Interactions
- **GET Datasets**: Fetches list on page load via `useDatasets()` hook
- **POST Create Dataset**: Submits form data to create new dataset
  - Payload: `{ name, description?, metadata?, repositoryUrl }`
  - On success: Dialog closes, list refreshes, new dataset appears in table
  - On error: Dialog remains open with user data preserved (per test plan scenario 11)

## Notes
- Table uses striped and highlight-on-hover styles
- Empty description shows "—" in table
- Version count defaults to 0 if not provided
- Created date formatted using `toLocaleDateString()`
- All trimmed fields exclude leading/trailing whitespace
- Metadata is optional and only included if at least one key-value pair exists
