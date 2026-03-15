# US-007: Add Grafana to Helm Chart with Auth and Data Sources

**As a** developer,
**I want to** deploy Grafana via the Helm chart with pre-configured data sources for Prometheus and Loki,
**So that** I can immediately query metrics and logs after deployment without manual setup.

## Acceptance Criteria

- [x] **Scenario 1**: Grafana deployed with username/password auth
    - **Given** the PLG Helm chart includes Grafana configuration
    - **When** the chart is deployed
    - **Then** Grafana is running with configurable admin credentials (`GRAFANA_ADMIN_PASSWORD`) and resource limits (memory `256Mi`, CPU `250m`)

- [x] **Scenario 2**: Prometheus data source pre-configured
    - **Given** Grafana is deployed alongside Prometheus
    - **When** a user logs into Grafana
    - **Then** a Prometheus data source is already configured and available for querying without manual setup

- [x] **Scenario 3**: Loki data source pre-configured
    - **Given** Grafana is deployed alongside Loki
    - **When** a user logs into Grafana
    - **Then** a Loki data source is already configured and available for log querying without manual setup

- [x] **Scenario 4**: Grafana not exposed via OpenShift Route
    - **Given** the Helm chart is deployed on OpenShift
    - **When** the deployment completes
    - **Then** no OpenShift Route is created for Grafana — developers access it via port-forwarding/tunneling (same pattern as Temporal UI)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use community Grafana Helm chart as a dependency or base
- Data sources are provisioned via Grafana's provisioning mechanism (ConfigMaps or Helm values)
- Default local port: `localhost:3001`
