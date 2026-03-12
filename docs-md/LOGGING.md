# Logging (shared package)

The `@ai-di/shared-logging` package provides structured NDJSON logging used by `backend-services` and the Temporal worker. See feature spec in `feature-docs/007-logging-system` (if present).

## Package location

- `packages/logging` — source and tests.

## Usage

- **Backend:** `AppLoggerService` wraps `createLogger("backend-services")` (see `apps/backend-services`). Request-scoped `requestId` and `userId` are merged into every log via middleware and request context. The `requestId` is always generated server-side (a new UUID per request); any client-supplied `x-request-id` header is ignored so logs and audit cannot be confused by reused IDs. In development, `LoggingInterceptor` (registered in `LoggingModule`) logs each HTTP request/response as NDJSON (method, path, statusCode, durationMs, and at debug level query, params, body).
- **Temporal worker:** `createLogger("temporal-worker")` and `createActivityLogger(activityName, context)` (see `apps/temporal/src/logger.ts`). Activities that receive `requestId` in workflow input should pass it in `context` so logs can be traced by requestId across backend and worker. **SDK internal logs** (e.g. "Activity failed", "Workflow failed") are routed through the same shared logger via a custom Runtime logger and native log forwarding (`apps/temporal/src/temporal-runtime-logger.ts`), so all worker process output is NDJSON and respects `LOG_LEVEL`.

## Testing

The package has a small Jest test suite in `packages/logging/src/logger.test.ts`.

- **Run tests:** From repo root or from `packages/logging`: `npm test` (or `npm run test:watch`).
- **Coverage:** `getLogLevel()` (default/invalid/valid/case-insensitive), NDJSON shape (timestamp, level, service, message, context), LOG_LEVEL filtering (debug suppressed when level is info; only warn/error when level is warn), redaction of sensitive keys (e.g. `apiKey`, `token`, `password`), child logger context merging, and no-throw behavior when stdout.write fails.

## Audit table (document access)

The backend records **who accessed documents and when** in the `audit_events` table. For each successful access to document metadata (GET document by ID), document file (GET download), or OCR result (GET OCR), an event with `event_type` `document_accessed` is written with `actor_id`, `document_id`, `group_id`, `request_id`, and `payload.action` (`metadata`, `download`, or `ocr`). See `docs/AUDIT.md` and `feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md` for the full audit schema and event types.

## OpenShift: log persistence and rotation

On OpenShift, stdout is still collected by the platform (e.g. Loki). To keep a durable copy for debugging after crashes, deployments use:

- **Tee:** The main process stdout/stderr is piped through `tee -a /var/log/app/<service>.log`, so logs go to both the container runtime (and thus Loki) and a file on a persistent volume.
- **PVC:** A dedicated logs PVC (`backend-services-logs`, `temporal-worker-logs`) is mounted at `/var/log/app`. Logs survive pod restarts.
- **Logrotate sidecar:** A `logrotate` container runs hourly, rotating the log file when it reaches 50M and keeping 5 rotated files. It uses `copytruncate` so the app does not need to be restarted.

To inspect persisted logs:

- Backend: `oc exec -it deployment/backend-services -c backend-services -- tail -n 200 /var/log/app/backend.log`
- Temporal worker: `oc exec -it deployment/temporal-worker -c temporal-worker -- tail -n 200 /var/log/app/worker.log`

Config is in `deployments/openshift/kustomize/base/`: PVCs (`pvc-logs.yml`), ConfigMaps (`logrotate-configmap.yml`), and the deployment specs (volume mounts, tee command, logrotate sidecar).
