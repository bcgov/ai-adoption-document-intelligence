# Audit Table

This document describes the durable audit table used to record **workflow runs** and **HITL (Human-in-the-Loop) events**. Requirements: [feature-docs/002-logging-system/REQUIREMENTS-AUDIT.md](../feature-docs/002-logging-system/REQUIREMENTS-AUDIT.md).

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

## Implementation

- **Backend:** `AuditService` (in `apps/backend-services/src/audit/`) provides `recordEvent(events)`. It is called from:
  - **OcrService:** after starting a graph workflow and updating the document.
  - **HitlService:** after creating a session, submitting corrections, approving, escalating, or skipping a session.
  - **DocumentController:** after successfully sending the human approval signal to a workflow.
- **Migration:** `apps/shared/prisma/migrations/20250224120000_add_audit_events/`.
- **Failure behavior:** If an audit insert fails, the service logs a warning and continues; the main operation is not failed.

## Querying

There is no dedicated REST API or UI for the audit table in the initial scope. The table can be queried directly (e.g. for reporting or via a DB connector to Kibana or other tools) using the indexed columns.
