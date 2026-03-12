# US-029: Benchmark Definition CRUD UI

**As a** user,
**I want to** create and manage benchmark definitions through the UI,
**So that** I can configure what to benchmark by selecting dataset versions, workflows, evaluators, and runtime settings.

## Acceptance Criteria
- [ ] **Scenario 1**: Create benchmark definition form
    - **Given** the user is on a project detail page
    - **When** the user clicks "Create Definition"
    - **Then** a form is displayed with fields for: name, dataset version (dropdown), split (dropdown filtered by selected version), workflow (dropdown), evaluator type (dropdown from registry), evaluator config (JSON editor), runtime settings (form fields), and artifact policy (radio: full/failures_only/sampled)

- [ ] **Scenario 2**: Dataset version dropdown populates correctly
    - **Given** published dataset versions exist
    - **When** the user opens the dataset version dropdown
    - **Then** published versions are listed with version label and document count, and draft versions are shown with a warning indicator

- [ ] **Scenario 3**: Workflow dropdown populates correctly
    - **Given** workflows exist in the system
    - **When** the user opens the workflow dropdown
    - **Then** available workflows are listed with name and version

- [ ] **Scenario 4**: Definition is created successfully
    - **Given** all required fields are filled
    - **When** the user submits the form
    - **Then** the definition is created via `POST /api/benchmark/projects/:id/definitions`, the form closes, and the definition list refreshes

- [ ] **Scenario 5**: Definition list within project view
    - **Given** a project with multiple definitions
    - **When** the user views the project detail page
    - **Then** a definition list is displayed with columns: name, dataset version, workflow name, evaluator type, immutable status, revision number, and actions

- [ ] **Scenario 6**: Definition detail view
    - **Given** a definition exists
    - **When** the user clicks on a definition
    - **Then** a detail view shows all configuration: name, dataset version details, split details, workflow details, evaluator type and config, runtime settings, artifact policy, immutable flag, and revision history

- [ ] **Scenario 7**: Immutable definition shows revision history
    - **Given** a definition that has been revised (multiple revisions exist)
    - **When** the user views the definition detail
    - **Then** the revision history is displayed showing all revisions with their creation dates and configuration differences

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files: `apps/frontend/src/pages/benchmarking/ProjectDetailPage.tsx`, `apps/frontend/src/components/benchmarking/CreateDefinitionForm.tsx`, `apps/frontend/src/components/benchmarking/DefinitionDetail.tsx`
- Evaluator types are fetched from the backend (or hardcoded for Phase 1: "schema-aware", "black-box")
- Evaluator config uses a JSON editor component
- Runtime settings include: maxParallelDocuments, perDocumentTimeout, useProductionQueue
- See Requirements Section 10.1 (Phase 1 -- Benchmark UI)
