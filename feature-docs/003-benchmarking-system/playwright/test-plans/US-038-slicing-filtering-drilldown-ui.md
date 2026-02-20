# Test Plan: US-038 - Slicing, Filtering & Drill-Down UI

**Source**: `user-stories/US-038-slicing-filtering-drilldown-ui.md`
**Requirement Section**: Section 10.3 (Phase 2 -- Slicing & Filtering, Drill-Down Panels)
**Priority**: Low (Phase 2)

## User Story
**As a** user,
**I want to** filter benchmark results by metadata dimensions and drill down into per-sample details,
**So that** I can understand performance across different document types, languages, and other dimensions.

## Acceptance Criteria
- Filter by metadata dimensions
- Available filter dimensions
- Drill-down panels
- Per-sample result view
- Metrics breakdown by dimension
- Pluggable drill-down panels

## Test Scenarios

### Scenario 1: Filter Panel Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Completed benchmark run with samples having metadata
**When**: User views the run results page
**Then**:
- Filter panel is visible on the left or top
- Available filter dimensions are displayed (docType, language, pageCount, source, custom fields)
- Each dimension shows available values with counts (e.g., "invoice (20)", "form (15)")
- Filters are initially unselected (showing all samples)

**Affected Pages**: Run results drill-down page
**Data Requirements**: Run with metadata-rich samples
**Prerequisites**: User logged in, run completed

### Scenario 2: Apply Single Filter
- **Type**: Happy Path
- **Priority**: High

**Given**: Filter panel is displayed
**When**: User selects filter value "docType = invoice"
**Then**:
- Results view updates to show only invoice samples
- Metrics are recalculated for the filtered subset
- Sample count indicator shows "Showing 20 of 100 samples"
- Filter is visually indicated as active (checkbox, badge)

**Affected Pages**: Run results drill-down page
**Data Requirements**: Run with multiple docTypes
**Prerequisites**: User logged in

### Scenario 3: Apply Multiple Filters
- **Type**: Happy Path
- **Priority**: High

**Given**: User has applied one filter
**When**: User adds additional filters (e.g., "language = en" AND "docType = invoice")
**Then**:
- Results view updates to show only samples matching ALL filters (AND logic)
- Metrics reflect the combined filtered subset
- Active filters are displayed as chips/tags
- Sample count updates accordingly

**Affected Pages**: Run results drill-down page
**Data Requirements**: Run with diverse metadata
**Prerequisites**: User logged in

### Scenario 4: Clear Individual Filter
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Multiple filters are active
**When**: User clicks "X" on one filter chip
**Then**:
- That specific filter is removed
- Results view updates to reflect remaining filters
- Metrics recalculate
- Other filters remain active

**Affected Pages**: Run results drill-down page
**Data Requirements**: Run with filters applied
**Prerequisites**: User logged in

### Scenario 5: Clear All Filters
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Multiple filters are active
**When**: User clicks "Clear All" button
**Then**:
- All filters are removed
- Results view shows all samples
- Metrics reflect the full dataset
- Filter panel resets to initial state

**Affected Pages**: Run results drill-down page
**Data Requirements**: Run with filters applied
**Prerequisites**: User logged in

### Scenario 6: Dynamic Filter Options
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Sample metadata contains various fields
**When**: Filter panel renders
**Then**:
- Filter dimensions are dynamically generated from available metadata keys
- Standard dimensions (docType, language, pageCount, source) are shown first
- Custom metadata fields appear under "More Filters" or similar section
- Only dimensions with multiple values are shown (no single-value dimensions)

**Affected Pages**: Run results drill-down page
**Data Requirements**: Run with custom metadata fields
**Prerequisites**: User logged in

### Scenario 7: Page Count Range Filter
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Samples have pageCount metadata
**When**: User applies page count range filter (e.g., 1-5 pages)
**Then**:
- Range slider or min/max inputs allow range selection
- Results filter to samples within the range
- Distribution histogram shows page count distribution (optional)
- Range is indicated in active filters

**Affected Pages**: Run results drill-down page
**Data Requirements**: Samples with varying page counts
**Prerequisites**: User logged in

### Scenario 8: Open Sample Drill-Down Panel
- **Type**: Happy Path
- **Priority**: High

**Given**: Filtered results view is displayed
**When**: User clicks on a specific sample row
**Then**:
- Drill-down panel opens (modal or side panel)
- Panel shows:
  - Sample ID
  - Input file preview (image thumbnail or file reference)
  - Workflow output (formatted JSON or text)
  - Ground truth (formatted JSON or text)
  - Field-by-field comparison with match/mismatch indicators
  - Sample's individual metrics

**Affected Pages**: Run results drill-down page (drill-down panel)
**Data Requirements**: Run with detailed sample results
**Prerequisites**: User logged in

### Scenario 9: Field-by-Field Comparison View
- **Type**: Happy Path
- **Priority**: High

