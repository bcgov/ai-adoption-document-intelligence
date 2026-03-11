# Group Resource Authorization

This document describes how group membership is enforced when creating or accessing top-level resources in the system.

## Overview

When a user or API key creates or accesses a top-level or sub-resource (`Document`, `Workflow`, `LabelingProject`, `LabelingDocument`, `FieldDefinition`, `DocumentLabel`, `TrainingJob`, `TrainedModel`, `ReviewSession`, `Dataset`, `BenchmarkProject`, or their child resources), the system verifies that the requestor belongs to the resource's group before allowing the operation to proceed. This prevents resources from being created, read, updated, or deleted by users not authorized to access the group.

## How to add a group

The message **"No groups are available. Contact an administrator"** appears when there are no groups in the database. Groups are created inside the app (database), not in the identity provider.

**Option 1 — System administrator (UI)**  
A user with **system-admin** rights can create groups:

1. Log in as a user whose `user.is_system_admin` is `true` in the database.
2. Go to **Groups** (`/groups`). System admins can open this page even when they have no group memberships.
3. Click **Create group**, enter name and optional description, and save.

Other users can then request membership from the Request group membership page; a group admin or system admin can approve.

**Option 2 — Database seed (first group)**  
To create the default group and optionally add yourself as system admin and group member:

1. From `apps/backend-services`, run: `npm run db:seed`.
2. Optionally set `SEED_USER_SUB` (and `SEED_USER_EMAIL`) in `.env` to your SSO user ID (Keycloak `sub` claim). The seed will create/update that user with `is_system_admin: true` and add them to the default group "Default".

After seeding, log in with that user (or any user added to the default group) to access the app; other users can request membership to "Default".

