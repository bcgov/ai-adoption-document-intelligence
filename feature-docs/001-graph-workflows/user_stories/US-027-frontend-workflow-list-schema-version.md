# US-027: Add SchemaVersion Badge Column to WorkflowListPage

**As a** workflow author,
**I want to** see the schema version of each workflow in the workflow list table,
**So that** I can quickly identify which graph schema version each workflow uses.

## Acceptance Criteria
- [ ] **Scenario 1**: SchemaVersion column appears in the table
    - **Given** the WorkflowListPage table
    - **When** rendered
    - **Then** a new `schemaVersion` column is displayed alongside name, description, version, dates, and actions

- [ ] **Scenario 2**: Schema version displayed as a badge
    - **Given** a workflow with `config.schemaVersion: "1.0"`
    - **When** the row renders
    - **Then** the schema version is shown as a badge (e.g., Mantine Badge component) displaying "1.0"

- [ ] **Scenario 3**: Existing CRUD operations unchanged
    - **Given** the workflow list page
    - **When** create, edit, and delete actions are performed
    - **Then** they function the same as before (no functional changes to CRUD)

## Priority
- [ ] High (Must Have)
- [ ] Medium (Should Have)
- [x] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/frontend/src/pages/WorkflowListPage.tsx` (modify existing)
- Per Section 8.1: same table layout with added schemaVersion badge column
- The schema version is extracted from `workflow.config.schemaVersion`
- No other functional changes to this page
