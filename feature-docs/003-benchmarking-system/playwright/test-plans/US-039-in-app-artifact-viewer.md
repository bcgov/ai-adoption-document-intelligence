# Test Plan: US-039 - In-App Artifact Viewer

**Source**: `user-stories/US-039-in-app-artifact-viewer.md`
**Requirement Section**: Section 10.3 (Phase 2 -- Artifact Viewer)
**Priority**: Low (Phase 2)

## User Story
**As a** user,
**I want to** view benchmark artifacts directly in the application,
**So that** I can inspect outputs, diffs, and reports without switching to the MLflow UI for common artifact types.

## Acceptance Criteria
- View JSON artifacts
- View image artifacts
- View PDF artifacts
- View text artifacts
- Diff viewer for comparison artifacts
- Deep-links to MLflow artifacts
- Download artifact

## Test Scenarios

### Scenario 1: Open JSON Artifact Viewer
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact list contains a JSON artifact
**When**: User clicks on the JSON artifact
**Then**:
- JSON viewer modal/panel opens
- JSON content is displayed with syntax highlighting
- JSON is formatted and indented
- Viewer is read-only (not editable)
- Large JSON files are scrollable

**Affected Pages**: Run detail page (artifact viewer modal)
**Data Requirements**: Run with JSON artifacts
**Prerequisites**: User logged in

### Scenario 2: Collapse/Expand JSON Nodes
- **Type**: Happy Path
- **Priority**: Medium

**Given**: JSON viewer is open with nested JSON structure
**When**: User clicks on expand/collapse icons
**Then**:
- JSON object/array nodes can be collapsed
- Collapsed nodes show summary (e.g., "{...}" or "[5 items]")
- User can navigate large JSON structures efficiently
- Expand/collapse state persists during session

**Affected Pages**: JSON viewer
**Data Requirements**: Nested JSON artifact
**Prerequisites**: User logged in

### Scenario 3: View Image Artifact
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact list contains an image artifact (JPEG, PNG)
**When**: User clicks on the image artifact
**Then**:
- Image viewer modal opens
- Image is displayed at appropriate size
- Zoom controls are available (zoom in, zoom out, reset)
- Pan controls or drag-to-pan functionality
- Image quality is maintained

**Affected Pages**: Run detail page (image viewer modal)
**Data Requirements**: Run with image artifacts
**Prerequisites**: User logged in

### Scenario 4: Image Zoom and Pan
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Image viewer is open
**When**: User uses zoom controls or mouse wheel
**Then**:
- Image zooms in/out smoothly
- User can pan the zoomed image (drag or scroll)
- Zoom level indicator is displayed (e.g., "150%")
- Reset button returns to original size/position
- Controls are intuitive and responsive

**Affected Pages**: Image viewer
**Data Requirements**: Image artifact
**Prerequisites**: User logged in

### Scenario 5: View PDF Artifact
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact list contains a PDF artifact
**When**: User clicks on the PDF artifact
**Then**:
- PDF viewer modal opens
- PDF is rendered using embedded viewer (e.g., react-pdf, browser native)
- Page navigation controls are available (next, previous, page number)
- Total page count is displayed (e.g., "Page 1 of 5")
- User can navigate through multi-page PDFs

**Affected Pages**: Run detail page (PDF viewer modal)
**Data Requirements**: Run with PDF artifacts
**Prerequisites**: User logged in

### Scenario 6: PDF Navigation Controls
- **Type**: Happy Path
- **Priority**: Medium

**Given**: PDF viewer is open with a multi-page PDF
**When**: User uses navigation controls
**Then**:
- "Next" and "Previous" buttons navigate pages
- Page number input allows direct page jump
- Thumbnails sidebar shows all pages (optional)
- Navigation is smooth and responsive

**Affected Pages**: PDF viewer
**Data Requirements**: Multi-page PDF artifact
**Prerequisites**: User logged in

### Scenario 7: View Text Artifact
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact list contains a text artifact (plain text, CSV, log file)
**When**: User clicks on the text artifact
**Then**:
- Text viewer modal opens
- Text content is displayed with monospace font
- Line numbers are shown
- Optional word wrap toggle
- Syntax highlighting for CSV or log format (if detected)

**Affected Pages**: Run detail page (text viewer modal)
**Data Requirements**: Run with text artifacts
**Prerequisites**: User logged in

### Scenario 8: Text Viewer Line Numbers
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Text viewer is open
**When**: Text content is displayed
**Then**:
- Line numbers are shown on the left
- User can click line number to highlight line (optional)
- Line numbers help with reference and debugging
- Long files are scrollable with preserved line numbers

**Affected Pages**: Text viewer
**Data Requirements**: Multi-line text artifact
**Prerequisites**: User logged in

### Scenario 9: View Diff Report Artifact
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact list contains a diff_report artifact
**When**: User clicks on the diff artifact
**Then**:
- Diff viewer modal opens
- Side-by-side or unified diff view is displayed
- Additions are highlighted in green
- Deletions are highlighted in red
- Modifications are highlighted in yellow/orange
- Line numbers for both versions are shown

**Affected Pages**: Run detail page (diff viewer modal)
**Data Requirements**: Run with diff_report artifacts
**Prerequisites**: User logged in

### Scenario 10: Toggle Diff View Mode
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Diff viewer is open
**When**: User toggles between "Side-by-Side" and "Unified" view modes
**Then**:
- View mode changes accordingly
- Side-by-side shows before/after in adjacent columns
- Unified shows interleaved with +/- indicators
- User preference is saved for session
- Both modes are readable and functional

