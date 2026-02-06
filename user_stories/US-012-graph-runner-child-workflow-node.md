# US-012: Implement ChildWorkflow Node Execution in Graph Runner

**As a** developer,
**I want to** the graph runner to execute childWorkflow nodes that invoke other graph workflow definitions as Temporal child workflows,
**So that** workflow graphs can compose reusable subgraphs (library workflows) and support modular workflow design.

## Acceptance Criteria
- [ ] **Scenario 1**: Library workflow reference starts a child workflow
    - **Given** a childWorkflow node with `workflowRef.type: "library"` and `workflowRef.workflowId` referencing a workflow in the database
    - **When** the node executes
    - **Then** the runner loads the referenced workflow's graph config and starts a new `graphWorkflow` Temporal child workflow with that config

- [ ] **Scenario 2**: Inline workflow reference starts a child workflow
    - **Given** a childWorkflow node with `workflowRef.type: "inline"` containing an embedded `GraphWorkflowConfig`
    - **When** the node executes
    - **Then** the runner starts a child `graphWorkflow` with the embedded graph definition

- [ ] **Scenario 3**: Input mappings pass parent context to child
    - **Given** a childWorkflow node with `inputMappings: [{ port: "blobKey", ctxKey: "currentSegment.blobKey" }]`
    - **When** the child workflow starts
    - **Then** the child workflow's `initialCtx` includes `blobKey` resolved from the parent's `ctx.currentSegment.blobKey`

- [ ] **Scenario 4**: Output mappings propagate child results to parent
    - **Given** a childWorkflow node with `outputMappings: [{ port: "ocrResult", ctxKey: "segmentOcrResult" }]`
    - **When** the child workflow completes
    - **Then** the child's output `ocrResult` is written to the parent's `ctx.segmentOcrResult`

- [ ] **Scenario 5**: Child workflow receives parentWorkflowId
    - **Given** a childWorkflow node executes
    - **When** the child `graphWorkflow` is started
    - **Then** the `GraphWorkflowInput.parentWorkflowId` is set to the parent workflow's ID

- [ ] **Scenario 6**: Child workflow failure propagates to parent
    - **Given** a child workflow fails
    - **When** the parent's childWorkflow node receives the failure
    - **Then** the error is handled according to the node's `errorPolicy` (default: fail the parent workflow)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a node-type handler within the graph runner (US-006)
- Per Section 3 (Key Architectural Decision 4), library workflows are stored as `Workflow` records in the database
- The child workflow runs the same `graphWorkflow` function -- this is recursive composition
- The multi-page example in Section 4.5 shows `segmentOcr` as a childWorkflow node referencing the standard OCR workflow
- Loading a library workflow by database ID requires an activity call (since workflow functions cannot do I/O)
- Tests must cover: childWorkflow node starts child, waits for result, maps output to parent ctx (Section 15.2)
