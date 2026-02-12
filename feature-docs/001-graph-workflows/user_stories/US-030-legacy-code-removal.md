# US-030: Remove Legacy Workflow Code and Files

**As a** developer,
**I want to** remove all legacy workflow code, types, components, and files that are replaced by the new graph workflow engine,
**So that** the codebase is clean, has no dead code, and there is no confusion between old and new implementations.

## Acceptance Criteria
- [ ] **Scenario 1**: Legacy frontend pages removed
    - **Given** the old workflow pages
    - **When** code cleanup is complete
    - **Then** `WorkflowPage.tsx` and `WorkflowEditPage.tsx` are deleted from `apps/frontend/src/pages/`

- [ ] **Scenario 2**: Legacy visualization component removed
    - **Given** the old SVG-based visualization
    - **When** code cleanup is complete
    - **Then** `WorkflowVisualization.tsx` is deleted from `apps/frontend/src/components/workflow/`

- [ ] **Scenario 3**: Legacy Temporal workflow config files removed
    - **Given** the old workflow config utilities
    - **When** code cleanup is complete
    - **Then** `workflow-config.ts` and `workflow-config-validator.ts` are deleted from `apps/temporal/src/`

- [ ] **Scenario 4**: Legacy backend validator removed
    - **Given** the old workflow validator
    - **When** code cleanup is complete
    - **Then** `workflow-validator.ts` is deleted from `apps/backend-services/src/workflow/`

- [ ] **Scenario 5**: Legacy workflow constants removed
    - **Given** the old workflow step constants
    - **When** code cleanup is complete
    - **Then** `workflow-constants.ts` (containing `VALID_WORKFLOW_STEP_IDS`) is deleted from `apps/backend-services/src/temporal/`

- [ ] **Scenario 6**: Old WorkflowStepsConfig types removed
    - **Given** the old `StepConfig` and `WorkflowStepsConfig` types
    - **When** code cleanup is complete
    - **Then** these types are removed from both frontend and backend type files

- [ ] **Scenario 7**: No references to removed files remain
    - **Given** all files are deleted
    - **When** the codebase is built
    - **Then** there are no broken imports, dangling references, or compilation errors

- [ ] **Scenario 8**: ocrWorkflow removed after transition period
    - **Given** all in-flight `ocrWorkflow` executions have completed
    - **When** the transition period is over
    - **Then** the `ocrWorkflow` function is removed from the Temporal worker, along with `startOCRWorkflow` and related dispatch code

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Complete list of files to remove in Appendix A of the requirements document
- Per Section 17.1: clean break, no backward compatibility
- Per Section 17.3: keep `ocrWorkflow` registered temporarily for in-flight executions; remove after all complete
- The `DEFAULT_WORKFLOW_STEPS` and `mergeWorkflowConfig` functions are no longer needed
- Run full build and test suite after removal to verify no broken references
- This story should be one of the last implemented to avoid breaking in-flight work
