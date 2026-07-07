# Audit Table

This document describes the durable audit table used to record **workflow runs** and **HITL (Human-in-the-Loop) events**. Requirements: [feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md](../feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md).

## Purpose

- **Traceability:** Correlate workflow starts and review actions with documents, workflows, and actors.
- **Compliance:** Append-only record of who did what and when (for the in-scope events).
- **Non-fatal:** Audit writes are best-effort; failures are logged and do not fail the main operation.

## Mutation audit requirements

In addition to the event types listed below, **every user-initiated create, update, or delete** exposed via the API must emit an audit row:

| Domain | Service | Audit helper |
|--------|---------|--------------|
| Global (HITL, groups, tables, documents, workflows) | Feature service or controller | `AuditService.recordEvent` |
| Benchmark (datasets, runs, definitions) | Feature service | `AuditLogService` or `AuditLogDbService` |

### Placement rules

1. **Transactional mutations:** include the audit insert in the same Prisma transaction by passing `tx` to the audit db-service. If the transaction rolls back, the audit row rolls back with it.
2. **Non-transactional mutations:** call `recordEvent` / `logAuditEvent` immediately after the write succeeds. Failures are logged and ignored (main operation already committed).
3. **Read/access endpoints:** record access events per the tables in this document; these are not part of mutation transactions.

### Review checklist

When adding or changing backend mutations, verify:

- [ ] Two or more related writes use a single transaction (see [DATABASE_SERVICES.md](./DATABASE_SERVICES.md)).
- [ ] An audit event is recorded with the correct `event_type` / `AuditAction`, `resource_type`, `resource_id`, and `actor_id` (or `null` only for system-initiated actions with no HTTP identity).
- [ ] Audit uses the same `tx` when the mutation is transactional.

Known gaps and remediation priorities: [TRANSACTION_AND_AUDIT_AUDIT.md](./TRANSACTION_AND_AUDIT_AUDIT.md).

## Schema

- **Table:** `audit_events` (Prisma model `AuditEvent`).
- **Columns:**

| Column                   | Type     | Description                                      |
|--------------------------|----------|--------------------------------------------------|
| `id`                     | String   | Primary key (cuid).                              |
| `occurred_at`            | DateTime | When the event occurred (default: now).          |
| `event_type`             | String   | Event kind (see below).                           |
| `actor_id`               | String?  | User/reviewer ID when the action is user-initiated. Omitted/`null` only for system-initiated actions (e.g. training poller) with no HTTP identity in request context. |
| `resource_type`          | String   | e.g. `workflow_run`, `review_session`.           |
| `resource_id`            | String   | ID of the resource (e.g. workflow id, session id). |
| `document_id`            | String?  | Related document ID.                             |
| `workflow_execution_id`   | String?  | Temporal workflow execution ID.                  |
| `group_id`               | String?  | Group context.                                   |
| `request_id`             | String?  | HTTP request ID when available.                  |
| `payload`                | Json?    | Event-specific details.                          |

- **Indexes:** `occurred_at`, `event_type`, `resource_type`, `document_id`, `workflow_execution_id`, `group_id`.

## Event Types

### Workflow runs

| event_type             | When | resource_type  | resource_id              | Payload / notes                    |
|------------------------|------|----------------|--------------------------|------------------------------------|
| `workflow_run_started`  | Backend starts graph workflow for a document | workflow_run | workflow_execution_id | workflow_config_id, request_id     |

