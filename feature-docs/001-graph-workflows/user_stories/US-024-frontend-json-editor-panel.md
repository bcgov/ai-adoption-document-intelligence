# US-024: Implement JSON Editor Panel with CodeMirror

**As a** workflow author,
**I want to** edit graph workflow configurations in a JSON text editor with syntax highlighting, bracket matching, and inline error markers,
**So that** I can author and modify workflow graph definitions directly in JSON with immediate feedback on syntax and validation errors.

## Acceptance Criteria
- [ ] **Scenario 1**: CodeMirror editor renders with JSON mode
    - **Given** the WorkflowEditorPage is loaded
    - **When** the left panel renders
    - **Then** a CodeMirror 6 editor is displayed with JSON syntax highlighting and bracket matching

- [ ] **Scenario 2**: Editor loads with existing workflow config
    - **Given** an existing workflow is being edited
    - **When** the editor page loads
    - **Then** the editor contains the workflow's `GraphWorkflowConfig` JSON, pretty-printed

- [ ] **Scenario 3**: Editor loads empty for new workflows
    - **Given** a new workflow is being created
    - **When** the editor page loads
    - **Then** the editor contains a minimal valid `GraphWorkflowConfig` template or is empty

- [ ] **Scenario 4**: Validation errors shown inline
    - **Given** the JSON is valid JSON but fails graph schema validation
    - **When** validation runs
    - **Then** error markers (red underlines) appear at the relevant locations and a collapsible error panel below the editor lists all errors

- [ ] **Scenario 5**: Malformed JSON shows syntax error
    - **Given** the editor content is not valid JSON
    - **When** parsing fails
    - **Then** a syntax error indicator is shown in the editor

- [ ] **Scenario 6**: Editor content changes trigger debounced sync
    - **Given** the user is typing in the editor
    - **When** 300ms elapses after the last keystroke
    - **Then** the JSON is parsed and the React Flow visualization (US-025) is updated

- [ ] **Scenario 7**: Format JSON button pretty-prints
    - **Given** the toolbar Format JSON button
    - **When** clicked
    - **Then** the editor content is reformatted with consistent indentation

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The editor is the left panel (50-60% width) of the WorkflowEditorPage (US-026)
- Use CodeMirror 6 per Section 8.1 specification
- Add `codemirror` and related packages to frontend `package.json`
- The editor content is the `GraphWorkflowConfig` JSON (the `config` field value)
- Debounce interval is 300ms per Section 8.1
- JSON schema-based autocompletion is a nice-to-have if CodeMirror supports it
- Tests from Section 15.5: JSON editor renders, invalid JSON shows error, validation errors shown
