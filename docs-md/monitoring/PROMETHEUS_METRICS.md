# Prometheus RED Metrics

## Overview

The backend-services application exposes a `/metrics` endpoint for Prometheus scraping. This endpoint provides RED (Rate, Errors, Duration) metrics for HTTP requests and Node.js runtime metrics via the `prom-client` library.

## Metrics Exposed

### RED Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_requests_total` | Counter | `method`, `path`, `status_code` | Total number of HTTP requests processed |
| `http_request_errors_total` | Counter | `method`, `path`, `status_code` | Total HTTP requests with 4xx or 5xx status codes |
| `http_request_duration_seconds` | Histogram | `method`, `path` | Request duration in seconds with configurable buckets |

### In-App Alert Metrics

Emitted by the shared logger metrics hook whenever a log line includes `{ alertType: "..." }` in context. See [ALERTING.md](ALERTING.md) for usage.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `app_error_total` | Counter | `type`, `severity` | Incremented on each `warn` (`severity=warning`) or `error` (`severity=critical`) log with an `alertType`. Used as the numerator in error-rate alert rules. |
| `app_success_total` | Counter | `type` | Incremented on every `info`/`debug` log with an `alertType`. Used as the denominator in error-rate alert rules. |

Both counters are created by `createAppMetrics()` in the shared `@ai-di/monitoring` package (`packages/monitoring/src/app-metrics.ts`), which is used by both `backend-services` and the `temporal` worker.

### Node.js Runtime Metrics

Default `prom-client` metrics are collected, including:
- Event loop lag
- Heap usage (used, total, external)
- Active handles and requests
- GC pause durations

## Architecture

The metrics implementation consists of four files in `apps/backend-services/src/metrics/`:

- **`metrics.service.ts`** -- Registers the Prometheus registry, RED metric instruments, the shared alert counters (via `createAppMetrics` from `@ai-di/monitoring`), and default Node.js metrics collection. On module init it pre-initializes an `app_error_total`/`app_success_total` series (value 0) for every alert type provided via the `ALERT_PREFILL_TYPES` injection token (populated in `app.module.ts` from `ALERT_THRESHOLDS`), so `increase()` can detect the very first failure after a cold start.
- **`metrics.middleware.ts`** -- NestJS middleware applied to all routes. Instruments each HTTP request by incrementing counters and recording duration on response finish. The `/metrics` path itself is excluded to avoid self-referential metric inflation.
- **`metrics.controller.ts`** -- Exposes `GET /metrics` with the `@Public()` decorator (no JWT required). Blocks external access by checking for `X-Forwarded-Host` header (injected by the OpenShift router for external requests).
- **`metrics.module.ts`** -- Wires the service, middleware, and controller together.

## Access Control

The `/metrics` endpoint is only accessible from within the cluster:

1. **Application level**: The controller rejects requests with an `X-Forwarded-Host` header (present when requests arrive via the OpenShift Route) with a 403 Forbidden response.
2. **Route level**: The OpenShift Route for backend-services includes a `haproxy.router.openshift.io/deny-list` annotation to block `/metrics` at the HAProxy router layer.

Prometheus scrapes `/metrics` directly via the in-cluster Kubernetes Service, bypassing the Route entirely.

## Authentication

The `/metrics` endpoint is marked with `@Public()` and excluded from JWT/API-key authentication guards. Prometheus scrapes without credentials.

## Histogram Buckets

Duration histogram uses the following bucket boundaries (in seconds):
`0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10`

## Path Label Strategy

The middleware uses `req.route?.path` (the Express route pattern, e.g., `/api/documents/:id`) when available, falling back to `req.path` (the literal URL path). This prevents high-cardinality label values from dynamic URL segments.

---

## Alert Counters

The alert counters above (`app_error_total`, `app_success_total`) support the Prometheus alerting pipeline. They are emitted by both `backend-services` and the `temporal` worker whenever a log entry includes an `alertType` field in its context.

### How it works

1. Log sites pass `alertType` in their log context (e.g. `log.error("...", { alertType: "enrich_results" })`).
2. The shared logger's `MetricsHook` fires after the log is emitted, incrementing the appropriate counter (`warn`/`error` → `app_error_total`, `info`/`debug` → `app_success_total`).
3. Prometheus scrapes the `/metrics` endpoints every 15 seconds.
4. Alert rules defined in `ALERT_THRESHOLDS` (in `packages/monitoring/src/alert-thresholds.ts`, re-exported via `deployments/alert-thresholds.ts`) are generated into Prometheus rule files by `npm run generate:alert-rules`.

### Alert threshold configuration

Edit `ALERT_THRESHOLDS` in `packages/monitoring/src/alert-thresholds.ts` to add or modify alert rules. It is a record keyed by `alertType`:

```ts
// Two modes:
// "any-error"   — fires when increase(app_error_total[window]) > 0
// "error-rate"  — fires when the error/(error+success) ratio exceeds errorRateThreshold
export const ALERT_THRESHOLDS: Record<string, AlertThresholdConfig> = {
  classifier_training_poll: {
    mode: "any-error",
    severity: "warning",
    window: "5m",
    job: "backend-services",
    summary: "Classifier training has failed",
    description: "A classifier training job polled from Azure Document Intelligence has failed within the last 5 minutes.",
  },
  enrich_results: {
    mode: "any-error",
    severity: "critical",
    window: "5m",
    job: "temporal-worker",
    summary: "OCR enrichment activity failed",
    description: "At least one enrichment activity failed within the last 5 minutes.",
  },
};
```

Alert type names are neutral operation names — do not add a `_failed` suffix. Static infrastructure-level rules (HTTP error rate, p95 latency, heap usage) live in `STATIC_ALERT_RULES` in `packages/monitoring/src/static-alert-rules.ts`.

After editing, regenerate the rules files:

```sh
npm run generate:alert-rules
```

This writes `deployments/local/prometheus/rules/app-alerts.yml` (local stack) and `deployments/openshift/helm/plg/files/app-alerts.yml` (embedded into the Helm `prometheus-rules-configmap.yaml`). Then restart the monitoring stack to pick up the new rules:

```sh
docker compose --profile monitoring down && docker compose --profile monitoring up -d
```

(The `npm run pod:*` scripts run the generator automatically before starting the stack.)

### Temporal worker metrics endpoint

The temporal worker exposes metrics on a dedicated HTTP server on port `9091` (configurable via `METRICS_PORT` env var). The same server also serves the worker's health check endpoints (`/health/live`, `/health/ready`). Verify it is running:

```sh
curl http://localhost:9091/metrics | grep app_error_total
```

### Verify in Prometheus

After triggering a failure of an alertable operation, wait one scrape interval (~15 s) then query (substituting the relevant `type`):

```
increase(app_error_total{type="enrich_results"}[5m])
```

A value > 0 means the corresponding alert rule (e.g. `EnrichResults`) will move to `pending` and then `firing`.

> **Note**: `increase()` only detects counter increments observed *during* the lookback window. To ensure the very first failure after a cold start is detectable, backend-services pre-initializes a zero-valued series for every alert type in `ALERT_THRESHOLDS` at startup (see `ALERT_PREFILL_TYPES` in the Architecture section).
