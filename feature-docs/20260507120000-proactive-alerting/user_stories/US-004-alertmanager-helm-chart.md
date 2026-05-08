# US-004: Add Alertmanager to PLG Helm Chart

**As an** operator,
**I want** Alertmanager deployed as part of the PLG Helm chart on OpenShift,
**So that** alerts evaluated by Prometheus are routed to notification channels in all deployed environments.

## Acceptance Criteria

- [x] **Scenario 1**: Alertmanager StatefulSet template renders correctly
    - **Given** the Helm chart is templated with valid values
    - **When** `helm template` is run
    - **Then** a `StatefulSet` for Alertmanager is included in the output with the correct image, port, volume mounts, and resource limits from `values.yaml`

- [x] **Scenario 2**: Alertmanager Service template renders correctly
    - **Given** the Helm chart is templated
    - **When** `helm template` is run
    - **Then** a `ClusterIP` Service for Alertmanager is included, exposing port `9093`

- [x] **Scenario 3**: Alertmanager ConfigMap template renders with the correct structure
    - **Given** the Helm chart is templated
    - **When** `helm template` is run
    - **Then** a ConfigMap containing `alertmanager.yml` is included, with route and receiver blocks populated from Helm values

- [x] **Scenario 4**: Prometheus ConfigMap is updated with alerting and rule_files sections
    - **Given** the Helm chart is templated
    - **When** `helm template` is run
    - **Then** the existing Prometheus ConfigMap includes an `alerting:` block pointing at the Alertmanager Service and a `rule_files:` section

- [x] **Scenario 5**: Alert rule files are provided via a separate ConfigMap mounted into Prometheus
    - **Given** the Helm chart is templated
    - **When** `helm template` is run
    - **Then** a dedicated ConfigMap containing application-level alert rule YAML is present and the Prometheus StatefulSet mounts it at the `rule_files` path

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- New files to add under `deployments/openshift/helm/plg/templates/`: `alertmanager-statefulset.yaml`, `alertmanager-service.yaml`, `alertmanager-configmap.yaml`, `prometheus-rules-configmap.yaml`.
- `_helpers.tpl` should be extended with `plg.alertmanager.fullname` and related label helpers following the existing naming pattern.
- Add an `alertmanager:` block to `values.yaml` (image, resources, httpPort, storage) following the same structure as existing blocks.
- Alertmanager storage: a small PVC (e.g., `2Gi`) for silences and notification state persistence.
- `values-openshift.yaml` should add resource overrides for the `alertmanager:` block.
- The Prometheus StatefulSet must be updated to mount the new rules ConfigMap.
