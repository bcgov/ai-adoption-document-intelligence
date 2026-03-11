# Logging System — Requirements Specification

## 1. Title and Overview

Define and implement a unified logging system across the AI-DI platform so that application, workflow, and operational events are captured in a consistent format, stored in a well-defined location, and usable for debugging and monitoring.

The system is generic: it must support arbitrary workloads and must not encode document-specific or domain-specific assumptions in the logging infrastructure itself.

### Current State

- **Backend (NestJS):** Uses `Logger` from `@nestjs/common`; output goes to stdout. No structured format; log level is not configurable via environment. Prisma uses `log: ["error", "warn"]`.
- **Temporal worker:** Uses ad-hoc `console.log(JSON.stringify({ activity, event, ... }))` for structured logs; no shared logger abstraction or log levels.
- **Deployment:** OpenShift/Kubernetes; no explicit log configuration in deployments. Container stdout is the only log sink.

### Target State

- **Single log format:** One structured format (e.g. NDJSON) used by both backend-services and temporal-worker.
- **Shared abstraction:** A shared logging module/package used by both apps for consistent levels, structure, and redaction.
- **Configurable:** Log level configurable via environment (default `info`).
- **Storage:** stdout only; consumed by the cluster’s log aggregation (e.g. OpenShift Logging). No audit store or database sink in scope.
- **Traceability:** Correlation identifiers (e.g. requestId, workflowExecutionId) propagated so that a single request or workflow can be traced across services in the log backend.

---

## 2. Goals and Non-Goals

### Goals

1. **Unified log format:** One JSON schema per log line (NDJSON) with required fields (e.g. timestamp, level, service, message) and consistent context fields (requestId, workflowExecutionId, documentId, etc.).
2. **What to log:** Define and document categories of what is logged: application lifecycle, request/API, business/domain events, errors, external service calls, and security/auth (without secrets or PII).
3. **Where logs are stored:** stdout for all services; the platform (OpenShift) is responsible for aggregation and retention. Audit store (database or other durable sink) is out of scope.
4. **Shared logger:** A shared logging abstraction used by backend-services and temporal-worker so that format, levels, and redaction rules are consistent.
5. **Configurable log level:** Environment-driven log level (e.g. LOG_LEVEL) for backend and worker so verbosity can be tuned per environment without code changes.
6. **Correlation IDs:** Propagate requestId (and workflowExecutionId where applicable) from API through to Temporal so that traces can be followed across services in the log backend.
7. **Documentation:** Document the logging system in `/docs` (what is logged, format schema, where logs go, redaction/sensitivity rules, and how to use correlation IDs).

### Non-Goals

1. **Document-specific or workload-specific log semantics:** The logging system is generic; individual features may add context fields (e.g. documentId) but the infrastructure does not mandate or parse document-specific events.
2. **Implementing a custom log aggregation backend:** Use existing platform capabilities (stdout + cluster logging); do not build a custom log ingestion or storage service.
3. **Real-time alerting or dashboards:** Out of scope for this feature; the system should produce logs that can later be used by existing platform tooling (e.g. OpenShift Logging, Grafana) for alerts and dashboards.
4. **Backward compatibility:** When replacing existing ad-hoc logging (e.g. Temporal `console.log(JSON.stringify(...))`), no need to preserve the old format; adopt the new format only.
5. **Audit store:** A durable audit store (database table or separate service) is out of scope; logs are stdout-only.

---

## 3. What Will Be Logged

### Categories and Levels

| Category | Description | Typical level | Example context fields |
|----------|-------------|---------------|------------------------|
| **Application** | Startup, shutdown, configuration (no secrets) | info | service, version, env |
| **Request/API** | Incoming HTTP requests and key internal calls | info / debug | method, path, statusCode, durationMs, requestId, userId (if available) |
| **Business/Domain** | Document upload, OCR start/complete, workflow start/complete, training jobs, review sessions | info | documentId, workflowExecutionId, event, status, durationMs |
| **Errors** | Exceptions, failed operations, retries | error | error, stack (or code), requestId, documentId |
| **External** | Outbound calls (Azure Document Intelligence, Temporal, DB if desired) | info / debug | provider, operation, durationMs, status |
| **Security/Auth** | Auth success/failure, API key usage (e.g. key prefix only, never full key) | info / warn | userId, keyIdOrPrefix, result |

### Redaction and Sensitivity

- **Never log:** Full file contents, raw API keys, tokens, or other secrets. Log identifiers, key prefixes (e.g. for API keys), and high-level outcomes only.
- **PII:** Do not log PII in free-text message fields unless required for audit and explicitly allowed by policy; prefer logging IDs and event types.

---

## 4. Where Logs Will Be Stored

