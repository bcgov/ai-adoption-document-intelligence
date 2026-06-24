# Group Resource Authorization

This document describes how group membership is enforced when creating or accessing top-level resources in the system.

## Overview

When a user or API key creates or accesses a top-level or sub-resource (`Document`, `Workflow`, `TemplateModel`, `LabelingDocument`, `FieldDefinition`, `DocumentLabel`, `TrainingJob`, `TrainedModel`, `ReviewSession`, `Dataset`, `BenchmarkProject`, or their child resources), the system verifies that the requestor belongs to the resource's group before allowing the operation to proceed. This prevents resources from being created, read, updated, or deleted by users not authorized to access the group.

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
| TemplateModel | `POST /api/template-models` | `TemplateModelController.createTemplateModel` |
| LabelingDocument | `POST /api/template-models/:id/upload` | `TemplateModelController.uploadLabelingDocument` |
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
| TemplateModel | `GET /api/template-models/:id` | `TemplateModelController.getTemplateModel` |
| TemplateModel | `PUT /api/template-models/:id` | `TemplateModelController.updateTemplateModel` |
| TemplateModel | `DELETE /api/template-models/:id` | `TemplateModelController.deleteTemplateModel` |
| LabelingDocument | `POST /api/template-models/:id/documents` | `TemplateModelController.addDocumentToTemplateModel` |
| LabelingDocument | `GET /api/template-models/:id/documents/:docId` | `TemplateModelController.getTemplateModelDocument` |
| LabelingDocument | `GET /api/template-models/:id/documents/:docId/view` | `TemplateModelController.viewLabelingDocument` |
| LabelingDocument | `GET /api/template-models/:id/documents/:docId/download` | `TemplateModelController.downloadLabelingDocument` |
| LabelingDocument | `DELETE /api/template-models/:id/documents/:docId` | `TemplateModelController.removeDocumentFromTemplateModel` |
| LabelingDocument | `GET /api/template-models/:id/documents/:docId/labels` | `TemplateModelController.getDocumentLabels` |
| LabelingDocument | `POST /api/template-models/:id/documents/:docId/labels` | `TemplateModelController.saveDocumentLabels` |
| LabelingDocument | `DELETE /api/template-models/:id/documents/:docId/labels/:labelId` | `TemplateModelController.deleteLabel` |
| LabelingDocument | `GET /api/template-models/:id/documents/:docId/ocr` | `TemplateModelController.getDocumentOcr` |
| TemplateModel | `GET /api/template-models/:id/documents` | `TemplateModelController.getTemplateModelDocuments` |
| FieldDefinition | `GET /api/template-models/:id/fields` | `TemplateModelController.getFieldSchema` |
| FieldDefinition | `POST /api/template-models/:id/fields` | `TemplateModelController.addField` |
| FieldDefinition | `PUT /api/template-models/:id/fields/:fieldId` | `TemplateModelController.updateField` |
| FieldDefinition | `DELETE /api/template-models/:id/fields/:fieldId` | `TemplateModelController.deleteField` |
| TemplateModel | `POST /api/template-models/:id/export` | `TemplateModelController.exportTemplateModel` |
| TrainingJob | `GET /api/template-models/:modelId/training/validate` | `TrainingController.validateTrainingData` |
| TrainingJob | `POST /api/template-models/:modelId/training/train` | `TrainingController.startTraining` |
| TrainingJob | `GET /api/template-models/:modelId/training/jobs` | `TrainingController.getTrainingJobs` |
| TrainingJob | `GET /api/template-models/training/jobs/:jobId` | `TrainingController.getJobStatus` |
| TrainingJob | `DELETE /api/template-models/training/jobs/:jobId` | `TrainingController.cancelJob` |
| TrainedModel | `GET /api/template-models/:modelId/training/versions` | `TrainingController.listTrainedVersions` |
| TrainedModel | `GET /api/template-models/:modelId/training/versions/:versionId/snapshot` | `TrainingController.getTrainedVersionSnapshot` |
| TrainedModel | `POST /api/template-models/:modelId/training/versions/:versionId/activate` | `TrainingController.setActiveTrainedVersion` |
| TrainedModel | `DELETE /api/template-models/:modelId/training/versions/:versionId` | `TrainingController.deleteTrainedVersion` |
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

For `LabelingDocument` endpoints accessed via a template-model route (e.g. `GET /api/template-models/:id/documents/:docId`), the `LabeledDocument` is fetched first to retrieve the nested `LabelingDocument.group_id`, which is then used for the group membership check.

For `FieldDefinition`, `GET /api/template-models/:id/documents`, and `POST /api/template-models/:id/export` endpoints, the parent `TemplateModel` is fetched first and its `group_id` is used for the check.

For `TrainingJob` and `TrainedModel` endpoints accessed via a template-model route (e.g. `GET /api/template-models/:modelId/training/jobs`), the parent `TemplateModel` is fetched and its `group_id` is checked. For job-level endpoints (e.g. `GET /api/template-models/training/jobs/:jobId`), the job is fetched first to get its `templateModelId`, then the parent `TemplateModel` is fetched to obtain the `group_id`. The `GET /api/template-models/training/info` endpoint is not group-scoped (Azure resource metadata only).

