# US-011: Create Application Overview Grafana Dashboard

**As a** developer,
**I want to** see an at-a-glance application health dashboard in Grafana,
**So that** I can quickly assess request rates, error rates, latency, and active sessions.

## Acceptance Criteria

- [x] **Scenario 1**: Request rate panel
    - **Given** Prometheus is scraping backend-services `/metrics`
    - **When** a user opens the Application Overview dashboard in Grafana
    - **Then** a panel displays the current request rate (requests/sec) derived from `http_requests_total`

- [x] **Scenario 2**: Error rate panel
    - **Given** Prometheus is collecting error metrics
    - **When** a user views the dashboard
    - **Then** a panel displays the error rate (4xx/5xx per second) derived from `http_request_errors_total`

- [x] **Scenario 3**: Latency percentiles panel
    - **Given** Prometheus is collecting duration histograms
    - **When** a user views the dashboard
    - **Then** a panel displays p50, p95, and p99 latency percentiles derived from `http_request_duration_seconds`

- [x] **Scenario 4**: Active sessions panel
    - **Given** Loki is ingesting logs with `sessionId` fields
    - **When** a user views the dashboard
    - **Then** a panel displays the count of unique `sessionId` values seen in the last 5 minutes

- [x] **Scenario 5**: Dashboard shipped as ConfigMap
    - **Given** the dashboard JSON definition exists
    - **When** the Helm chart is deployed
    - **Then** the dashboard is automatically provisioned in Grafana via a ConfigMap (dashboards-as-code)

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Dashboard is defined as a JSON file and mounted via Grafana provisioning
- Requires Prometheus and Loki data sources to be pre-configured (US-007)
- Requires RED metrics endpoint (US-004) and sessionId logging (US-001)
