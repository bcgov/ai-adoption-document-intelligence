NOTE: The requirements document for this feature is available here: `feature-docs/20260507120000-proactive-alerting/REQUIREMENTS.md`.

All user story files are located in `feature-docs/20260507120000-proactive-alerting/user_stories/`.

Read both the requirements document and individual user story files for full implementation details.

After implementing a user story, check it off at the bottom of this file.

---

## Group 1: Backend Metrics Foundation (US-001 to US-002) — HIGH priority
| File | Title |
|---|---|
| `US-001-metrics-service-app-alert-gauge.md` | Add app_alert_active Gauge to MetricsService |
| `US-002-in-app-alert-usage-demo.md` | Demonstrate In-App Alerting from Backend Service and Temporal Activity |

## Group 2: Alertmanager Deployment (US-003 to US-004) — HIGH priority
| File | Title |
|---|---|
| `US-003-alertmanager-local-docker-compose.md` | Add Alertmanager to Local Docker Compose Monitoring Stack |
| `US-004-alertmanager-helm-chart.md` | Add Alertmanager to PLG Helm Chart |

## Group 3: Alert Rules (US-005 to US-006) — HIGH priority
| File | Title |
|---|---|
| `US-005-prometheus-app-alert-rules.md` | Define Prometheus Alert Rules for Application-Level Metrics |
| `US-006-prometheus-rule-crds-infrastructure.md` | Define PrometheusRule CRDs for Infrastructure-Level Alerts |

## Group 4: Notification Channels (US-007 to US-009) — HIGH priority
| File | Title |
|---|---|
| `US-007-teams-webhook-receiver.md` | Implement Teams Webhook Notification Receiver |
| `US-008-ches-email-receiver-stub.md` | Implement CHES Email Receiver Stub |
| `US-009-swappable-channel-and-flags.md` | Swappable Channel Selection and Severity / Enabled Flags |

## Group 5: Persistence, CI/CD & Documentation (US-010 to US-012) — MEDIUM priority
| File | Title |
|---|---|
| `US-010-grafana-pvc-alert-history.md` | Add Grafana PVC for Persistent Alert History |
| `US-011-workflow-alertmanager-secrets.md` | Wire Alertmanager Secrets into deploy-instance.yml Workflow |
| `US-012-documentation.md` | Update docs-md Documentation for Alerting System |

---

## Suggested Implementation Order (by dependency chain)

### Phase 1 — Backend Metric (no dependencies)
- [x] **US-001** (Add `app_alert_active` gauge + `recordAlert`/`clearAlert` to `MetricsService`) — foundation for all in-app alerting

### Phase 2 — Alertmanager Deployment (depends on Phase 1 for test data; can proceed in parallel)
- [ ] **US-003** (Alertmanager in local Docker Compose) — enables local testing of routing
- [ ] **US-004** (Alertmanager in PLG Helm chart) — enables OpenShift deployment

### Phase 3 — Alert Rules (depends on Alertmanager being deployed)
- [ ] **US-005** (Application-level Prometheus alert rules) — requires Prometheus/Alertmanager wired together
- [ ] **US-006** (PrometheusRule CRDs for infrastructure alerts) — requires Helm chart from US-004

### Phase 4 — Notification Channels (depends on Alertmanager ConfigMap structure from Phase 2)
- [ ] **US-007** (Teams webhook receiver) — builds on the ConfigMap template from US-004
- [ ] **US-008** (CHES email receiver stub) — builds on the ConfigMap template from US-004
- [ ] **US-009** (Swappable channel + severity/enabled flags) — ties together US-007 and US-008 routing logic

### Phase 5 — In-App Usage, Persistence & CI/CD (depends on Phases 1–4)
- [x] **US-002** (Demonstrate in-app alerting in backend service and Temporal activity) — requires US-001
- [ ] **US-010** (Grafana PVC for persistent alert history) — independent of alerting logic, can be done any time after US-004
- [ ] **US-011** (Wire Alertmanager secrets into deploy-instance.yml) — requires all Helm values from US-004, US-007, US-008, US-009 to be defined

### Phase 6 — Documentation (depends on all prior phases being complete)
- [ ] **US-012** (Update docs-md) — documents the completed system

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
