# Document re-run (reprocess) endpoint — design

Date: 2026-06-29
Status: Approved (pending spec review)

## Problem

There is no way to re-run a document's workflow. When a run fails or a document
gets orphaned in `ongoing_ocr` ("Processing"), the only recourse today is
direct DB/Temporal surgery. We want a generic, per-document, user-facing re-run
primitive — both to let users retry a broken run and to clear stuck backlogs
(e.g. the ~233 prod documents stranded in `ongoing_ocr`) by looping the endpoint
over their IDs.

## Goals

- A single per-document re-run action, group-scoped, usable by end users.
- Re-run from a **broken or stuck** state only: `failed` or an orphaned
  `ongoing_ocr` (no live Temporal run).
- Reuse the existing OCR start path (`OcrService.requestOcr`) — re-run is
  *validate + delegate*, not a new execution mechanism.
- Safe to script for bulk backlog clearing (ops loops document IDs, throttled).

## Non-goals (YAGNI)

- Re-running already-successful documents (`complete` / `extracted` /
  `awaiting_review`). Excluded to avoid clobbering good results.
- Choosing a different/newer workflow version — re-run uses the document's
  existing `workflow_config_id` (same version).
- `ctx` overrides on re-run.
- A dedicated bulk/admin endpoint. Backlog clearing is ops looping this
  endpoint with an identity that can access the relevant groups.
- Re-normalizing `conversion_failed` documents (they have no normalized PDF; the
  remedy is re-upload, surfaced as a clear error).

## API

`POST /api/documents/:documentId/reprocess`

- Auth: `@Identity()` + `identityCanAccessGroup(req.resolvedIdentity, document.group_id)` — same pattern as `POST /:documentId/approve`.
- Request body: none.
- Success: **202 Accepted**

```json
{
  "success": true,
  "workflowExecutionId": "graph-<documentId>",
  "status": "ongoing_ocr"
}
```

### Status codes

| Code | When |
|------|------|
| 202 | Re-run started; workflow execution id returned. |
| 403 | Caller is not a member of the document's group. |
| 404 | Document not found. |
| 409 | Not re-runnable (see guard reasons below), each with a specific message. |

`409` is used for every guard failure, with a distinct human-readable `message`
so callers can tell the cases apart (wrong state, no source file, purged,
already running).

## Behaviour

On `POST /:documentId/reprocess`:

1. Load the document → `404` if missing.
2. `identityCanAccessGroup(...)` → `403` if not a group member.
3. Guards (all → `409` with a specific reason):
   - **State**: `status` must be `failed` or `ongoing_ocr`. Any other status is
     rejected (e.g. `complete`/`extracted`/`awaiting_review`/`pre_ocr`).
   - **Source present**: `normalized_file_path` must be non-null. This naturally
     rejects `conversion_failed` (no normalized PDF); the message advises
     re-upload.
   - **Not purged**: `purged_at` must be null **and** the normalized blob must
     still exist in blob storage (guards ephemeral docs whose source was
     reclaimed).
   - **Not already running**: no **live** (Running) Temporal execution for
     `graph-<documentId>`. Orphaned `ongoing_ocr` passes because its prior run
     is closed/Failed; a genuinely in-flight document is rejected so it is not
     double-started.
   - **Workflow config present**: `workflow_config_id` must be set (a re-run
     cannot start without one). Documents predating workflow configs are
     rejected with a clear message.
4. Delegate to `OcrService.requestOcr(documentId)`:
   - Starts `graph-<documentId>`. Temporal's default WorkflowId reuse policy
     (`ALLOW_DUPLICATE`) permits a new run because the prior run is closed.
   - The workflow's pre-execution hook sets the document to `ongoing_ocr`.
   - Prior OCR artifacts are overwritten by the new run — no manual pre-clean.
5. Return `202` with the workflow execution id and `ongoing_ocr`.

### Interaction with the OCR failure fixes (PR #216)

Re-run depends on the failure-handling fixes already in flight:

- A re-run of a permanently-bad document (e.g. its normalized PDF is still an
  encrypted/unsupported file) fails fast (non-retryable Azure 4xx) and the
  workflow's failure-path hook lands it in `failed` — a terminal, purgeable
  state — instead of stranding it back in `ongoing_ocr`. This is what makes
  looping the endpoint over the stuck backlog converge.

## Components

- **Controller** — `DocumentController.reprocessDocument(documentId, req)` route
  with full Swagger decorators (`@ApiOkResponse`/`@ApiForbiddenResponse`/
  `@ApiNotFoundResponse`/`@ApiConflictResponse`) referencing the response DTO.
- **DTO** — `ReprocessDocumentResponseDto` (`success`, `workflowExecutionId`,
  `status`) with `@ApiProperty` per repo conventions.
- **Service** — `DocumentService.reprocessDocument(documentId, identity)`:
  performs the guards, the live-run check (via `TemporalClientService`), then
  delegates to `OcrService.requestOcr`. Throws `NotFoundException` /
  `ForbiddenException` / `ConflictException` mapped to the codes above.
- **Live-run check** — a small `TemporalClientService` helper that reports
  whether `graph-<documentId>` currently has a Running execution (e.g. via
  `describeWorkflow` / status query), returning false when no execution exists.

## Testing

- **Controller spec**: 404 (missing), 403 (wrong group), 409 per guard
  (bad state, null `normalized_file_path`, purged, already running), and the
  202 happy path delegating to the service.
- **Service spec**: each guard in isolation, the live-run check, and successful
  delegation to `OcrService.requestOcr` (mocked) returning the workflow id.
- Follows existing `document.controller.spec` / `document.service.spec`
  patterns and mocks.

## Operational use (clearing the backlog)

Ops obtains the stuck document IDs (`status = 'ongoing_ocr'`), then loops
`POST /api/documents/:id/reprocess` in throttled batches with an identity that
can access those groups. Each call drives the document to a terminal state
(`failed`, or `complete` if the original failure was transient), after which the
ephemeral janitor reclaims blobs/Temporal records for ephemeral configs. No
direct DB modification.
