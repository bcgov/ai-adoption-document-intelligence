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
