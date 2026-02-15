NOTE: The requirements document for this feature is available here: `feature-docs/003-benchmarking-system/REQUIREMENTS.md`.

All user stories files are located in `feature-docs/003-benchmarking-system/user-stories/`.

Read both requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file

Run `git add .` and `git commit -m ... --no-verify` after every user story.

## Infrastructure & Foundation (US-001 to US-004) -- HIGH priority
| File | Title |
|---|---|
| `US-001-docker-compose-minio-mlflow.md` | Docker Compose -- MinIO & MLflow Services |
| `US-002-prisma-schema-benchmark-models.md` | Prisma Schema -- Benchmark Data Models |
| `US-003-minio-blob-storage-service.md` | MinIO Blob Storage Service |
| `US-004-mlflow-client-service.md` | MLflow Client Service |

## Dataset Management (US-005 to US-009) -- HIGH priority
| File | Title |
|---|---|
| `US-005-dvc-service.md` | DVC Service |
| `US-006-dataset-service-controller.md` | Dataset Service & Controller |
| `US-007-dataset-version-management.md` | Dataset Version Management |
| `US-008-dataset-file-upload.md` | Dataset File Upload |
| `US-009-dataset-manifest-sample-preview.md` | Dataset Manifest & Sample Preview |

## Benchmark Management (US-010 to US-013) -- HIGH priority
| File | Title |
|---|---|
| `US-010-benchmark-project-service-controller.md` | Benchmark Project Service & Controller |
| `US-011-benchmark-definition-service-controller.md` | Benchmark Definition Service & Controller |
| `US-012-benchmark-run-service-controller.md` | Benchmark Run Service & Controller |
| `US-013-benchmark-artifact-management.md` | Benchmark Artifact Management |

## Evaluation System (US-014 to US-017) -- HIGH priority
| File | Title |
|---|---|
| `US-014-evaluator-interface-registry.md` | Evaluator Interface & Registry |
| `US-015-schema-aware-evaluator.md` | Schema-Aware Evaluator |
| `US-016-black-box-evaluator.md` | Black-Box Evaluator |
| `US-017-metrics-aggregation-failure-analysis.md` | Metrics Aggregation & Failure Analysis |

## Temporal Execution (US-018 to US-023) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-018-dataset-materialization-activity.md` | Dataset Materialization Activity |
| `US-019-workflow-execution-activity.md` | Workflow Execution Activity |
| `US-020-evaluation-aggregation-activities.md` | Evaluation & Aggregation Activities |
| `US-021-mlflow-logging-cleanup-activities.md` | MLflow Logging & Cleanup Activities |
| `US-022-benchmark-run-workflow.md` | Benchmark Run Workflow Orchestrator |
| `US-023-task-queue-isolation-concurrency.md` | Task Queue Isolation & Concurrency Controls |

## Versioning & Operations (US-024 to US-025) -- HIGH/MEDIUM priority
| File | Title |
|---|---|
| `US-024-workflow-configuration-versioning.md` | Workflow & Configuration Versioning |
| `US-025-audit-logging.md` | Audit Logging |

## Frontend -- Phase 1 (US-026 to US-031) -- HIGH priority
| File | Title |
|---|---|
| `US-026-benchmarking-navigation-routing.md` | Benchmarking Navigation & Routing |
| `US-027-dataset-list-create-ui.md` | Dataset List & Create UI |
| `US-028-dataset-version-sample-preview-ui.md` | Dataset Version & Sample Preview UI |
| `US-029-benchmark-definition-crud-ui.md` | Benchmark Definition CRUD UI |
| `US-030-run-list-start-cancel-progress-ui.md` | Run List, Start/Cancel, Progress UI |
| `US-031-results-summary-mlflow-deeplinks-ui.md` | Results Summary & MLflow Deep-Links UI |

## Phase 1.5 Enhancements (US-032 to US-035) -- MEDIUM priority
| File | Title |
|---|---|
| `US-032-dataset-quality-checks-validation.md` | Dataset Quality Checks & Validation |
| `US-033-split-management-ui.md` | Split Management UI |
| `US-034-baseline-management.md` | Baseline Management |
| `US-035-scheduled-nightly-runs.md` | Scheduled & Nightly Runs |

