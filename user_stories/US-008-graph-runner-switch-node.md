# US-008: Implement Switch Node Execution in Graph Runner

**As a** developer,
**I want to** the graph runner to execute switch nodes by evaluating condition expressions and routing to the correct outgoing edge,
**So that** workflow graphs can include conditional branching logic based on runtime context values.

## Acceptance Criteria
- [ ] **Scenario 1**: True case is followed
    - **Given** a switch node with a case whose condition evaluates to true
    - **When** the node executes
    - **Then** the runner follows the edge identified by the matching case's `edgeId`

- [ ] **Scenario 2**: Cases are evaluated in order
    - **Given** a switch node with multiple cases where more than one could match
    - **When** the node executes
    - **Then** the first matching case (in array order) is selected

- [ ] **Scenario 3**: Default edge is followed when no case matches
    - **Given** a switch node where no case condition evaluates to true
    - **When** the node executes
    - **Then** the runner follows the `defaultEdge`

- [ ] **Scenario 4**: Input port bindings provide context for evaluation
    - **Given** a switch node with `inputs: [{ port: "requiresReview", ctxKey: "requiresReview" }]`
    - **When** the node executes
    - **Then** the condition expressions can reference the ctx values bound to the input ports

- [ ] **Scenario 5**: Complex conditions evaluate correctly
    - **Given** a switch case with a nested logical expression (e.g., `and` combining comparison and null check)
    - **When** the node executes
    - **Then** the expression evaluator (US-003) processes the condition correctly

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This is a node-type handler within the graph runner (US-006)
- Uses the expression evaluator from US-003
- Switch nodes use `conditional` type edges
- The worked example in Section 4.4 includes a `reviewSwitch` node that demonstrates this pattern
- Tests must cover: switch routing true case, switch routing default case (Section 15.2)
