# Page: Project Detail
**URL Pattern**: `/benchmarking/projects/:projectId`
**Purpose**: View and manage a specific benchmark project, including its definitions and runs

## Key Elements

### Project Header
- **Project Name Title**: `[data-testid="project-name-title"]` - Main project name heading
- **Project Description**: `[data-testid="project-description"]` - Optional description text
- **MLflow Experiment ID**: `[data-testid="mlflow-experiment-id"]` - Displays linked MLflow experiment

### Benchmark Definitions Section
- **Section Heading**: `[data-testid="definitions-heading"]` - "Benchmark Definitions" title
- **Create Definition Button**: `[data-testid="create-definition-btn"]` - Opens creation dialog
- **Definitions Table**: `[data-testid="definitions-table"]` - Table of all definitions
- **Definition Row**: `[data-testid="definition-row-{definitionId}"]` - Clickable row for each definition
- **No Definitions Message**: `[data-testid="no-definitions-message"]` - Empty state text
- **Create First Definition Button**: `[data-testid="create-first-definition-btn"]` - Alternative create button in empty state

#### Definition Table Columns
- Name
- Dataset Version (format: "{datasetName} v{version}")
- Workflow (format: "{workflowName} v{version}")
- Evaluator Type
- Status (Mutable/Immutable badge)
- Revision

### Recent Runs Section
- **Section Heading**: `[data-testid="runs-heading"]` - "Recent Runs" title
- **Compare Button**: `[data-testid="compare-runs-btn"]` - Appears when 2+ runs selected, shows count
- **Runs Table**: `[data-testid="runs-table"]` - Table of all runs
- **Run Row**: `[data-testid="run-row-{runId}"]` - Row for each run
- **Run Checkbox**: `[data-testid="run-checkbox-{runId}"]` - Selection checkbox for comparison
- **No Runs Message**: `[data-testid="no-runs-message"]` - Empty state text

#### Run Table Columns
- Select (checkbox)
- Status (badge with color coding: pending=blue, running=yellow, completed=green, failed=red, cancelled=gray)
- Definition name
- Started timestamp
- Duration (or elapsed time for running/pending)
- Headline metrics (first 2 key-value pairs)

### Modals & Dialogs
- **Create Definition Dialog**: Modal for creating new benchmark definition
- **Definition Detail Modal**: Shows full definition details when row clicked

## State Behaviors

### Loading States
- **Project Loading**: Center-aligned spinner with loader component (h=400)
- **Definitions Loading**: Center-aligned spinner in card (h=200)
- **Runs Loading**: Center-aligned spinner in card (h=200)
- **Definition Detail Loading**: Center-aligned spinner in modal (h=200)

### Empty States
- **No Definitions**: Shows message with "Create your first definition" button
- **No Runs**: Shows simple "No runs yet" message
- **Project Not Found**: Shows "Project not found" message when invalid ID

### Interactive States
- **Run Selection**: Checkboxes toggle on/off, selectedRunIds array updates
- **Compare Button**: Only visible when 2+ runs selected, shows count in label
- **Definition Rows**: Clickable, opens detail modal
- **Run Rows**: Most cells clickable (except checkbox cell), navigates to run detail page

### Dynamic Content
- **Status Badges**: Color changes based on run status
- **Regression Indicators**: Red badge with warning icon shows when run has regressions
- **Duration Display**: Shows elapsed time for running/pending, final duration for completed
- **Metrics Preview**: Shows first 2 headline metrics or "-" if none

## Navigation Flows

### Incoming
- **From Projects List**: Click on project row → Navigate to this page

### Outgoing
- **To Run Detail**: Click run row → `/benchmarking/projects/:projectId/runs/:runId`
- **To Compare Runs**: Click "Compare" button → `/benchmarking/projects/:projectId/compare?runs={runIds}`
- **Modal Navigation**: Click definition row → Opens detail modal (no URL change)

### User Interactions
1. **Create Definition Flow**: Click "Create Definition" → Fill form in modal → Submit → New definition appears in table
2. **View Definition Details**: Click definition row → Modal opens → Shows detailed configuration
3. **Compare Runs**: Check 2+ runs → "Compare" button appears → Click to navigate to comparison view
4. **View Run Details**: Click any run row (except checkbox) → Navigate to run detail page

## API Integration
- **GET /api/benchmark/projects/:projectId** - Fetch project details
- **GET /api/benchmark/projects/:projectId/definitions** - List definitions
- **POST /api/benchmark/projects/:projectId/definitions** - Create definition
- **GET /api/benchmark/projects/:projectId/definitions/:definitionId** - Get definition details
- **GET /api/benchmark/projects/:projectId/runs** - List runs

## Notes
- Definitions table only appears when definitions exist
- Runs table shows all runs regardless of which definition they belong to
- Definition rows are fully clickable for detail view
- Run rows are clickable except for the checkbox cell which toggles selection
- Compare functionality requires at least 2 selected runs
- Modal detail view stays open until explicitly closed
