# US-013: Create Node.js Runtime Grafana Dashboard

**As a** developer,
**I want to** monitor Node.js runtime health in Grafana,
**So that** I can identify memory leaks, event loop bottlenecks, and GC pressure in backend-services.

## Acceptance Criteria

- [x] **Scenario 1**: Heap usage panel
    - **Given** Prometheus is scraping Node.js runtime metrics from backend-services
    - **When** a user opens the Node.js Runtime dashboard in Grafana
    - **Then** a panel displays heap usage over time (used, total, external memory)

- [x] **Scenario 2**: Event loop lag panel
    - **Given** `prom-client` default metrics include event loop lag
    - **When** a user views the dashboard
    - **Then** a panel displays event loop lag over time

- [x] **Scenario 3**: GC pause durations panel
    - **Given** `prom-client` default metrics include GC pause durations
    - **When** a user views the dashboard
    - **Then** a panel displays garbage collection pause durations over time

- [x] **Scenario 4**: Active handles panel
    - **Given** `prom-client` default metrics include active handles count
    - **When** a user views the dashboard
    - **Then** a panel displays the number of active handles over time

- [x] **Scenario 5**: Dashboard shipped as ConfigMap
    - **Given** the dashboard JSON definition exists
    - **When** the Helm chart is deployed
    - **Then** the dashboard is automatically provisioned in Grafana via a ConfigMap

## Priority
- [ ] High (Must Have)
- [x] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Requires Prometheus data source (US-007) and runtime metrics endpoint (US-004)
- All metrics come from `prom-client` default metrics collection
- Dashboard is defined as JSON and provisioned via Grafana's ConfigMap mechanism
