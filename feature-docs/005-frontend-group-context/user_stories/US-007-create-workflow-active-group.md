# US-007: Inject Active Group into `useCreateWorkflow` Hook

**As a** user creating a workflow,
**I want to** have the active group automatically included in the create-workflow request,
**So that** workflows are correctly scoped to my current group without manual input.

## Acceptance Criteria
- [x] **Scenario 1**: `groupId` is included in create-workflow request automatically
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useCreateWorkflow` mutation is invoked
    - **Then** the hook reads `activeGroup.id` from `GroupContext` and injects it as `groupId` in `CreateWorkflowDto` without the caller providing it

- [x] **Scenario 2**: Error is returned before API call when no active group
    - **Given** the user's `activeGroup` is `null`
    - **When** the `useCreateWorkflow` mutation is triggered
    - **Then** the hook throws or returns an error without calling the API

- [x] **Scenario 3**: Callers do not pass `groupId`
    - **Given** existing callers of `useCreateWorkflow`
    - **When** the hook is invoked
    - **Then** no `groupId` argument is expected or accepted from callers

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `useCreateWorkflow` must consume `useGroup()` from `GroupContext`.
- Remove any existing `groupId` parameters from hook caller sites (no backwards compatibility).
- Frontend hook tests must be updated to mock `GroupContext` and cover both active-group and null-group scenarios.
