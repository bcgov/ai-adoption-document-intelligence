# US-004: Pre-flight Workflow Cost Estimation

**As a** system,
**I want to** estimate the maximum cost of a workflow before it starts using a max-flow traversal of the workflow DAG,
**So that** the cap check has a conservative worst-case cost to compare against the group's remaining budget.

## Acceptance Criteria

- [ ] **Scenario 1**: Linear workflow returns sum of all activity node costs
    - **Given** a workflow graph where all nodes execute sequentially (no branching) and each activity has a flat cost in the active rate version
    - **When** the pre-flight estimator runs on this graph
    - **Then** the estimated cost equals the sum of `units` for all activities in the graph

- [ ] **Scenario 2**: Branching workflow returns cost of the most expensive branch
    - **Given** a workflow graph with a conditional branch node where one branch costs 100 units and another costs 300 units
    - **When** the pre-flight estimator runs on this graph
    - **Then** the estimated cost includes the 300-unit branch (worst case), not the 100-unit branch

- [ ] **Scenario 3**: Per-page activities use max_pages_assumption for estimation
    - **Given** an activity with `cost_type = "per_page"` and `units = 40`, and the active rate version has `max_pages_assumption = 50`
    - **When** the pre-flight estimator encounters this activity node
    - **Then** the node's estimated cost is `50 × 40 = 2000` units

- [ ] **Scenario 4**: Activities absent from the rate version contribute zero cost
    - **Given** a workflow graph that includes an activity not listed in the active rate version's `activity_costs`
    - **When** the pre-flight estimator encounters that node
    - **Then** the node contributes `0` units to the total estimated cost without throwing an error

- [ ] **Scenario 5**: Estimation uses the currently active rate version
    - **Given** multiple rate versions in the database with different `effective_from` dates
    - **When** the estimator runs at time T
    - **Then** only the rate version with the highest `effective_from` ≤ T is used for cost lookups

## Priority
- [x] High (Must Have)

## Technical Notes / Assumptions
- The workflow graph config is already fetched via `getWorkflowGraphConfig` before this estimator is called
- The max-flow/longest-path traversal must handle arbitrary DAG shapes; at each fork, take the maximum-cost branch
- The estimation result is stored as `estimated_units` on the `workflow_started` UsageEvent (see US-006)
- The cap check does not retroactively block a workflow if actual pages exceed `max_pages_assumption` — estimation is only used at start time
