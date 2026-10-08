# Group Resource Authorization

This document describes how group membership and permissions are enforced when creating or accessing top-level resources in the system.

## Roles and Permissions

Group members are assigned one of three roles defined in the `GroupRole` enum. Permissions are granular capabilities defined in the `Permission` enum (`apps/backend-services/src/auth/role-permissions.ts`) and mapped to roles via `RoleClaimsMap`:

| Role | Description | Permissions |
|------|-------------|-------------|
| `ADMIN` | Full access to all group operations, including member management, API keys, billing and table schemas | All permissions |
| `EDITOR` | Standard contributor access — can create, read, update, and delete resources, but cannot manage the group or its members, API keys, billing or table schemas, or delete classifiers | All permissions except the group-admin-only set: `API_KEY_*`, `CLASSIFIER_DELETE`, `GROUP_UPDATE`, `GROUP_REQUESTS_RETRIEVE`, `GROUP_REQUESTS_APPROVE_DENY`, `GROUP_USER_ADD`, `GROUP_USER_REMOVE`, `GROUP_USER_ROLE_UPDATE`, `GROUP_BILLING`, `USAGE_RETRIEVE`, `TABLE_CREATE`, `TABLE_UPDATE`, `TABLE_DELETE`, `TABLE_COLUMN_*` |
| `REVIEWER` | Limited access focused on HITL review workflows | `HITL_QUEUE_RETRIEVE`, `HITL_SESSION_*`, `HITL_CORRECTION_*`, `HITL_APPROVE_DENY`, `DOCUMENT_VIEW`, `DOCUMENT_DOWNLOAD`, `GROUP_RETRIEVE`, `GROUP_LEAVE` |

New members are assigned `EDITOR` by default. API keys are always granted `EDITOR` within their scoped group.

The frontend reads each group's permissions from `GET /api/auth/me` to decide which pages and sidebar entries to show; see [FRONTEND_ROUTE_PERMISSIONS.md](./FRONTEND_ROUTE_PERMISSIONS.md). Those checks only shape the UI — the backend enforcement described below is what authorizes each request.

## Overview

When a user or API key creates or accesses a top-level or sub-resource (`Document`, `Workflow`, `TemplateModel`, `LabelingDocument`, `FieldDefinition`, `DocumentLabel`, `TrainingJob`, `TrainedModel`, `ReviewSession`, `Dataset`, `BenchmarkProject`, `ClassifierModel`, `ConfusionProfile`, `ReferenceTable`, or their child resources), the system verifies that the requestor belongs to the resource's group before allowing the operation to proceed. This prevents resources from being created, read, updated, or deleted by users not authorized to access the group.

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

Group membership is enforced through two mechanisms, both at the HTTP boundary:

1. **Declarative** — when the group ID is present directly in the request (route param, query param, or body field), the controller method declares it via `@Identity({ groupPermissions: { groupIdFrom: { param | query | body }, requiredPermissions: [...] } })` and `IdentityGuard` performs the membership/permission check before the handler runs. Most creation endpoints use this (e.g. `POST /api/template-models`, `POST /api/api-key`, `POST /api/benchmark/projects`, `POST /api/benchmark/datasets`).
2. **Imperative** — when the group ID must be derived from a fetched resource, the controller calls `identityCanAccessGroup` from `apps/backend-services/src/auth/identity.helpers.ts` before delegating to the service. This keeps authorization concerns at the HTTP boundary while keeping service methods reusable without identity coupling. (A few service methods also call the helper directly where the resource lookup lives in the service: group membership-request approval/denial in `GroupService`, and labeling-document suggestion generation in `TemplateModelService`.)

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
| ClassifierModel | `POST /api/azure/classifier` (and related `PATCH`/`POST .../documents`/`POST .../train`) | `AzureController.*` |
| ConfusionProfile | `POST /api/groups/:groupId/confusion-profiles` and `POST .../derive` | `ConfusionProfileController.*` |
| ReferenceTable | `POST /api/tables` | `TablesController.createTable` |

