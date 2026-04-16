# US-009: Unresolved Binding Error Handling

**As a** workflow admin,
**I want to** have the transformation node halt the workflow and surface a clear error when a binding expression cannot be resolved,
**So that** silent data corruption is prevented and I can diagnose which field is missing.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [x] **Scenario 1**: Unresolved binding halts the workflow
    - **Given** a transform node whose field mapping contains `{{extractionNode.MissingField}}` and `MissingField` does not exist in the upstream output
    - **When** the transform node executes in Temporal
    - **Then** a non-retryable `ApplicationFailure` is thrown and the workflow halts at that node

- [x] **Scenario 2**: Error message identifies the unresolved binding path
    - **Given** the same unresolved binding scenario
    - **When** the `ApplicationFailure` is thrown
    - **Then** the error message contains the full unresolved binding path (e.g., `"extractionNode.MissingField"`)

- [x] **Scenario 3**: Error is recorded in the workflow execution log
    - **Given** the workflow halts due to an unresolved binding
    - **When** the Temporal workflow execution history is inspected
    - **Then** an activity failure event is present with the unresolved path in its details

- [x] **Scenario 4**: Workflow node status reflects the error
    - **Given** the workflow has halted due to an unresolved binding
    - **When** the node status is queried via the backend
    - **Then** the transform node's status shows a failed/error state

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The error should use `ApplicationFailure.create({ type: "TRANSFORM_BINDING_ERROR", nonRetryable: true, message: ... })` consistent with existing error patterns in `node-executors.ts`.
- The error must be non-retryable since unresolved bindings are a configuration issue, not a transient failure.
- This story depends on US-003 (binding resolver) for the actual detection logic; this story adds the Temporal-level error propagation and logging.
- The error badge visible in the workflow UI (FR-6.3) is a frontend concern covered by US-015.
