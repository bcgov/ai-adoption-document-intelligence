# Test Plan: US-029 - Benchmark Definition CRUD UI

**Source**: `user-stories/US-029-benchmark-definition-crud-ui.md`
**Requirement Section**: Section 10.1 (Phase 1 -- Benchmark UI)
**Priority**: High

## User Story
**As a** user,
**I want to** create and manage benchmark definitions through the UI,
**So that** I can configure what to benchmark by selecting dataset versions, workflows, evaluators, and runtime settings.

## Acceptance Criteria
- Create benchmark definition form
- Dataset version dropdown populates correctly
- Workflow dropdown populates correctly
- Definition is created successfully
- Definition list within project view
- Definition detail view
- Immutable definition shows revision history

## Test Scenarios

### Scenario 1: Open Create Definition Form
- **Type**: Happy Path
- **Priority**: High

**Given**: User is on a project detail page
**When**: User clicks "Create Definition" button
**Then**:
- Form dialog/page opens with all required fields
- Fields visible: name, dataset version (dropdown), split (dropdown), workflow (dropdown), evaluator type (dropdown), evaluator config (JSON editor), runtime settings (form fields), artifact policy (radio buttons)
- All dropdowns are populated with data
- Form is ready for input

**Affected Pages**: Project detail page
**Data Requirements**: Project ID, available datasets/workflows
**Prerequisites**: User logged in, project exists

### Scenario 2: Dataset Version Dropdown Loads
- **Type**: Happy Path
- **Priority**: High

**Given**: Published dataset versions exist in the system
**When**: User opens the dataset version dropdown
**Then**:
- Published versions are listed with format: "{dataset name} - v{version} ({document count} docs)"
- Draft versions are shown with warning indicator/icon
- Dropdown is searchable/filterable
- Most recent versions appear first

**Affected Pages**: Create definition form
**Data Requirements**: 3+ datasets with published versions, 1+ draft version
**Prerequisites**: User logged in, datasets exist

### Scenario 3: Split Dropdown Filters by Version
- **Type**: Happy Path
- **Priority**: High

**Given**: User has selected a dataset version
**When**: User opens the split dropdown
**Then**:
- Only splits for the selected dataset version are shown
- Split types are indicated (train/val/test/golden)
- If no splits exist, dropdown shows "No splits available"
- User can proceed without selecting a split (optional)

**Affected Pages**: Create definition form
**Data Requirements**: Dataset version with 2+ splits
**Prerequisites**: User logged in, splits created

### Scenario 4: Workflow Dropdown Loads
- **Type**: Happy Path
- **Priority**: High

**Given**: Workflows exist in the system
**When**: User opens the workflow dropdown
**Then**:
- Available workflows are listed with format: "{name} (v{version})"
- Workflows are ordered by name or recent usage
- Dropdown is searchable
- Workflow descriptions are visible (optional)

**Affected Pages**: Create definition form
**Data Requirements**: 3+ workflows
**Prerequisites**: User logged in, workflows exist

### Scenario 5: Evaluator Type Dropdown
- **Type**: Happy Path
- **Priority**: High

**Given**: User is filling out the definition form
**When**: User opens the evaluator type dropdown
**Then**:
- Available evaluator types are listed: "schema-aware", "black-box"
- Each evaluator has a brief description
- Selection updates the evaluator config editor with appropriate schema/template

**Affected Pages**: Create definition form
**Data Requirements**: Evaluator registry
**Prerequisites**: User logged in

### Scenario 6: Evaluator Config JSON Editor
- **Type**: Happy Path
- **Priority**: Medium

**Given**: User has selected an evaluator type
**When**: Evaluator config section is rendered
**Then**:
- JSON editor is displayed with syntax highlighting
- Default/template config is pre-populated
- Editor validates JSON syntax
- Invalid JSON shows error indicators

**Affected Pages**: Create definition form
**Data Requirements**: Evaluator config schema
**Prerequisites**: User logged in

### Scenario 7: Runtime Settings Form
- **Type**: Happy Path
- **Priority**: High

**Given**: User is filling out the definition form
**When**: Runtime settings section is visible
**Then**:
- Fields include: maxParallelDocuments (number), perDocumentTimeout (number), useProductionQueue (checkbox)
- Default values are pre-populated
- Number inputs have min/max validation
- Help text explains each setting

**Affected Pages**: Create definition form
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 8: Artifact Policy Selection
- **Type**: Happy Path
- **Priority**: High

**Given**: User is filling out the definition form
**When**: Artifact policy section is rendered
**Then**:
- Radio buttons for: "full", "failures_only", "sampled"
- Each option has description text
- "full" is selected by default
- Only one option can be selected

