# Logging System

This document describes the unified logging system used across the AI-DI platform (backend-services and temporal-worker). For full requirements, see [feature-docs/002-logging-system/REQUIREMENTS.md](../feature-docs/002-logging-system/REQUIREMENTS.md).

## What Is Logged

Logs are grouped into categories with typical levels and context fields:

| Category | Description | Typical level | Example context fields |
|----------|-------------|---------------|------------------------|
| **Application** | Startup, shutdown, configuration (no secrets) | info | service, version, env |
| **Request/API** | Incoming HTTP requests and key internal calls | info / debug | method, path, statusCode, durationMs, requestId, userId |
| **Business/Domain** | Document upload, OCR, workflow, training, review | info | documentId, workflowExecutionId, event, status, durationMs |
| **Errors** | Exceptions, failed operations, retries | error | error, stack, requestId, documentId |
| **External** | Outbound calls (Azure, Temporal, DB) | info / debug | provider, operation, durationMs, status |
| **Security/Auth** | Auth success/failure, API key usage (key prefix only) | info / warn | userId, keyIdOrPrefix, result |

## Log Format

- **Format:** NDJSON (one JSON object per line). UTF-8.
- **Required fields:** `timestamp` (ISO 8601), `level`, `service`, `message`.
- **Context fields:** Optional; include as relevant: `requestId`, `workflowExecutionId`, `documentId`, `userId`, `activity`, `event`, `durationMs`, `status`, `error`, `stack`, etc. Naming is camelCase.

Example:

```json
{"timestamp":"2025-02-24T12:00:00.000Z","level":"info","service":"backend-services","message":"Request completed","requestId":"abc-123","method":"GET","path":"/api/documents","statusCode":200,"durationMs":45}
```

## Where Logs Are Stored

- **Stdout only.** All services emit logs to stdout in the agreed NDJSON format.
- **Platform aggregation:** Storage and retention are handled by the cluster’s log aggregation (e.g. OpenShift Logging / Elasticsearch or Loki). No application-level log files or audit store are in scope.

## Correlation IDs and Tracing

- **requestId:** Generated per HTTP request (or read from `x-request-id`). Attached to all backend logs for that request and passed to Temporal workflow input so worker logs can include it.
- **workflowExecutionId:** Temporal workflow execution ID. Included in worker/activity log context so all logs for one workflow run can be filtered.

To trace a single request across backend and worker: filter logs by `requestId`. To trace a workflow run: filter by `workflowExecutionId`.

## Redaction and Sensitivity

- **Never log:** Full file contents, raw API keys, tokens, or other secrets. Log identifiers, key prefixes (e.g. for API keys), and high-level outcomes only.
- **PII:** Avoid PII in free-text messages; prefer IDs and event types. The shared logger redacts known secret keys (e.g. `apiKey`, `token`, `authorization`) in context objects.

## Configuration

- **LOG_LEVEL:** Environment variable for both backend-services and temporal-worker. Allowed values: `debug`, `info`, `warn`, `error`. **Default is `info`.** If unset or invalid, `info` is used.
- Set per deployment (e.g. in OpenShift) to tune verbosity without code changes.

## Implementation Notes

- **Shared package:** `@ai-di/shared-logging` (under `packages/logging`) provides types and `createLogger(serviceName, baseContext?)`. It writes NDJSON to stdout, respects LOG_LEVEL, and does not throw on failure (best-effort stderr fallback).
- **Backend:** Uses the shared logger via `AppLoggerService`; request-scoped `requestId` and `userId` are attached via middleware and interceptor. Prisma and other third-party loggers are wired through the shared logger.
- **Temporal worker:** Uses the same shared logger with service name `temporal-worker`; activities use `createActivityLogger(activityName, { workflowExecutionId, requestId, ... })` so logs include workflow and request context.
