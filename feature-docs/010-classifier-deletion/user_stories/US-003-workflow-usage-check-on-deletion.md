# US-003: Block Classifier Deletion When Referenced by Workflow Versions

## Summary
As a group admin, I want the system to prevent me from deleting a classifier that is still referenced by workflow versions so that I don't accidentally break active workflows.

## Actors
- Group Admin
- System Admin

## Main Flow
1. Before executing deletion, backend queries all `WorkflowVersion` rows whose parent `WorkflowLineage` belongs to the same `group_id` as the classifier.
2. Backend inspects the `config` JSON of each version, searching for the classifier name.
3. If any workflow versions within the group reference the classifier, deletion is blocked.
4. Backend returns `409 Conflict` with a list of affected workflow names and IDs in the response body.
5. If no references are found, deletion proceeds normally.

## Endpoints
- Part of `DELETE /azure/classifiers/:groupId/:classifierName` (see US-002).
- `409 Conflict` response body:
  ```json
  {
    "conflictingWorkflows": [
      { "id": "string", "name": "string" }
    ]
  }
  ```

## Acceptance Criteria
- Backend queries `WorkflowVersion` rows scoped to the classifier's `group_id` only (no cross-group checks needed).
- Detection searches the `config` JSON blob for the classifier name string.
- Returns `409 Conflict` when one or more workflow versions reference the classifier, with a body listing workflow names and IDs.
- Proceeds with deletion when no workflow versions reference the classifier.
- Unit tests cover: no references found (proceeds), references found (blocks with correct body).

## Notes
- Classifiers from one group cannot be referenced in another group's workflows, so cross-group checks are not required.
- The check must be performed before any destructive operations are attempted.
