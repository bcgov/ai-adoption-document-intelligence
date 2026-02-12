# US-022: Integrate Graph Schema Validator into Workflow Service

**As a** developer,
**I want to** wire the new graph schema validator into the workflow service's create and update operations,
**So that** all workflow configurations are validated against the graph schema before being persisted to the database.

## Acceptance Criteria
- [ ] **Scenario 1**: Create workflow validates config
    - **Given** a POST request to `/api/workflows` with a `config` field
    - **When** the workflow service processes the request
    - **Then** `validateGraphConfig` is called on the config; if validation fails, a 400 response is returned with the validation errors

- [ ] **Scenario 2**: Update workflow validates config
    - **Given** a PUT request to `/api/workflows/:id` with an updated `config`
    - **When** the workflow service processes the request
    - **Then** `validateGraphConfig` is called; if validation fails, a 400 response is returned with errors

- [ ] **Scenario 3**: Valid config is persisted
    - **Given** a config that passes all validation checks
    - **When** the create or update completes
    - **Then** the `GraphWorkflowConfig` is stored in the `config` JSONB column

- [ ] **Scenario 4**: Validation errors include structured details
    - **Given** an invalid config
    - **When** validation fails
    - **Then** the error response includes an array of `GraphValidationError` objects with `path`, `message`, and `severity`

- [ ] **Scenario 5**: Old validator is replaced
    - **Given** the workflow service code
    - **When** reviewed
    - **Then** references to the old `workflow-validator.ts` are removed and replaced with `graph-schema-validator.ts`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files to modify: `apps/backend-services/src/workflow/workflow.service.ts`, `apps/backend-services/src/workflow/workflow.controller.ts`
- Depends on US-004 (backend graph schema validator)
- The controller should translate validation errors into appropriate HTTP 400 responses
- The old `workflow-validator.ts` should be removed after this story is complete
- Tests should verify both valid and invalid configs produce correct API responses
