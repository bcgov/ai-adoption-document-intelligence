# US-004: Expose Prometheus RED Metrics Endpoint

**As a** platform operator,
**I want to** collect HTTP request rate, error rate, and duration metrics from backend-services,
**So that** I can monitor application health and performance via Prometheus and Grafana.

## Acceptance Criteria

- [x] **Scenario 1**: /metrics endpoint exposes RED metrics
    - **Given** the `prom-client` library is installed in backend-services
    - **When** Prometheus scrapes `GET /metrics`
    - **Then** the response includes `http_requests_total` (counter by method, path, status code), `http_request_duration_seconds` (histogram by method, path), and `http_request_errors_total` (counter of 4xx/5xx responses)

- [x] **Scenario 2**: Metrics are collected for every HTTP request
    - **Given** the metrics middleware is active
    - **When** any HTTP request is processed by the backend-services application
    - **Then** the request increments `http_requests_total`, records duration in `http_request_duration_seconds`, and increments `http_request_errors_total` if the status code is 4xx or 5xx

- [x] **Scenario 3**: Node.js runtime default metrics are exposed
    - **Given** `prom-client` default metrics collection is enabled
    - **When** Prometheus scrapes `GET /metrics`
    - **Then** the response includes Node.js runtime metrics: event loop lag, heap usage (used, total, external), active handles/requests, and GC pause durations

- [x] **Scenario 4**: /metrics endpoint is not publicly accessible on OpenShift
    - **Given** the backend-services application is deployed on OpenShift with a Route
    - **When** an external client attempts to access `/metrics` via the Route URL
    - **Then** the request is blocked — `/metrics` is excluded from the Route and only accessible within the cluster

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Add `prom-client` as a dependency to `apps/backend-services/package.json`
- Create a new NestJS metrics module with middleware to instrument HTTP requests
- The `/metrics` endpoint should be excluded from authentication guards (Prometheus scrapes without a JWT)
- Exclude the `/metrics` path itself from being counted in RED metrics to avoid self-referential inflation
