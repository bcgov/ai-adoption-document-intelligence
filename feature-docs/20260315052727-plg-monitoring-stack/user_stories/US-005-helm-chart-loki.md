# US-005: Create Helm Chart with Loki for Log Aggregation

**As a** platform operator,
**I want to** deploy Loki via a Helm chart with configurable retention and storage,
**So that** application logs are aggregated and queryable from a central location.

## Acceptance Criteria

- [x] **Scenario 1**: Helm chart structure created
    - **Given** the project has no existing Helm charts for PLG
    - **When** the Helm chart is created
    - **Then** a Helm chart directory exists with configurable values for Loki, including PVC size (`LOKI_PVC_SIZE` default `10Gi`), retention period (`LOKI_RETENTION_DAYS` default `30`), and resource limits (memory `256Mi`, CPU `500m`)

- [x] **Scenario 2**: Loki configured for NDJSON log parsing
    - **Given** application services output NDJSON structured logs to stdout
    - **When** Loki ingests logs via Promtail
    - **Then** Loki can parse and index NDJSON fields (timestamp, level, service, requestId, userId, sessionId, clientIp, method, path, statusCode, durationMs)

- [x] **Scenario 3**: 30-day log retention enforced
    - **Given** Loki is configured with a 30-day retention period
    - **When** logs older than 30 days exist in storage
    - **Then** Loki automatically purges expired logs according to the `retention_period` configuration

- [x] **Scenario 4**: Helm values configurable per environment
    - **Given** the Helm chart has a `values.yaml` with defaults
    - **When** deploying to different environments (local Docker vs. OpenShift)
    - **Then** environment-specific values can override defaults (PVC size, retention, resource limits) via values files or `--set` flags

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Use community Loki Helm chart as a dependency or base
- The existing Kustomize deployment for the application is not modified
- Loki stores data in a PVC on OpenShift
