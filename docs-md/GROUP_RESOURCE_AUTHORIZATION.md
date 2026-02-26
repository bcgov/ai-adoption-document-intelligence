# Group Resource Authorization

This document describes how group membership is enforced when creating or accessing top-level resources in the system.

## Overview

When a user or API key creates or accesses a top-level resource (`Document`, `Workflow`, `LabelingProject`, or `LabelingDocument`), the system verifies that the requestor belongs to the resource's group before allowing the operation to proceed. This prevents resources from being created, read, updated, or deleted by users not authorized to access the group.

## Enforcement Location

Group membership checks are performed in the **controller layer** before delegating to the service. This keeps authorization concerns at the HTTP boundary while keeping service methods reusable without identity coupling.

The shared helper used for all checks is `identityCanAccessGroup` from `src/auth/identity.helpers.ts`.

## Covered Endpoints

### Resource Creation (group derived from request body)

| Resource | Endpoint | Controller |
|---|---|---|
| Document | `POST /api/upload` | `UploadController.uploadDocument` |
| Workflow | `POST /api/workflows` | `WorkflowController.createWorkflow` |
| LabelingProject | `POST /api/labeling/projects` | `LabelingController.createProject` |
| LabelingDocument | `POST /api/labeling/projects/:id/upload` | `LabelingController.uploadLabelingDocument` |

### Resource Read / Update / Delete (group derived from fetched resource)

| Resource | Endpoint | Controller |
|---|---|---|
| Document | `GET /api/documents/:id` | `DocumentController.getDocument` |
| Document | `PATCH /api/documents/:id` | `DocumentController.updateDocument` |
| Document | `DELETE /api/documents/:id` | `DocumentController.deleteDocument` |
| Workflow | `GET /api/workflows/:id` | `WorkflowController.getWorkflow` |
| Workflow | `PUT /api/workflows/:id` | `WorkflowController.updateWorkflow` |
| Workflow | `DELETE /api/workflows/:id` | `WorkflowController.deleteWorkflow` |
| LabelingProject | `GET /api/labeling/projects/:id` | `LabelingController.getProject` |
| LabelingProject | `PUT /api/labeling/projects/:id` | `LabelingController.updateProject` |
| LabelingProject | `DELETE /api/labeling/projects/:id` | `LabelingController.deleteProject` |

For read/update/delete endpoints, the resource is fetched first to obtain its `group_id`, and then `identityCanAccessGroup` is called with that value before the operation continues.

## Authorization Logic

The `identityCanAccessGroup(identity, groupId, db)` helper performs the following checks:

1. If `identity` is `undefined`, throws `403 Forbidden`.
2. If the identity is an **API key** identity (`identity.groupId` is set), verifies the key's group matches the requested `groupId`. Throws `403 Forbidden` if they differ.
3. If the identity is a **JWT user** identity (`identity.userId` is set), queries the database to confirm the user is a member of the group. Throws `403 Forbidden` if not a member.

## Request DTOs

All creation DTOs include a required `group_id` (or `groupId`) field. A missing or empty value results in a `400 Bad Request` response enforced by class-validator before the controller logic is reached.

| DTO | Field |
|---|---|
| `UploadDocumentDto` | `group_id` |
| `CreateWorkflowDto` | `groupId` |
| `CreateProjectDto` | `group_id` |
| `LabelingUploadDto` | `group_id` |

## Error Responses

| Status | Condition |
|---|---|
| `400 Bad Request` | `group_id` is missing or empty in the request body |
| `403 Forbidden` | Requestor identity is absent, or identity does not belong to the specified group |

## Related

- [Authentication](./AUTHENTICATION.md) — describes how `resolvedIdentity` is set on the request
- `src/auth/identity.helpers.ts` — `identityCanAccessGroup` implementation
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-008-enforce-group-membership-on-resource-creation.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-009-enforce-group-authorization-on-document.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-010-enforce-group-authorization-on-workflow.md`
