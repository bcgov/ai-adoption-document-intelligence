# PLG Monitoring Stack (Prometheus, Loki, Grafana)

## Overview

Add a Prometheus, Loki, and Grafana (PLG) observability stack to the platform. The stack must run both locally in Docker and on OpenShift, deployed via Helm charts. It integrates with the existing NDJSON structured logging and JWT-based session tracking to provide centralized log aggregation, metrics collection, and dashboarding.

---

## 1. Deployment & Infrastructure

### 1.1 Helm Charts for PLG

- Deploy Prometheus, Loki, and Grafana using community Helm charts.
- The existing application deployment (Kustomize) remains unchanged — Helm is used only for PLG components.
- The Helm chart values must be configurable per environment (local Docker vs. OpenShift).

### 1.2 OpenShift Deployment

- PLG runs in the **same namespace** as the application, integrated with the existing Kustomize-based deployment architecture.
- Must work with the existing **GitHub Actions workflow** that builds and deploys the application.
- Must work with the existing **local deployment scripts** in `/scripts`.
- Loki stores logs in a PVC with configurable size.
- Prometheus uses a PVC for metrics storage.

### 1.3 Local Docker Deployment

- PLG is provided via a **separate `docker-compose.monitoring.yml`** file.
- Developers opt-in by running both compose files together (e.g., `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up`).
- Must be compatible with the existing **startup scripts in `package.json`** and the **VS Code `Dev:All` task**.
- This keeps the core dev stack lightweight; PLG is not required for day-to-day development.
- Log and metric data persists via Docker volumes.

---

## 2. Grafana UI Access

### 2.1 Authentication

- Grafana uses **username/password authentication** (configurable admin credentials).
- Both locally and on OpenShift, the same login/password approach is used.

### 2.2 Network Exposure

- On OpenShift, Grafana is **not exposed via a Route**. Developers access it via **port-forwarding/tunneling** (same pattern used for the Temporal UI on OpenShift).
- Locally, Grafana is exposed on a configurable port (default `localhost:3001`). Prometheus on `localhost:9090`, Loki on `localhost:3100` (community-standard defaults).

---

## 3. Log Aggregation (Loki)

### 3.1 Collection Method

- **Loki scrapes container stdout** (Option A) — no changes to the application logging code for collection.
- On OpenShift, use **Promtail sidecar containers** added to each application pod to tail shared log volumes. This works within tenant-level namespace permissions (no DaemonSet or cluster-admin access required). The backend-services deployment already uses a logrotate sidecar writing to `/var/log/app/`, establishing the sidecar pattern.
- Locally in Docker, a **Promtail container** mounts the Docker socket (`/var/run/docker.sock`) to auto-discover and tail all running container logs.

### 3.2 Services Collected

Logs are collected from **all services**:
- `backend-services` (NestJS API)
- `temporal-worker` (Temporal workflow worker)
- `temporal-server` (Temporal server)
- `frontend` (nginx access logs)
- `PostgreSQL` (database logs)

Each service is labeled in Loki (e.g., `service=backend-services`, `service=temporal-worker`) for filtering.

### 3.3 Log Retention

- **30-day retention** period, configured in Loki's `retention_period` setting.
- Retention is configurable via Helm values to allow adjustment per environment.

### 3.4 Existing Log Format Compatibility

The existing `@ai-di/shared-logging` package outputs NDJSON with the following fields already available for querying in Loki:
- `timestamp` (ISO 8601)
- `level` (debug, info, warn, error)
- `service` (e.g., "backend-services", "temporal-worker")
- `requestId` (UUID, injected by LoggingMiddleware)
- `userId` (from resolved identity)
- `method`, `path`, `statusCode` (from RequestLoggingInterceptor)
- `durationMs` (request duration)
- `workflowExecutionId`, `documentId` (contextual fields)

No changes are needed to the log format for Loki to parse and index these fields.

---

## 4. Session Tracking & User Activity Browsing

### 4.1 Session Identification

- Extract `session_state` from the existing `req.user` object (already available after Keycloak JWT validation via the `KeycloakJwtStrategy`).
- Add `sessionId` (value of `session_state`) to the request context stored in `AsyncLocalStorage`, alongside the existing `requestId` and `userId`.
- The `AppLoggerService` automatically includes `sessionId` in all NDJSON log output.
- **No manual JWT decoding** — reuse the existing Passport/IdentityGuard infrastructure that already parses and validates the JWT.

### 4.2 API Key Requests

- For API key-authenticated requests (no JWT/session), log the **API key prefix or key ID** from the database as an identifier.
- API key requests are not treated as "sessions" — the identifier is for audit filtering only.

### 4.3 Grafana Session Browsing

- Users can filter logs in Grafana by `sessionId` to see all API activity within a single Keycloak session.
- Users can filter by `userId` to see all activity for a specific user across sessions.
- This is surfaced via the Logs Explorer dashboard (see Section 7).

---

## 5. Client IP Logging

### 5.1 IP Extraction

- Add `clientIp` to the NDJSON log context for every request.
- Extraction logic (in the `LoggingMiddleware` or `RequestLoggingInterceptor`):
  ```
  clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
           || req.headers['x-real-ip']
           || req.socket.remoteAddress
  ```
