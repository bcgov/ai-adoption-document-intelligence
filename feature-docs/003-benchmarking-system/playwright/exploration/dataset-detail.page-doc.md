# Page: Dataset Detail
**URL Pattern**: `/benchmarking/datasets/{datasetId}`
**Purpose**: View and manage dataset versions, upload files, preview samples, and manage splits

## Key Elements

### Header Section
- **Page Title**: `[data-testid="dataset-name-title"]` - Displays dataset name (e.g., "Invoice Test Dataset")
- **Description**: `[data-testid="dataset-description"]` - Shows dataset description below title
- **Upload Files Button**: `[data-testid="upload-files-btn"]` - Primary action button in top-right

### Tabs Navigation
- **Versions Tab**: `[data-testid="versions-tab"]` - Shows count of versions (e.g., "Versions (1)")
- **Sample Preview Tab**: `[data-testid="sample-preview-tab"]` - Appears when a version is selected
- **Splits Tab**: `[data-testid="splits-tab"]` - Appears when a version is selected, manages train/test/val splits

## Versions Tab Content

### Versions Table
- **Table**: `[data-testid="versions-table"]` - Displays all dataset versions
- **Table Columns**: Version, Status, Documents, Git Revision, Published, Created, Actions
- **Version Row**: `[data-testid="version-row-{versionId}"]` - Clickable row to view version samples
  - Status badge with color coding: yellow (draft), green (published), gray (archived)
  - Git revision truncated to first 8 characters

### Version Actions Menu
- **Actions Button**: `[data-testid="version-actions-btn-{versionId}"]` - Three-dot menu button
- **Menu Items**:
  - **View Samples**: Navigate to sample preview tab
  - **Validate**: Run dataset validation checks
  - **Publish**: Convert draft version to published (only for draft versions)
  - **Archive**: Archive published version (only for published versions)

### Empty State
- **No Versions Message**: `[data-testid="no-versions-message"]` - Displayed when no versions exist
  - Message prompts user to upload files to create first version

## Sample Preview Tab Content

### Samples Table
- **Table**: `[data-testid="samples-table"]` - Displays paginated list of samples in selected version
- **Table Columns**: Sample ID, Input Files, Ground Truth, Metadata, Actions
- **Sample Row**: `[data-testid="sample-row-{sampleId}"]` - One row per sample
- **View Ground Truth Button**: `[data-testid="view-ground-truth-btn-{sampleId}"]` - Opens ground truth viewer modal

### Pagination
- **Pagination**: `[data-testid="samples-pagination"]` - Appears when more than 20 samples exist
  - Default page size: 20 samples per page

### Empty State
- **No Samples Message**: `[data-testid="no-samples-message"]` - Displayed when version has no samples

## Splits Tab Content
- **Split Management Component**: Embedded component for creating and managing train/test/validation splits
- See separate component documentation for details

## State Behaviors
- **Loading State**: Centered spinner while fetching dataset or versions
- **Dataset Not Found**: "Dataset not found" message if ID is invalid
- **Tab Switching**:
  - Clicking version row switches to Sample Preview tab automatically
  - Sample Preview and Splits tabs only appear when a version is selected
- **Version Row Click**: Entire row is clickable (except actions menu) to view samples
- **Actions Menu**: Click stops propagation to prevent row click

## Modals and Dialogs
- **File Upload Dialog**: Triggered by "Upload Files" button
- **Ground Truth Viewer**: JSON viewer modal for sample ground truth data
- **Validation Report Dialog**: Shows dataset validation results when "Validate" action is triggered

## Navigation Flows
- **From Datasets List**: Click dataset row → Navigate to this page
- **To Sample Preview**: Click version row OR click "View Samples" in actions menu
- **To Splits**: Click "Splits" tab after selecting a version

## API Integration
- **GET** `/api/benchmark/datasets/{id}` - Fetch dataset metadata
- **GET** `/api/benchmark/datasets/{id}/versions` - Fetch all versions
- **GET** `/api/benchmark/datasets/{id}/versions/{versionId}/samples?page={page}&limit={limit}` - Fetch paginated samples
- **PATCH** `/api/benchmark/datasets/{id}/versions/{versionId}` - Update version status (publish/archive)

## Implementation Notes
- Uses Mantine UI components (Table, Tabs, Badge, Menu, Modal)
- Status badge colors match UX spec: yellow (draft), green (published), gray (archived)
- Git revisions truncated to 8 characters for readability
- Sample preview tab uses pagination with 20 items per page
- Actions menu conditionally shows Publish (draft only) or Archive (published only)
- All timestamps formatted with `toLocaleDateString()`

## Authentication
- Requires authenticated user (mock JWT tokens in localStorage)
- Backend requires x-api-key header (automatically added by api.service.ts in test mode)
