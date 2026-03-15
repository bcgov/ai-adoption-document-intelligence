# US-008: Create Docker Compose for Local PLG Stack

**As a** developer,
**I want to** run PLG locally via an opt-in Docker Compose file,
**So that** I can test logging, metrics, and dashboards in my local development environment without affecting the core dev stack.

## Acceptance Criteria

- [ ] **Scenario 1**: Separate docker-compose.monitoring.yml created
    - **Given** the project has an existing `docker-compose.yml` for core services (PostgreSQL, MinIO)
    - **When** a developer wants to run PLG locally
    - **Then** they can run `docker compose -f docker-compose.yml -f docker-compose.monitoring.yml up` to start both the core stack and PLG together

- [ ] **Scenario 2**: Promtail auto-discovers container logs via Docker socket
    - **Given** the `docker-compose.monitoring.yml` includes a Promtail container
    - **When** the monitoring stack starts
    - **Then** Promtail mounts `/var/run/docker.sock`, auto-discovers all running containers, and forwards their stdout logs to Loki with service labels

- [ ] **Scenario 3**: Community-standard ports exposed locally
    - **Given** the monitoring compose file defines port mappings
    - **When** the stack is running
    - **Then** Grafana is available at `localhost:3001`, Prometheus at `localhost:9090`, and Loki at `localhost:3100`

- [ ] **Scenario 4**: Data persists via Docker volumes
    - **Given** the monitoring stack stores logs and metrics
    - **When** the stack is stopped and restarted
    - **Then** previously collected logs (Loki) and metrics (Prometheus) are retained via named Docker volumes

- [ ] **Scenario 5**: Compatible with existing startup scripts and VS Code task
    - **Given** the project has startup scripts in `package.json` and a VS Code `Dev:All` task
    - **When** the monitoring stack is integrated
    - **Then** existing startup workflows continue to function and the monitoring stack can be optionally started alongside them

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- PLG is opt-in — the core dev stack works without it
- Promtail needs Docker socket access for container log discovery
- Grafana should have Prometheus and Loki data sources pre-configured in the compose setup
