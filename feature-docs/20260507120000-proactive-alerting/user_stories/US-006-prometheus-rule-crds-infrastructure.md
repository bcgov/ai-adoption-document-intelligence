# US-006: Define PrometheusRule CRDs for Infrastructure-Level Alerts

**As an** operator,
**I want** `PrometheusRule` CRDs deployed to the OpenShift namespace for CPU usage, memory usage, pod error states, and Temporal task queue depth,
**So that** OpenShift User Workload Monitoring evaluates infrastructure health and fires alerts into Alertmanager.

## Acceptance Criteria

- [x] **Scenario 1**: High pod CPU usage rule fires when usage exceeds 80%
    - **Given** the `PrometheusRule` CRD is applied to the namespace and User Workload Monitoring is enabled
    - **When** a pod's CPU usage exceeds 80% of its limit
    - **Then** an alert named `HighPodCpuUsage` with severity `warning` enters the `firing` state

- [x] **Scenario 2**: High pod memory usage rule fires when usage exceeds 90%
    - **Given** the `PrometheusRule` CRD is applied to the namespace
    - **When** a pod's memory usage exceeds 90% of its limit
    - **Then** an alert named `HighPodMemoryUsage` with severity `critical` enters the `firing` state

- [x] **Scenario 3**: Pod error state rule fires on CrashLoopBackOff or OOMKilled
    - **Given** the `PrometheusRule` CRD is applied to the namespace
    - **When** a pod enters `CrashLoopBackOff` or has been OOMKilled
    - **Then** an alert named `PodInErrorState` with severity `critical` enters the `firing` state

- [x] **Scenario 4**: Temporal task queue depth rule fires when depth exceeds 1000
    - **Given** the `PrometheusRule` CRD is applied and Prometheus scrapes the Temporal server
    - **When** `temporal_task_queue_depth` exceeds `1000`
    - **Then** an alert named `TemporalTaskQueueDepthHigh` with severity `warning` enters the `firing` state

- [x] **Scenario 5**: PrometheusRule CRD is deployed as part of the Helm chart
    - **Given** the PLG Helm chart is applied to the OpenShift namespace
    - **When** `helm upgrade --install` completes
    - **Then** the `PrometheusRule` resource is present in the namespace and has the correct `role: alert-rules` label required by OpenShift User Workload Monitoring

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- `PrometheusRule` is an OpenShift/Prometheus Operator CRD (`monitoring.coreos.com/v1`). It must carry the label `role: alert-rules` (or the label matching the cluster's `PrometheusRule` selector) to be picked up by OpenShift User Workload Monitoring.
- **Prerequisite**: Confirm OpenShift User Workload Monitoring is enabled (`oc get configmap cluster-monitoring-config -n openshift-monitoring`).
- CPU/memory metrics come from `kube_pod_container_resource_usage` / `container_cpu_usage_seconds_total` exposed by OpenShift's cluster monitoring — these are available to user namespaces via User Workload Monitoring without additional scrape config.
- A new Helm template file `prometheus-rule-crd.yaml` should be added alongside the existing templates.
- This CRD is only meaningful on OpenShift; the local Docker Compose stack uses the plain rule files from US-005 instead.
