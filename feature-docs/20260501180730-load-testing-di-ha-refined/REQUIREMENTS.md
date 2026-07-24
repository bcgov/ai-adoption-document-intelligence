# Load Testing, DI Stubbing, and HA Assessment — Refined Requirements

> **Status**: Refined via iterative elicitation
> **Feature**: 20260501180730-load-testing-di-ha-refined
> **Refinement Inputs**: User decisions from requirements-refiner Q&A

---

## 1. Goals and Scope

### 1.1 Problem Statement

The platform requires a repeatable developer-facing capability to:

- create high-volume synthetic `documents` data (up to ~1M rows),
- execute standardized API load scenarios,
- stub worker-side Azure Document Intelligence dependencies,
- and document high-availability configuration gaps in deployment manifests.

### 1.2 Objectives

- Provide a load-testing toolkit usable by any authenticated developer in the repository.
- Keep performance evaluation metric-focused (no hard SLO pass/fail requirements in this feature).
- Produce HA assessment outputs as a current-state snapshot.
- Add backend DI mock mode within this feature scope (not just worker-level stubbing).
- Enforce safe operational boundaries for large dataset runs.

### 1.3 In Scope

- `tools/load-testing` toolkit and root script integration.
- Seed generation for large `documents` volumes.
- **Baseline** k6 scenarios per FR-5: smoke, paginated benchmark reads, and document-list stress.
- Specification of **extended** load-test paths per FR-13 (upload/OCR workflow, blob pressure, Temporal saturation, review APIs, realistic payloads)—implementation may follow in later increments unless explicitly scheduled with FR-5 baseline work.
- Worker DI stubbing (`MOCK_AZURE_OCR`) docs/config wiring.
- Backend DI mock mode requirements for load-test-safe execution paths.
- Bottleneck findings template and HA gap checklist documentation.
- Documented and/or manifest-supported pattern to run k6 **inside an OpenShift namespace** when **cluster egress is disabled**, using in-cluster Service URLs only.

### 1.4 Out of Scope

- Refactoring `GET /api/documents` pagination and Temporal fan-out logic.
- Mandatory production topology changes (replicas, rollout strategy, PDB, anti-affinity).
- Real Azure DI quota benchmarking in production environments.
- Delivery of **every** FR-13 scenario in the same milestone as the FR-5 baseline toolkit, unless product explicitly pulls individual FR-13 items into a planned release (FR-13 remains the catalog either way).

---

## 2. Personas and Permissions

### 2.1 Primary Persona

- **Authenticated developer** in this repository.

### 2.2 Secondary Persona

- **Platform/devops engineer** who may run larger-scale or environment-level test exercises.

### 2.3 Permissions Model

- Requirements assume repo/tooling access and environment credentials are managed externally.
- Feature does not introduce new RBAC in application runtime.

---

## 3. Functional Requirements

### FR-1: Load Testing Toolkit Structure

The system must provide a dedicated toolkit under `tools/load-testing` containing:

- package manifest,
- TypeScript configuration,
- seed script,
- k6 scenario scripts,
- toolkit README,
- runtime artifact ignore rules.

### FR-2: Seeder Behavior

The seed utility must:

- insert synthetic rows into `documents` using high-throughput bulk SQL patterns,
- support `--count`, `--group-id`, `--batch-size`, `--dry-run`, and `--delete-by-prefix`,
- validate target group existence before writes,
- emit progress and completion output,
- support deterministic cleanup by generated id prefix.

### FR-2a: Seeder Idempotency

Seeder execution requirements must define idempotent rerun behavior for the same group and id namespace:

- rerunning with the same generated id prefix must not silently create duplicate-key failures as the default path,
- docs/commands must provide an explicit rerunnable flow (for example deterministic prefix cleanup before reinsert),
- failure behavior for non-idempotent invocation must be explicit and operator-actionable.

### FR-3: Data Profile for Load Testing

Synthetic rows must:

- satisfy required schema columns,
- prioritize read/list load behavior over OCR/blob realism,
- avoid requiring actual blob artifacts for default scenarios.

### FR-4: Root Execution Entry Points

Repository root scripts must expose:

- seed run,
- k6 smoke run,
- k6 paginated benchmark datasets run,
- k6 document-list stress run.

### FR-5: k6 Scenario Requirements

Scenarios must:

- use API-key authentication,
- consume runtime configuration from env vars,
- export summary JSON artifacts to `tools/load-testing/results/`.

Scenario coverage must include:

- smoke readiness-like authenticated request,
- paginated benchmark datasets baseline,
- large-table document-list stress request loop.

### FR-6: k6 Runtime Portability

