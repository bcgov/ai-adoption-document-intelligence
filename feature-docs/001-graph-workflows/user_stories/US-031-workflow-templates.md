# US-031: Provide Standard OCR and Multi-Page Report Workflow Templates

**As a** workflow author,
**I want to** have pre-built workflow templates for the standard OCR workflow and the multi-page report workflow,
**So that** I can quickly create common workflow configurations without writing the graph JSON from scratch.

## Acceptance Criteria
- [ ] **Scenario 1**: Standard OCR workflow template is available
    - **Given** the graph equivalent of the old 11-step OCR workflow (Section 4.4)
    - **When** a user wants to create a standard OCR workflow
    - **Then** a template JSON file or seeded database record provides the complete `GraphWorkflowConfig` for the standard OCR pipeline (update status, prepare file, submit OCR, poll results, extract, cleanup, check confidence, review switch, human gate, store results)

- [ ] **Scenario 2**: Multi-page report workflow template is available
    - **Given** the multi-page workflow example from Section 4.5
    - **When** a user wants to create a multi-page report workflow
    - **Then** a template JSON file or seeded database record provides the complete `GraphWorkflowConfig` for the multi-page report pipeline (update status, split document, map segments, OCR child workflows, classify, join, validate fields, store results)

- [ ] **Scenario 3**: Templates are valid against the graph schema
    - **Given** either template
    - **When** validated using the graph schema validator
    - **Then** validation passes with no errors

- [ ] **Scenario 4**: Templates are importable or selectable
    - **Given** a user creating a new workflow
    - **When** they want to start from a template
    - **Then** the templates are available as importable JSON files or can be seeded into the database as workflow records

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Per Section 17.2 step 5: "Create a Standard OCR Workflow template and optionally a Multi-Page Report template"
- Templates can be provided as JSON files in the repository or seeded into the database
- The standard OCR template is the graph from Section 4.4
- The multi-page report template is the graph from Section 4.5
- Both templates serve as reference implementations and migration aids for users recreating their old workflows
- Templates should be validated by the automated test suite
