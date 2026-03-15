# US-009: Add Promtail Sidecar Containers to OpenShift Deployments

**As a** platform operator,
**I want to** collect logs from all application pods on OpenShift via Promtail sidecar containers,
**So that** logs are forwarded to Loki without requiring cluster-level DaemonSet permissions.

## Acceptance Criteria

- [ ] **Scenario 1**: Promtail sidecar added to backend-services pod
    - **Given** the backend-services deployment already has a logrotate sidecar writing to `/var/log/app/`
    - **When** the Promtail sidecar is added to the pod spec
    - **Then** Promtail tails log files from the shared log volume and forwards them to Loki with `service=backend-services` label

- [ ] **Scenario 2**: Promtail sidecar added to temporal-worker pod
    - **Given** the temporal-worker deployment runs in the same namespace
    - **When** the Promtail sidecar is added to the pod spec
    - **Then** Promtail collects and forwards temporal-worker logs to Loki with `service=temporal-worker` label

- [ ] **Scenario 3**: Promtail sidecar added to temporal-server pod
    - **Given** the temporal-server deployment runs in the same namespace
    - **When** the Promtail sidecar is added to the pod spec
    - **Then** Promtail collects and forwards temporal-server logs to Loki with `service=temporal-server` label

- [ ] **Scenario 4**: Promtail sidecar resource limits configured
    - **Given** the Promtail sidecar has configurable resource limits
    - **When** deployed on OpenShift
    - **Then** the sidecar uses minimal resources (default: memory `64Mi`, CPU `100m`) configurable via Helm values

- [ ] **Scenario 5**: Logs from frontend and PostgreSQL collected
    - **Given** frontend (nginx) and PostgreSQL pods run in the same namespace
    - **When** Promtail sidecars are added to these pods
    - **Then** logs are forwarded to Loki with appropriate service labels (`service=frontend`, `service=postgresql`)

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Sidecar pattern works within tenant-level namespace permissions (no cluster-admin needed)
- Backend-services already uses a logrotate sidecar establishing the shared volume pattern
- Promtail sidecar config references the Loki endpoint within the namespace
