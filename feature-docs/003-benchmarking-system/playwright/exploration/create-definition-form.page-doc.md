# Page: Create Definition Form
**URL Pattern**: Dialog on `/benchmarking/projects/:projectId`
**Purpose**: Create a new benchmark definition by selecting dataset, workflow, evaluator, and configuration

## Key Elements

### Dialog Header
- **Title**: `heading[level=2]` - "Create Benchmark Definition"
- **Close Button**: `button` - Close dialog (X icon)

### Form Fields

#### Required Fields
- **Name Input**: `[data-testid="definition-name-input"]` - Text input, required
  - Placeholder: "Enter definition name"
  - Error message appears if empty on submit

- **Dataset Version Select**: `[data-testid="dataset-version-select"]` - Dropdown, required, searchable
  - Placeholder: "Select dataset version"
  - Format: "{version} ({documentCount} documents) [DRAFT]" (draft indicator)
  - Options loaded via API: `/api/benchmark/datasets/{id}/versions`
  - Triggers split dropdown population

- **Split Select**: `[data-testid="split-select"]` - Dropdown, required
  - Placeholder: "Select split"
  - **Initially disabled** until dataset version selected
  - Filters splits by selected dataset version
  - Format: "{name} ({type})"
  - **BUG NOTE**: Remained disabled even after selecting dataset version (needs investigation)

- **Workflow Select**: `[data-testid="workflow-select"]` - Dropdown, required, searchable
  - Placeholder: "Select workflow"
  - Format: "{name} (v{version})"
  - Options loaded via API: `/api/workflows`
  - **BUG FIXED**: Was not showing options due to user_id mismatch between seed data and auth tokens

- **Evaluator Type Select**: `[data-testid="evaluator-type-select"]` - Dropdown, required
  - Default: "Schema-Aware"
  - Options: "Schema-Aware", "Black-Box"

#### Optional Fields
- **Evaluator Config Textarea**: `[data-testid="evaluator-config-textarea"]` - JSON textarea
  - Placeholder: '{"key": "value"}'
  - Validates JSON syntax on submit
  - Error message for invalid JSON

#### Runtime Settings
- **Max Parallel Documents**: `[data-testid="max-parallel-documents-input"]` - Number input
  - Default: 10
  - Min: 1, Max: 100
  - Increment/decrement buttons

- **Per Document Timeout**: `[data-testid="per-document-timeout-input"]` - Number input
  - Default: 300000 (ms)
  - Min: 1000, Step: 1000
  - Increment/decrement buttons

- **Use Production Queue**: `[data-testid="production-queue-radio"]` - Radio group
  - Options:
    - `[data-testid="production-queue-no"]` - "No (Benchmark Queue)" (default)
    - `[data-testid="production-queue-yes"]` - "Yes (Production Queue)"

#### Artifact Policy
- **Artifact Policy**: `[data-testid="artifact-policy-radio"]` - Radio group (vertical stack)
  - Options:
    - `[data-testid="artifact-policy-full"]` - "Full (all outputs)"
    - `[data-testid="artifact-policy-failures"]` - "Failures Only" (default)
    - `[data-testid="artifact-policy-sampled"]` - "Sampled"

### Action Buttons
- **Cancel Button**: `[data-testid="cancel-definition-btn"]` - Closes dialog without saving
- **Create Button**: `[data-testid="submit-definition-btn"]` - Submits form
  - Shows loading spinner during submission
  - POST to `/api/benchmark/projects/{id}/definitions`

## State Behaviors
- **Loading States**:
  - Dataset version dropdown shows loading while fetching datasets
  - Workflow dropdown shows loading while fetching workflows
  - Create button shows spinner during submission

- **Validation**:
  - Required fields show error on submit if empty
  - JSON config validates syntax, shows error for malformed JSON
  - First error field is focused

- **Conditional Display**:
  - Split dropdown disabled until dataset version selected
  - Split options filter based on selected dataset version

## Known Issues
1. **Split dropdown remains disabled**: Even after selecting dataset version, split dropdown stays disabled. Needs investigation - may be related to split data loading.
2. **Fixed - Workflow dropdown empty**: Fixed by updating seed data to use `test-user` instead of `seed-user`.

## API Calls
- GET `/api/benchmark/datasets?limit=1000` - Load all datasets
- GET `/api/benchmark/datasets/{id}/versions` - Load versions for each dataset
- GET `/api/workflows` - Load available workflows
- POST `/api/benchmark/projects/{projectId}/definitions` - Create definition
