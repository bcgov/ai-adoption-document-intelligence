# US-004: Implement Backend Graph Schema Validator

**As a** developer,
**I want to** have a comprehensive graph schema validator in the backend service,
**So that** invalid graph configurations are rejected at save time with clear, actionable error messages before they reach the Temporal worker.

## Acceptance Criteria
- [ ] **Scenario 1**: Schema version validation
    - **Given** a graph config with an unrecognized `schemaVersion`
    - **When** validation runs
    - **Then** an error is returned indicating the schema version is not supported

- [ ] **Scenario 2**: Node ID uniqueness and entry node existence
    - **Given** a graph config with duplicate node IDs or a missing `entryNodeId`
    - **When** validation runs
    - **Then** errors are returned for duplicate node IDs and/or entry node not found in `nodes`

- [ ] **Scenario 3**: Entry node has no incoming edges
    - **Given** a graph where the entry node has an incoming edge
    - **When** validation runs
    - **Then** an error is returned indicating the entry node must not have incoming edges

- [ ] **Scenario 4**: Activity type validation against the registry
    - **Given** an activity node with `activityType: "nonexistent"`
    - **When** validation runs
    - **Then** an error is returned indicating the activity type is not registered

- [ ] **Scenario 5**: Edge validation (unique IDs, valid source/target)
    - **Given** edges with duplicate IDs or referencing non-existent nodes
    - **When** validation runs
    - **Then** appropriate errors are returned for each invalid edge

- [ ] **Scenario 6**: DAG cycle detection
    - **Given** a graph with a cycle (A -> B -> C -> A)
    - **When** validation runs
    - **Then** an error is returned indicating a cycle was detected

- [ ] **Scenario 7**: Reachability check
    - **Given** a graph with an orphan node not reachable from the entry node
    - **When** validation runs
    - **Then** a warning is returned indicating the unreachable node

- [ ] **Scenario 8**: Switch node validation
    - **Given** a switch node missing a `defaultEdge` or with case edge IDs that do not exist
    - **When** validation runs
    - **Then** errors are returned for the missing default or invalid edge references

- [ ] **Scenario 9**: Map/Join node cross-references
    - **Given** a map node with invalid `bodyEntryNodeId` or `bodyExitNodeId`, or a join node referencing a non-existent `sourceMapNodeId`
    - **When** validation runs
    - **Then** errors are returned for invalid references

- [ ] **Scenario 10**: Context key validation for port bindings
    - **Given** a node with an input port binding referencing an undeclared ctx key
    - **When** validation runs
    - **Then** an error is returned indicating the ctx key is not declared

- [ ] **Scenario 11**: Expression validation
    - **Given** a switch condition with an unknown operator or referencing a non-existent ctx variable
    - **When** validation runs
    - **Then** errors are returned for the invalid expression

- [ ] **Scenario 12**: Validation returns structured errors
    - **Given** any validation failure
    - **When** the result is inspected
    - **Then** each error includes a JSON `path`, human-readable `message`, and `severity` ("error" or "warning")

- [ ] **Scenario 13**: Valid graphs pass validation
    - **Given** a well-formed graph (e.g., the standard OCR workflow from Section 4.4)
    - **When** validation runs
    - **Then** the result is `{ valid: true, errors: [] }`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- File: `apps/backend-services/src/workflow/graph-schema-validator.ts`
- Replaces the existing `workflow-validator.ts`
- Uses the `ACTIVITY_REGISTRY` constant from US-002 for activity type validation
- Validation rules are detailed in Section 9.2
- Tests must cover all 14 test cases listed in Section 15.1
- The validator function signature: `validateGraphConfig(config: GraphWorkflowConfig): { valid: boolean; errors: GraphValidationError[] }`
