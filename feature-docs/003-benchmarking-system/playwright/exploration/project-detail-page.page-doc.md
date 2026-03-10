# Page: Project Detail Page
**URL Pattern**: `/benchmarking/projects/:projectId`
**Purpose**: Display benchmark project details, list of definitions, and recent runs

## Key Elements

### Header
- **Project Title**: `heading[level=2]` - Displays project name
- **Project Description**: `paragraph` - Project description text
- **MLflow Experiment ID**: `paragraph` - "MLflow Experiment: {id}"

### Definitions Section
- **Section Heading**: `heading[level=3]` - "Benchmark Definitions"
- **Create Definition Button**: `[data-testid="create-definition-btn"]` - Opens create definition dialog
- **Definitions Table**: `table`
  - Columns: Name, Dataset Version, Workflow, Evaluator, Status, Revision
  - **Definition Row**: `[data-testid="definition-row-{definitionId}"]` - Clickable row
  - **Status Badge**: Shows "Mutable" or "Immutable"

### Recent Runs Section
- **Section Heading**: `heading[level=3]` - "Recent Runs"
- **Runs Table**: `table`
  - Columns: Select, Status, Definition, Started, Duration, Metrics
  - **Select Checkbox**: `checkbox` - For selecting runs
  - **Status Badge**: Shows run status (running, failed, completed)
  - **Run Row**: Clickable to view run details

## State Behaviors
- **Loading State**: Tables load asynchronously via API calls
- **Empty State**: No specific empty state observed
- **Row Click**: Clicking definition row opens definition detail dialog

## Navigation Flows
- **From**: Project list page → Click project row
- **To Definition Detail**: Click definition row → Opens definition detail dialog
- **To Create Form**: Click "Create Definition" button → Opens create definition dialog
