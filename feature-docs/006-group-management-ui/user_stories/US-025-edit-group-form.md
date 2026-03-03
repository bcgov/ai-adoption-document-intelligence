# US-025: Edit Group Button and Form (System Admin)

**As a** system admin,
**I want to** edit a group's name and description from the Groups listing page,
**So that** I can correct or update group details through the UI.

## Acceptance Criteria
- [ ] **Scenario 1**: Edit button is visible per group row for system admins
    - **Given** a user with the `system-admin` role on `/groups`
    - **When** the groups list renders
    - **Then** an `Edit` button (or icon) is shown per group row

- [ ] **Scenario 2**: Edit button is not visible to non-admin users
    - **Given** a regular user on `/groups`
    - **When** the groups list renders
    - **Then** no `Edit` button is visible

- [ ] **Scenario 3**: Clicking Edit opens a modal pre-populated with current values
    - **Given** the admin clicks `Edit` for a group
    - **When** the modal opens
    - **Then** the form fields `Name` and `Description` are pre-filled with the group's current values

- [ ] **Scenario 4**: Submitting the form updates the group and refreshes the list
    - **Given** the form has valid updated values
    - **When** the form is submitted
    - **Then** `PUT /api/groups/:groupId` is called, the modal closes, and the groups list refreshes with the updated values

- [ ] **Scenario 5**: A descriptive error is shown on validation or conflict failures
    - **Given** the submitted name conflicts or is invalid
    - **When** the form is submitted
    - **Then** an inline or notification error message is shown without closing the modal

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use Mantine `Modal` and form components.
- Use TanStack React Query mutation; invalidate the groups query on success.
- System admin status determined from `AuthContext`.