### Workflow configuration

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `workflow_created` | New workflow lineage + v1 created | workflow_lineage | lineage.id | workflow_version_id, version_number, slug, name |
| `workflow_updated` | Lineage metadata updated (no new version) | workflow_lineage | lineage.id | workflow_version_id, fields_updated |
| `workflow_version_appended` | New config version appended to lineage | workflow_lineage | lineage.id | workflow_version_id, version_number |
| `workflow_candidate_created` | Benchmark candidate lineage created | workflow_lineage | candidate lineage.id | source_workflow_version_id, source_lineage_id |
| `workflow_deleted` | Workflow lineage deleted | workflow_lineage | lineage.id | slug, name |
| `workflow_head_reverted` | Lineage head set to an existing version | workflow_lineage | lineage.id | workflow_version_id, version_number |
| `benchmark_workflow_promoted` | Candidate promoted into definition's base lineage | benchmark_definition | definition.id | project_id, candidate_workflow_version_id, base_lineage_id |
| `benchmark_workflow_applied_to_base` | Candidate applied directly to base lineage | workflow_version | new version.id | project_id, candidate_workflow_version_id, base_lineage_id, new_version_number |

### API keys

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `api_key_created` | New API key generated for a group | api_key | key.id | key_prefix, generating_user_id; `actor_id` from request context |
| `api_key_deleted` | API key revoked | api_key | key.id | key_prefix; `actor_id` from request context |
| `api_key_regenerated` | API key rotated in place | api_key | key.id | key_prefix, generating_user_id; `actor_id` from request context |

### HITL events

| event_type                     | When | resource_type    | resource_id | Payload / notes        |
|--------------------------------|------|------------------|-------------|------------------------|
| `review_session_started`       | Review session created | review_session | session.id | document_id             |
| `review_corrections_submitted` | Corrections saved      | review_session | session.id | correction_count        |
| `review_session_approved`      | Session status → approved | review_session | session.id | document_id             |
| `review_session_escalated`     | Session status → escalated | review_session | session.id | document_id, reason     |
| `review_session_skipped`       | Session status → skipped | review_session | session.id | document_id             |
| `review_session_reopened`      | Completed session reopened | review_session | session.id | document_id             |
| `review_correction_deleted`    | Single correction removed from a session | review_session | session.id | correction_id, document_id |
| `human_approval_signal_sent`   | Backend sends humanApproval signal to Temporal | workflow_run | workflow_execution_id | approved, reviewer     |

### Training

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `training_job_started` | User starts template model training | training_job | job.id | template_model_id, target_model_id, target_version, build_mode |
| `training_job_cancelled` | User cancels an in-flight training job | training_job | job.id | template_model_id, previous_status |
| `trained_model_activated` | User activates a trained version, or poller activates after SUCCEEDED | trained_model | trained_model.id | template_model_id, model_id, version; poller also sets `source: "training_poller"` and omits actor_id |
| `trained_model_deleted` | User tombstones a trained version | trained_model | trained_model.id | template_model_id, model_id, version |

### Dataset

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `dataset_deleted` | Dataset cascade-deleted | dataset | dataset.id | name, version_count |
| `dataset_version_created` | New draft version created | dataset_version | version.id | dataset_id, version, name |
| `dataset_version_updated` | Version name updated | dataset_version | version.id | dataset_id, name |
| `dataset_version_deleted` | Version deleted | dataset_version | version.id | dataset_id, version |
| `dataset_version_frozen` | Version frozen (user-facing) | dataset_version | version.id | dataset_id, version |
| `dataset_files_uploaded` | Files uploaded to a draft version | dataset_version | version.id | dataset_id, file_count, document_count |
| `dataset_sample_deleted` | Sample removed from a draft version | dataset_version | version.id | dataset_id, sample_id |
| `dataset_split_created` | Split created | dataset_split | split.id | dataset_id, dataset_version_id, name, type, sample_count |
| `dataset_split_updated` | Split sample IDs updated | dataset_split | split.id | dataset_id, dataset_version_id, sample_count |
| `dataset_split_frozen` | Split frozen (user-facing) | dataset_split | split.id | dataset_id, dataset_version_id, name |

### Benchmark project

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `benchmark_project_created` | Project created | benchmark_project | project.id | name |
| `benchmark_project_deleted` | Project deleted | benchmark_project | project.id | name |

