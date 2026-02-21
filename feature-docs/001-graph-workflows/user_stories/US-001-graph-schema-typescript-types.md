# US-001: Define Graph Workflow Schema TypeScript Types

**As a** developer,
**I want to** have a complete set of TypeScript interfaces and types for the graph workflow configuration schema,
**So that** all backend, frontend, and Temporal worker code can share a consistent, strongly-typed graph definition format.

## Acceptance Criteria
- [ ] **Scenario 1**: Top-level GraphWorkflowConfig interface exists
    - **Given** the graph schema specification in Section 4.1
    - **When** the types file is created
    - **Then** a `GraphWorkflowConfig` interface is defined with `schemaVersion`, `metadata`, `nodes`, `edges`, `entryNodeId`, and `ctx` fields matching the specification

- [ ] **Scenario 2**: All node type interfaces are defined
    - **Given** the seven node types specified in Section 4.2 (activity, switch, map, join, childWorkflow, pollUntil, humanGate)
    - **When** the types are reviewed
    - **Then** each node type has its own interface extending `GraphNodeBase` with all required and optional fields per the specification

- [ ] **Scenario 3**: Edge interface is defined
    - **Given** the edge specification in Section 4.3
    - **When** the types are reviewed
    - **Then** a `GraphEdge` interface exists with `id`, `source`, `sourcePort`, `target`, `targetPort`, `type`, and `condition` fields

- [ ] **Scenario 4**: Port binding and error policy types are defined
    - **Given** the `PortBinding` and `ErrorPolicy` types in Sections 4.2 and 11.1
    - **When** the types are reviewed
    - **Then** `PortBinding` (with `port` and `ctxKey`) and `ErrorPolicy` (with `retryable`, `fallbackEdgeId`, `maxRetries`, `onError`) interfaces exist

- [ ] **Scenario 5**: GraphWorkflowInput and GraphWorkflowResult types are defined
    - **Given** the Temporal execution input/result types in Section 5.1
    - **When** the types are reviewed
    - **Then** `GraphWorkflowInput` (with `graph`, `initialCtx`, `configHash`, `runnerVersion`, `parentWorkflowId`) and `GraphWorkflowResult` (with `ctx`, `completedNodes`, `status`) interfaces exist

- [ ] **Scenario 6**: Condition expression types are defined
    - **Given** the expression language specification in Section 14
    - **When** the types are reviewed
    - **Then** `ConditionExpression`, `ComparisonExpression`, `LogicalExpression`, `NotExpression`, `NullCheckExpression`, `ListMembershipExpression`, and `ValueRef` types all exist with correct fields

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Types should be defined in shared locations accessible by both backend and Temporal worker: `apps/backend-services/src/workflow/graph-workflow-types.ts` and `apps/temporal/src/types.ts`
- Frontend types go in `apps/frontend/src/types/graph-workflow.ts` (see US-023)
- No backward compatibility with old `WorkflowStepsConfig` types
- The `NodeType` union type must include exactly: `"activity" | "switch" | "map" | "join" | "childWorkflow" | "pollUntil" | "humanGate"`
- All types must avoid using `any`; use `unknown` or proper typing instead