**Affected Pages**: Create definition form
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 9: Create Definition Success
- **Type**: Happy Path
- **Priority**: High

**Given**: All required fields are filled with valid data
**When**: User submits the form
**Then**:
- POST request to `/api/benchmark/projects/{id}/definitions` is sent
- Success notification appears
- Form closes
- Definition list refreshes showing the new definition
- User can see the new definition in the list

**Affected Pages**: Project detail page
**Data Requirements**: Valid form data
**Prerequisites**: User logged in, all referenced entities exist

### Scenario 10: Validation - Required Fields
- **Type**: Error Case
- **Priority**: High

**Given**: User attempts to create a definition
**When**: User leaves required fields (name, dataset version, workflow) empty and submits
**Then**:
- Error messages appear on empty required fields
- Form does not submit
- First error field is focused
- User can correct and retry

**Affected Pages**: Create definition form
**Data Requirements**: None
**Prerequisites**: User logged in

### Scenario 11: Validation - Invalid JSON Config
- **Type**: Error Case
- **Priority**: High

**Given**: User is entering evaluator config
**When**: User enters malformed JSON and submits
**Then**:
- JSON editor shows syntax error indicator
- Error message: "Invalid JSON syntax"
- Form does not submit
- User can correct the JSON

**Affected Pages**: Create definition form
**Data Requirements**: Malformed JSON string
**Prerequisites**: User logged in

### Scenario 12: Definition List Display
- **Type**: Happy Path
- **Priority**: High

**Given**: Project has multiple definitions
**When**: User views the project detail page
**Then**:
- Definition table shows columns: name, dataset version, workflow name, evaluator type, immutable status, revision number, actions
- Each definition row is clickable
- Action buttons include: View Details, Start Run, Edit (if not immutable)

**Affected Pages**: Project detail page
**Data Requirements**: Project with 3+ definitions
**Prerequisites**: User logged in, project exists

### Scenario 13: View Definition Detail
- **Type**: Happy Path
- **Priority**: High

**Given**: Definition exists
**When**: User clicks on a definition row or "View Details"
**Then**:
- Detail view/page opens showing:
  - Name, dataset version details, split details, workflow details
  - Evaluator type and config (formatted JSON)
  - Runtime settings (formatted)
  - Artifact policy
  - Immutable flag
  - Revision history (if revisions exist)
- All configuration is read-only display

**Affected Pages**: Definition detail page/modal
**Data Requirements**: Complete definition
**Prerequisites**: User logged in, definition exists

### Scenario 14: Immutable Definition - Revision History
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Definition has been revised (multiple revisions exist with different revision numbers)
**When**: User views the definition detail
**Then**:
- Revision history section is visible
- All revisions are listed with: revision number, creation date, creator
- Configuration differences between revisions are highlighted (optional)
- User can view each revision's full config

**Affected Pages**: Definition detail page
**Data Requirements**: Definition with 2+ revisions
**Prerequisites**: User logged in, revised definition exists

### Scenario 15: Cannot Edit Immutable Definition
- **Type**: Edge Case
- **Priority**: High

**Given**: Definition with `immutable=true` (has been executed)
**When**: Definition list is rendered
**Then**:
- "Edit" button is not visible for immutable definitions
- Immutable badge/indicator is shown
- User can view details but not modify
- "Create Revision" action is available instead

**Affected Pages**: Project detail page, Definition detail
**Data Requirements**: Immutable definition
**Prerequisites**: User logged in, definition executed

### Scenario 16: Create New Revision
- **Type**: Happy Path
- **Priority**: Medium

**Given**: Immutable definition exists
**When**: User clicks "Create Revision" action
**Then**:
- Create definition form opens
- Form is pre-populated with current definition's config
- Revision number is incremented
- User can modify settings and create new revision
- New definition ID is generated

**Affected Pages**: Definition form
**Data Requirements**: Immutable definition
**Prerequisites**: User logged in

### Scenario 17: API Error Handling
- **Type**: Error Case
- **Priority**: High

**Given**: User attempts to create a definition
**When**: API returns 500 error or validation error
**Then**:
- Error notification displays with server message
- Form remains open with user's data preserved
- User can retry submission
- Definition list does not update

**Affected Pages**: Create definition form
**Data Requirements**: Simulated API error
**Prerequisites**: User logged in

## Coverage Analysis
- ✅ Happy path covered (create, view, list, revisions)
- ✅ Edge cases covered (immutable definitions, validation, JSON errors)
- ✅ Error handling covered (API errors, required fields)
- ✅ Dependent dropdowns covered (split filtered by version)
- ⚠️ Missing: Performance with large number of workflows/datasets in dropdowns
- ⚠️ Missing: Concurrent editing scenarios
