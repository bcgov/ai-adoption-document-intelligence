NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user stories files are located in `feature-docs/20260501180730-load-testing-di-ha-refined/user_stories/`.

Read both requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

## Foundation and Tooling (US-001 to US-003, US-011) -- HIGH priority
| File | Title |
|---|---|
| `US-001-load-testing-workspace-foundation.md` | Load testing workspace foundation |
| `US-002-high-volume-seeder-and-cleanup.md` | High-volume seeder and cleanup workflow |
| `US-003-root-scripts-and-k6-portability.md` | Root scripts and k6 runtime portability |
| `US-011-load-test-seeder-idempotency.md` | Load-test seeder idempotency documentation and operator flow |

## Load Scenario Coverage (US-004 to US-005) -- HIGH priority
| File | Title |
|---|---|
| `US-004-smoke-and-dataset-k6-scenarios.md` | Smoke and dataset baseline k6 scenarios |
| `US-005-document-list-stress-and-artifacts.md` | Document-list stress scenario and artifacts |

## DI Stubbing and Backend Mocking (US-006 to US-008, US-012) -- HIGH priority
| File | Title |
|---|---|
| `US-006-temporal-worker-mock-azure-ocr-wiring.md` | Temporal worker MOCK_AZURE_OCR wiring |
| `US-007-backend-di-mock-mode-contract.md` | Backend DI mock mode contract and scope |
| `US-008-backend-di-mock-implementation-tests.md` | Backend DI deterministic mock implementation and tests |
| `US-012-classifier-di-mock-test-gap-closure.md` | Classifier DI mock-mode test doubles and coverage closure |

## Documentation and Assessment Outputs (US-009 to US-010) -- MEDIUM priority
| File | Title |
|---|---|
| `US-009-runbook-bottleneck-and-ha-assessment-docs.md` | Runbook, bottleneck template, and HA assessment documentation |
| `US-010-openshift-in-cluster-k6-job.md` | OpenShift in-cluster k6 for egress-constrained namespaces |

## Extended load scenarios — FR-13 (US-013 to US-017) -- MEDIUM priority

Follow-on work beyond baseline k6 (`FR-5`). Implements scenario classes in [`../REQUIREMENTS.md`](../REQUIREMENTS.md) §FR-13.

| File | Title |
|---|---|
| `US-013-k6-upload-ocr-workflow-throughput.md` | k6 upload and OCR/workflow throughput scenarios |
| `US-014-k6-blob-storage-pressure.md` | k6 blob and object storage pressure scenarios |
| `US-015-temporal-queue-saturation-harness.md` | Temporal worker queue saturation harness |
| `US-016-k6-review-hitl-apis.md` | k6 review and HITL API scenarios |
| `US-017-k6-realistic-payload-sizes.md` | k6 realistic document payload sizes |

## Suggested Implementation Order (by dependency chain)

### Phase 1
- [x] **US-001** (create load-testing workspace skeleton and conventions) -- baseline for all stories

### Phase 2
- [x] **US-002** (implement seeder behavior, data profile, and cleanup strategy)
- [x] **US-011** (document seeder idempotency: rerun flow, duplicate-key expectation, prefix scope — FR-2a)
- [x] **US-003** (wire root scripts and portable k6 execution paths)

### Phase 3
- [x] **US-004** (implement smoke and paginated dataset k6 scenarios)
- [x] **US-005** (implement document-list stress scenario and summary artifacts)

### Phase 4
- [x] **US-006** (wire worker MOCK_AZURE_OCR across env sample, config map, and deployment)
- [x] **US-007** (define backend DI mock mode behavior and route coverage contract)
- [x] **US-008** (implement deterministic typed backend DI mocks and tests)
- [x] **US-012** (close classifier mock-mode test doubles + coverage + doc alignment — FR-8a)

### Phase 5
- [x] **US-009** (publish runbook, bottleneck template, HA checklist, and environment guardrails)
- [x] **US-010** (document OpenShift in-cluster k6 Job/CronJob pattern for egress-constrained clusters)

### Phase 6 — Extended scenarios (FR-13)
- [x] **US-013** (k6 upload / OCR-workflow throughput — enumerate routes, mocks, observability)
- [x] **US-014** (k6 blob/storage pressure — payloads, provider assumptions, cleanup)
- [x] **US-015** (Temporal queue saturation — harness, metrics, stop conditions)
- [x] **US-016** (review/HITL API k6 — routes, auth, fixtures, teardown)
- [x] **US-017** (realistic payload tiers — env-driven sizes, root scripts, fixtures policy)

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
