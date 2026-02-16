# Page: Dataset Detail Page
**URL Pattern**: `/benchmarking/datasets/:id`
**Purpose**: View dataset versions, manage lifecycle (publish/archive), preview samples, and upload files

## Key Elements

### Header Section
- **Dataset Name**: `[data-testid="dataset-name-title"]` - h2 heading displaying dataset name
- **Dataset Description**: `[data-testid="dataset-description"]` - paragraph with dataset description
- **Upload Files Button**: `[data-testid="upload-files-btn"]` - primary action button to open upload dialog

### Navigation Tabs
- **Versions Tab**: `[data-testid="versions-tab"]` - shows all versions with count badge (e.g., "Versions (3)")
- **Sample Preview Tab**: `[data-testid="sample-preview-tab"]` - appears when a version is selected
- **Splits Tab**: `[data-testid="splits-tab"]` - appears when a version is selected for split management

### Version List Table
- **Table**: `[data-testid="versions-table"]` - striped table with hover highlighting
- **Table Columns**: Version | Status | Documents | Git Revision | Published | Created | Actions
- **Version Row**: `[data-testid="version-row-{versionId}"]` - clickable row to view version details
- **Status Badge**: `[data-testid="version-status-badge-{versionId}"]` - color-coded badge
  - Draft: yellow/warning
  - Published: green/success
  - Archived: gray/muted
- **Git Revision**: Truncated to 8 characters (e.g., "abc123de" from "abc123def456")
- **Published Date**: Shows formatted date or "-" if not published
- **Actions Menu Button**: `[data-testid="version-actions-btn-{versionId}"]` - three-dot menu icon

### Actions Menu Items
- **View Samples**: `[data-testid="view-samples-menu-item-{versionId}"]` - navigates to sample preview tab
- **Validate**: `[data-testid="validate-menu-item-{versionId}"]` - triggers dataset validation
- **Publish** (draft only): `[data-testid="publish-menu-item-{versionId}"]` - changes status to published
- **Archive** (published only): `[data-testid="archive-menu-item-{versionId}"]` - changes status to archived

### Sample Preview (when version selected)
- **Samples Table**: `[data-testid="samples-table"]` - displays sample details
- **Table Columns**: Sample ID | Input Files | Ground Truth | Metadata | Actions
- **Sample Row**: `[data-testid="sample-row-{sampleId}"]` - one row per sample
- **View Ground Truth Button**: `[data-testid="view-ground-truth-btn-{sampleId}"]` - opens JSON viewer
- **Pagination**: `[data-testid="samples-pagination"]` - when more than 1 page of samples
- **Empty State**: `[data-testid="no-samples-message"]` - shows when no samples exist

### File Upload Dialog
- **Dialog**: `[data-testid="upload-files-dialog"]` - modal with "Upload Files" title
- **Dropzone**: `[data-testid="file-dropzone"]` - drag-and-drop area (max 100MB per file)
- **File List**: `[data-testid="selected-files-list"]` - appears when files are selected
- **File Item**: `[data-testid="file-item-{index}"]` - shows filename and size
- **Remove File Button**: `[data-testid="remove-file-btn-{index}"]` - removes file from selection
- **Upload Progress**: `[data-testid="upload-progress"]` - animated progress bar during upload
- **Success Message**: `[data-testid="upload-success-message"]` - green text on successful upload
- **Cancel Button**: `[data-testid="upload-cancel-btn"]` - closes dialog without uploading
- **Upload Button**: `[data-testid="upload-submit-btn"]` - submits files (disabled when empty)

### Ground Truth Viewer
- **Modal**: `[data-testid="ground-truth-viewer"]` - xl-sized modal with "Ground Truth JSON" title
- **JSON Display**: `[data-testid="ground-truth-json"]` - formatted JSON with 2-space indentation
- **Scroll Area**: 500px height with scrollbar for long JSON

## State Behaviors
- **Loading State**: Loader component shown while fetching dataset or versions
- **Empty Version State**: `[data-testid="no-versions-message"]` with prompt to upload files
- **Empty Sample State**: `[data-testid="no-samples-message"]` when version has no samples
- **Row Selection**: Clicking version row opens Sample Preview and Splits tabs
- **Status-dependent Actions**:
  - Draft versions show "Publish" action
  - Published versions show "Archive" action
  - Archived versions show no status change actions
- **Upload Dialog**:
  - Upload button disabled until files selected
  - Progress bar animates during upload
  - Success message replaces upload interface on completion
  - Cancel button becomes "Close" after successful upload

## API Interactions
- **GET** `/api/benchmark/datasets/:id` - fetch dataset details
- **GET** `/api/benchmark/datasets/:id/versions` - fetch all versions
- **GET** `/api/benchmark/datasets/:id/versions/:versionId/samples?page={page}&limit={limit}` - fetch paginated samples
- **GET** `/api/benchmark/datasets/:id/versions/:versionId/splits` - fetch version splits
- **PUT/PATCH** `/api/benchmark/datasets/:id/versions/:versionId` - publish or archive version
- **POST** `/api/benchmark/datasets/:id/upload` - upload files (multipart form data)
- **POST** `/api/benchmark/datasets/:id/versions/:versionId/validate` - validate dataset

## Navigation Flows
- **From**: Dataset List Page → Click on dataset row
- **To**: Sample Preview → Click version row or "View Samples" menu item
- **To**: Splits Management → Click "Splits" tab after selecting version
- **To**: Upload Dialog → Click "Upload Files" button

## Known Issues
- Sample endpoints return 404 (not implemented) - shows empty state correctly
- Split endpoints return 404 (not implemented) - shows empty state correctly
