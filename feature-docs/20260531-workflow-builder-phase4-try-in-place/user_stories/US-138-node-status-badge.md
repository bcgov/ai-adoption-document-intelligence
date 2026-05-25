# US-138: `NodeStatusBadge` component + wire into node renderers

**As a** user iterating on a workflow in the V2 editor,
**I want** a small status badge in the top-right corner of every node that updates as a Try executes,
**So that** I can see at-a-glance which nodes are pending, running, completed (or cache-hit), or failed without reading any logs.

## Acceptance Criteria

- [ ] **Scenario 1**: `NodeStatusBadge` component
    - **Given** `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx` (new file)
    - **When** read
    - **Then** it exports `function NodeStatusBadge({ status }: { status: NodeRunStatus["status"] | "pending" })`
    - **And** the status → (icon, color) mapping is: pending → IconCircle / gray; running → Loader / blue; succeeded → IconCircleCheck / green; failed → IconCircleX / red; skipped → IconBolt / violet
    - **And** the component renders a Mantine `<ThemeIcon size="xs" radius="xl">` with the icon + color

- [ ] **Scenario 2**: Activity / source nodes mount the badge
    - **Given** the existing `ActivityNodeRenderer` (Phase 1A) AND `SourceNodeRenderer` (Phase 8)
    - **When** they're read after the change
    - **Then** each renderer subscribes to its own status via a small `useNodeRunStatus(nodeId)` lookup hook that consumes the latest `useNodeStatuses` query data via React context (US-138 creates that context)
    - **And** the badge renders absolute-positioned in the top-right corner via a `<Box pos="absolute" top={-6} right={-6}>` wrapper inside each renderer's main `<div>`

- [ ] **Scenario 3**: `RunStateContext` provides the status map
    - **Given** a new `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx`
    - **When** read
    - **Then** it exports `<RunStateProvider value={{ activeRunId, nodeStatuses, isReplay }}>` and a hook `useNodeRunStatus(nodeId): NodeRunStatus | { status: "pending" }`
    - **And** the provider is mounted in `WorkflowEditorV2Page.tsx` wrapping the canvas

- [ ] **Scenario 4**: Absent node ids default to "pending"
    - **Given** a node id not present in `nodeStatuses` (e.g., a node that's downstream of an un-walked switch branch, or before any Try has happened)
    - **When** `useNodeRunStatus(nodeId)` is called
    - **Then** the return is `{ status: "pending" }` (the "absent ≡ pending" rule from US-135's Scenario 5)
    - **And** the badge renders the gray circle accordingly

- [ ] **Scenario 5**: Control-flow nodes mount the badge too
    - **Given** the existing `SwitchNodeRenderer`, `MapNodeRenderer`, `JoinNodeRenderer`, `ChildWorkflowNodeRenderer`, `PollUntilNodeRenderer`, `HumanGateNodeRenderer`, `GroupChipNode` (Phase 1B)
    - **When** they're read after the change
    - **Then** every node renderer mounts a `<NodeStatusBadge>` in the same absolute position
    - **And** for `GroupChipNode` (collapsed group view), the badge reflects the aggregate of the group's member statuses ("running" if any member is running, "failed" if any failed, "succeeded" if all are succeeded/skipped, else "pending")

- [ ] **Scenario 6**: Frontend tests cover badge + provider integration
    - **Given** `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.test.tsx`
    - **When** tests run
    - **Then** at least 5 cases pass: each status → expected icon+color combination renders correctly
    - **And** an integration test verifies `useNodeRunStatus` returns the expected status from a stubbed `RunStateProvider`

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.tsx` — implementation
- `apps/frontend/src/features/workflow-builder/run/NodeStatusBadge.test.tsx` — tests
- `apps/frontend/src/features/workflow-builder/run/RunStateContext.tsx` — context provider + `useNodeRunStatus` hook
- `apps/frontend/src/features/workflow-builder/canvas/ActivityNodeRenderer.tsx` — mount badge
- `apps/frontend/src/features/workflow-builder/sources/SourceNodeRenderer.tsx` — mount badge
- Each control-flow renderer (`SwitchNodeRenderer`, `MapNodeRenderer`, etc.) — mount badge
- `apps/frontend/src/features/workflow-builder/canvas/GroupChipNode.tsx` — mount aggregate badge
- `apps/frontend/src/features/workflow-builder/WorkflowEditorV2Page.tsx` — wrap canvas in `<RunStateProvider>`

## Technical notes

- The Mantine + Tabler icons used are already in the project's icon bundle — no new dependency.
- The absolute positioning needs to not collide with the existing Phase 3 type pill (which renders on selection, anchored to the handle, not the top-right corner). Verified: type pill is anchored to the handle position; badge is at the node's top-right. No collision.
- Group aggregate logic: `getAggregateStatus(memberIds, nodeStatuses)` is a small pure helper that walks member statuses; lives in `RunStateContext.tsx`.
- The hook `useNodeRunStatus` is the single read-point — never call `useNodeStatuses` directly from a renderer (renderers don't know about workflowId/runId).
- After landing: no Vite restart (frontend-only).
