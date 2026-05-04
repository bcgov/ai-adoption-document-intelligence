# US-004: Delete Button and Confirmation Dialog in Classifier Details UI

## Summary
As a group admin or system admin, I want a "Delete" button in the classifier details view with a confirmation dialog so that I can intentionally and safely delete a classifier from the UI.

## Actors
- Group Admin (for their own group's classifiers)
- System Admin (for any classifier)

## Main Flow
1. Group admin or system admin navigates to the `ClassifierDetails` component.
2. A "Delete" button is visible only to users with the appropriate role (group admin for that group, or system admin).
3. User clicks "Delete".
4. A modal confirmation dialog opens displaying the classifier name and a warning about permanent deletion.
5. The dialog contains a text input where the user must type `delete` (case-insensitive) to enable the confirmation button.
6. User types `delete` — the confirmation button becomes enabled.
7. User clicks the confirmation button — the `DELETE /azure/classifiers/:groupId/:classifierName` API call is triggered.
8. On success (`200 OK`), the UI navigates away from the deleted classifier's page and shows a success notification.

## Acceptance Criteria
- "Delete" button is rendered only for group admins (matching group) and system admins.
- Clicking the button opens a modal with the classifier name and a permanent-deletion warning.
- Confirmation button is disabled until the user types `delete` (case-insensitive) in the input field.
- Confirming triggers the deletion API call using Tanstack React Query mutation.
- On `200 OK`, the UI navigates away and shows a success notification.
- Loading state is shown while the API call is in progress.
- Component and hook unit tests cover: button visibility by role, modal open/close, input validation, and success flow.

## Notes
- Uses Mantine components for the button and modal.
- Workflow conflict error handling (409) is covered in US-005.
