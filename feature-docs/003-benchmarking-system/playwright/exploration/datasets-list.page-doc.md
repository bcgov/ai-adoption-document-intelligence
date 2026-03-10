# Page: Datasets List
**URL Pattern**: `/benchmarking/datasets`
**Purpose**: Display all benchmark datasets, create new datasets, and navigate to dataset details

## Key Elements

### Header Section
- **Page Header Group**: `[data-testid="datasets-header"]`
  - **Page Title**: "Datasets" (h2)
  - **Page Description**: "Manage benchmark datasets and versions"
  - **Create Button**: `[data-testid="create-dataset-btn"]` - Blue button with plus icon in top right

### Empty State (when no datasets exist)
- **Empty State Container**: `[data-testid="datasets-empty-state"]`
  - Database icon (gray, size 48)
  - **Title**: "No datasets yet" (bold)
  - **Description**: "Create your first benchmark dataset to get started"
  - **Create Button**: `[data-testid="create-dataset-empty-btn"]` - Blue button with plus icon

### Datasets Table (when datasets exist)
- **Table**: `[data-testid="datasets-table"]`
  - Striped rows with hover highlighting
  - Columns:
    - **Name**: Dataset name (bold)
    - **Description**: Dataset description (dimmed, truncated)
    - **Version Count**: Number of versions
    - **Created Date**: Formatted date

- **Dataset Row**: `[data-testid="dataset-row-{id}"]` (dynamic ID based on dataset)
  - Clickable row (pointer cursor)
  - Navigates to dataset detail page on click

### Dialogs
- **Create Dataset Dialog**: Modal that opens when clicking create buttons
  - Not visible by default
  - Controlled by CreateDatasetDialog component

## State Behaviors
- **Loading State**: Shows centered loader with "lg" size while fetching datasets
- **Empty State**: Displayed when `datasets.length === 0`
- **Table State**: Displayed when `datasets.length > 0`
- **Create Dialog**: Opens when clicking either create button
- **Row Hover**: Table rows highlight on hover
- **Row Click**: Clicking a row navigates to `/benchmarking/datasets/{id}`

## Navigation Flows
- **Create Dataset**: Click "Create Dataset" button → Opens create dialog
- **View Dataset Details**: Click on any dataset row → Navigate to dataset detail page
- **From Sidebar**: Click "Datasets" in benchmarking section → Load this page

## API Integration
- **GET** `/api/benchmark/datasets?page=1&limit=20` - Fetch datasets list
  - Returns 403 with mock auth (expected behavior)
  - Would populate table when properly authenticated

## Notes
- Page handles both empty and populated states
- Table uses Mantine Table component with striping and hover effects
- Dataset descriptions are truncated to one line with ellipsis
- Version count defaults to 0 if not provided
- Dates are formatted using `toLocaleDateString()`
- Two create buttons provide multiple entry points for the same action