**Affected Pages**: Diff viewer
**Data Requirements**: Diff artifact
**Prerequisites**: User logged in

### Scenario 11: Deep-Link to MLflow Artifact
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact is stored in MLflow artifact store
**When**: User clicks "Open in MLflow" button
**Then**:
- New tab opens with MLflow UI at the specific artifact path
- URL format: `http://localhost:5000/#/experiments/{expId}/runs/{runId}/artifacts/{artifactPath}`
- MLflow UI displays the artifact
- User can access full MLflow artifact features

**Affected Pages**: Artifact viewer, MLflow UI
**Data Requirements**: Artifact with MLflow path
**Prerequisites**: User logged in, MLflow accessible

### Scenario 12: Download Artifact
- **Type**: Happy Path
- **Priority**: High

**Given**: Artifact viewer is open
**When**: User clicks "Download" button
**Then**:
- File download initiates
- File is saved with original filename and extension
- Download progress indicator for large files
- Download completes successfully
- File is accessible on user's machine

**Affected Pages**: Artifact viewer
**Data Requirements**: Any artifact type
**Prerequisites**: User logged in

### Scenario 13: Unsupported Artifact Type
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Artifact list contains an unsupported file type (e.g., .bin, .zip)
**When**: User clicks on the artifact
**Then**:
- Message appears: "Preview not available for this file type"
- "Download" button is prominently displayed
- "Open in MLflow" link is available
- User can still access the artifact via download or MLflow

**Affected Pages**: Artifact viewer
**Data Requirements**: Unsupported artifact type
**Prerequisites**: User logged in

### Scenario 14: Large Artifact Performance
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Artifact file is very large (e.g., 50MB JSON)
**When**: User attempts to open the artifact
**Then**:
- Warning message: "This file is large (50MB). Loading may take time."
- Option to proceed or download instead
- If user proceeds, loading indicator is shown
- Viewer handles large files gracefully (virtualization, pagination)
- UI remains responsive

**Affected Pages**: Artifact viewer
**Data Requirements**: Large artifact file
**Prerequisites**: User logged in

### Scenario 15: Close Artifact Viewer
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Artifact viewer modal is open
**When**: User clicks "Close" button, X icon, or clicks outside modal
**Then**:
- Modal closes smoothly
- User returns to artifact list
- No data is lost
- Modal can be reopened

**Affected Pages**: Artifact viewer modal
**Data Requirements**: Any artifact
**Prerequisites**: User logged in

### Scenario 16: Keyboard Navigation in Viewer
- **Type**: Happy Path
- **Priority**: Low

**Given**: Artifact viewer is open
**When**: User uses keyboard shortcuts
**Then**:
- ESC key closes the viewer
- Arrow keys navigate between pages (PDF) or items
- +/- keys zoom (images)
- Keyboard navigation is intuitive and documented

**Affected Pages**: Artifact viewer
**Data Requirements**: Any artifact
**Prerequisites**: User logged in

### Scenario 17: Multiple Artifacts Quick Switch
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Artifact viewer is open
**When**: User clicks "Next Artifact" or "Previous Artifact" button
**Then**:
- Viewer switches to the next/previous artifact in the list
- Content updates without closing the modal
- User can browse through artifacts efficiently
- Navigation wraps at list boundaries (optional)

**Affected Pages**: Artifact viewer
**Data Requirements**: Multiple artifacts
**Prerequisites**: User logged in

### Scenario 18: Artifact Loading Error
- **Type**: Error Case
- **Priority**: High

**Given**: User attempts to open an artifact
**When**: Artifact fetch fails (network error, 404, permissions)
**Then**:
- Error message is displayed: "Failed to load artifact"
- Technical error details are shown (optional, for debugging)
- "Retry" button allows re-attempting the fetch
- "Download" and "Open in MLflow" options remain available

**Affected Pages**: Artifact viewer
**Data Requirements**: Simulated fetch error
**Prerequisites**: User logged in

### Scenario 19: Search Within Text/JSON Artifacts
- **Type**: Happy Path
- **Priority**: Low

**Given**: Text or JSON viewer is open
**When**: User uses search functionality (Ctrl+F or search box)
**Then**:
- Search box appears
- User can enter search term
- Matches are highlighted
- Navigation between matches (next/previous)
- Match count is displayed (e.g., "3 of 15")

**Affected Pages**: Text/JSON viewer
**Data Requirements**: Text or JSON artifact
**Prerequisites**: User logged in

### Scenario 20: Copy Artifact Content
- **Type**: Happy Path
- **Priority**: Low

**Given**: JSON or text viewer is open
**When**: User clicks "Copy" button or selects text
**Then**:
- Content is copied to clipboard
- Success notification appears
- User can paste content elsewhere
- "Copy" button copies entire content, text selection copies selection

**Affected Pages**: JSON/text viewer
**Data Requirements**: JSON or text artifact
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (view all types, download, deep-link, navigation)
- ✅ Edge cases covered (large files, unsupported types, loading errors)
- ✅ Error handling covered (fetch failures, permissions)
- ✅ Usability covered (keyboard navigation, copy, search)
- ⚠️ Missing: Accessibility testing (screen readers, keyboard-only navigation)
- ⚠️ Missing: Performance testing with very large images or PDFs
