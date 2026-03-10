# Page: Run Drill-Down
**URL Pattern**: `/benchmarking/projects/:projectId/runs/:runId/drill-down`
**Purpose**: Filter, slice, and drill down into per-sample results for detailed analysis of benchmark run performance

## Key Elements

### Header Section
- **Page Title**: `heading "Sample Results: {definitionName}"` - Shows run definition name
- **Breadcrumb Text**: Text showing project name and run ID
- **Back Button**: `[data-testid="back-to-run-details-btn"]` - Returns to run detail page

### Filter Panel (Card)
- **Filters Icon**: Filter funnel icon
- **Filters Label**: "Filters" text
- **Active Filter Count Badge**: `[data-testid="active-filter-count"]` - Shows number of active filters (conditional: only when filters applied)
- **Clear All Button**: `[data-testid="clear-all-filters-btn"]` - Removes all active filters (conditional: only when filters applied)

#### Filter Dropdowns (Dynamic - based on available metadata dimensions)
- **customField Filter**: `[data-testid="filter-customField"]` - Dropdown for customField dimension
- **docType Filter**: `[data-testid="filter-docType"]` - Dropdown for document type
- **language Filter**: `[data-testid="filter-language"]` - Dropdown for language
- **pageCount Filter**: `[data-testid="filter-pageCount"]` - Dropdown for page count
- **source Filter**: `[data-testid="filter-source"]` - Dropdown for source type
- Each filter has clear button (X icon) when value selected

### Results Summary Section (Card)
- **Sample Count**: `[data-testid="sample-count"]` - Shows "Showing X of Y samples"
- **Top Pagination**: `[data-testid="top-pagination"]` - Page navigation controls (conditional: only when totalPages > 1)

### Results Table
- **Table**: `[data-testid="samples-table"]` - Main results table with striped rows
- **Table Headers**:
  - Sample ID
  - Dynamic metadata columns (first 3 dimensions shown)
  - Metrics
  - Actions

#### Table Rows
- **Sample ID Cell**: Code block with sample ID
- **Metadata Cells**: String values for each dimension
- **Metrics Cell**: Badge group showing up to 2 metrics with "+N more" indicator
- **Actions Cell**: `[data-testid="view-sample-{sampleId}"]` - Eye icon button to view sample details

### Pagination Footer
- **Bottom Pagination**: `[data-testid="bottom-pagination"]` - Page navigation controls (conditional: only when totalPages > 1)

### Sample Detail Drawer (Modal/Side Panel)
- **Drawer**: `[data-testid="sample-detail-drawer"]` - Right-side drawer, size XL
- **Title**: "Sample Details: {sampleId}"
- **Close Button**: X button in header

#### Drawer Content
- **Sample ID Card**: Shows sample ID as code
- **Metadata Card**: JSON input (read-only) with formatted metadata
- **Metrics Table**: Table showing metric name and value pairs
- **Ground Truth Card**: JSON input (conditional: when groundTruth exists)
- **Prediction Card**: JSON input (conditional: when prediction exists)
- **Evaluation Details Card**: JSON input (conditional: when evaluationDetails exists)
- **Diagnostics Card**: JSON input (conditional: when diagnostics exists)

#### Custom Drill-Down Panels (Pluggable Architecture)
- **Tabs**: When custom panels registered, shows tabs for "Default View" and custom panel names
- **Tab Panels**: Each tab shows different visualization of sample data

## State Behaviors

### Loading States
- **Initial Load**: Center-aligned spinner while fetching run data
- **Results Loading**: Center-aligned spinner (h=200) while fetching sample results
- **Run Not Found**: Red alert if run doesn't exist
- **Run Not Completed**: Yellow alert if run status is not "completed"

### Filtering Behavior
- **Apply Filter**: Selecting filter value updates results immediately and resets to page 1
- **Clear Single Filter**: Clicking X on filter dropdown removes that filter
- **Clear All Filters**: Button removes all filters and resets to page 1
- **Active Filter Indicator**: Badge shows count of active filters
- **Filter Values**: Dynamically populated based on available values in results

### Results Display
- **Pagination**: 20 samples per page
- **Empty State**: Blue alert when no samples match filters: `[data-testid="empty-results-alert"]`
- **Error State**: Red alert when API fails
- **Dynamic Columns**: First 3 metadata dimensions shown as table columns
- **Metric Preview**: Up to 2 metrics shown as badges in table

### Drill-Down Panel
- **Open**: Clicking action button opens right drawer
- **Close**: Clicking X button or clicking outside closes drawer
- **Scroll**: Drawer content scrollable (h=calc(100vh - 80px))
- **Tabs**: Multiple visualization options when custom panels registered
- **Fallback**: Default panel shown when no custom panels available

## Navigation Flows

### Incoming
- **From Run Detail**: Click "View All Samples" button → Navigate to this page

### Outgoing
- **To Run Detail**: Click "Back to Run Details" → Navigate to `/benchmarking/projects/:projectId/runs/:runId`

### Modal Navigation
- Click sample action button → Opens sample detail drawer (no URL change)
- Close drawer → Returns to filtered table view

## API Integration
- **GET /api/benchmark/projects/:projectId/runs/:runId** - Fetch run metadata
- **GET /api/benchmark/projects/:projectId** - Fetch project info
- **GET /api/benchmark/projects/:projectId/runs/:runId/samples** - Fetch paginated sample results with filters
  - Query params: `page`, `limit`, dynamic metadata dimensions (e.g., `docType=invoice`, `language=en`)
  - Returns: `{ samples, total, totalPages, availableDimensions, dimensionValues }`

## Notes
- Page only accessible for completed runs (status="completed")
- Filter dimensions dynamically generated from sample metadata keys
- Supports multi-filter AND logic (all filters must match)
- Pagination resets to page 1 when filters change
- Sample detail drawer supports pluggable custom visualization panels
- Default drill-down panel shows: sample ID, metadata, metrics, ground truth, prediction, evaluation details, diagnostics
- Metrics displayed with 3-4 decimal precision
- Table is responsive with horizontal scroll for many columns
- All filter dropdowns are clearable
- Empty filter results show helpful message with suggestion to adjust filters
