# US-020: Update Backend DTOs and Workflow Type Constants

**As a** developer,
**I want to** update the backend DTOs, workflow type constants, and related type definitions to use the new graph workflow schema,
**So that** the backend API accepts and returns `GraphWorkflowConfig` instead of the old `WorkflowStepsConfig` format.

## Acceptance Criteria
- [ ] **Scenario 1**: CreateWorkflowDto uses GraphWorkflowConfig
    - **Given** the updated `CreateWorkflowDto`
    - **When** a POST request is made to `/api/workflows`
    - **Then** the `config` field is validated as a `GraphWorkflowConfig` object (not `WorkflowStepsConfig`)

- [ ] **Scenario 2**: UpdateWorkflowDto uses GraphWorkflowConfig
    - **Given** the updated DTO for PUT requests
    - **When** a PUT request is made to `/api/workflows/:id`
    - **Then** the `config` field is validated as a `GraphWorkflowConfig` object

- [ ] **Scenario 3**: WORKFLOW_TYPES constant is updated
    - **Given** the `workflow-types.ts` file
    - **When** it is reviewed
    - **Then** it exports `WORKFLOW_TYPES = { GRAPH_WORKFLOW: "graphWorkflow" }` and the old OCR workflow type is removed

- [ ] **Scenario 4**: VALID_WORKFLOW_STEP_IDS is replaced by ACTIVITY_REGISTRY
    - **Given** the workflow constants
    - **When** reviewed
    - **Then** `VALID_WORKFLOW_STEP_IDS` is removed and `ACTIVITY_REGISTRY` constant (with activity types and descriptions) is available

- [ ] **Scenario 5**: API response includes GraphWorkflowConfig
    - **Given** a GET request to `/api/workflows` or `/api/workflows/:id`
    - **When** the response is returned
    - **Then** the `config` field contains a `GraphWorkflowConfig` JSON object

- [ ] **Scenario 6**: WorkflowInfo type includes schemaVersion
    - **Given** the `WorkflowInfo` response type
    - **When** it is reviewed
    - **Then** it includes a `schemaVersion` field derived from the config

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files to modify: `apps/backend-services/src/workflow/dto/create-workflow.dto.ts`, `apps/backend-services/src/temporal/workflow-types.ts`
- File to remove: `apps/backend-services/src/temporal/workflow-constants.ts` (VALID_WORKFLOW_STEP_IDS)
- DTO update specified in Section 9.4
- Workflow types update in Section 9.5
- No backward compatibility with old format per Section 2 (Goals item 9)
- Tests should verify API accepts new format and rejects old format