Execution must support:

- native `k6` if installed,
- Docker fallback if not installed,
- host networking guidance for local Docker execution.

### FR-6a: OpenShift In-Cluster k6 (No Outbound Egress)

Deployments where workloads **cannot initiate outbound traffic** (no Route/Ingress client needed for load generation) must still support running the standard k6 scenarios **inside the namespace**.

Requirements:

- k6 runs as an **in-cluster workload** (for example a **`Job`** or **`CronJob`**) using an official or organization-mirrored **k6 container image**.
- `BASE_URL` (or equivalent) must target the backend via **ClusterIP Service DNS** within the namespace (for example `http://backend-services:3002`), not an external URL, so HTTP stays **pod → Service → backend** without internet egress.
- Scenario scripts must be supplied via **ConfigMap** volume mount (or equivalent), matching the scripts under `tools/load-testing/k6/`.
- `LOAD_TEST_API_KEY` must be supplied via **Secret** (or OpenShift secret reference), never baked into manifests as plaintext.
- Documentation must call out **NetworkPolicy** (or equivalent): the k6 pod must be allowed egress to the backend Service on the API port.
- Documentation must call out **disconnected clusters**: if the cluster cannot pull public images, operators must mirror the k6 image to an allowed registry and reference that image in the Job/CronJob.

### FR-7: Worker DI Stub Configuration

Temporal worker must support DI stubbing via config:

- `MOCK_AZURE_OCR` documented in sample env,
- ConfigMap key for `MOCK_AZURE_OCR`,
- Deployment env injection from ConfigMap.

### FR-8: Backend DI Mock Mode

Because broad developer usage is required, backend DI-dependent endpoints must have a requirements path for mock-safe operation.

Requirements:

- Define a backend DI mode switch (`live`/`mock`) for load/integration use cases.
- Mock mode must return deterministic, typed response shapes matching endpoint/service contracts.
- Mock mode behavior must be explicitly documented, including non-goals and route coverage.
- Unit tests must verify mock branch behavior and contract validity for affected backend services.

### FR-8a: Mock-Mode Test Gap Closure

Known gaps discovered during review must be closed in this feature scope:

- classifier service tests must include `DOCUMENT_INTELLIGENCE_MODE=mock` branch coverage,
- classifier poller tests must include mock-mode short-circuit coverage,
- test doubles for Azure service dependencies must include `isMockMode()` behavior where required by production code,
- docs must stay aligned with implemented mock behavior and tested route coverage.

### FR-9: Bottleneck Reporting Deliverable

Documentation must include a bottleneck findings template with fields for:

- rank/severity,
- impacted area,
- symptom,
- evidence source (query/metric/log/file),
- mitigation notes.

This feature requires **capturing metrics**, not enforcing hard pass/fail thresholds.

### FR-10: HA Gap Deliverable

Documentation must include a file-referenced HA checklist covering:

- replica posture,
- rollout strategy,
- PDB presence/absence,
- DB replica posture,
- connection pooling posture,
- storage scaling posture,
- health probe depth posture.

Deliverable is **assessment snapshot only** (no mandatory remediation changes).

### FR-11: Data Lifecycle Requirement

Definition of Done must include documented cleanup steps for generated data.

- Cleanup command(s) must be explicit and runnable.
- Cleanup should target deterministic generated-id prefixes to avoid accidental deletion of non-test records.

### FR-12: Environment Guardrails for Large Runs

For high-volume runs (for example 1M rows), requirements must state:

- runs are prohibited on shared/prod databases,
- disposable/sandbox environment is required,
- pre-run checklist is required in documentation (environment, storage, runtime assumptions, cleanup plan).

### FR-13: Extended load-test scenario paths (beyond FR-5 baseline)

The baseline k6 suite (FR-5) intentionally stresses read/list and paginated benchmark routes. The platform load-testing program **must also define**—for implementation in this toolkit or documented follow-on increments—the following **additional scenario classes**. Each class must remain **generic** (no document-type-specific fixtures or hard-coded domain payloads), **env-var driven**, safe on **disposable** environments only, and aligned with FR-11/FR-12 lifecycle and guardrails.

Extended scenario classes:

1. **Upload → OCR / workflow throughput**  
   - Drive HTTP APIs that enqueue or progress OCR/graph workflows (including paths that cause Temporal workflow execution).  
   - Document required mock modes (`MOCK_AZURE_OCR`, `DOCUMENT_INTELLIGENCE_MODE`, etc.), credentials, and how to observe workflow backlog without touching production Azure.

