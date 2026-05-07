# US-010: Add Grafana PVC for Persistent Alert History

**As an** operator,
**I want** Grafana backed by a Persistent Volume Claim,
**So that** alert annotation history and dashboard state survive pod restarts.

## Acceptance Criteria

- [ ] **Scenario 1**: Grafana PVC template renders in the Helm chart
    - **Given** the PLG Helm chart is templated
    - **When** `helm template` is run
    - **Then** a `PersistentVolumeClaim` named after the Grafana instance is included with `storage: 1Gi` and the configured storage class

- [ ] **Scenario 2**: Grafana Deployment mounts the PVC at `/var/lib/grafana`
    - **Given** the PLG Helm chart is templated
    - **When** `helm template` is run
    - **Then** the Grafana Deployment spec includes a volume referencing the PVC and a `volumeMount` at `/var/lib/grafana`

- [ ] **Scenario 3**: Grafana PVC size is hardcoded to `1Gi` in `values.yaml`
    - **Given** `values.yaml` is reviewed
    - **When** `grafana.pvcSize` is checked
    - **Then** the value is `1Gi` and there is no environment-specific override in `values-openshift.yaml` or `values-local.yaml`

- [ ] **Scenario 4**: Local Docker Compose Grafana uses a named volume for the same purpose
    - **Given** `docker-compose.monitoring.yml` is updated
    - **When** the monitoring stack starts
    - **Then** Grafana's `/var/lib/grafana` is backed by a named Docker volume (e.g., `grafana_data`) so alert state persists across `docker compose down && up`

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- A new `grafana-pvc.yaml` template should be added to `deployments/openshift/helm/plg/templates/`.
- The Grafana Deployment currently has no PVC — remove any existing ephemeral `emptyDir` volume at `/var/lib/grafana` if present, and replace with the PVC mount.
- `grafana.pvcSize: 1Gi` is set in `values.yaml` as a default. It is intentionally not exposed as a GitHub Environment secret — it is hardcoded because Grafana's SQLite DB is always small.
- `grafana.storageClassName` follows the same pattern as `prometheus.storageClassName` (empty string = cluster default).
- For local Docker Compose: add `grafana_data:` to the top-level `volumes:` block and mount it in the Grafana service definition.
