# US-010: Inject Active Group into Labeling Project Creation

**As a** user creating a new labeling project,
**I want to** have my active group automatically included in the create-project request,
**So that** new projects are correctly scoped to my current group without manual input.

## Acceptance Criteria
- [ ] **Scenario 1**: `group_id` is included in create-project request automatically
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** the `createProject` mutation is invoked
    - **Then** the hook reads `activeGroup.id` from `GroupContext` and injects it as `group_id` in the request body without the caller providing it

- [ ] **Scenario 2**: Error is returned before API call when no active group
    - **Given** the user's `activeGroup` is `null`
    - **When** the `createProject` mutation is triggered
    - **Then** the hook throws or returns an error without calling the API

- [ ] **Scenario 3**: "New Project" button is disabled when no active group
    - **Given** the user's `activeGroup` is `null`
    - **When** the Project List page is displayed
    - **Then** the "New Project" (and "Create Project" empty-state) button is disabled with a tooltip explaining that a group must be selected

- [ ] **Scenario 4**: Callers do not pass `group_id`
    - **Given** existing callers of `createProject` (e.g., `ProjectListPage`)
    - **When** the mutation is invoked
    - **Then** no `group_id` argument is expected or accepted from callers

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Update the frontend `CreateProjectDto` interface in `useProjects.ts` to include `group_id: string`.
- `createProjectMutation` must consume `useGroup()` from `GroupContext` and prepend `group_id` to the POST body automatically.
- Remove `group_id` from any call sites that were previously passing it manually (no backwards compatibility).
- Frontend tests for `useProjects` and `ProjectListPage` must be updated to mock `GroupContext` and cover both active-group and null-group scenarios.
