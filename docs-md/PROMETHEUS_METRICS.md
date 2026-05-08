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
| `app_recovery_total` | Counter | `type` | Incremented once when the first `info`/`debug` log is emitted for a `type` that was previously in error state. Signals a recovery transition. |
| `app_success_total` | Counter | `type` | Incremented on every `info`/`debug` log with an `alertType`. Used as the denominator in error-rate alert rules. |

### Node.js Runtime Metrics

Default `prom-client` metrics are collected, including:
- Event loop lag
- Heap usage (used, total, external)
- Active handles and requests
- GC pause durations

## Architecture

The metrics implementation consists of four files in `apps/backend-services/src/metrics/`:

- **`metrics.service.ts`** -- Registers the Prometheus registry, RED metric instruments, and default Node.js metrics collection.
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

Three additional counters support the Prometheus alerting pipeline. They are emitted by both `backend-services` and the `temporal` worker whenever a log entry includes an `alertType` field in its context.

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `app_error_total` | Counter | `type`, `severity` | Error-level log with `alertType` |
| `app_recovery_total` | Counter | `type` | Info/warn log with `alertType` after a previous error |
| `app_success_total` | Counter | `type` | Successful completion log with `alertType` |

### How it works

1. Log sites pass `alertType` in their log context (e.g. `log.error("...", { alertType: "temporal_test" })`).
2. The shared logger's `MetricsHook` fires after the log is emitted, incrementing the appropriate counter.
3. Prometheus scrapes the `/metrics` endpoints every 15 seconds.
4. Alert rules defined in `deployments/alert-thresholds.ts` are generated into Prometheus rule files by `npm run generate:alert-rules`.

### Alert threshold configuration

Edit `deployments/alert-thresholds.ts` to add or modify alert rules:

```ts
// Two modes:
// "any-error"   — fires when increase(app_error_total[window]) > 0
// "error-rate"  — fires when error rate exceeds a threshold percentage
export const ALERT_THRESHOLDS: AlertThresholdConfig[] = [
  {
    alertType: "classifier_training_failed",
    mode: "error-rate",
    severity: "warning",
    window: "5m",
    threshold: 0.05, // 5% error rate
  },
  {
    alertType: "enrich_results_failed",
    mode: "any-error",
    severity: "critical",
    window: "5m",
  },
];
```

After editing, regenerate the rules files:

```sh
npm run generate:alert-rules
```

Then restart the monitoring stack to pick up the new rules:

```sh
podman compose -f deployments/local/docker-compose.monitoring.yml up -d
```

### Temporal worker metrics endpoint

The temporal worker exposes metrics on port `9091` (configurable via `METRICS_PORT` env var). Verify it is running:

```sh
curl http://localhost:9091/metrics | grep app_error_total
```

---

## Testing the Alert Pipeline

A test activity `test.alertMetrics` is registered in the temporal worker to validate the end-to-end alert pipeline without using real workflow data.

### Trigger a simulated failure (increments `app_error_total{type="temporal_test"}`)

```sh
podman exec temporal temporal workflow execute \
  --type graphWorkflow \
  --task-queue ocr-processing \
  --input '{
    "graph": {
      "schemaVersion": "1.0",
      "metadata": { "name": "Alert test" },
      "entryNodeId": "n1",
      "ctx": {},
      "edges": [],
      "nodes": {
        "n1": {
          "id": "n1",
          "type": "activity",
          "label": "Test alert",
          "activityType": "test.alertMetrics",
          "parameters": { "shouldFail": true }
        }
      }
    },
    "initialCtx": {},
    "configHash": "test",
    "runnerVersion": "1.0.0"
  }'
```

### Trigger a simulated success (increments `app_success_total{type="enrich_results_failed"}`)

Same command with `"shouldFail": false`.

### Verify in Prometheus

After running the command, wait one scrape interval (~15 s) then query:

```
increase(app_error_total{type="enrich_results_failed"}[5m])
```

A value > 0 means the `EnrichResultsFailed` alert rule will move to `pending` and then `firing`.

> **Note**: `increase()` only detects counter increments observed *during* the lookback window. If the counter was already non-zero when Prometheus first scraped it, the first data point will appear as 0. Run the workflow again after the monitoring stack is up to see a real increment.
