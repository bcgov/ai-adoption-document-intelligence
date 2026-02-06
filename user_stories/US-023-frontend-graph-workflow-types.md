# US-023: Define Frontend Graph Workflow TypeScript Types

**As a** frontend developer,
**I want to** have TypeScript type definitions for the graph workflow schema in the frontend codebase,
**So that** frontend components can work with strongly-typed graph workflow configurations for editing, visualization, and API communication.

## Acceptance Criteria
- [ ] **Scenario 1**: GraphWorkflowConfig and all sub-types are defined
    - **Given** the schema specification in Section 4
    - **When** the frontend types file is created
    - **Then** all types (`GraphWorkflowConfig`, `GraphNodeBase`, `ActivityNode`, `SwitchNode`, `MapNode`, `JoinNode`, `ChildWorkflowNode`, `PollUntilNode`, `HumanGateNode`, `GraphEdge`, `PortBinding`, `ErrorPolicy`, `ConditionExpression`, `ValueRef`) are defined

- [ ] **Scenario 2**: Old workflow types are replaced
    - **Given** the existing `apps/frontend/src/types/workflow.ts`
    - **When** the types are updated
    - **Then** `StepConfig` and `WorkflowStepsConfig` are removed and replaced with imports from the new graph workflow types

- [ ] **Scenario 3**: WorkflowInfo type uses GraphWorkflowConfig
    - **Given** the `WorkflowInfo` interface used in API hooks
    - **When** reviewed
    - **Then** the `config` field is typed as `GraphWorkflowConfig` and `schemaVersion` field is included

- [ ] **Scenario 4**: Types match the backend schema exactly
    - **Given** the frontend and backend type definitions
    - **When** compared
    - **Then** they are structurally identical (same fields, same types)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- New file: `apps/frontend/src/types/graph-workflow.ts`
- Existing file to update: `apps/frontend/src/types/workflow.ts`
- Type changes specified in Section 8.4
- Must not use `any` types; use `unknown` or proper typing
- These types are consumed by the JSON editor, React Flow visualization, and API hooks
