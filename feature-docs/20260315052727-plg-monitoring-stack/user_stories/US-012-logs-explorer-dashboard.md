# US-012: Create Logs Explorer Grafana Dashboard

**As a** developer,
**I want to** browse and filter application logs in Grafana with pre-configured label filters,
**So that** I can quickly find logs for a specific user session, service, or error level.

## Acceptance Criteria

- [x] **Scenario 1**: Loki data source pre-configured in dashboard
    - **Given** Grafana has a Loki data source configured
    - **When** a user opens the Logs Explorer dashboard
    - **Then** the dashboard uses the Loki data source by default with a log query panel ready

- [x] **Scenario 2**: Filter by service label
    - **Given** logs are labeled with `service` (e.g., `backend-services`, `temporal-worker`)
    - **When** a user selects a service from the filter dropdown
    - **Then** only logs from that service are displayed

- [x] **Scenario 3**: Filter by userId and sessionId
    - **Given** logs contain `userId` and `sessionId` fields
    - **When** a user enters a `userId` or `sessionId` value in the filter
    - **Then** only logs matching that user or session are displayed, showing all API activity within the session

- [x] **Scenario 4**: Filter by log level with error quick-filter
    - **Given** logs contain a `level` field (debug, info, warn, error)
    - **When** a user selects the error-level quick filter
    - **Then** only error-level logs are displayed

- [x] **Scenario 5**: Dashboard shipped as ConfigMap
    - **Given** the dashboard JSON definition exists
    - **When** the Helm chart is deployed
    - **Then** the dashboard is automatically provisioned in Grafana via a ConfigMap

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- This dashboard enables the session browsing use case described in requirements Section 4.3
- Requires Loki data source (US-007) and sessionId/userId logging (US-001)
- Label filters are implemented as Grafana template variables
