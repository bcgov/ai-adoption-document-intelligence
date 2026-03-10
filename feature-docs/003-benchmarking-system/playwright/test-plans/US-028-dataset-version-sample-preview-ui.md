# Test Plan: US-028 - Dataset Version & Sample Preview UI

**Source**: `user-stories/US-028-dataset-version-sample-preview-ui.md`
**Requirement Section**: Section 10.1 (Phase 1 -- Dataset UI)
**Priority**: High

## User Story
**As a** user,
**I want to** view dataset versions, manage their lifecycle, and preview samples,
**So that** I can verify dataset contents and publish versions for use in benchmarks.

## Acceptance Criteria
- Version list within dataset detail view
- Publish version action
- Archive version action
- Sample preview with pagination
- Ground truth JSON viewer
- File upload interface
- Status badges with color coding

## Test Scenarios

### Scenario 1: Version List Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset has multiple versions (draft, published, archived)
**When**: User views the dataset detail page
**Then**:
- Version table displays with columns: version label, status, document count, git revision (truncated), published date, created date
- All versions are listed in descending order by creation date
- Status badges are color-coded correctly
- Action buttons appropriate to each status are visible

**Affected Pages**: Dataset detail page
**Data Requirements**: Dataset with 3+ versions in different states
**Prerequisites**: User logged in, dataset with versions exists

### Scenario 2: Publish Draft Version
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset version with status `draft` exists
**When**: User clicks the "Publish" action button
**Then**:
- Confirmation dialog appears (optional)
- PUT/PATCH request updates version status to `published`
- Status badge changes from yellow (draft) to green (published)
- Published date is populated
- Success notification appears
- "Publish" button is replaced with "Archive" button

**Affected Pages**: Dataset detail page
**Data Requirements**: Draft version
**Prerequisites**: User logged in, permission to publish

### Scenario 3: Archive Published Version
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset version with status `published` exists
**When**: User clicks the "Archive" action button
**Then**:
- Confirmation dialog appears (optional)
- Version status transitions to `archived`
- Status badge changes to gray (archived)
- Version is still visible in the list
- Archived versions cannot be edited

**Affected Pages**: Dataset detail page
**Data Requirements**: Published version
**Prerequisites**: User logged in, permission to archive

### Scenario 4: Sample Preview with Pagination
- **Type**: Happy Path
- **Priority**: High

**Given**: Dataset version with 50 samples
**When**: User clicks on a version to view its details
**Then**:
- Paginated sample list is displayed (e.g., 10 samples per page)
- Each sample shows: sample ID, input file references, ground truth preview, metadata
- Pagination controls allow navigation through pages
- Total sample count is displayed

**Affected Pages**: Dataset version detail view (nested in dataset detail page)
**Data Requirements**: Version with 50+ samples
**Prerequisites**: User logged in

### Scenario 5: View Sample Ground Truth JSON
- **Type**: Happy Path
- **Priority**: High

**Given**: Sample has JSON ground truth file
**When**: User clicks to preview the sample's ground truth
**Then**:
- JSON viewer modal/panel opens
- JSON is formatted with syntax highlighting
- JSON is read-only (not editable)
- User can collapse/expand JSON nodes
- Close button dismisses the viewer

**Affected Pages**: Sample preview component
**Data Requirements**: Sample with JSON ground truth
**Prerequisites**: User logged in

### Scenario 6: Upload Files Interface
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on the dataset detail page
**When**: User clicks "Upload Files" button
**Then**:
- File upload dialog/interface appears
- Drag-and-drop zone is visible
- File picker button is available
- Instructions indicate: "Upload documents and ground truth files"
- Accepts multiple files

**Affected Pages**: Dataset detail page (upload modal)
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 7: Upload Files with Progress
- **Type**: Happy Path
- **Priority**: High

