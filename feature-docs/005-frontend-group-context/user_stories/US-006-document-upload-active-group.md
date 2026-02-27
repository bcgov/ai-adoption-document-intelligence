# US-006: Inject Active Group into Document Upload Hook

**As a** user uploading a document,
**I want to** have the active group automatically included in the upload request,
**So that** documents are correctly associated with my current group without manual input.

## Acceptance Criteria
- [x] **Scenario 1**: `group_id` is included in upload request automatically
    - **Given** the user has an `activeGroup` set in `GroupContext`
    - **When** a document upload is initiated
    - **Then** the upload hook reads `activeGroup.id` from `GroupContext` and includes it as `group_id` in `UploadDocumentPayload`

- [x] **Scenario 2**: Upload is disabled when no active group
    - **Given** the user's `activeGroup` is `null`
    - **When** the upload UI renders
    - **Then** the upload button is disabled (greyed out) with a tooltip explaining that a group must be selected

- [x] **Scenario 3**: Upload succeeds with group association
    - **Given** the user has an `activeGroup` and selects a file
    - **When** the upload completes successfully
    - **Then** the document is stored with the correct `group_id`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- The hook (`useDocuments` upload variant or the relevant upload hook) must consume `useGroup()` from `GroupContext`.
- Callers of the hook should not need to pass `group_id` explicitly after this change.
- If callers were previously passing `group_id` manually, those arguments should be removed (no backwards compatibility).
- Frontend hook tests must be updated to mock `GroupContext` and cover both active-group and null-group scenarios.
