# US-026: Delete Group with Soft-Delete Confirmation (System Admin)

**As a** system admin,
**I want to** soft-delete a group from the Group Details page via a confirmation dialog,
**So that** I can disable a group while preserving historical data.

## Acceptance Criteria
- [x] **Scenario 1**: Delete action is visible on the Group Details page for system admins
    - **Given** a user with the `system-admin` role on `/groups/:groupId`
    - **When** the Group Details page renders
    - **Then** a `Delete Group` option is visible in the actions menu

- [x] **Scenario 2**: Delete action is not visible to non-admin users
    - **Given** a regular user on `/groups/:groupId`
    - **When** the Group Details page renders
    - **Then** no `Delete Group` option is visible

- [x] **Scenario 3**: Clicking Delete opens a confirmation dialog explaining the action
    - **Given** the admin clicks `Delete Group` from the actions menu
    - **When** the confirmation dialog opens
    - **Then** the dialog clearly states that this action will disable the group and cannot be easily undone

- [x] **Scenario 4**: Confirming navigates away and removes the group from the listing
    - **Given** the confirmation dialog is open
    - **When** the admin confirms
    - **Then** `DELETE /api/groups/:groupId` is called, the dialog closes, the user is navigated to `/groups`, and the deleted group no longer appears in the groups list

- [x] **Scenario 5**: Cancelling the dialog does nothing
    - **Given** the confirmation dialog is open
    - **When** the admin cancels
    - **Then** no API call is made and the group page remains unchanged

- [x] **Scenario 6**: Error state is shown on API failure
    - **Given** the API returns an error
    - **When** the deletion is attempted
    - **Then** an error notification or message is displayed

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use Mantine `Modal` for the confirmation dialog.
- Use TanStack React Query mutation; invalidate the groups query on success.
- The backend performs a soft delete (sets `deleted_at` and `deleted_by`); no cascade deletes occur.
