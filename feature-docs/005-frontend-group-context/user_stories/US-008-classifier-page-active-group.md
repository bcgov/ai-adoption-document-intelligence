# US-008: Remove Hardcoded Group Selection from Classifier Page

**As a** user creating a new classifier model,
**I want to** have my active group automatically used when creating a classifier,
**So that** I do not need to manually select a group from a hardcoded dropdown that does not reflect my actual memberships.

## Acceptance Criteria
- [x] **Scenario 1**: Active group is injected into classifier creation automatically
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** the user submits the Create Classifier modal
    - **Then** the `createClassifier` mutation reads `activeGroup.id` from `GroupContext` and sends it as `group_id` in the request body, without the caller providing it

- [x] **Scenario 2**: "Create new model" button is disabled when no active group
    - **Given** the user's `activeGroup` is `null`
    - **When** the Classifier page is displayed
    - **Then** the "Create new model" button is disabled (greyed out) with a tooltip explaining that a group must be selected

- [x] **Scenario 3**: Group dropdown is removed from `CreateClassifierModal`
    - **Given** the `CreateClassifierModal` is open
    - **When** the user views the form
    - **Then** there is no Group selector dropdown — only Name and Description fields are present

- [x] **Scenario 4**: Classifier list display no longer relies on hardcoded group map
    - **Given** the Classifier page is displayed
    - **When** the list of classifiers is rendered
    - **Then** classifier labels do not reference hardcoded group names; the `groupOptions` and `groupMap` constants are removed from `ClassifierPage.tsx`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Remove the `groupOptions` prop from `CreateClassifierModal` and its associated interface.
- `CreateClassifierModal` must consume `useGroup()` from `GroupContext` to obtain the active group ID.
- The classifier model already stores `group_id` — existing read/update/delete operations that use the model's own `group_id` are not affected.
- Frontend tests for `ClassifierPage` and `CreateClassifierModal` must be updated or added to mock `GroupContext`.
- No backwards compatibility required — remove the old `groupOptions` prop entirely.
