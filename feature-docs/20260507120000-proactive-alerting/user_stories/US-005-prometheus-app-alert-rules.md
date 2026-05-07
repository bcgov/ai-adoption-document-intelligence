# US-005: Define Prometheus Alert Rules for Application-Level Metrics

**As an** operator,
**I want** Prometheus alert rules defined for existing application metrics and the new `app_alert_active` gauge,
**So that** threshold breaches in HTTP error rates, response latency, heap usage, and in-app flags automatically produce firing alerts visible in Grafana and routed through Alertmanager.

## Acceptance Criteria

- [ ] **Scenario 1**: High HTTP error rate rule fires when threshold is exceeded
    - **Given** the alert rules are loaded by Prometheus
    - **When** `rate(http_request_errors_total[5m])` exceeds the defined threshold
    - **Then** an alert named `HighHttpErrorRate` with severity `warning` enters the `firing` state in Prometheus

- [ ] **Scenario 2**: Slow HTTP response rule fires when p95 latency exceeds 5 seconds
    - **Given** the alert rules are loaded by Prometheus
    - **When** `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` exceeds `5`
    - **Then** an alert named `SlowHttpResponses` with severity `warning` enters the `firing` state

- [ ] **Scenario 3**: High Node.js heap usage rule fires when heap ratio exceeds 90%
    - **Given** the alert rules are loaded by Prometheus
    - **When** the ratio of used heap to heap size exceeds `0.9`
    - **Then** an alert named `HighNodeHeapUsage` with severity `warning` enters the `firing` state

- [ ] **Scenario 4**: `app_alert_active` rule fires when any application alert gauge is set
    - **Given** the alert rules are loaded by Prometheus
    - **When** `app_alert_active > 0`
    - **Then** an alert named `AppAlertActive` with the `severity` label inherited from the gauge label enters the `firing` state

## Priority
- [x] High (Must Have)
- [ ] Medium (Should Have)
- [ ] Low (Nice to Have)

## Technical Notes / Assumptions
- Rules are defined in a YAML file at `deployments/local/prometheus/rules/app-alerts.yml` (local) and in the `prometheus-rules-configmap.yaml` Helm template (OpenShift).
- Each rule must have a `severity` label matching the three-tier system: `info`, `warning`, `critical`.
- For `AppAlertActive`, use `for: 0m` (fire immediately) since `recordAlert` is an explicit in-code flag, not a transient spike.
- For HTTP error rate and latency, a short `for: 2m` window prevents flapping on transient spikes.
- Threshold values (e.g., exact error rate number) should be defined as Helm values so they can be inspected without editing rule files.
