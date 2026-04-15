# Audit Table

This document describes the durable audit table used to record **workflow runs** and **HITL (Human-in-the-Loop) events**. Requirements: [feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md](../feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md).

## Purpose

- **Traceability:** Correlate workflow starts and review actions with documents, workflows, and actors.
- **Compliance:** Append-only record of who did what and when (for the in-scope events).
- **Non-fatal:** Audit writes are best-effort; failures are logged and do not fail the main operation.

## Schema

- **Table:** `audit_events` (Prisma model `AuditEvent`).
- **Columns:**

| Column                   | Type     | Description                                      |
|--------------------------|----------|--------------------------------------------------|
| `id`                     | String   | Primary key (cuid).                              |
| `occurred_at`            | DateTime | When the event occurred (default: now).          |
| `event_type`             | String   | Event kind (see below).                           |
| `actor_id`               | String?  | User/reviewer ID when the action is user-initiated. |
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

### HITL events

| event_type                     | When | resource_type    | resource_id | Payload / notes        |
|--------------------------------|------|------------------|-------------|------------------------|
| `review_session_started`       | Review session created | review_session | session.id | document_id             |
| `review_corrections_submitted` | Corrections saved      | review_session | session.id | correction_count        |
| `review_session_approved`      | Session status → approved | review_session | session.id | document_id             |
| `review_session_escalated`     | Session status → escalated | review_session | session.id | document_id, reason     |
| `review_session_skipped`       | Session status → skipped | review_session | session.id | document_id             |
| `human_approval_signal_sent`   | Backend sends humanApproval signal to Temporal | workflow_run | workflow_execution_id | approved, reviewer     |

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
  - `DocumentController` — `getDocument` (metadata), `updateDocument` (metadata), `getAllDocuments` (list metadata), `getOcrResult` (ocr), `viewDocument` (view), `downloadDocument` (download).
  - `TemplateModelController` — `getTemplateModelDocuments` (list), `getTemplateModelDocument` (metadata), `getDocumentLabels` (metadata), `getDocumentOcr` (ocr), `viewLabelingDocument` (view), `downloadLabelingDocument` (download).
  - `HitlController` — `getQueue` (list), `getSession` (ocr), `getCorrections` (ocr).
  - `GroundTruthGenerationController` — `getReviewQueue` (list ocr).
  - `BenchmarkRunController` — `getDrillDown` (metadata), `getPerSampleResults` (list ocr).
  - `DatasetController` — `listSamples` (list metadata), `getSplit` (list metadata), `getGroundTruth` (ocr), `downloadFile` (download).
  - `HitlDatasetController` — `listEligibleDocuments` (list metadata).
  - `AzureController` — `getClassifierDocuments` (list metadata).

## Implementation

- **Backend:** `AuditService` (in `apps/backend-services/src/audit/`) provides `recordEvent(events)`. When `request_id` or `actor_id` are omitted in the input, they are filled from the current request context (AsyncLocalStorage) when available, so callers do not need to pass them explicitly. It is called from:
  - **OcrService:** after starting a graph workflow and updating the document.
  - **HitlService:** after creating a session, submitting corrections, approving, escalating, or skipping a session.
  - **DocumentController:** after successfully sending the human approval signal to a workflow; and after authorized delivery of document metadata, file bytes, or OCR to a user (see "Document access" above for the full list of controllers and endpoints).
- **Migration:** `apps/shared/prisma/migrations/20250224120000_add_audit_events/`.
- **Failure behavior:** If an audit insert fails, the service logs a warning and continues; the main operation is not failed.

## Querying

There is no dedicated REST API or UI for the audit table in the initial scope. The table can be queried directly (e.g. for reporting or via a DB connector to Kibana or other tools) using the indexed columns.
