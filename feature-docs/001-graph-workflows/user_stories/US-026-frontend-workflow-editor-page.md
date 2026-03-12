# US-026: Implement WorkflowEditorPage (Combined Create/Edit)

**As a** workflow author,
**I want to** have a single page for both creating and editing workflows with a split-panel layout,
**So that** I can author workflow graphs with a JSON editor on the left and a live visualization on the right, with metadata fields and action toolbar.

## Acceptance Criteria
- [ ] **Scenario 1**: Page renders with two-panel split layout
    - **Given** the user navigates to the workflow editor route
    - **When** the page loads
    - **Then** a two-panel layout is displayed: left panel (50-60%) for the JSON editor and right panel (40-50%) for the React Flow visualization

- [ ] **Scenario 2**: Metadata panel shows above editors
    - **Given** the editor page
    - **When** rendered
    - **Then** a metadata section above the panels includes: workflow name (text input), description (text input), and version badge (read-only, shown in edit mode)

- [ ] **Scenario 3**: Create mode for new workflows
    - **Given** the user navigates to the create workflow route
    - **When** the page loads
    - **Then** the name and description fields are empty, the JSON editor contains a minimal template or is empty, and the Save button creates a new workflow

- [ ] **Scenario 4**: Edit mode for existing workflows
    - **Given** the user navigates to edit an existing workflow
    - **When** the page loads
    - **Then** the name, description, and JSON editor are populated from the database record, and the Save button updates the existing workflow

- [ ] **Scenario 5**: Save button persists the workflow
    - **Given** valid metadata and a valid graph config in the editor
    - **When** the Save/Create button is clicked
    - **Then** the workflow is created or updated via the API, and the user receives success feedback

- [ ] **Scenario 6**: Validate button runs validation without saving
    - **Given** a graph config in the editor
    - **When** the Validate button is clicked
    - **Then** validation runs and errors are displayed without persisting changes

- [ ] **Scenario 7**: Format JSON button reformats the editor content
    - **Given** the JSON editor has content
    - **When** the Format JSON button is clicked
    - **Then** the JSON is pretty-printed with consistent indentation

- [ ] **Scenario 8**: Reset button reverts changes
    - **Given** unsaved changes in the editor
    - **When** the Reset button is clicked
    - **Then** the editor reverts to the last saved state (or empty/template for new workflows)

- [ ] **Scenario 9**: Debounced sync between editor and visualization
    - **Given** the user edits JSON in the left panel
    - **When** 300ms elapses after the last keystroke and the JSON is valid
    - **Then** the React Flow visualization in the right panel updates to reflect the changes

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/pages/WorkflowEditorPage.tsx` (new file)
- Replaces both `WorkflowPage.tsx` and `WorkflowEditPage.tsx`
- Composes the JSON editor (US-024) and GraphVisualization (US-025) components
- Toolbar actions: Save/Create, Validate, Format JSON, Reset (Section 8.1)
- Uses Mantine UI components consistent with the existing frontend
- Tests from Section 15.5: create workflow, edit workflow