**Given**: Drill-down panel for a sample is open (schema-aware evaluation)
**When**: Field comparison section is rendered
**Then**:
- Table shows: Field Name, Predicted Value, Ground Truth Value, Match Status
- Matched fields have green checkmark ✅
- Mismatched fields have red X ❌ and are highlighted
- Differences are visually distinct
- User can see exactly which fields failed

**Affected Pages**: Drill-down panel
**Data Requirements**: Schema-aware evaluation results
**Prerequisites**: User logged in

### Scenario 10: Navigate Between Samples in Drill-Down
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User is viewing a sample drill-down panel
**When**: User clicks "Next" or "Previous" navigation buttons
**Then**:
- Panel updates to show the next/previous sample in the filtered list
- Navigation wraps at the end/beginning (or disables buttons)
- User can browse through samples without closing the panel
- Efficient for reviewing multiple samples

**Affected Pages**: Drill-down panel
**Data Requirements**: Multiple samples
**Prerequisites**: User logged in

### Scenario 11: Metrics Breakdown by Dimension
- **Type**: Happy Path
- **Priority**: High

**Given**: User has selected a dimension for slicing (e.g., docType)
**When**: Metrics breakdown view is rendered
**Then**:
- Table/chart shows metrics per dimension value:
  - docType: invoice | F1: 0.95 | Precision: 0.96 | Recall: 0.94
  - docType: form | F1: 0.88 | Precision: 0.90 | Recall: 0.86
- Visualization (bar chart) compares metrics across dimension values
- User can identify which document types perform best/worst

**Affected Pages**: Run results drill-down page (metrics breakdown section)
**Data Requirements**: Run with metadata and per-sample metrics
**Prerequisites**: User logged in

### Scenario 12: Interactive Breakdown Chart
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Metrics breakdown chart is displayed
**When**: User hovers over or clicks a chart element (e.g., bar for "invoice")
**Then**:
- Tooltip shows detailed metric values
- Clicking filters the sample view to that dimension value
- Chart is interactive and responsive
- User can drill down from the visualization

**Affected Pages**: Metrics breakdown section
**Data Requirements**: Breakdown data
**Prerequisites**: User logged in

### Scenario 13: Pluggable Drill-Down Panels
- **Type**: Happy Path
- **Priority**: Low

**Given**: Custom panel components are registered for specific workflow types
**When**: User opens a drill-down panel for a sample from a custom workflow
**Then**:
- Custom visualization panel is loaded and rendered
- Panel shows workflow-specific details (e.g., OCR confidence heatmap)
- Pluggable architecture allows extensibility without modifying core code
- Fallback to default panel if no custom panel is registered

**Affected Pages**: Drill-down panel (plugin system)
**Data Requirements**: Run from workflow with custom panel
**Prerequisites**: User logged in, custom panel registered

### Scenario 14: Input File Preview in Drill-Down
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Sample has input image files
**When**: Drill-down panel is opened
**Then**:
- Image thumbnail or preview is displayed
- User can click to view full-size image (lightbox or new tab)
- For PDFs: first page thumbnail or PDF viewer
- For other file types: file icon with download option

**Affected Pages**: Drill-down panel
**Data Requirements**: Samples with image inputs
**Prerequisites**: User logged in

### Scenario 15: Empty Filter Results
- **Type**: Edge Case
- **Priority**: Medium

**Given**: User applies filters
**When**: No samples match the filter criteria
**Then**:
- Empty state message: "No samples match the selected filters"
- Suggestion to adjust or clear filters
- Metrics section shows "N/A" or is hidden
- User can easily clear filters to restore results

**Affected Pages**: Run results drill-down page
**Data Requirements**: Filters with no matching samples
**Prerequisites**: User logged in

### Scenario 16: Performance with Large Sample Sets
- **Type**: Edge Case
- **Priority**: Medium

**Given**: Run has 10,000+ samples
**When**: User applies filters or views results
**Then**:
- Results are paginated or virtualized
- Filtering is performant (completes in <1s)
- Metrics recalculation is efficient
- UI remains responsive

**Affected Pages**: Run results drill-down page
**Data Requirements**: Large benchmark run
**Prerequisites**: User logged in

### Scenario 17: Export Filtered Results
- **Type**: Happy Path
- **Priority**: Low

**Given**: User has applied filters to the results view
**When**: User clicks "Export Filtered Results"
**Then**:
- Export includes only filtered samples
- Export format: CSV or JSON
- File indicates filters applied in metadata or filename
- Useful for sharing subset analyses

**Affected Pages**: Run results drill-down page
**Data Requirements**: Filtered results
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (filter, drill-down, breakdown, navigation)
- ✅ Edge cases covered (empty results, large datasets, missing metadata)
- ✅ Error handling covered (no matches, missing previews)
- ✅ Extensibility covered (pluggable panels)
- ⚠️ Missing: Performance with complex filter combinations
- ⚠️ Missing: Saved filter presets or bookmarks