### Primary: stdout → Platform

- All services (backend-services, temporal-worker) emit logs to **stdout only** in the agreed structured format.
- **Storage and retention** are the responsibility of the cluster’s log aggregation (e.g. OpenShift Logging / Elasticsearch or Loki). No application-level log files or app-managed log storage are required.
- The deployment model (OpenShift) remains unchanged; no new volume or sidecar is required for basic logging.

- **Audit store:** Out of scope. No database or other durable log sink; stdout only.

---

## 5. Log Format and Structure

- **Format:** One JSON object per line (NDJSON). UTF-8.
- **Required fields (minimum):** `timestamp` (ISO 8601), `level` (e.g. debug, info, warn, error), `service` (e.g. `backend-services`, `temporal-worker`), `message` (short human-readable summary).
- **Context fields:** Include as relevant: `requestId`, `workflowExecutionId`, `documentId`, `userId`, `activity`, `event`, `durationMs`, `status`, `error`, `stack`, etc. Use a consistent naming convention (e.g. camelCase) across services.
- **Stability:** The schema (field names and meaning) must be documented in `/docs` so that log aggregation and future tooling can rely on it.

---

## 6. Shared Logger and Correlation IDs

- **Shared logger:** Implement a small shared logging module (e.g. under `apps/shared` or a dedicated package) that:
  - Outputs the agreed NDJSON format to stdout.
  - Respects a configurable log level via `LOG_LEVEL` (default `info`).
  - Exposes a simple API (e.g. `log.info(message, context)`, `log.error(message, context)`) so that both backend-services and temporal-worker use the same implementation.
  - **Failure behavior:** If logging fails (e.g. serialization throws or stdout write fails), the logger must not throw. Use best-effort fallback to stderr (e.g. plain text or best-effort JSON) so the application continues; the log line may be lost or degraded.
- **Third-party loggers:** Route output from third-party libraries (e.g. Prisma, HTTP clients) through the shared logger where possible so that all process output is in the same NDJSON format. Prisma’s `log` option and any other in-process log sources should be wired to the shared logger instead of writing directly to stdout/stderr in a different format.
- **Backend (NestJS):** Use the shared logger instead of (or wrapped by) Nest’s built-in Logger so that all output is structured. Ensure request-scoped middleware or interceptor attaches `requestId` (and optionally `userId`) to the logger context for the request lifecycle.
- **Temporal worker:** Replace ad-hoc `console.log(JSON.stringify(...))` with the shared logger. Ensure workflow/activity context (e.g. `workflowExecutionId`, `activity`) is attached where available.
- **Correlation:** When the backend starts a Temporal workflow, pass `requestId` (and any other desired correlation IDs) in workflow input or headers so that the worker can include them in log context. Document how to trace a single request or workflow across services using these IDs.

---

## 7. Configuration

- **LOG_LEVEL:** Optional environment variable for both backend-services and temporal-worker. Allowed values: `debug`, `info`, `warn`, `error`. Default is `info`; if unset or invalid, use `info`.

---

## 8. Documentation

- Add a document under `/docs` (e.g. `docs/LOGGING.md` or `docs/observability/LOGGING.md`) that describes:
  - What is logged (categories and levels).
  - The standard log format (field names, types, and meaning).
  - Where logs go (stdout only; platform handles aggregation).
  - How to use correlation IDs for tracing.
  - Redaction and sensitivity rules (no secrets, minimal PII).
  - How to configure log level (LOG_LEVEL, default `info`).

---

## 9. Acceptance Criteria (Summary)

1. A shared logging module exists and is used by both backend-services and temporal-worker.
2. All log output from both apps is in the agreed NDJSON format and includes at least timestamp, level, service, and message.
3. Log level is configurable via environment (e.g. LOG_LEVEL) for both apps.
4. Request IDs (and workflow execution IDs where applicable) are propagated and included in log context so that traces can be followed across services.
5. Documentation in `/docs` describes what is logged, the log format, where logs are stored, and how to use correlation IDs and configure the system.
6. No secrets or PII are logged; redaction rules are documented and applied.
7. When the shared logger fails (e.g. serialization or write error), it uses best-effort stderr fallback and does not throw.
8. Third-party loggers (e.g. Prisma) are routed through the shared logger so all process output is NDJSON.

---

## 10. Out of Scope / Clarifications

- **No backward compatibility** for existing log formats when migrating to the new system.
- **No new infrastructure** for log aggregation; the system relies on existing platform (OpenShift) capabilities.
- **Generic system only:** No document-type-specific or workflow-type-specific logic in the logging infrastructure; domain events may add context fields as needed.
- **Audit store:** Out of scope; no database or other durable log sink.
