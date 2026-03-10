# Page: Artifact Viewer

**URL Pattern**: Drawer/Modal (no URL change) - opened from Run Detail page
**Purpose**: View benchmark artifact content directly in the application without switching to MLflow UI
**Component**: `apps/frontend/src/features/benchmarking/components/ArtifactViewer.tsx`

## Key Elements

### Drawer Header
- **Title**: "Artifact Viewer"
- **Artifact Path**: Displayed as Code component below title (no testid)

### Artifact Metadata Card
- **Metadata Card**: Card with border containing artifact details
- **Type Label**: Shows artifact type as Code (no testid)
- **MIME Type Label**: Shows MIME type as Code (no testid)
- **Sample ID**: Conditionally shown if artifact has sampleId (no testid)
- **Node ID**: Conditionally shown if artifact has nodeId (no testid)

### Action Buttons
- **Download Button**: `Button` with IconDownload icon, variant="light" (no testid)
- **Open in MLflow Button**: `Button` with IconExternalLink icon, variant="light" (no testid)
  - Only shown if mlflowExperimentId and mlflowRunId are available
  - Opens in new tab with deep-link to MLflow artifact

### Content Viewer Card
- **Content Card**: Card with border, flex: 1 layout
- **Loading State**: Center-aligned Loader (h=300) while fetching content
- **Error Alert**: Alert with red color, "Error Loading Artifact" title, IconAlertCircle icon
- **Image Viewer**: ScrollArea with `<img>` tag (maxWidth: 100%, height: auto)
- **JSON Viewer**: ScrollArea with JsonInput (readOnly, autosize, minRows=10, maxRows=50)
- **Text Viewer**: ScrollArea with Textarea (readOnly, autosize, minRows=10, maxRows=50, monospace font, fontSize=12px)
- **PDF Alert**: Blue Alert stating "PDF viewing is not yet implemented"
- **Unsupported Type Alert**: Blue Alert stating "Preview Not Available"

## State Behaviors

### Loading States
- **Initial Load**: Loader shown while fetching artifact content
- **Content Fetching**: Async load based on MIME type detection
- **Blob URL Cleanup**: Image URLs are revoked on component unmount

### Content Type Detection
- **Images**: `mimeType.startsWith("image/")`
  - Fetched as blob, converted to object URL
  - Displayed in `<img>` tag with scroll area
- **JSON**: `mimeType.includes("json")` or `path.endsWith(".json")`
  - Fetched as text
  - Parsed and pretty-printed with 2-space indentation
  - Displayed in JsonInput component
- **Text**: `mimeType.startsWith("text/")` or path ends with `.txt`, `.log`, `.csv`
  - Fetched as text
  - Displayed in Textarea with monospace font
- **PDF**: `mimeType === "application/pdf"` or `path.endsWith(".pdf")`
  - Shows "not yet implemented" message
  - User directed to download or open in MLflow
- **Unsupported**: All other types
  - Shows "Preview Not Available" message
  - User directed to download or open in MLflow

### Error Handling
- **Fetch Errors**: Shown in red Alert with error message
- **JSON Parse Errors**: Falls back to displaying raw text content
- **Download Errors**: Sets error state with error message

### Interactive States
- **Download**: Creates blob URL, triggers browser download, cleans up URL
- **MLflow Link**: Opens new tab with security attributes (noopener noreferrer)
- **Close**: onClose callback when drawer is closed

## Navigation Flows

### Incoming
- **From Run Detail**: Click artifact row → Opens drawer

### Outgoing
- **Close Drawer**: Returns to run detail page (no navigation)
- **MLflow Link**: Opens external MLflow UI in new tab

## API Integration
- **GET** `/api/benchmark/projects/:projectId/runs/:runId/artifacts/:artifactId/content`
  - Response type varies: `blob` for images, `text` for JSON/text
  - Proxies content from MinIO storage

## Implementation Status

### ✅ Implemented (Partial)
- JSON viewing with syntax highlighting and formatting
- Image viewing (basic display, no zoom/pan)
- Text viewing (basic display, no line numbers)
- Download functionality
- MLflow deep-linking
- Error handling for fetch failures
- Unsupported file type handling

### ❌ Not Implemented
- PDF viewing (shows "not yet implemented" alert)
- Diff viewer for comparison artifacts
- Image zoom and pan controls
- JSON collapse/expand nodes
- Text line numbers
- Search within JSON/text content
- Copy content to clipboard
- Keyboard navigation (ESC, arrow keys, zoom shortcuts)
- Multiple artifact navigation (next/previous buttons)
- Large file performance warnings
- Loading progress indicators for large files

## Missing Test Selectors

The component **lacks data-testid attributes** for most elements:
- Drawer component
- Download button
- Open in MLflow button
- Metadata card and fields
- Content viewers (image, JSON, text)
- Error alerts
- Loading states

## Notes

### Testing Blockers
- **No Seed Data**: The seed file (`apps/shared/prisma/seed.ts`) does not create any test artifacts
- **MinIO Required**: Artifacts are stored in MinIO; testing requires:
  1. MinIO service running
  2. Test artifact files uploaded to MinIO
  3. Database records referencing those files
- **Mock Artifacts Needed**: To test all scenarios, need artifacts of types:
  - `application/json` (evaluation reports)
  - `image/png` or `image/jpeg` (per-doc outputs)
  - `application/pdf` (evaluation reports) - currently not implemented
  - `text/plain`, `text/csv`, `text/log` (error logs)
  - Diff reports - format unclear, no viewer implemented

### Requirements Gap
- User Story US-039 acceptance criteria partially met (3/7 scenarios):
  - ✅ Scenario 1: View JSON artifacts (basic)
  - ✅ Scenario 2: View image artifacts (missing zoom/pan)
  - ❌ Scenario 3: View PDF artifacts (not implemented)
  - ✅ Scenario 4: View text artifacts (missing line numbers)
  - ❌ Scenario 5: Diff viewer (not implemented)
  - ✅ Scenario 6: MLflow deep-links (implemented)
  - ✅ Scenario 7: Download artifact (implemented)
- Feature is marked **Low Priority** in user story

### Code Location
- Component: `apps/frontend/src/features/benchmarking/components/ArtifactViewer.tsx`
- Backend Service: `apps/backend-services/src/benchmark/benchmark-artifact.service.ts`
- Controller: `apps/backend-services/src/benchmark/benchmark-run.controller.ts`
- Storage: MinIO bucket configured via `MINIO_ARTIFACT_BUCKET` (default: `benchmark-outputs`)

### Recommendations for Test Implementation
1. **Add Seed Data**:
   - Create `seedBenchmarkArtifacts()` function in `apps/shared/prisma/seed.ts`
   - Upload sample files to MinIO during seed
   - Create database records with correct paths
2. **Add Test Selectors**:
   - Add `data-testid` attributes to all interactive elements
   - Follow naming convention: `artifact-viewer-{element}-{action}`
3. **Implement Missing Features** (if priority increases):
   - PDF viewer (use `react-pdf` library)
   - Diff viewer (use `react-diff-viewer-continued` library)
   - Image zoom/pan (use `react-image-zoomer` or similar)
   - JSON collapse/expand (JsonInput may support this already)
   - Text line numbers (use `react-ace` or `monaco-editor`)
