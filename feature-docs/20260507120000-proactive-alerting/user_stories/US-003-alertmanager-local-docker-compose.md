# US-003: Add Alertmanager to Local Docker Compose Monitoring Stack

**As a** developer,
**I want** Alertmanager running in the local Docker Compose monitoring stack,
**So that** I can develop and test alert rules and notification routing locally without needing an OpenShift cluster.

## Acceptance Criteria

- [x] **Scenario 1**: Alertmanager container starts healthy
    - **Given** `docker compose -f docker-compose.monitoring.yml up` is run
    - **When** the stack starts
    - **Then** an `ai-doc-intelligence-alertmanager` container reaches a healthy state and the Alertmanager UI is accessible on a local port (e.g., `9093`)

- [x] **Scenario 2**: Prometheus is configured to send alerts to Alertmanager
    - **Given** the local `prometheus.yml` is mounted into the Prometheus container
    - **When** Prometheus starts
    - **Then** the config contains an `alerting:` block pointing at `ai-doc-intelligence-alertmanager:9093`

- [x] **Scenario 3**: Prometheus loads alert rule files
    - **Given** alert rule YAML files are mounted into the Prometheus container
    - **When** Prometheus starts
    - **Then** the config contains a `rule_files:` section referencing the mounted rule files, and Prometheus reports them as loaded

- [x] **Scenario 4**: Alertmanager config file is mounted from the local filesystem
    - **Given** an `alertmanager.yml` config file exists under `deployments/local/alertmanager/`
    - **When** the Alertmanager container starts
    - **Then** Alertmanager reads that file and its status page shows the configured receivers

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Add `alertmanager` service to `deployments/local/docker-compose.monitoring.yml` using the official `prom/alertmanager` image, consistent with the existing image versioning pattern.
- Create `deployments/local/alertmanager/alertmanager.yml` with a minimal local config (route to a `null` receiver or log receiver so no real notifications fire locally).
- Create `deployments/local/prometheus/rules/` directory with alert rule YAML files.
- Update `prometheus.yml` to include `alerting:` and `rule_files:` sections.
- Healthcheck: `wget --spider http://localhost:9093/-/healthy`.
- Alertmanager does not need `extra_hosts` since it communicates within the compose network.