2. **Blob / object storage pressure**  
   - Exercises that read/write representative binary payloads through the API or worker-visible storage paths (multipart uploads, normalized artifact reads, or bulk blob operations as exposed by the platform).  
   - Must document storage backend assumptions (filesystem vs cloud), size tiers, and cleanup.

3. **Temporal worker queue saturation**  
   - Sustained submit rates or concurrent workflow starts that stress task-queue depth, worker concurrency, and polling—not only Nest HTTP latency.  
   - Document correlation signals (Temporal UI/metrics, worker logs, queue lag) and safety stops.

4. **Review / HITL APIs**  
   - Load against review-session or human-in-the-loop endpoints where they exist in the API surface, using synthetic identities and disposable data only.  
   - Contract and routes must be enumerated when scenarios are implemented.

5. **Realistic document payload sizes**  
   - k6 (or harness) scenarios using configurable file sizes (small/medium/large) representative of production uploads, within configured body limits.  
   - Must avoid embedding proprietary documents; use generated binary blobs or openly licensed minimal PDF fixtures checked into the repo only if license-clear.

Cross-cutting expectations for any FR-13 scenario:

- Authenticate like FR-5 (`x-api-key` or documented SSO bypass for disposable env only).
- Export summary JSON artifacts under `tools/load-testing/results/` (or a documented subdirectory).
- OpenShift in-cluster execution follows FR-6a when egress is constrained.
- Each scenario file documents prerequisites, teardown/cleanup, and non-production prohibition.

---

## 4. Non-Functional Requirements

### NFR-1: Safety

- No secrets in code or committed documentation.
- Large-run warnings must be explicit.
- Guardrails must be stated clearly for non-production-only execution.

### NFR-2: Usability

- Standard flow must be runnable from repo root with copy-paste commands.
- Commands and env vars must be documented with minimal ambiguity.

### NFR-3: Reproducibility

- Deterministic id prefix strategy for generated records.
- Repeatable scenario scripts and stable output artifact locations.

### NFR-4: Traceability

- Performance and HA statements must reference concrete source files/manifests.

### NFR-5: Egress-Constrained Clusters

- Load-test execution paths must not assume outbound internet from cluster pods when operators choose the OpenShift in-cluster k6 pattern.

---

## 5. Acceptance Criteria

1. Developers can run dry-run seed from root without writes.
2. Seed run inserts rows for valid DB/group and supports prefix-based cleanup.
3. Seeder docs define and demonstrate an idempotent rerun flow for repeated runs against the same group/prefix.
4. Required k6 scenario files exist and execute via native or Docker fallback path.
5. k6 summary artifacts are produced under `tools/load-testing/results/`.
6. Worker `MOCK_AZURE_OCR` is documented and wired through ConfigMap and Deployment env.
7. Requirements include backend DI mock mode scope and test obligations.
8. Classifier service + classifier poller mock-mode test coverage is present and passing.
9. Requirements/docs include bottleneck template and HA assessment checklist.
10. Docs include explicit cleanup instructions and non-prod-only guardrails for large runs.
11. Requirements and operator-facing docs describe how to run k6 **inside OpenShift** using **in-cluster `BASE_URL`** (ClusterIP Service), Job/CronJob pattern, ConfigMap scripts, Secret API key, NetworkPolicy notes, and image-mirroring for disconnected environments.
12. FR-13 defines the extended scenario catalog (upload/OCR workflow throughput, blob/storage pressure, Temporal queue saturation, review APIs, realistic payload sizes) with cross-cutting expectations for safety, artifacts, and generic workloads.

---

## 6. Risks and Constraints

- `GET /api/documents` remains an intentionally stressed known hotspot and may degrade severely at high volumes.
- Additional overhead from large audit payload creation may distort endpoint performance.
- Docker networking compatibility varies by host/runtime and must be documented.
- In-cluster k6 Jobs require correct RBAC, image pull policy, and NetworkPolicy alignment with backend Services.
- HA findings remain informational until separate remediation planning is approved.

---

## 7. Open Follow-Ups (for Story Breakdown)

- Define exact backend modules/endpoints included in DI mock mode.
- Decide whether backend mock mode is env-flag-only or route-selective.
- Define minimum mock response fixtures per endpoint contract.
- Decide if baseline comparison (% regression) should be added in a future enhancement phase.
- Implement FR-13 via user stories **US-013** through **US-017** (`feature-docs/20260501180730-load-testing-di-ha-refined/user_stories/`).
- For FR-13 **Review / HITL APIs**, enumerate concrete routes and auth assumptions once scenarios are scheduled.
- For FR-13 **Temporal saturation**, agree on target metrics (queue backlog, schedule-to-start latency, worker CPU) and stop conditions for disposable runs.
