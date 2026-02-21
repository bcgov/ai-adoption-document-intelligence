# US-028: Update Frontend API Hooks and Route Configuration

**As a** frontend developer,
**I want to** update the API hooks and routing configuration to use the new graph workflow types and the WorkflowEditorPage,
**So that** the frontend communicates with the updated backend API using the correct types and routes to the new editor page.

## Acceptance Criteria
- [ ] **Scenario 1**: useWorkflows hook uses GraphWorkflowConfig type
    - **Given** the `useWorkflows` hook
    - **When** reviewed
    - **Then** the `WorkflowInfo.config` field is typed as `GraphWorkflowConfig` instead of `WorkflowStepsConfig`

- [ ] **Scenario 2**: useCreateWorkflow sends GraphWorkflowConfig
    - **Given** the `useCreateWorkflow` hook
    - **When** a workflow is created
    - **Then** the request body `config` field is a `GraphWorkflowConfig` object

- [ ] **Scenario 3**: useUpdateWorkflow sends GraphWorkflowConfig
    - **Given** the `useUpdateWorkflow` hook
    - **When** a workflow is updated
    - **Then** the request body `config` field is a `GraphWorkflowConfig` object

- [ ] **Scenario 4**: Routes point to WorkflowEditorPage
    - **Given** the `App.tsx` route configuration
    - **When** the user navigates to create or edit a workflow
    - **Then** the `WorkflowEditorPage` component is rendered (replacing the old `WorkflowPage` and `WorkflowEditPage` routes)

- [ ] **Scenario 5**: Delete workflow hook remains unchanged
    - **Given** the `useDeleteWorkflow` hook
    - **When** reviewed
    - **Then** its implementation is unchanged (delete does not involve config types)

- [ ] **Scenario 6**: CreateWorkflowDto includes schemaVersion
    - **Given** the `CreateWorkflowDto` type
    - **When** reviewed
    - **Then** it includes `name`, `description`, and `config: GraphWorkflowConfig`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Files to modify: `apps/frontend/src/data/hooks/useWorkflows.ts`, `apps/frontend/src/App.tsx`
- Hook changes specified in Section 8.5
- The hooks keep the same structure; only the `config` type changes
- Route updates in `App.tsx` per Section 8.1 (WorkflowEditorPage replaces both WorkflowPage and WorkflowEditPage)
- Tests from Section 15.5: create workflow, edit workflow, delete workflow