### Benchmark definition

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `benchmark_definition_created` | Definition created | benchmark_definition | definition.id | project_id, name, revision |
| `benchmark_definition_updated` | In-place update (no runs) | benchmark_definition | definition.id | project_id |
| `benchmark_definition_revised` | New revision created (has runs; prior marked immutable) | benchmark_definition | new definition.id | project_id, previous_definition_id, revision |
| `benchmark_definition_deleted` | Definition deleted | benchmark_definition | definition.id | project_id, name |
| `benchmark_schedule_configured` | Schedule enabled/disabled or cron updated | benchmark_definition | definition.id | project_id, schedule_enabled, schedule_cron, schedule_id |

### Benchmark run

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `benchmark_run_cancelled` | Run cancelled | benchmark_run | run.id | project_id, definition_id |
| `benchmark_run_deleted` | Run deleted (with unfreeze/reset when last run) | benchmark_run | run.id | project_id, definition_id |

### Ground truth generation

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `ground_truth_generation_started` | GT jobs created for a dataset version | dataset_version | version.id | dataset_id, workflow_version_id, job_count, stale_jobs_removed |

### Template model

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `template_model_created` | Template model created | template_model | model.id | name, model_id |
| `template_model_updated` | Template model metadata updated | template_model | model.id | — |
| `template_model_deleted` | Template model deleted | template_model | model.id | name |
| `template_model_field_created` | Field added to schema | template_model | model.id | field_id, field_key |
| `template_model_field_updated` | Field definition updated | template_model | model.id | field_id |
| `template_model_field_deleted` | Field removed from schema | template_model | model.id | field_id |
| `template_model_document_added` | Existing labeling doc linked | template_model | model.id | labeling_document_id |
| `template_model_document_removed` | Labeling doc unlinked | template_model | model.id | labeling_document_id |
| `template_model_document_uploaded` | Labeling doc uploaded and linked | template_model | model.id | labeling_document_id, kind |
| `template_model_labels_saved` | Labels saved (with status update) | template_model | model.id | labeling_document_id, label_count |
| `template_model_label_deleted` | Single label deleted | template_model | model.id | labeling_document_id, label_id |

### Classifier

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `classifier_created` | Classifier record created | classifier | classifier.name | classifier_name, status |
| `classifier_updated` | User updates description/source | classifier | classifier.name | classifier_name, fields_updated |
| `classifier_training_requested` | User requests classifier training | classifier | classifier.name | classifier_name |
| `classifier_deleted` | Classifier deleted | classifier | classifier.name | classifier_name, previous_status |

### Confusion profile

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `confusion_profile_created` | Profile created (explicit or derived) | confusion_profile | profile.id | name |
| `confusion_profile_updated` | Profile updated | confusion_profile | profile.id | fields_updated |
| `confusion_profile_deleted` | Profile deleted | confusion_profile | profile.id | — |

### Document mutations

| event_type | When | resource_type | resource_id | Payload / notes |
|------------|------|---------------|-------------|-----------------|
| `document_uploaded` | Document uploaded via upload API | document | document.id | title, file_type, status |
| `document_updated` | Document title/metadata updated | document | document.id | fields_updated |

### Document access

| event_type                | When                                                                          | resource_type                                                                                             | resource_id                                                | Payload / notes                                                                           |
|---------------------------|-------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------|------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| `document_accessed`       | After successful access to document metadata, file bytes, or OCR result (single resource) | `document`, `ocr_result`, `template_model_document`, `ground_truth`, `dataset_document`, `benchmark_run` | id of the resource accessed (document id, sample id, etc.) | `{ action: "metadata" \| "ocr" \| "view" \| "download", ...context }`                     |
| `document_list_accessed`  | After successful access to a list/collection endpoint that returns documents, OCR, or their derivatives | `document_collection`, `template_model`, `hitl_queue`, `hitl_eligible`, `dataset_version`, `dataset_split`, `benchmark_run`, `classifier` | scope id (group id, template model id, version id, etc.)   | `{ action, document_ids \| sample_ids \| document_names, count, ...scope-specific ids }`  |

