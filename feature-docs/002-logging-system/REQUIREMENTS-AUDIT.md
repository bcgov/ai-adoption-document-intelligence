# Audit Table — Requirements Specification (Logging Feature)

## 1. Title and Overview

Add a durable audit table that records **workflow runs** and **HITL (Human-in-the-Loop) events** for traceability and compliance. This extends the logging-system feature (002) with a database-backed audit trail for a defined subset of events, while application logs remain stdout-only per REQUIREMENTS.md.

The system is generic: event types and resource types are string-based so that additional event kinds can be added later without changing the audit infrastructure.

### Scope (Initial)

- **Workflow runs:** Record when a graph workflow is started for a document (backend). Completion/failure of workflows is out of scope for this document; only “started” is recorded.
- **HITL events:** Record review session lifecycle: session started, corrections submitted, session approved, session escalated, session skipped. Optionally record when a human approval signal is sent to a Temporal workflow.

### Out of Scope (Initial)

- Workflow run completed/failed (no Temporal worker or visibility-based backfill).
- Audit events for other domains (e.g. group membership, API keys) unless explicitly added later.
- Query API or UI for audit data; the table is for storage and future consumption (e.g. reporting, Kibana via DB connector).

---

## 2. Goals and Non-Goals

### Goals

1. **Single audit table:** One append-only table with a consistent schema (event type, timestamp, actor, resource type/id, optional document/workflow/group/request IDs, JSON payload).
2. **Workflow run started:** One audit row when the backend starts a graph workflow for a document (after successful start and document update).
3. **HITL events:** One audit row for each of: review session started, corrections submitted (one row per submit action), session approved, session escalated, session skipped. Optionally: human approval signal sent to workflow.
4. **Actor and correlation:** Where the action is user-initiated, store actor (e.g. reviewer_id/userId) and request_id when available from request context.
5. **No impact on existing flows:** Audit writes are best-effort; failures must not fail the main operation (log and continue). The audit table is not required for application correctness.

### Non-Goals

1. Workflow completion/failure audit (Temporal-side or job-based) in this feature.
2. Public REST API or UI for querying audit events.
3. Mandatory audit for every possible action in the system; only the listed events are in scope.

---

## 3. Event Types and Payloads

### Workflow runs

| event_type              | When | resource_type  | resource_id        | Typical payload |
|-------------------------|------|----------------|--------------------|-----------------|
| workflow_run_started    | After backend starts graph workflow and updates document | workflow_run | workflow_execution_id | workflow_config_id?, request_id? |

- **document_id**, **workflow_execution_id**, **group_id** (from document) set when available.
- **actor_id**: optional (e.g. from request context if user triggered upload).

### HITL events

| event_type                    | When | resource_type    | resource_id | Typical payload |
|-------------------------------|------|------------------|-------------|-----------------|
| review_session_started        | After review session is created | review_session | session.id | document_id, workflow_execution_id? (from document) |
| review_corrections_submitted  | After corrections are saved     | review_session | session.id | document_id, correction_count |
| review_session_approved       | After session status → approved  | review_session | session.id | document_id |
| review_session_escalated      | After session status → escalated | review_session | session.id | document_id, reason? |
| review_session_skipped        | After session status → skipped   | review_session | session.id | document_id |
| human_approval_signal_sent    | When backend sends humanApproval signal to Temporal | workflow_run | workflow_execution_id | approved, reviewer? |

- **actor_id**: reviewer_id (or request context userId) for session events; reviewer for signal.
- **document_id**, **workflow_execution_id**, **group_id** from session.document when available.

---

## 4. Schema

- **Table name:** `audit_events` (Prisma model `AuditEvent`).
- **Columns:**
  - `id`: String (cuid), primary key.
  - `occurred_at`: DateTime, default now.
  - `event_type`: String (required).
  - `actor_id`: String (optional).
  - `resource_type`: String (required), e.g. workflow_run, review_session.
  - `resource_id`: String (required), e.g. workflow execution id, session id.
  - `document_id`: String (optional).
  - `workflow_execution_id`: String (optional).
  - `group_id`: String (optional).
  - `request_id`: String (optional).
  - `payload`: Json (optional), event-specific details.
- **Indexes:** occurred_at, event_type, resource_type, document_id, workflow_execution_id, group_id (as needed for common filters).
- **Append-only:** No updates or deletes; insert only.

---

## 5. Implementation Points

- **Backend (NestJS):**
  - Add Prisma model and migration for `audit_events`.
  - Add an `AuditService` that provides `recordEvent(events: CreateAuditEventDto[])`. It must catch errors and log them without throwing so that audit failures do not fail the main flow.
  - **Workflow run started:** In `OcrService` (or equivalent), after successful `startGraphWorkflow` and `updateDocument`, call `AuditService.recordEvent` with event_type `workflow_run_started`, resource_id = workflowExecutionId, document_id, group_id, request_id, payload (workflow_config_id, request_id).
  - **HITL:** In `HitlService`, after each of: `createReviewSession`, submitCorrections, approveSession, escalateSession, skipSession, call `AuditService.recordEvent` with the corresponding event_type and resource/session/document/group/actor/request_id. For escalate include reason in payload.
  - **Human approval signal:** In the code path that calls `TemporalClientService.sendHumanApproval`, after a successful send, call `AuditService.recordEvent` with event_type `human_approval_signal_sent`, resource_id = workflowId, payload = { approved, reviewer }.
- **Database:** Shared Prisma schema; migration run via existing backend migration flow.
- **Documentation:** Update `docs/LOGGING.md` (or add `docs/AUDIT.md`) to describe the audit table, event types, and that failures are non-fatal.

---

## 6. Acceptance Criteria

1. Table `audit_events` exists with the specified columns and indexes.
2. When a graph workflow is started for a document, one audit row is written with event_type `workflow_run_started` and correct resource/document/workflow/group/request identifiers.
3. When a review session is started, corrections submitted, approved, escalated, or skipped, one audit row is written per action with the correct event_type and identifiers.
4. Optionally, when a human approval signal is sent to a workflow, one audit row is written with event_type `human_approval_signal_sent`.
5. Audit write failures are logged and do not cause the main operation to fail.
6. Documentation describes the audit table and event types.

---

## 7. Out of Scope / Clarifications

- No Temporal worker changes for workflow completion/failure audit in this feature.
- No REST API or UI for audit data.
- Generic event/resource design only; no document-type-specific logic in the audit service.
