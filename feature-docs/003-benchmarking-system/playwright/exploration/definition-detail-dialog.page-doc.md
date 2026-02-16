# Page: Definition Detail Dialog
**URL Pattern**: Dialog on `/benchmarking/projects/:projectId`
**Purpose**: View full details of a benchmark definition including configuration, schedule, and run history

## Key Elements

### Dialog Header
- **Title**: `heading[level=2]` - "Definition Details"
- **Close Button**: `button` - Close dialog (X icon)

### Definition Header
- **Definition Name**: `heading[level=3]` - Name of the definition (e.g., "Baseline OCR Model")
- **Start Run Button**: `button` - "Start Run" button with play icon
  - Triggers a new benchmark run for this definition
- **Revision Badge**: `generic` - "Revision {number}" (e.g., "Revision 1")

### Configuration Table
**Table structure** showing key-value pairs:
- **Dataset Version**: `row` - "{dataset name} v{version}" (e.g., "Invoice Test Dataset vv1.0")
- **Split**: `row` - "{name} ({type})" (e.g., "train (train)")
- **Workflow**: `row` - "{workflow name} v{version}" (e.g., "Standard OCR Workflow v1")
- **Workflow Config Hash**: `row` - `code` element with hash value (e.g., "hash-abc123")
- **Evaluator Type**: `row` - Evaluator type name (e.g., "field-accuracy")

### Configuration Sections

#### Evaluator Configuration
- **Heading**: `heading[level=4]` - "Evaluator Configuration"
- **JSON Display**: `generic` - Formatted JSON string
  - Example: `{ "metrics": [ "field_accuracy", "character_accuracy", "word_accuracy" ] }`

#### Runtime Settings
- **Heading**: `heading[level=4]` - "Runtime Settings"
- **JSON Display**: `generic` - Formatted JSON string
  - Example: `{ "retries": 3, "timeout": 300 }`

#### Artifact Policy
- **Heading**: `heading[level=4]` - "Artifact Policy"
- **JSON Display**: `generic` - Formatted JSON string
  - Example: `{ "saveOutputs": true, "saveIntermediateResults": false }`

### Schedule Configuration
- **Heading**: `heading[level=4]` - "Schedule Configuration"
- **Icon**: "Scheduled Runs" icon
- **Toggle Switch**: `switch` - "Enable automatic scheduled runs"
  - Allows enabling/disabling scheduled runs for this definition
- **Save Button**: `button` - "Save Schedule"
  - **BUG NOTE**: API endpoint not implemented (GET `/api/benchmark/projects/{projectId}/definitions/{definitionId}/schedule` returns 404)

### Run History
- **Heading**: `heading[level=4]` - "Run History"
- **Table**: Shows all runs associated with this definition
  - Columns: MLflow Run ID, Status, Started, Completed
  - **MLflow Run ID**: `code` element - Truncated run ID (e.g., "mlflow-r")
  - **Status Badge**: `generic` - "running", "failed", or "completed"
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
