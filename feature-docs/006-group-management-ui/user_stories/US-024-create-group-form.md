# US-024: Create Group Button and Form (System Admin)

**As a** system admin,
**I want to** create a new group from the Groups listing page using a modal form,
**So that** I can provision new groups without direct database access.

## Acceptance Criteria
- [x] **Scenario 1**: Create Group button is visible to system admins on the groups listing page
    - **Given** a user with the `system-admin` role on `/groups`
    - **When** the page renders
    - **Then** a `Create Group` button is shown

- [x] **Scenario 2**: Create Group button is not visible to non-admin users
    - **Given** a regular user on `/groups`
    - **When** the page renders
    - **Then** no `Create Group` button is visible

- [x] **Scenario 3**: Clicking Create Group opens a modal with Name and Description fields
    - **Given** the admin clicks `Create Group`
    - **When** the modal opens
    - **Then** a form is shown with a required `Name` field and an optional `Description` field

- [x] **Scenario 4**: Submitting the form creates the group and refreshes the list
    - **Given** the form is filled with a valid unique name
    - **When** the form is submitted
    - **Then** `POST /api/groups` is called, the modal closes, and the groups list refreshes to include the new group

- [x] **Scenario 5**: A descriptive error is shown for duplicate names or validation failures
    - **Given** the submitted name already exists or is missing
    - **When** the form is submitted
    - **Then** an inline or notification error message is displayed without closing the modal

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use Mantine `Modal` and form components.
- Use TanStack React Query mutation; invalidate the groups query on success.
- System admin status determined from `AuthContext` (`roles.includes('system-admin')`).
