NOTE: The requirements document for this feature is available here: `feature-docs/20260315052727-plg-monitoring-stack/REQUIREMENTS.md`.

All user stories files are located in `feature-docs/20260315052727-plg-monitoring-stack/user_stories/`.

Read both requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Log Enrichment (US-001 to US-003) -- HIGH priority
| File | Title |
|---|---|
| `US-001-session-id-logging.md` | Add Session ID to Request Context and Log Output |
| `US-002-client-ip-logging.md` | Add Client IP to Log Output |
| `US-003-api-key-identifier-logging.md` | Add API Key Identifier to Log Output |

## Prometheus Metrics (US-004) -- HIGH priority
| File | Title |
|---|---|
| `US-004-prometheus-red-metrics.md` | Expose Prometheus RED Metrics Endpoint |

## PLG Helm Charts (US-005 to US-007) -- HIGH priority
| File | Title |
|---|---|
| `US-005-helm-chart-loki.md` | Create Helm Chart with Loki for Log Aggregation |
| `US-006-helm-chart-prometheus.md` | Add Prometheus to Helm Chart with Scrape Configuration |
| `US-007-helm-chart-grafana.md` | Add Grafana to Helm Chart with Auth and Data Sources |

## Local & OpenShift Deployment (US-008 to US-010) -- HIGH priority
| File | Title |
|---|---|
| `US-008-docker-compose-monitoring.md` | Create Docker Compose for Local PLG Stack |
| `US-009-promtail-sidecar-openshift.md` | Add Promtail Sidecar Containers to OpenShift Deployments |
| `US-010-openshift-deployment-integration.md` | Integrate PLG Deployment with GitHub Actions and Scripts |

## Grafana Dashboards (US-011 to US-013) -- MEDIUM priority
| File | Title |
|---|---|
| `US-011-application-overview-dashboard.md` | Create Application Overview Grafana Dashboard |
| `US-012-logs-explorer-dashboard.md` | Create Logs Explorer Grafana Dashboard |
| `US-013-nodejs-runtime-dashboard.md` | Create Node.js Runtime Grafana Dashboard |

## Suggested Implementation Order (by dependency chain)

### Phase 1 — Log Enrichment (application code changes)
- [x] **US-001** (Add sessionId from Keycloak session_state to request context and log output)
- [x] **US-002** (Add clientIp extraction from X-Forwarded-For/X-Real-IP/socket to log output)
- [ ] **US-003** (Add API key prefix/ID logging for API key-authenticated requests)

### Phase 2 — Prometheus Metrics (application code changes)
- [ ] **US-004** (Add prom-client, expose /metrics endpoint with RED + Node.js runtime metrics)

### Phase 3 — PLG Helm Charts (infrastructure)
- [ ] **US-005** (Create Helm chart with Loki, NDJSON parsing, 30-day retention, PVC storage)
- [ ] **US-006** (Add Prometheus to Helm chart with scrape configs for backend-services and Temporal)
- [ ] **US-007** (Add Grafana to Helm chart with username/password auth and pre-configured data sources)

### Phase 4 — Deployment Integration (local + OpenShift)
- [ ] **US-008** (Create docker-compose.monitoring.yml with Promtail, Loki, Prometheus, Grafana)
- [ ] **US-009** (Add Promtail sidecar containers to all OpenShift application pods)
- [ ] **US-010** (Integrate PLG Helm deployment into GitHub Actions workflow and /scripts)

### Phase 5 — Grafana Dashboards
- [ ] **US-011** (Application Overview dashboard — request rate, error rate, latency, active sessions)
- [ ] **US-012** (Logs Explorer dashboard — filter by service, userId, sessionId, level)
- [ ] **US-013** (Node.js Runtime dashboard — heap, event loop lag, GC, active handles)

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