**Option 3 — API**  
A system admin can create a group with `POST /api/groups` and body `{ "name": "Group Name", "description": "Optional" }`.

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
| ApiKey | `POST /api/api-key` | `ApiKeyController.generateApiKey` |
| ApiKey | `POST /api/api-key/regenerate` | `ApiKeyController.regenerateApiKey` |
| ApiKey | `DELETE /api/api-key` | `ApiKeyController.deleteApiKey` |
| BenchmarkProject | `POST /api/benchmark/projects` | `BenchmarkProjectController.createProject` |
| Dataset | `POST /api/benchmark/datasets` | `DatasetController.createDataset` |
| Dataset (HITL) | `POST /api/benchmark/datasets/from-hitl` | `HitlDatasetController.createDatasetFromHitl` |

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
| LabelingDocument | `POST /api/labeling/projects/:id/documents` | `LabelingController.addDocumentToProject` |
| LabelingDocument | `GET /api/labeling/projects/:id/documents/:docId` | `LabelingController.getProjectDocument` |
| LabelingDocument | `GET /api/labeling/projects/:id/documents/:docId/download` | `LabelingController.downloadLabelingDocument` |
| LabelingDocument | `DELETE /api/labeling/projects/:id/documents/:docId` | `LabelingController.removeDocumentFromProject` |
| LabelingDocument | `GET /api/labeling/projects/:id/documents/:docId/labels` | `LabelingController.getDocumentLabels` |
| LabelingDocument | `POST /api/labeling/projects/:id/documents/:docId/labels` | `LabelingController.saveDocumentLabels` |
| LabelingDocument | `DELETE /api/labeling/projects/:id/documents/:docId/labels/:labelId` | `LabelingController.deleteLabel` |
| LabelingDocument | `GET /api/labeling/projects/:id/documents/:docId/ocr` | `LabelingController.getDocumentOcr` |
| LabelingProject | `GET /api/labeling/projects/:id/documents` | `LabelingController.getProjectDocuments` |
| FieldDefinition | `GET /api/labeling/projects/:id/fields` | `LabelingController.getFieldSchema` |
| FieldDefinition | `POST /api/labeling/projects/:id/fields` | `LabelingController.addField` |
| FieldDefinition | `PUT /api/labeling/projects/:id/fields/:fieldId` | `LabelingController.updateField` |
| FieldDefinition | `DELETE /api/labeling/projects/:id/fields/:fieldId` | `LabelingController.deleteField` |
| LabelingProject | `POST /api/labeling/projects/:id/export` | `LabelingController.exportProject` |
| TrainingJob | `GET /api/training/projects/:projectId/validate` | `TrainingController.validateProject` |
| TrainingJob | `POST /api/training/projects/:projectId/train` | `TrainingController.startTraining` |
| TrainingJob | `GET /api/training/projects/:projectId/jobs` | `TrainingController.getTrainingJobs` |
| TrainingJob | `GET /api/training/jobs/:jobId` | `TrainingController.getJobStatus` |
| TrainedModel | `GET /api/training/projects/:projectId/models` | `TrainingController.getTrainedModels` |
| TrainingJob | `DELETE /api/training/jobs/:jobId` | `TrainingController.cancelJob` |
| ReviewSession | `POST /api/hitl/sessions` | `HitlController.startSession` |
| ReviewSession | `GET /api/hitl/sessions/:id` | `HitlController.getSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/corrections` | `HitlController.submitCorrections` |
| ReviewSession | `GET /api/hitl/sessions/:id/corrections` | `HitlController.getCorrections` |
| ReviewSession | `POST /api/hitl/sessions/:id/submit` | `HitlController.approveSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/escalate` | `HitlController.escalateSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/skip` | `HitlController.skipSession` |
| BenchmarkProject | `GET /api/benchmark/projects` | `BenchmarkProjectController.listProjects` |
| BenchmarkProject | `GET /api/benchmark/projects/:id` | `BenchmarkProjectController.getProjectById` |
| BenchmarkProject | `DELETE /api/benchmark/projects/:id` | `BenchmarkProjectController.deleteProject` |
| Dataset | `GET /api/benchmark/datasets` | `DatasetController.listDatasets` |
| Dataset | `GET /api/benchmark/datasets/:id` | `DatasetController.getDatasetById` |
| Dataset | `DELETE /api/benchmark/datasets/:id` | `DatasetController.deleteDataset` |
| Dataset (versions) | `POST/GET/PATCH/DELETE /api/benchmark/datasets/:id/versions/**` | `DatasetController.*` |
| Dataset (samples) | `GET/DELETE /api/benchmark/datasets/:id/versions/:vid/samples/**` | `DatasetController.*` |
| Dataset (splits) | `POST/GET/PATCH /api/benchmark/datasets/:id/versions/:vid/splits/**` | `DatasetController.*` |
| Dataset (freeze) | `POST /api/benchmark/datasets/:id/versions/:vid/freeze` | `DatasetController.freezeVersion` |
| Dataset (ground truth) | `POST/GET /api/benchmark/datasets/:id/versions/:vid/ground-truth-generation/**` | `GroundTruthGenerationController.*` |
| Dataset (HITL) | `GET /api/benchmark/datasets/from-hitl/eligible-documents` | `HitlDatasetController.listEligibleDocuments` |
| Dataset (HITL) | `POST /api/benchmark/datasets/:id/versions/from-hitl` | `HitlDatasetController.addVersionFromHitl` |
| BenchmarkDefinition | `POST/GET/PUT/DELETE /api/benchmark/projects/:pid/definitions/**` | `BenchmarkDefinitionController.*` |
| BenchmarkRun | `POST/GET/DELETE /api/benchmark/projects/:pid/runs/**` | `BenchmarkRunController.*` |

For read/update/delete endpoints, the resource is fetched first to obtain its `group_id`, and then `identityCanAccessGroup` is called with that value before the operation continues.

For `LabelingDocument` endpoints accessed via a project route (e.g. `GET /api/labeling/projects/:id/documents/:docId`), the `LabeledDocument` is fetched first to retrieve the nested `LabelingDocument.group_id`, which is then used for the group membership check.

For `FieldDefinition`, `GET /projects/:id/documents`, and `POST /projects/:id/export` endpoints, the parent `LabelingProject` is fetched first and its `group_id` is used for the check.

For `TrainingJob` and `TrainedModel` endpoints accessed via project route (e.g. `GET /api/training/projects/:projectId/jobs`), the parent `LabelingProject` is fetched and its `group_id` is checked. For job-level endpoints (e.g. `GET /api/training/jobs/:jobId`), the job is fetched first to get its `project_id`, then the parent `LabelingProject` is fetched to obtain the `group_id`.