**Action vocabulary (compact — same values across all controllers):**

- `metadata` — DB record, list metadata, labeled document record, or aggregate metrics
- `ocr` — raw OCR output, corrections derived from OCR, ground-truth JSON, or per-sample extracted values
- `view` — rendered/inline file bytes (e.g. inline PDF)
- `download` — raw original-file bytes returned as an attachment

**Single-row list audits:** endpoints returning multiple resources emit **one** audit row per request. The returned identifiers are stored in the payload as `document_ids`, `sample_ids`, or `document_names` (whichever is applicable), along with a `count`. This keeps audit volume proportional to request count rather than result size.

- **actor_id / group_id / request_id** are filled from the current request context when not passed explicitly.
- **Where recorded (user-facing data delivery only):**
  - `DocumentController` — `getDocument` (metadata), `getAllDocuments` (list metadata), `getOcrResult` (ocr), `viewDocument` (view), `downloadDocument` (download). Mutations use `document_updated` / `document_uploaded` (see tables above), not access events.
  - `TemplateModelController` — `getTemplateModelDocuments` (list), `getTemplateModelDocument` (metadata), `getDocumentLabels` (metadata), `getDocumentOcr` (ocr), `viewLabelingDocument` (view), `downloadLabelingDocument` (download).
  - `HitlController` — `getQueue` (list), `getSession` (ocr), `getCorrections` (ocr).
  - `GroundTruthGenerationController` — `getReviewQueue` (list ocr).
  - `BenchmarkRunController` — `getDrillDown` (metadata), `getPerSampleResults` (list ocr).
  - `DatasetController` — `listSamples` (list metadata), `getSplit` (list metadata), `getGroundTruth` (ocr), `downloadFile` (download).
  - `HitlDatasetController` — `listEligibleDocuments` (list metadata).
  - `AzureController` — `getClassifierDocuments` (list metadata).

## Implementation

- **Backend:** `AuditService` (in `apps/backend-services/src/audit/`) provides `recordEvent(events)`. When `request_id` or `actor_id` are omitted in the input, they are filled from the current request context (AsyncLocalStorage) when available, so callers do not need to pass them explicitly. It is called from:
  - **OcrService:** after starting a graph workflow and updating the document (document update + audit in one transaction).
  - **WorkflowService:** after creating, updating, or appending workflow versions; after creating benchmark candidate lineages.
  - **BenchmarkDefinitionService:** after promoting or applying candidate workflows to the base lineage.
  - **ApiKeyService:** after creating, deleting, or regenerating group API keys.
  - **HitlService:** after creating a session, submitting corrections, approving, escalating, skipping, reopening a session, or deleting a correction.
  - **TrainingService / TrainingPollerService:** after starting/cancelling training jobs and activating/deleting trained models (poller activation is system-initiated, no actor).
  - **DatasetService:** after dataset/version/sample/split mutations and freezes.
  - **BenchmarkProjectService:** after creating or deleting a project.
  - **ClassifierService / AzureController:** after classifier create/update/delete and training request.
  - **ConfusionProfileService:** after create/update/delete (including derive-and-save create path).
  - **UploadController:** after successful document upload (`document_uploaded`).
  - **DocumentController:** after successfully sending the human approval signal to a workflow; after document update (`document_updated`); and after authorized delivery of document metadata, file bytes, or OCR to a user (see "Document access" above for the full list of controllers and endpoints).
- **Migration:** `apps/shared/prisma/migrations/20250224120000_add_audit_events/`.
- **Failure behavior:** If an audit insert fails, the service logs a warning and continues; the main operation is not failed.

## Querying

There is no dedicated REST API or UI for the audit table in the initial scope. The table can be queried directly (e.g. for reporting or via a DB connector to Kibana or other tools) using the indexed columns.
