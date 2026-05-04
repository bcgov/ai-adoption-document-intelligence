# US-005: Display Workflow Conflict Error When Deleting Classifier

## Summary
As a group admin, I want to see a clear list of workflows that are blocking my classifier deletion so that I know exactly which workflows I need to update before the classifier can be removed.

## Actors
- Group Admin
- System Admin

## Main Flow
1. User initiates classifier deletion via the confirmation dialog (US-004).
2. API returns `409 Conflict` with a list of workflow names and IDs referencing the classifier.
3. The confirmation dialog (or a follow-on notification/alert) displays a clear message that the classifier cannot be deleted because it is used by workflows.
4. The conflicting workflow names are listed so the user can navigate to them and remove the classifier reference.
5. The dialog remains open (or re-opens) so the user can dismiss and take corrective action.

## Acceptance Criteria
- When the deletion API returns `409`, the UI does not navigate away.
- A clear error message is shown stating the classifier is referenced by active workflows.
- The names (and IDs) of all conflicting workflow versions are displayed.
- The user can dismiss the error and return to the classifier details page.
- Component unit tests cover: 409 response handling, conflict list rendering.

## Notes
- Uses Mantine notification or inline alert component for the error display.
- No further deletion actions are taken after a `409` response.
