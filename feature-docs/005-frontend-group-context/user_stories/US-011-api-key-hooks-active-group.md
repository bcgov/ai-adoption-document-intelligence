# US-011: Inject Active Group into API Key Management Hooks

**As a** user managing API keys for my group,
**I want to** have my active group automatically used in all API key operations,
**So that** API key management is correctly scoped to my current group without me providing a group ID manually.

## Acceptance Criteria
- [ ] **Scenario 1**: GET API key is scoped to the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useApiKey` fetches the API key
    - **Then** the request includes `groupId=<activeGroup.id>` as a query parameter, and `activeGroup.id` is part of the `queryKey` so it re-fetches when the active group changes

- [ ] **Scenario 2**: Generate API key uses the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useGenerateApiKey` mutation is invoked
    - **Then** `{ groupId: activeGroup.id }` is included in the POST body automatically without the caller providing it

- [ ] **Scenario 3**: Delete API key uses the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useDeleteApiKey` mutation is invoked
    - **Then** `{ groupId: activeGroup.id }` is included in the DELETE body automatically without the caller providing it

- [ ] **Scenario 4**: Regenerate API key uses the active group
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** `useRegenerateApiKey` mutation is invoked
    - **Then** `{ groupId: activeGroup.id }` is included in the POST body automatically without the caller providing it

- [ ] **Scenario 5**: All operations are blocked when no active group
    - **Given** the user's `activeGroup` is `null`
    - **When** any of the four API key hooks are invoked
    - **Then** the hook throws or returns an error before calling the API, and any UI controls that trigger these operations are disabled

- [ ] **Scenario 6**: Callers do not pass `groupId`
    - **Given** existing call sites of the API key hooks
    - **When** the hooks are invoked
    - **Then** no `groupId` argument is expected or accepted from callers

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- All four hooks (`useApiKey`, `useGenerateApiKey`, `useDeleteApiKey`, `useRegenerateApiKey`) must consume `useGroup()` from `GroupContext`.
- For `useApiKey` (GET), add `activeGroup?.id` to the `queryKey` tuple so React Query automatically invalidates/refetches on group change.
- The `enabled` option on `useApiKey` should be gated on `activeGroup !== null` to avoid a 400 error when no group is selected.
- Frontend tests for these hooks and any consuming components must be updated to mock `GroupContext` covering both active-group and null-group scenarios.
- No backwards compatibility — remove any `groupId` arguments that callers were previously passing manually.