- On OpenShift, the client IP comes from `X-Forwarded-For` (first entry) due to reverse proxy/ingress.
- Locally, `req.socket.remoteAddress` is used as fallback.

All logged fields (including `clientIp`) are stored in Loki and retained per the configured retention period (see Section 3.3).

---

## 6. Metrics (Prometheus)

### 6.1 Application Metrics

Expose a `/metrics` endpoint on the backend-services application using `prom-client`. The `/metrics` path must **not be publicly accessible** — it is excluded from the OpenShift Route so only in-cluster Prometheus can scrape it:

- **RED Metrics** (Request, Error, Duration):
  - `http_requests_total` — counter by method, path, status code
  - `http_request_duration_seconds` — histogram by method, path
  - `http_request_errors_total` — counter of 4xx/5xx responses

- **Node.js Runtime Metrics** (via `prom-client` default metrics):
  - Event loop lag
  - Heap usage (used, total, external)
  - Active handles and requests
  - GC pause durations

### 6.2 Temporal Metrics

- Scrape the **Temporal server's built-in `/metrics` endpoint** — no custom instrumentation needed.
- Temporal already exposes workflow execution, task queue, and schedule metrics in Prometheus format.

### 6.3 Scrape Configuration

- Prometheus scrape configs are defined in the Helm chart values.
- Targets: backend-services `/metrics`, Temporal server `/metrics`.
- Scrape interval: 15s (configurable).

---

## 7. Pre-Built Grafana Dashboards

Ship the following dashboards as ConfigMaps in the Helm chart (dashboards-as-code):

### 7.1 Application Overview Dashboard
- Request rate (requests/sec)
- Error rate (4xx/5xx per second)
- Latency percentiles (p50, p95, p99)
- Active sessions (unique sessionIds in last 5 minutes)

### 7.2 Logs Explorer Dashboard
- Pre-configured Loki data source
- Label filters for: `service`, `userId`, `sessionId`, `level`
- Quick filters for error-level logs

### 7.3 Node.js Runtime Dashboard
- Heap usage over time
- Event loop lag
- GC pause durations
- Active handles

---

## 8. Code Changes Summary

The following changes to existing application code are required:

| Area | Change | Files Affected |
|------|--------|----------------|
| Session tracking | Add `sessionId` (from `req.user.session_state`) to request context and log output | `request-context.ts`, `request-logging.interceptor.ts`, `logging.middleware.ts` |
| Client IP logging | Add `clientIp` extraction and include in log context | `logging.middleware.ts` or `request-logging.interceptor.ts` |
| API key identifier | Log API key prefix/ID for non-JWT requests | `request-logging.interceptor.ts` |
| Prometheus metrics | Add `prom-client`, expose `/metrics` endpoint, instrument HTTP layer | New metrics module + middleware in `backend-services` |
| Dependencies | Add `prom-client` to `backend-services` | `package.json` |

No changes to `@ai-di/shared-logging` package for log collection (Loki scrapes stdout).
The `LogContext` interface in the shared logging package needs `sessionId` and `clientIp` fields added.

---

## 9. Configuration & Environment Variables

New environment variables (configurable per environment):

| Variable | Description | Example |
|----------|-------------|---------|
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password | (secret) |
| `LOKI_RETENTION_DAYS` | Log retention period in days | `30` |
| `LOKI_PVC_SIZE` | Loki storage PVC size | `10Gi` |
| `PROMETHEUS_PVC_SIZE` | Prometheus storage PVC size | `10Gi` |
| `METRICS_SCRAPE_INTERVAL` | Prometheus scrape interval | `15s` |

---

## 10. Resilience

- PLG is **fire-and-forget** — purely observational. If Loki, Prometheus, or Grafana is down, the application continues operating normally. Logs still go to container stdout regardless of Loki's health.
- No alerting rules are included in this scope. Dashboards are for manual inspection. Alerting (via Alertmanager) can be added as a follow-up once meaningful thresholds are established from real usage.

---

## 11. Resource Limits

PLG container resource limits are **configurable via Helm values** with minimal defaults:

| Component | Memory Request/Limit | CPU Request/Limit |
|-----------|---------------------|-------------------|
| Loki | 256Mi | 500m |
| Prometheus | 512Mi | 500m |
| Grafana | 256Mi | 250m |
| Promtail (sidecar) | 64Mi | 100m |

Defaults are sized for low-traffic environments. Override via Helm values per environment as needed.

---

## 12. Constraints & Assumptions

- The existing Kustomize deployment for the application is **not modified** — PLG is a separate Helm release.
- On OpenShift, Promtail runs as **sidecar containers** (not DaemonSets) to work within tenant-level namespace permissions.
- The `prom-client` library is added only to `backend-services`; other services (frontend, temporal) are not instrumented with custom metrics.
- No IP geo-location or IP-based analytics dashboards are included in this scope.
- No alerting rules or Alertmanager configuration is included in this scope.
- `session_state` from Keycloak JWTs is treated as non-sensitive (opaque UUID, meaningless outside the Keycloak instance).
