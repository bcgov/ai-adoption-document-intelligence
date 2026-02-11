# US-021: Replace startOCRWorkflow with startGraphWorkflow in TemporalClientService

**As a** developer,
**I want to** replace the `startOCRWorkflow` method in `TemporalClientService` with a `startGraphWorkflow` method,
**So that** the backend can start the new generic graph workflow execution instead of the old hardcoded OCR workflow.

## Acceptance Criteria
- [ ] **Scenario 1**: startGraphWorkflow loads config from database
    - **Given** a `workflowConfigId` referencing a workflow in the database
    - **When** `startGraphWorkflow` is called
    - **Then** the method loads the `GraphWorkflowConfig` from the `Workflow` table

- [ ] **Scenario 2**: Config hash is computed before starting
    - **Given** the loaded graph config
    - **When** `startGraphWorkflow` prepares the workflow input
    - **Then** it computes the SHA-256 config hash using the canonicalization algorithm (US-015)

- [ ] **Scenario 3**: Temporal workflow is started with correct input
    - **Given** the graph config, initial context, and computed hash
    - **When** the Temporal client starts the workflow
    - **Then** it calls `client.workflow.start("graphWorkflow", { args: [{ graph, initialCtx, configHash, runnerVersion }] })` on the `ocr-processing` task queue

- [ ] **Scenario 4**: Initial context includes document metadata
    - **Given** a document ID and associated metadata
    - **When** `startGraphWorkflow` constructs the `initialCtx`
    - **Then** the context includes `documentId`, `blobKey`, and other relevant document fields

- [ ] **Scenario 5**: Old startOCRWorkflow is removed
    - **Given** the updated `TemporalClientService`
    - **When** the code is reviewed
    - **Then** the `startOCRWorkflow` method and associated backward compatibility code are removed

- [ ] **Scenario 6**: Method returns the Temporal workflow execution ID
    - **Given** a successful workflow start
    - **When** the method completes
    - **Then** the Temporal workflow execution ID is returned (same pattern as the old method)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/src/temporal/temporal-client.service.ts`
- Method signature specified in Section 9.3
- Depends on US-015 for config hash computation
- The method loads the workflow config from the database, so it requires access to the workflow service/repository
- Remove old `startOCRWorkflow` and any "wrapped steps key handling" backward compatibility code
- Tests should verify the correct Temporal workflow input is constructed
