# US-002: Create `GroupContext` to Manage Active Group State

**As a** frontend developer,
**I want to** have a `GroupContext` that stores the user's available groups and the currently active group,
**So that** any component in the app can read and update which group is in scope without prop-drilling.

## Acceptance Criteria
- [ ] **Scenario 1**: Context provides required values
    - **Given** a user is authenticated and wrapped in `GroupContext`
    - **When** a component calls `useGroup()`
    - **Then** `availableGroups`, `activeGroup`, and `setActiveGroup` are accessible

- [ ] **Scenario 2**: Auto-selects first group on initial load
    - **Given** a user with group memberships and no `activeGroupId` in `localStorage`
    - **When** `GroupContext` initialises
    - **Then** `activeGroup` is set to the first entry in `availableGroups`

- [ ] **Scenario 3**: Restores persisted group from localStorage
    - **Given** a valid `activeGroupId` exists in `localStorage` that matches one of the user's groups
    - **When** `GroupContext` initialises
    - **Then** `activeGroup` is restored to the matching group

- [ ] **Scenario 4**: Falls back to first group when persisted ID is stale
    - **Given** `localStorage` contains an `activeGroupId` that no longer appears in `availableGroups`
    - **When** `GroupContext` initialises
    - **Then** `activeGroup` is set to the first entry in `availableGroups`

- [ ] **Scenario 5**: `activeGroup` is null when user has no memberships
    - **Given** a user with an empty `availableGroups` list
    - **When** `GroupContext` initialises
    - **Then** `activeGroup` is `null`

- [ ] **Scenario 6**: Active group change is persisted
    - **Given** a user calls `setActiveGroup` with a new group
    - **When** the context state updates
    - **Then** `localStorage` key `activeGroupId` is updated to the new group's id

- [ ] **Scenario 7**: `useGroup` throws outside of provider
    - **Given** a component that calls `useGroup()` but is not wrapped in `GroupContext`
    - **When** the component renders
    - **Then** an error is thrown indicating the hook is used outside its provider

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Groups are sourced from the `AuthContext` user object (populated by `/me`); no additional network call.
- Extend `MeResponse` / `AuthUser` interfaces in `AuthContext.tsx` to include `groups: Array<{ id: string; name: string }>`.
- `localStorage` key is `activeGroupId`.
- Export a `useGroup` convenience hook from the same file.
- Frontend component tests must cover the initialisation scenarios and localStorage behaviour.