All `ApiKey` endpoints require `GroupRole.ADMIN` in the target group. `TemplateModel`, `LabelingDocument` (upload), `ApiKey` (generate), `BenchmarkProject`, and `Dataset` creation use the declarative `@Identity({ groupIdFrom: ... })` check; the others call `identityCanAccessGroup` in the handler. `POST /api/upload` treats `group_id` as optional for API-key callers — see [Request DTOs](#request-dtos).

### Resource Read / Update / Delete (group derived from fetched resource)

| Resource | Endpoint | Controller |
|---|---|---|
| Document | `GET /api/documents/:id` | `DocumentController.getDocument` |
| Document | `PATCH /api/documents/:id` | `DocumentController.updateDocument` |
| Document | `DELETE /api/documents/:id` | `DocumentController.deleteDocument` |
| Document | `GET /api/documents/:id/ocr` / `/view` / `/download` / `/thumbnail` | `DocumentController.*` |
| Workflow | `GET /api/workflows/:id` | `WorkflowController.getWorkflow` |
| Workflow | `PUT /api/workflows/:id` | `WorkflowController.updateWorkflow` |
| Workflow | `DELETE /api/workflows/:id` | `WorkflowController.deleteWorkflow` |
| Workflow | `GET /api/workflows/:id/versions` | `WorkflowController.listVersions` |
| Workflow | `POST /api/workflows/:id/revert-head` | `WorkflowController.revertHead` |
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
| LabelingDocument | `POST /api/template-models/:id/documents/:docId/suggestions` | `TemplateModelController.generateDocumentSuggestions` (check in `TemplateModelService`) |
| TemplateModel | `GET /api/template-models/:id/documents` | `TemplateModelController.getTemplateModelDocuments` |
| TemplateModel | `POST /api/template-models/:id/suggest-formats` | `TemplateModelController.suggestFormats` |
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
| ReviewSession | `POST /api/hitl/sessions/:id/approve` | `HitlController.approveSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/reject` | `HitlController.rejectSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/flag` | `HitlController.flagSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/skip` | `HitlController.skipSession` |
| ReviewSession | `POST /api/hitl/sessions/:id/heartbeat` | `HitlController.heartbeat` |
| ReviewSession | `POST /api/hitl/sessions/:id/reopen` | `HitlController.reopenSession` |
| ReviewSession | `DELETE /api/hitl/sessions/:id/corrections/:correctionId` | `HitlController.deleteCorrection` |
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
| ClassifierModel | `GET/POST/PATCH/DELETE /api/azure/classifier/**` (group from query/body) and `DELETE /api/azure/classifiers/:groupId/:classifierName` | `AzureController.*` |
| ConfusionProfile | `POST/GET/PATCH/DELETE /api/groups/:groupId/confusion-profiles/**` (group from route param) | `ConfusionProfileController.*` |
| ReferenceTable | `GET/POST/PATCH/DELETE /api/tables/**` (table/column/lookup mutations require `GroupRole.ADMIN`; row reads/writes require `EDITOR`) | `TablesController.*` |

For read/update/delete endpoints, the resource is fetched first to obtain its `group_id`, and then `identityCanAccessGroup` is called with that value before the operation continues.

For `LabelingDocument` endpoints accessed via a template-model route (e.g. `GET /api/template-models/:id/documents/:docId`), the `LabeledDocument` is fetched first to retrieve the nested `LabelingDocument.group_id`, which is then used for the group membership check.

For `FieldDefinition`, `GET /api/template-models/:id/documents`, and `POST /api/template-models/:id/export` endpoints, the parent `TemplateModel` is fetched first and its `group_id` is used for the check.

For `TrainingJob` and `TrainedModel` endpoints accessed via a template-model route (e.g. `GET /api/template-models/:modelId/training/jobs`), the parent `TemplateModel` is fetched and its `group_id` is checked. For job-level endpoints (e.g. `GET /api/template-models/training/jobs/:jobId`), the job is fetched first to get its `templateModelId`, then the parent `TemplateModel` is fetched to obtain the `group_id`. The `GET /api/template-models/training/info` endpoint is not group-scoped (Azure resource metadata only).

For `ReviewSession` endpoints, the parent `Document` is fetched (either directly from the request body for creation, or via the session record for existing sessions) and its `group_id` is used for the check.

For `BenchmarkDefinition` and `BenchmarkRun` endpoints (accessed via `/api/benchmark/projects/:projectId/...`), the parent `BenchmarkProject` is fetched and its `group_id` is checked. Child models (`DatasetVersion`, `Split`, `BenchmarkDefinition`, `BenchmarkRun`, `DatasetGroundTruthJob`) do not have their own `group_id` — they inherit access through their parent `Dataset` or `BenchmarkProject`.

For `Dataset` sub-resource endpoints (versions, splits, samples, ground truth, freeze), the parent `Dataset` is fetched and its `group_id` is checked before proceeding.

### List Endpoints

List endpoints (e.g. `GET /api/documents`, `GET /api/workflows`, `GET /api/template-models`, `GET /api/benchmark/projects`) accept an optional `group_id` query parameter. When provided, `identityCanAccessGroup` validates access to that group and results are scoped to it. When omitted, results are filtered to the identity's accessible groups via `getIdentityGroupIds` (same helper file) — system admins receive results across all groups, API keys are scoped to their key's group, and unauthenticated identities get nothing.

## Authorization Logic

The `identityCanAccessGroup(identity, groupId, requiredPermissions)` helper performs the following checks using the pre-populated `resolvedIdentity` (no additional database queries):

1. If `groupId` is `null` (orphaned record with no group assignment), throws `404 Not Found`. This prevents leaking the existence of orphaned records to any caller, regardless of identity.
2. If `identity` is `undefined`, throws `403 Forbidden`.
3. If `identity.isSystemAdmin` is `true`, access is always allowed (system admins bypass group checks).
4. Checks `identity.groupRoles` for the requested `groupId`. If the group is not present, throws `403 Forbidden`. This applies to both JWT and API key identities — both use the same `groupRoles` map (populated by `IdentityGuard` via a `findUserWithGroups` DB lookup for JWT, or directly from the key's scoped group with role `EDITOR` for API keys).
5. Checks that the identity's role grants all `requiredPermissions` (defined per endpoint via `@Identity({ groupPermissions })` or passed directly to `identityCanAccessGroup`). Throws `403 Forbidden` if any permission is missing. See `src/auth/role-permissions.ts` for the full `RoleClaimsMap`.

## Request DTOs

All creation DTOs include a `group_id` (or `groupId`) field. Except for `UploadDocumentDto`, the field is required — a missing or empty value results in a `400 Bad Request` response enforced by class-validator before the controller logic is reached.

`UploadDocumentDto.group_id` is optional for API-key callers: when omitted, the group is inferred from the key's scoped group. If both are present and disagree, the controller throws `403 Forbidden`; if neither is available (JWT caller with no `group_id`), it throws `400 Bad Request`.

| DTO | Field |
|---|---|
| `UploadDocumentDto` | `group_id` (optional with API key) |
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
| `400 Bad Request` | `group_id` is missing or empty in the request body (for `POST /api/upload`, only when no API-key group can be inferred) |
| `403 Forbidden` | Requestor identity is absent, identity does not belong to the specified group, or the identity's role does not grant the required permissions |
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
| Labeling upload target | `POST /api/template-models/:id/upload` | The template model must belong to the body's `group_id`; a mismatch is `400` | `TemplateModelService.uploadLabelingDocument` |
| Labeling document attach | `POST /api/template-models/:id/documents` | The template model must be in the labeling document's group; otherwise the template model is not found | `TemplateModelService.addDocumentToTemplateModel` |
| Upload model | `POST /api/upload` (`model_id`, or the workflow's default) | A trained model of another group is not found; Azure `prebuilt-*` ids and ids that are not trained models (other engines) are not group-owned | `UploadController.uploadDocument`, `TrainingDbService.findTrainedModelGroupId` |
| Upload ctx overrides | `POST /api/upload` (`ctx_overrides`) | Only ctx keys the workflow declares with a `defaultValue` are applied, and never the values the server derives from the stored document (`documentId`, `groupId`, `blobKey`, `fileName`, `fileType`, `contentType`, `modelId`, `documentMetadata`) | `OcrService.requestOcr` |
| Document thumbnails | `GET /api/documents/thumbnails` | The requested ids are resolved within `group_id`; ids outside it return no thumbnail | `DocumentController.getBulkThumbnails`, `DocumentDbService.findDocumentIdsInGroup` |
| HITL field schema | `GET /api/hitl/sessions/:id` | `metadata.templateModelId` is resolved only within the document's group | `ReviewDbService.findFieldDefinitionsForDocument` |
| Confusion profile derivation | `POST /api/groups/:groupId/confusion-profiles/derive` | `benchmarkRunIds` (via the run's project) and `templateModelIds` are read only from the profile's group; other ids are skipped like unknown ones | `ConfusionProfileService` |
| Format suggestions | `POST /api/template-models/:id/suggest-formats` | Benchmark runs are read only from projects in the template model's group | `FormatSuggestionService` |
| Error-detection analysis | `GET .../projects/:projectId/runs/:runId/error-detection-analysis` | A cached analysis is returned only for the project that owns the run | `BenchmarkErrorDetectionService` |
| Ground-truth generation | `POST /api/benchmark/datasets/:id/versions/:versionId/ground-truth-generation` (`workflowVersionId`) | The workflow version's lineage must be in the dataset's group | `GroundTruthGenerationService`, `GroundTruthJobDbService.findWorkflow` |
| Baseline history | `GET .../projects/:projectId/definitions/:definitionId/baseline-history` | The definition must belong to the project before audit rows are read | `BenchmarkDefinitionController` |
| Classification result | `GET /api/azure/classifier/classify` | Requires `group_id`; the operation location must name an existing classifier of that group | `AzureController`, `ClassifierService` |
| Blob path components | Classifier `name` / `label` / `folder`; dataset version `manifestPath` | Caller-supplied path components may not contain `.` or `..` segments (`manifestPath` may not be absolute); rejected with `400` | Classifier request DTOs, `CreateVersionDto` |
| Group membership check | All `groupPermissions` routes | Membership counts only the identity's own group entries (`Object.hasOwn`) | `IdentityGuard` |

**Blob paths.** `@ai-di/blob-storage-paths` rejects `.` and `..` segments when it
builds or validates a path, so a path component can never move a key into
another group's `{groupId}/` prefix. `validateBlobFilePathInGroup(key, groupId)`
additionally requires the key to belong to `groupId`.

**Pattern for new code:** when an endpoint accepts a resource id (or a reference
to another entity) that is not itself the group, scope the database query to the
caller's group — directly (`where: { id, group_id }`) for group-owned rows, or
via the owning parent relation (`where: { id, lineage: { group_id } }`,
`template_model_id`, project group, etc.) for child rows that have no `group_id`
of their own. Prefer reporting cross-group references as not-found over an
explicit "forbidden" so existence is not disclosed.

## Workflow Worker

Graph workflows run in the Temporal worker without an HTTP identity, so the
worker enforces the group itself:

- **The run's group comes from execution state.** The backend starts every graph
  workflow with the document's `groupId`. The engine injects it into each
  activity's input last and drops any `groupId` set by node parameters or port
  bindings. Activities that touch group data refuse to run without it.
- **Blob storage is reached only through group-bound helpers.**
  `getGroupBlobStorage(groupId)` validates every key and prefix against the group
  before reading, writing, listing or signing it, and `readGroupBlob(key, groupId)`
  reads document bytes from blob storage or the group's benchmark cache. This
  covers blob keys, OCR payload refs and keys built from `documentId`. The
  worker's Biome config (`style/noRestrictedImports`) rejects importing
  `getBlobStorageClient` outside `src/blob-storage/`.
- **Local files** are read only from the group's benchmark cache,
  `{BENCHMARK_CACHE_DIR}/{groupId}`, where benchmark runs materialise their
  datasets. Manifest paths must stay inside the materialised dataset, and benchmark
  cleanup deletes only inside the group's cache.
- **Rows loaded by an id from ctx or node parameters are scoped to the group:**
  documents (`{ id, group_id }`, so a status or OCR write to another group's
  document matches nothing), template models, confusion profiles, and child
  workflow refs (`getWorkflowGraphConfig` resolves version ids, lineage ids and
  lineage names only among the group's workflows).
- **Azure Content Understanding analyzers** live on a shared resource, so each
  group deploys under its own prefix (`{prefix}{groupId}…`); an explicit
  `analyzerId` must be a `prebuilt-*` analyzer or one of the group's own.

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
