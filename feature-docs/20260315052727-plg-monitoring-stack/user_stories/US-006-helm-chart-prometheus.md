# US-006: Add Prometheus to Helm Chart with Scrape Configuration

**As a** platform operator,
**I want to** deploy Prometheus via the Helm chart with pre-configured scrape targets,
**So that** application and Temporal metrics are automatically collected without manual configuration.

## Acceptance Criteria

- [x] **Scenario 1**: Prometheus deployed via Helm chart
    - **Given** the PLG Helm chart includes Prometheus configuration
    - **When** the chart is deployed
    - **Then** Prometheus is running with a PVC for metrics storage (configurable via `PROMETHEUS_PVC_SIZE`, default `10Gi`) and resource limits (memory `512Mi`, CPU `500m`)

- [x] **Scenario 2**: Backend-services scrape target configured
    - **Given** Prometheus scrape configs are defined in the Helm chart values
    - **When** Prometheus starts
    - **Then** it scrapes the backend-services `/metrics` endpoint at the configured interval (default `15s`, configurable via `METRICS_SCRAPE_INTERVAL`)

- [x] **Scenario 3**: Temporal server scrape target configured
    - **Given** Temporal server exposes a built-in `/metrics` endpoint
    - **When** Prometheus starts
    - **Then** it scrapes the Temporal server's `/metrics` endpoint at the configured interval

- [x] **Scenario 4**: Scrape interval configurable
    - **Given** a deployment with custom scrape interval requirements
    - **When** `METRICS_SCRAPE_INTERVAL` is set to a different value (e.g., `30s`)
    - **Then** Prometheus uses the specified interval for all scrape targets

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use community Prometheus Helm chart as a dependency or base
- No Alertmanager configuration is included in this scope
- Scrape targets reference service names within the same namespace
