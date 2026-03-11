# Logging (shared package)

The `@ai-di/shared-logging` package provides structured NDJSON logging used by `backend-services` and the Temporal worker. See feature spec in `feature-docs/007-logging-system` (if present).

## Package location

- `packages/logging` — source and tests.

## Usage

- **Backend:** `AppLoggerService` wraps `createLogger("backend-services")` (see `apps/backend-services`).
- **Temporal worker:** `createLogger("temporal-worker")` and `createActivityLogger(activityName, context)` (see `apps/temporal/src/logger.ts`).

## Testing

The package has a small Jest test suite in `packages/logging/src/logger.test.ts`.

- **Run tests:** From repo root or from `packages/logging`: `npm test` (or `npm run test:watch`).
- **Coverage:** `getLogLevel()` (default/invalid/valid/case-insensitive), NDJSON shape (timestamp, level, service, message, context), LOG_LEVEL filtering (debug suppressed when level is info; only warn/error when level is warn), redaction of sensitive keys (e.g. `apiKey`, `token`, `password`), child logger context merging, and no-throw behavior when stdout.write fails.

## Audit table (document access)

The backend records **who accessed documents and when** in the `audit_events` table. For each successful access to document metadata (GET document by ID), document file (GET download), or OCR result (GET OCR), an event with `event_type` `document_accessed` is written with `actor_id`, `document_id`, `group_id`, `request_id`, and `payload.action` (`metadata`, `download`, or `ocr`). See `docs/AUDIT.md` and `feature-docs/007-logging-system/REQUIREMENTS-AUDIT.md` for the full audit schema and event types.
