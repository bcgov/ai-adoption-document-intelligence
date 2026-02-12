# GET /api/documents: Issues and Recommended Fixes

This note describes current problems in `DocumentController.getAllDocuments()` and what should be improved.

## Current behavior

- Endpoint: `GET /api/documents` (`@Controller("api/documents")`, `@Get()`).
- Frontend usage:
  - `useDocuments()` calls `GET /api/documents`.
  - `DocumentsList` uses it for document listing.
  - `ProcessingQueue` uses it with polling every 10 seconds.
- Data access:
  - Calls `databaseService.findAllDocuments()`.
  - Current implementation returns all rows (`findMany` with only `orderBy`), no pagination.
- Status reconciliation:
  - For each document with `workflow_execution_id` and status `ongoing_ocr` or `completed_ocr`, it calls Temporal:
    - `getWorkflowStatus(workflowId)` (`describe`)
    - `queryWorkflowStatus(workflowId)` for running workflows
  - If workflow is terminal failed/terminated/timed out/cancelled, it updates DB status to `failed`.
  - If query status is `awaiting_review`, it returns UI override status `needs_validation`.

## Why this is a problem

- No pagination means full-table reads for each call.
- Endpoint performs per-document Temporal RPC fan-out (`O(M)` to `O(2M)` remote calls per request).
- With frontend polling (10s in queue view), this repeats frequently and scales poorly.
- Endpoint currently mixes read path and write side effects (`updateDocument` inside list retrieval).
- If Temporal is degraded, list performance and freshness degrade.
- There is a possible status contract mismatch risk:
  - Controller expects query result field `status === "awaiting_review"`.
  - Graph workflow query shape includes `overallStatus`; ensure review state is exposed consistently.

## Dependency trace

- Frontend: `useDocuments` -> `apiService.get("/documents")`
- Backend:
  - `DocumentController.getAllDocuments()`
  - `DatabaseService.findAllDocuments()`
  - `TemporalClientService.getWorkflowStatus()`
  - `TemporalClientService.queryWorkflowStatus()`
  - `DatabaseService.updateDocument()` (in controller read path)

## Recommended fixes (priority order)

1. **Add pagination to `GET /api/documents`**
   - Support query params (cursor or `limit`/`offset`) and return metadata.
2. **Make DB the primary source for list status**
   - Persist workflow/review state in DB so list endpoint does not need per-document Temporal checks.
3. **Move status reconciliation off request path**
   - Use workflow completion/failure updates or a background reconciler.
4. **Standardize workflow status contract**
   - Ensure one stable field for review-needed state across workflow types.
5. **Reduce polling load**
   - Use adaptive polling/backoff or longer interval when queue is idle.

## Target outcomes

- Predictable list latency as data volume grows.
- Lower Temporal load and fewer cross-service calls on high-traffic endpoints.
- Clearer ownership of status state transitions.
- Better resilience during Temporal outages.
