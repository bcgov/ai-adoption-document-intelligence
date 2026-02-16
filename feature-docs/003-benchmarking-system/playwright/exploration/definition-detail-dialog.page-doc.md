# Page: Definition Detail Dialog
**URL Pattern**: Dialog on `/benchmarking/projects/:projectId`
**Purpose**: View full details of a benchmark definition including configuration, schedule, and run history

## Key Elements

### Dialog Header
- **Title**: `heading[level=2]` - "Definition Details"
- **Close Button**: `button` - Close dialog (X icon)

### Definition Header
- **Definition Name**: `[data-testid="definition-name-title"]` - Name of the definition (e.g., "Baseline OCR Model")
- **Start Run Button**: `[data-testid="start-run-btn"]` - "Start Run" button with play icon
  - Triggers a new benchmark run for this definition
  - **CRITICAL**: This is the primary action for starting benchmark runs (US-030 Scenario 2)
- **Immutable Badge**: `[data-testid="immutable-badge"]` - Shows "Immutable" if definition is locked (conditional)
- **Revision Badge**: `[data-testid="revision-badge"]` - "Revision {number}" (e.g., "Revision 1")

### Configuration Table
**Table**: `[data-testid="definition-info-table"]` showing key-value pairs:
- **Dataset Version**: `row` - "{dataset name} v{version}" (e.g., "Invoice Test Dataset vv1.0")
- **Split**: `row` - "{name} ({type})" (e.g., "train (train)")
- **Workflow**: `row` - "{workflow name} v{version}" (e.g., "Standard OCR Workflow v1")
- **Workflow Config Hash**: `row` - `code` element with hash value (e.g., "hash-abc123")
- **Evaluator Type**: `row` - Evaluator type name (e.g., "field-accuracy")

### Configuration Sections

#### Evaluator Configuration
- **Heading**: `[data-testid="evaluator-config-heading"]` - "Evaluator Configuration"
- **JSON Display**: `[data-testid="evaluator-config-json"]` - Formatted JSON string
  - Example: `{ "metrics": [ "field_accuracy", "character_accuracy", "word_accuracy" ] }`

#### Runtime Settings
- **Heading**: `[data-testid="runtime-settings-heading"]` - "Runtime Settings"
- **JSON Display**: `[data-testid="runtime-settings-json"]` - Formatted JSON string
  - Example: `{ "retries": 3, "timeout": 300 }`

#### Artifact Policy
- **Heading**: `[data-testid="artifact-policy-heading"]` - "Artifact Policy"
- **JSON Display**: `[data-testid="artifact-policy-json"]` - Formatted JSON string
  - Example: `{ "saveOutputs": true, "saveIntermediateResults": false }`

### Schedule Configuration
- **Heading**: `[data-testid="schedule-config-heading"]` - "Schedule Configuration"
- **Icon**: "Scheduled Runs" icon
- **Toggle Switch**: `switch` - "Enable automatic scheduled runs"
  - Allows enabling/disabling scheduled runs for this definition
- **Save Button**: `button` - "Save Schedule"
  - **BUG NOTE**: API endpoint not implemented (GET `/api/benchmark/projects/{projectId}/definitions/{definitionId}/schedule` returns 404)

### Run History
- **Heading**: `[data-testid="run-history-heading"]` - "Run History"
- **Table**: `[data-testid="run-history-table"]` - Shows all runs associated with this definition
  - Columns: MLflow Run ID, Status, Started, Completed
  - **Run History Row**: `[data-testid="run-history-row-{runId}"]` - Each run in the history
  - **MLflow Run ID**: `code` element - Truncated run ID (e.g., "mlflow-r")
  - **Status Badge**: `[data-testid="run-status-badge-{runId}"]` - "running", "failed", or "completed"
  - **Started**: Formatted date/time
  - **Completed**: Formatted date/time or "—" for ongoing runs

## State Behaviors
- **Read-only Display**: All configuration fields are read-only
- **Schedule Toggle**: Interactive switch for enabling/disabling scheduled runs
- **API Error**: Schedule section fails to load (404 error) but doesn't break the UI
- **Row Click**: Clicking on run history rows may navigate to run detail (not tested)

## Known Issues
1. **Schedule API Not Implemented**: GET request to `/api/benchmark/projects/{projectId}/definitions/{definitionId}/schedule` returns 404. The schedule section renders but cannot load/save schedule configuration.

## API Calls
- GET `/api/benchmark/projects/{projectId}/definitions/{definitionId}` - Load definition details
- GET `/api/benchmark/projects/{projectId}/runs?definitionId={definitionId}` - Load run history
- GET `/api/benchmark/projects/{projectId}/definitions/{definitionId}/schedule` - **Returns 404** (not implemented)

## Missing from Requirements
According to test plan scenario 14, this page should show:
- **Revision History**: If definition has multiple revisions, should show all revisions with creation date and creator
- **Config Differences**: Optional highlighting of changes between revisions

These features were not observed in the current implementation.
