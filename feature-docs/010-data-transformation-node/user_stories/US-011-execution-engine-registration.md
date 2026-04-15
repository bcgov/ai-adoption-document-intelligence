# US-011: Register Transform Node in Execution Engine and Validators

**As a** developer,
**I want to** wire the `transform` node type into the Temporal node executor, both graph schema validators, and the activity registries,
**So that** workflow configs containing transform nodes are validated at save time and executed correctly at runtime.

## Acceptance Criteria
<!-- Keep to 4-6 scenarios max. Each scenario should be independently implementable. -->
- [ ] **Scenario 1**: executeNode handles the transform case
    - **Given** the Temporal graph runner encounters a node with `type: "transform"`
    - **When** `executeNode` dispatches on node type
    - **Then** the transform execution pipeline (parse → resolve bindings → render → validate output) is invoked and the result is written to the workflow context

- [ ] **Scenario 2**: Backend validator rejects transform nodes with missing required fields
    - **Given** a workflow config containing a transform node missing `inputFormat`, `outputFormat`, or `fieldMapping`
    - **When** the backend graph schema validator runs at save time
    - **Then** validation fails with a clear error message identifying the missing field(s)

- [ ] **Scenario 3**: Temporal validator rejects transform nodes with missing required fields
    - **Given** the same invalid transform node config reaching the Temporal worker
    - **When** the Temporal graph schema validator runs defensively at execution time
    - **Then** validation fails with a clear error message identifying the missing field(s)

- [ ] **Scenario 4**: Valid transform node config passes both validators
    - **Given** a workflow config containing a transform node with valid `inputFormat`, `outputFormat`, and `fieldMapping`
    - **When** both the backend and Temporal validators run
    - **Then** validation passes with no errors for the transform node

- [ ] **Scenario 5**: Transform node output is written to workflow context
    - **Given** a transform node that successfully renders its output
    - **When** execution completes
    - **Then** the rendered output string is written to the ctx key specified in the node's `outputs` port bindings

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- `executeNode` in `apps/temporal/src/graph-engine/node-executors.ts` needs a new `case "transform":` branch.
- Both `apps/backend-services/src/workflow/graph-schema-validator.ts` and `apps/temporal/src/graph-schema-validator.ts` need a validation function for transform node required fields.
- The transform node reads its input from the workflow context via `inputs` port bindings (providing upstream node output strings keyed by node ID) and writes the rendered output string via `outputs` port bindings.
- Existing tests for the graph schema validators and node executor should be updated to include transform node cases.
- This story depends on US-001 (type definitions) and all transformation engine stories (US-002 through US-010).