For `ReviewSession` endpoints, the parent `Document` is fetched (either directly from the request body for creation, or via the session record for existing sessions) and its `group_id` is used for the check.

For `BenchmarkDefinition` and `BenchmarkRun` endpoints (accessed via `/api/benchmark/projects/:projectId/...`), the parent `BenchmarkProject` is fetched and its `group_id` is checked. Child models (`DatasetVersion`, `Split`, `BenchmarkDefinition`, `BenchmarkRun`, `DatasetGroundTruthJob`) do not have their own `group_id` — they inherit access through their parent `Dataset` or `BenchmarkProject`.

For `Dataset` sub-resource endpoints (versions, splits, samples, ground truth, freeze), the parent `Dataset` is fetched and its `group_id` is checked before proceeding.

## Authorization Logic

The `identityCanAccessGroup(identity, groupId, db)` helper performs the following checks:

1. If `groupId` is `null` (orphaned record with no group assignment), throws `404 Not Found`. This prevents leaking the existence of orphaned records to any caller, regardless of identity.
2. If `identity` is `undefined`, throws `403 Forbidden`.
3. If the identity is an **API key** identity (`identity.groupId` is set), verifies the key's group matches the requested `groupId`. Throws `403 Forbidden` if they differ.
4. If the identity is a **JWT user** identity (`identity.userId` is set), queries the database to confirm the user is a member of the group. Throws `403 Forbidden` if not a member.

## Request DTOs

All creation DTOs include a required `group_id` (or `groupId`) field. A missing or empty value results in a `400 Bad Request` response enforced by class-validator before the controller logic is reached.

| DTO | Field |
|---|---|
| `UploadDocumentDto` | `group_id` |
| `CreateWorkflowDto` | `groupId` |
| `CreateProjectDto` | `group_id` |
| `LabelingUploadDto` | `group_id` |
| `GenerateApiKeyRequestDto` | `groupId` |
| `CreateProjectDto` (benchmark) | `groupId` |
| `CreateDatasetDto` | `groupId` |
| `CreateDatasetFromHitlDto` | `groupId` |

## Error Responses

| Status | Condition |
|---|---|
| `400 Bad Request` | `group_id` is missing or empty in the request body |
| `403 Forbidden` | Requestor identity is absent, or identity does not belong to the specified group |
| `404 Not Found` | The fetched resource has `group_id = null` (orphaned record) — returned to all non-system-admin callers |

## Auditing

Group and membership-request operations are recorded in the audit store for traceability and security.

**Audit events (AuditService):** The following event types are written to the `audit_event` table with `resource_type`, `resource_id`, `actor_id`, `group_id`, and optional `request_id` / `payload`:

| Event type | Resource type | When |
|------------|----------------|------|
| `group_created` | group | System admin creates a group |
| `group_updated` | group | System admin updates a group |
| `group_deleted` | group | System admin soft-deletes a group |
| `membership_request_created` | group_membership_request | User requests membership |
| `membership_request_cancelled` | group_membership_request | User cancels own pending request |
| `membership_request_approved` | group_membership_request | Admin approves request (and user is added to group) |
| `membership_request_denied` | group_membership_request | Admin denies request |
| `member_added` | user_group | User added to group (via approval or direct assign) |
| `member_removed` | user_group | Admin removes a member |
| `user_left_group` | user_group | User leaves a group |

See the platform logging and audit documentation for log format, retention, and how to query audit events.

## Related

- [Authentication](./AUTHENTICATION.md) — describes how `resolvedIdentity` is set on the request
- `src/auth/identity.helpers.ts` — `identityCanAccessGroup` implementation
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-008-enforce-group-membership-on-resource-creation.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-009-enforce-group-authorization-on-document.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-010-enforce-group-authorization-on-workflow.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-012-enforce-group-authorization-on-labeling-document.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-013-enforce-group-authorization-on-sub-resources.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-015-user-requests-api-key-for-group.md`
- Feature docs: `feature-docs/004-group-resource-authorization/user_stories/US-016-block-access-to-orphaned-records.md`
