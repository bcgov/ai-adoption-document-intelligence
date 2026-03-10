# Page: Split Management (Dataset Version Detail - Splits Tab)
**URL Pattern**: `/benchmarking/datasets/:datasetId` (within Splits tab after selecting a version)
**Purpose**: Create, edit, and freeze dataset splits for organizing samples into train/val/test/golden sets

## Key Elements

### Header Section
- **Section Title**: `[data-testid="splits-title"]` - h3 heading "Dataset Splits"
- **Create Split Button**: `[data-testid="create-split-btn"]` - primary action button to open create split dialog

### Splits Table
- **Table Card**: `[data-testid="splits-table-card"]` - card container with border
- **Table**: `[data-testid="splits-table"]` - striped table with hover highlighting
- **Table Columns**: Name | Type | Samples | Status | Created | Actions
- **Split Row**: `[data-testid="split-row-{splitId}"]` - one row per split
- **Split Name**: `[data-testid="split-name-{splitId}"]` - split name text
- **Type Badge**: `[data-testid="split-type-badge-{splitId}"]` - color-coded badge showing split type
  - **train**: blue badge
  - **val**: cyan badge
  - **test**: grape/purple badge
  - **golden**: yellow badge
- **Sample Count**: `[data-testid="split-sample-count-{splitId}"]` - number of samples in split
- **Status Badge**: `[data-testid="split-status-badge-{splitId}"]` - shows frozen or editable status
  - **Frozen**: gray badge
  - **Editable**: green badge
- **Created Date**: `[data-testid="split-created-{splitId}"]` - formatted date (e.g., "1/9/2026")
- **Edit Button**: `[data-testid="edit-split-btn-{splitId}"]` - appears only for unfrozen splits
- **Freeze Button**: `[data-testid="freeze-split-btn-{splitId}"]` - appears only for unfrozen golden splits

### Empty State
- **Empty State Card**: `[data-testid="splits-empty-state"]` - displayed when no splits exist
- **Empty Message**: `[data-testid="no-splits-message"]` - text "No splits defined yet"
- **Create First Split Button**: `[data-testid="create-first-split-btn"]` - alternative create button in empty state

### Create Split Dialog
- **Dialog**: `[data-testid="create-split-dialog"]` - modal dialog with "Create Split" title (size: lg)
- **Split Name Input**: `[data-testid="split-name-input"]` - required text input
  - Placeholder: "e.g., train-v1, golden-regression"
- **Split Type Select**: `[data-testid="split-type-select"]` - required dropdown
  - Options: Train, Validation, Test, Golden Regression
  - Default: Train
- **Samples MultiSelect**: `[data-testid="split-samples-multiselect"]` - required multi-select dropdown
  - Searchable
  - Shows all available samples from the dataset version
- **Selected Count**: `[data-testid="selected-samples-count"]` - displays "Selected X of Y samples"
- **Error Message**: `[data-testid="create-split-error"]` - shown when submission fails
- **Cancel Button**: `[data-testid="create-split-cancel-btn"]` - closes dialog without creating
- **Submit Button**: `[data-testid="create-split-submit-btn"]` - creates the split

### Edit Split Dialog
- **Dialog**: `[data-testid="edit-split-dialog"]` - modal dialog with "Edit Split: {name}" title (size: lg)
- **Type Badge**: `[data-testid="edit-split-type-badge"]` - shows split type (non-editable)
- **Current Count**: `[data-testid="edit-split-current-count"]` - displays current sample count
- **Samples MultiSelect**: `[data-testid="edit-split-samples-multiselect"]` - update sample selection
  - Searchable
  - Pre-populated with current sample IDs (in real implementation)
- **Selected Count**: `[data-testid="edit-split-selected-count"]` - displays selected count
- **Error Message**: `[data-testid="edit-split-error"]` - shown when update fails
- **Cancel Button**: `[data-testid="edit-split-cancel-btn"]` - closes dialog without saving
- **Submit Button**: `[data-testid="edit-split-submit-btn"]` - updates the split

## State Behaviors

### Split List States
- **Loading**: Loader shown while fetching splits
- **Empty State**: Shows centered message with icon when no splits exist
- **Populated**: Table displays all splits with appropriate actions based on status

### Split Status Rules
- **Frozen Splits**:
  - Cannot be edited (no Edit button)
  - Cannot be deleted
  - Gray "Frozen" status badge
- **Editable Splits**:
  - Show Edit button
  - Green "Editable" status badge
  - If type is "golden", also shows Freeze button

### Action Button Visibility
- **Edit Button**: Only shown for unfrozen splits
- **Freeze Button**: Only shown for unfrozen splits with type "golden"
- **Frozen Splits**: No action buttons displayed

### Dialog Behaviors
- **Create Split**:
  - Name field validates for empty/invalid characters
  - At least one sample must be selected
  - Loading state on Create Split button during submission
  - Error messages displayed inline
- **Edit Split**:
  - Type and name are read-only (cannot be changed)
  - Sample selection can be modified
  - Loading state on Update Split button during submission
- **Freeze Confirmation**:
  - Browser confirmation dialog: "Are you sure you want to freeze this split? It will become immutable."
  - Cannot be undone

## API Interactions
- **GET** `/benchmark/datasets/:datasetId/versions/:versionId/splits` - fetch all splits for version
- **POST** `/benchmark/datasets/:datasetId/versions/:versionId/splits` - create new split
  - Body: `{ name, type, sampleIds, stratificationRules? }`
- **PATCH** `/benchmark/datasets/:datasetId/versions/:versionId/splits/:splitId` - update split
  - Body: `{ sampleIds }`
- **POST** `/benchmark/datasets/:datasetId/versions/:versionId/splits/:splitId/freeze` - freeze split
  - Body: `{}`

## Navigation Flows
- **To Splits Tab**: Dataset Detail Page → Click version row → Click "Splits" tab
- **Create Split**: Click "Create Split" or "Create First Split" → Fill form → Submit
- **Edit Split**: Click "Edit" on unfrozen split → Modify samples → Submit
- **Freeze Split**: Click "Freeze" on golden split → Confirm → Split becomes immutable

## Split Type Badge Colors
- **train** (Train): Blue
- **val** (Validation): Cyan
- **test** (Test): Grape/Purple
- **golden** (Golden Regression): Yellow

## Known Issues & Implementation Notes
- Edit split dialog currently doesn't pre-populate with existing sample IDs (noted as TODO in code)
- Stratification rules are supported in the data model but not exposed in the UI
- No delete functionality implemented (splits can only be frozen, not removed)
- Sample multiselect shows sample IDs only (no thumbnail preview or metadata display in current implementation)