**Given**: Upload interface is open
**When**: User selects 5 files (3 images, 2 JSON) and uploads
**Then**:
- Upload progress indicator shows for each file
- POST to `/api/benchmark/datasets/{id}/upload` with multipart form data
- Progress bar shows completion percentage
- Success message appears when upload completes
- Sample count updates if applicable

**Affected Pages**: Dataset detail page
**Data Requirements**: Sample files (images + JSON ground truth)
**Prerequisites**: User logged in, dataset exists

### Scenario 8: Upload Large File
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Upload interface is open
**When**: User attempts to upload a file larger than size limit (e.g., 100MB)
**Then**:
- Error message appears: "File exceeds maximum size limit"
- Upload is rejected before sending to server
- User can remove the file and try again
- Other valid files can still be uploaded

**Affected Pages**: Dataset detail page
**Data Requirements**: File larger than configured limit
**Prerequisites**: User logged in

### Scenario 9: Status Badge Color Coding
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Versions with different statuses exist
**When**: Version list is rendered
**Then**:
- Draft versions show yellow/warning badge
- Published versions show green/success badge
- Archived versions show gray/muted badge
- Badge colors are accessible (sufficient contrast)

**Affected Pages**: Dataset detail page
**Data Requirements**: Versions in all three states
**Prerequisites**: User logged in

### Scenario 10: Sample Metadata Display
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Samples have metadata (docType, language, pageCount, source)
**When**: Sample preview is displayed
**Then**:
- Metadata fields are shown for each sample
- Metadata is formatted as key-value pairs
- Long metadata values are truncated with expand option

**Affected Pages**: Sample preview component
**Data Requirements**: Samples with rich metadata
**Prerequisites**: User logged in

### Scenario 11: Empty Sample List
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Dataset version with no samples uploaded yet
**When**: User views the version detail
**Then**:
- Empty state message is displayed
- Message prompts user to upload files
- No sample table is shown
- Upload button is prominently displayed

**Affected Pages**: Dataset version detail view
**Data Requirements**: Empty version (no samples)
**Prerequisites**: User logged in

### Scenario 12: Git Revision Truncation
- **Type**: Happy Path
- **Priority**: Low

**Given**: Version has a full Git SHA (40 characters)
**When**: Version list is rendered
**Then**:
- Git revision is truncated to first 7-8 characters
- Hover/tooltip shows full SHA (optional)
- Truncated value is still readable and useful

**Affected Pages**: Dataset detail page
**Data Requirements**: Versions with Git revisions
**Prerequisites**: User logged in

### Scenario 13: Cannot Publish Already Published
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Version with status `published`
**When**: Version list is rendered
**Then**:
- "Publish" button is not visible
- Only "Archive" button is available
- User cannot trigger publish action via UI

**Affected Pages**: Dataset detail page
**Data Requirements**: Published version
**Prerequisites**: User logged in

### Scenario 14: Upload File Type Validation
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Upload interface is open
**When**: User attempts to upload unsupported file type (e.g., .exe)
**Then**:
- Error message appears: "Unsupported file type"
- File is rejected
- Supported types are indicated (images, JSON, JSONL, CSV, PDF)

**Affected Pages**: Dataset detail page
**Data Requirements**: Invalid file type
**Prerequisites**: User logged in

### Scenario 15: Concurrent Upload Handling
- **Type**: Edge Case
- **Priority**: Low

**Given**: User initiates file upload
**When**: User tries to navigate away or start another upload
**Then**:
- Warning appears: "Upload in progress"
- User can cancel current upload or wait
- Navigation is blocked until upload completes or is canceled

**Affected Pages**: Dataset detail page
**Data Requirements**: Large files for slow upload
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (version lifecycle, sample preview, file upload)
- ✅ Edge cases covered (large files, empty states, unsupported types)
- ✅ Error handling covered (file size limits, validation)
- ✅ UI states covered (status badges, progress indicators)
- ⚠️ Missing: Network interruption during upload
- ⚠️ Missing: Multiple simultaneous users editing same dataset