For `ReviewSession` endpoints, the parent `Document` is fetched (either directly from the request body for creation, or via the session record for existing sessions) and its `group_id` is used for the check.

For `BenchmarkDefinition` and `BenchmarkRun` endpoints (accessed via `/api/benchmark/projects/:projectId/...`), the parent `BenchmarkProject` is fetched and its `group_id` is checked. Child models (`DatasetVersion`, `Split`, `BenchmarkDefinition`, `BenchmarkRun`, `DatasetGroundTruthJob`) do not have their own `group_id` — they inherit access through their parent `Dataset` or `BenchmarkProject`.

For `Dataset` sub-resource endpoints (versions, splits, samples, ground truth, freeze), the parent `Dataset` is fetched and its `group_id` is checked before proceeding.

## Authorization Logic

The `identityCanAccessGroup(identity, groupId, minimumRole?)` helper performs the following checks using the pre-populated `resolvedIdentity` (no additional database queries):

1. If `groupId` is `null` (orphaned record with no group assignment), throws `404 Not Found`. This prevents leaking the existence of orphaned records to any caller, regardless of identity.
2. If `identity` is `undefined`, throws `403 Forbidden`.
3. If `identity.isSystemAdmin` is `true`, access is always allowed (system admins bypass group checks).
4. Checks `identity.groupRoles` for the requested `groupId`. If the group is not present, throws `403 Forbidden`. This applies to both JWT and API key identities — both use the same `groupRoles` map (populated by `IdentityGuard` from parallel DB queries for JWT, or directly from the key's scope for API keys).
5. If `minimumRole` is specified, checks that the identity's role within the group meets the minimum (e.g., `MEMBER` < `ADMIN`). Throws `403 Forbidden` if insufficient.

## Request DTOs

All creation DTOs include a required `group_id` (or `groupId`) field. A missing or empty value results in a `400 Bad Request` response enforced by class-validator before the controller logic is reached.

| DTO | Field |
|---|---|
| `UploadDocumentDto` | `group_id` |
| `CreateWorkflowDto` | `groupId` |
| `CreateTemplateModelDto` | `group_id` |
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

## Cross-Group Reference & Child-Resource Hardening

Controller-layer `identityCanAccessGroup` checks confirm the caller belongs to the
group named in the request. They do **not**, on their own, stop a caller from
naming a **resource id that belongs to another group** in an endpoint that the
caller is otherwise authorized to hit. Where a resource was loaded or mutated by
its own (global) id, or a referenced entity's group was never compared to the
caller's, a member of one group could read or affect another group's data. The
following service/DB-layer checks close those gaps. Each treats a foreign-group
reference as **not found** (404 / "does not exist") so resource existence is not
leaked across groups.

| Area | Endpoint(s) | Rule enforced | Location |
|------|-------------|---------------|----------|
| Workflow config resolution | `POST /api/documents/upload` (`workflow_config_id`) | A `WorkflowVersion`/`WorkflowLineage` id is resolved only when its owning lineage is in the caller's group; the workflow default-model lookup is group-scoped too | `WorkflowService.resolveWorkflowVersionId`, `getModelIdDefault` |
| Benchmark definition refs | `POST/PUT .../projects/:projectId/definitions` | `datasetVersionId` and `workflowVersionId` must belong to the **project's** group | `BenchmarkDefinitionService.createDefinition` / `updateDefinition` |
| Benchmark run candidate | `POST .../definitions/:definitionId/runs` (`candidateWorkflowVersionId`) | The candidate workflow version's lineage must be in the project's group | `BenchmarkRunService.startRun` |
| Benchmark candidate promote | `POST .../apply-candidate-to-base`, `.../promote-candidate-workflow` | Both the candidate and the **base lineage being written into** must be in the project's group | `BenchmarkDefinitionService.applyToBaseWorkflow` / `promoteCandidateWorkflow` |
| Confusion profiles | `GET/PATCH/DELETE /api/groups/:groupId/confusion-profiles/:id` | The profile row is loaded/mutated only when `group_id` matches the path group (not just membership in the path group) | `ConfusionProfileService.findById` / `update` / `delete` |
| Template field/label children | `PUT/DELETE .../template-models/:id/fields/:fieldId`, `DELETE .../documents/:docId/labels/:labelId` | The child write is scoped to the owning template model (and labeling document); a child id from another group's template matches nothing | `TemplateModelDbService.updateFieldDefinition` / `deleteFieldDefinition` / `deleteDocumentLabel` |
| Trained model listing | `GET /api/models` | The trained-model picker is filtered to the caller's groups (via `getIdentityGroupIds`); prebuilt models remain global | `TrainingDbService.findAllTrainedModelIds` |

**Pattern for new code:** when an endpoint accepts a resource id (or a reference
to another entity) that is not itself the group, scope the database query to the
caller's group — directly (`where: { id, group_id }`) for group-owned rows, or
via the owning parent relation (`where: { id, lineage: { group_id } }`,
`template_model_id`, project group, etc.) for child rows that have no `group_id`
of their own. Prefer reporting cross-group references as not-found over an
explicit "forbidden" so existence is not disclosed.

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