## Phase 2 -- Rich UI (US-036 to US-039) -- LOW priority
| File | Title |
|---|---|
| `US-036-side-by-side-run-comparison-ui.md` | Side-by-Side Run Comparison UI |
| `US-037-regression-reports-ui.md` | Regression Reports UI |
| `US-038-slicing-filtering-drilldown-ui.md` | Slicing, Filtering & Drill-Down UI |
| `US-039-in-app-artifact-viewer.md` | In-App Artifact Viewer |

## Suggested Implementation Order (by dependency chain)

### Phase 1 -- Infrastructure
- [x] **US-001** (Docker Compose -- MinIO & MLflow) -- everything depends on this infrastructure
- [x] **US-002** (Prisma Schema -- Benchmark Models) -- all services depend on the data model

### Phase 2 -- Core Services
- [x] **US-003** (MinIO Blob Storage Service) -- depends on US-001
- [x] **US-004** (MLflow Client Service) -- depends on US-001
- [x] **US-005** (DVC Service) -- depends on US-001

### Phase 3 -- Dataset Management
- [x] **US-006** (Dataset Service & Controller) -- depends on US-002, US-005
- [x] **US-007** (Dataset Version Management) -- depends on US-006, US-005
- [x] **US-008** (Dataset File Upload) -- depends on US-006
- [x] **US-009** (Dataset Manifest & Sample Preview) -- depends on US-007

### Phase 4 -- Evaluation System
- [x] **US-014** (Evaluator Interface & Registry) -- depends on US-002
- [x] **US-015** (Schema-Aware Evaluator) -- depends on US-014
- [x] **US-016** (Black-Box Evaluator) -- depends on US-014
- [x] **US-017** (Metrics Aggregation & Failure Analysis) -- depends on US-014

### Phase 5 -- Benchmark Management
- [x] **US-010** (Benchmark Project Service & Controller) -- depends on US-002, US-004
- [x] **US-011** (Benchmark Definition Service & Controller) -- depends on US-010, US-014
- [x] **US-012** (Benchmark Run Service & Controller) -- depends on US-011
- [x] **US-013** (Benchmark Artifact Management) -- depends on US-012, US-003

### Phase 6 -- Temporal Execution
- [x] **US-018** (Dataset Materialization Activity) -- depends on US-005
- [x] **US-019** (Workflow Execution Activity) -- depends on US-002
- [x] **US-020** (Evaluation & Aggregation Activities) -- depends on US-014, US-015, US-016, US-017
- [x] **US-021** (MLflow Logging & Cleanup Activities) -- depends on US-004
- [x] **US-022** (Benchmark Run Workflow Orchestrator) -- depends on US-018, US-019, US-020, US-021
- [x] **US-023** (Task Queue Isolation & Concurrency) -- depends on US-022

### Phase 7 -- Versioning & Operations
- [x] **US-024** (Workflow & Configuration Versioning) -- depends on US-011, US-012
- [x] **US-025** (Audit Logging) -- depends on US-002

### Phase 8 -- Frontend (Phase 1)
- [x] **US-026** (Benchmarking Navigation & Routing) -- depends on backend APIs from Phases 3-5
- [x] **US-027** (Dataset List & Create UI) -- depends on US-026, US-006
- [x] **US-028** (Dataset Version & Sample Preview UI) -- depends on US-027, US-007, US-008, US-009
- [x] **US-029** (Benchmark Definition CRUD UI) -- depends on US-026, US-011
- [x] **US-030** (Run List, Start/Cancel, Progress UI) -- depends on US-026, US-012
- [x] **US-031** (Results Summary & MLflow Deep-Links UI) -- depends on US-030, US-013

### Phase 9 -- Phase 1.5 Enhancements
- [x] **US-032** (Dataset Quality Checks & Validation) -- depends on US-007, US-009
- [x] **US-033** (Split Management UI) -- depends on US-028
- [x] **US-034** (Baseline Management) -- depends on US-012, US-031
- [x] **US-035** (Scheduled & Nightly Runs) -- depends on US-022

### Phase 10 -- Phase 2 Rich UI
- [x] **US-036** (Side-by-Side Run Comparison UI) -- depends on US-031
- [ ] **US-037** (Regression Reports UI) -- depends on US-034, US-036
- [ ] **US-038** (Slicing, Filtering & Drill-Down UI) -- depends on US-031
- [ ] **US-039** (In-App Artifact Viewer) -- depends on US-013, US-031
