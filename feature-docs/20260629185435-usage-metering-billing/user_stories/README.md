NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user story files are located in `feature-docs/20260629185435-usage-metering-billing/user_stories/`.

Read both the requirements document and individual user story files for implementation details.

After implementing a user story, check it off at the bottom of this file.

---

## Group A: Foundation (US-001 to US-003) — HIGH priority

| File | Title |
|---|---|
| `US-001-billing-schema-migration.md` | Billing Database Schema Migration |
| `US-002-rate-version-seeder.md` | Rate Version JSON File and Startup Seeder |
| `US-003-usage-event-write-service.md` | Usage Event Write Service |

## Group B: Workflow Metering (US-004 to US-008) — HIGH priority

| File | Title |
|---|---|
| `US-004-preflight-cost-estimation.md` | Pre-flight Workflow Cost Estimation |
| `US-005-preflight-cap-check.md` | Pre-flight Spending Cap Enforcement |
| `US-006-workflow-lifecycle-events.md` | Workflow Lifecycle Event Recording |
| `US-007-activity-interceptor-flat-cost.md` | Temporal Activity Interceptor for Flat-Cost Billing |
| `US-008-per-page-activity-billing.md` | Per-Page Activity Billing via _metered_quantity |

## Group C: Storage Tracking (US-009 to US-011) — HIGH priority

| File | Title |
|---|---|
| `US-009-blob-client-instrumentation.md` | BlobStorageClient Instrumentation for Storage Ledger |
| `US-010-nightly-storage-charge-job.md` | Nightly Storage Charge Temporal Workflow |
| `US-011-archival-and-retention-purge.md` | End-of-Month Archival and UsageEvent Retention Purge |

## Group D: Training Cost Recording (US-012) — HIGH priority

| File | Title |
|---|---|
| `US-012-training-usage-recording.md` | Training Usage Recording and Pre-flight Cap Check |

## Group E: Cap Administration (US-013) — HIGH priority

| File | Title |
|---|---|
| `US-013-spending-cap-configuration.md` | Platform Admin Group Spending Cap Configuration |

## Group F: Usage Visibility (US-014 to US-018) — MEDIUM priority

| File | Title |
|---|---|
| `US-014-group-admin-usage-summary.md` | Group Admin Usage Summary and History |
| `US-015-group-admin-run-detail.md` | Group Admin Per-Run Cost Detail |
| `US-016-platform-admin-cross-group-view.md` | Platform Admin Cross-Group Usage View |
| `US-017-platform-admin-rate-version-management.md` | Platform Admin Rate Version Management |
| `US-018-usage-api-auth.md` | Usage REST API Authentication and Authorization |

---

## Suggested Implementation Order (by dependency chain)

### Phase 1 — Database Foundation
- [x] **US-001** (Prisma schema migration for all billing tables) — everything depends on this

### Phase 2 — Rate Versioning Infrastructure
- [ ] **US-002** (rate_versions.json file and startup seeder service)

### Phase 3 — Core Event Write Service
- [ ] **US-003** (shared service for writing UsageEvents and maintaining UsagePeriodSummary) — required by all metering instrumentation in Phases 4–6

### Phase 4 — Workflow Metering
- [ ] **US-004** (pre-flight cost estimation via max-flow DAG traversal)
- [ ] **US-005** (pre-flight spending cap check with HTTP 402) — depends on US-003 and US-004
- [ ] **US-006** (workflow_started / completed / failed / cancelled lifecycle events) — depends on US-003
- [ ] **US-007** (Temporal ActivityInboundCallsInterceptor for flat-cost activities) — depends on US-003
- [ ] **US-008** (per-page billing via _metered_quantity on azureOcr.extract) — depends on US-007

### Phase 5 — Storage Tracking
- [ ] **US-009** (BlobStorageClient instrumentation — both backend and Temporal worker) — depends on US-001
- [ ] **US-010** (nightly storage charge Temporal workflow) — depends on US-009 and US-003
- [ ] **US-011** (end-of-month archival job + UsageEvent retention purge) — depends on US-010

### Phase 6 — Training Cost Recording
- [ ] **US-012** (template model and classifier training events + pre-flight cap check) — depends on US-003 and US-005

### Phase 7 — Cap Administration
- [ ] **US-013** (platform admin API to configure group spending caps) — depends on US-001

### Phase 8 — Usage Visibility
- [ ] **US-014** (group admin usage summary and history API) — depends on US-003, US-013
- [ ] **US-015** (group admin per-run cost detail API) — depends on US-006, US-007, US-008
- [ ] **US-016** (platform admin cross-group usage view) — depends on US-014
- [ ] **US-017** (platform admin rate version management API) — depends on US-002
- [ ] **US-018** (usage API authentication and authorization guards) — depends on US-014 through US-017

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
