# Load testing and performance assessment

This document describes how to run bulk data generation and API load tests, how Document Intelligence is stubbed for worker OCR, which API routes are in scope, how to record bottlenecks, and how current OpenShift manifests compare to typical high-availability expectations.

## Runbook

1. **Prepare** a disposable PostgreSQL database and run migrations (`prisma migrate deploy` or dev reset).
2. **Seed base app data** if needed (`prisma db seed`) so a group such as `seed-default-group` exists.
3. **Confirm pre-run guardrails** before inserting large volumes:
   - Use only a disposable/sandbox database; do **not** run this against shared, production, or production-like databases.
   - Confirm storage/WAL headroom and expected runtime for the selected row count.
   - Confirm the cleanup command and target `group_id` before starting.
4. **Bulk-insert** load-test documents from repo root:
   - `npm run load-test:seed -- --count=<N> --group-id=seed-default-group`
   - Repeat the same group/prefix cleanly with `npm run load-test:seed -- --delete-by-prefix --count=<N> --group-id=seed-default-group`.
   - If you omit cleanup on a repeat run, duplicate ids such as `ldt-1` are expected to fail; the generated-id prefix keeps cleanup scoped to synthetic rows only.
   - For ~1M rows, use a dedicated environment; monitor disk and duration.
5. **Start** backend (and Temporal worker if exercising workflows separately).
6. **Export** `LOAD_TEST_API_KEY` (and optional `BASE_URL`, `LOAD_TEST_GROUP_ID`).
7. **Run k6** via `npm run load-test:k6:smoke` (then datasets / documents / upload OCR / blob storage / review HITL scenarios as needed), or run the direct Temporal saturation harness for queue-focused tests.
8. **Track parameter sweeps** with `npm run load-test:matrix -- <scenario> --vus N --duration STR --seeded-rows N --instance NAME --namespace NAME --notes "..."`. The runner wraps the `npm run load-test:k6:<scenario>` script, parses the resulting `tools/load-testing/results/k6-<scenario>-summary.json`, and appends one row per run to `tools/load-testing/test-matrix.csv` (timestamp, requested params, iterations, throughput, failure rate, p50/p95/max latency, threshold pass, git branch/sha, free-text notes, auto-generated `result_summary`). Use `--no-run` to record an existing summary without re-executing k6. To run every applicable scenario in a single invocation use `npm run load-test:suite -- --instance NAME --namespace NAME --vus N --duration STR` — scenarios whose prerequisites are missing (`LOAD_TEST_WORKFLOW_VERSION_ID`, `LOAD_TEST_BLOB_CLASSIFIER_NAME`, HITL fixtures) are skipped and reported, not failed. Full options: [tools/load-testing/README.md](../tools/load-testing/README.md#test-matrix-tracker).
9. **Collect** k6/Temporal harness summary JSON from `tools/load-testing/results/`, database metrics, and pod metrics.
10. **Clean up** generated rows after the run:
    - `npm run load-test:seed -- --delete-by-prefix --count=0 --group-id=seed-default-group`

Detailed flags and Docker notes: [tools/load-testing/README.md](../tools/load-testing/README.md).
Stress parameter matrix and execution order: [docs-md/LOAD_TEST_STRESS_RUN_SHEET.md](./LOAD_TEST_STRESS_RUN_SHEET.md).

## Baseline vs extended scenarios

**Baseline (implemented today)** — aligned with requirements **FR-5**:

- Smoke and paginated benchmark datasets (`npm run load-test:k6:smoke`, `npm run load-test:k6:datasets`).
- Document list stress (`npm run load-test:k6:documents`) targeting `GET /api/documents` (known hotspot; see [get-all-documents-fixes.md](../apps/backend-services/src/document/get-all-documents-fixes.md)).

The upload/OCR workflow, blob/object storage, and Temporal queue saturation scenarios below extend the baseline suite for **FR-13**. The other extended areas still require separate implementation.

**Extended scenarios** — requirements **FR-13** in [`feature-docs/20260501180730-load-testing-di-ha-refined/REQUIREMENTS.md`](../feature-docs/20260501180730-load-testing-di-ha-refined/REQUIREMENTS.md):

| Area | Intent |
|------|--------|
| Upload → OCR / workflow | Implemented by `npm run load-test:k6:upload-ocr`; starts OCR workflow execution through `POST /api/upload`. |
| Blob / storage pressure | Implemented by `npm run load-test:k6:blob-storage`; writes generated multipart files and lists/deletes the generated object prefix through classifier document storage APIs. |
| Temporal queue saturation | Implemented by `npm run load-test:temporal:saturation`; starts generic `graphWorkflow` executions directly through Temporal at a controlled rate. |
| Review / HITL | Implemented by `npm run load-test:k6:review-hitl`; reads review queue/analytics and optionally drives review session lifecycle actions against synthetic fixtures. |
| Payload sizes | Implemented by `npm run load-test:k6:payload-sizes`; runs upload/OCR with env-driven small/medium/large bodies within `BODY_LIMIT` using generic/generated content. |

Tracked as user stories **US-013–US-017** under [`feature-docs/20260501180730-load-testing-di-ha-refined/user_stories/`](../feature-docs/20260501180730-load-testing-di-ha-refined/user_stories/README.md). HTTP scenarios follow the k6 pattern under `tools/load-testing/k6/`; direct service harnesses live beside the toolkit scripts and still expose root npm commands plus summary artifacts under `tools/load-testing/results/`.

## Upload → OCR workflow throughput

Use this scenario only in disposable environments. It creates real `documents` rows and blob objects, then asks the backend to enqueue OCR processing through Temporal.

Run from repo root:

```bash
export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_WORKFLOW_VERSION_ID="<workflow-version-id>"
export LOAD_TEST_RUN_ID="k6-upload-ocr-$(date +%Y%m%d%H%M%S)"
npm run load-test:k6:upload-ocr
```

Routes used by the scenario:

| Route | Purpose |
|-------|---------|
| `POST /api/upload` | Creates a document from a generic synthetic PDF, stores `metadata.loadTestRunId`, and queues OCR/workflow execution. |
| `GET /api/workflows?groupId=<group>` | Operator discovery route before the run; copy `workflow.workflowVersionId` into `LOAD_TEST_WORKFLOW_VERSION_ID`. |

Runtime variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `LOAD_TEST_API_KEY` | Yes | Sent as `x-api-key`; never commit the value. |
| `LOAD_TEST_GROUP_ID` | Yes | Disposable group that owns the workflow and generated documents. |
| `LOAD_TEST_WORKFLOW_VERSION_ID` | Yes | Must be a `WorkflowVersion.id`; the upload path stores it as `workflow_config_id`. |
| `LOAD_TEST_MODEL_ID` | No | Defaults to `prebuilt-layout`. |
| `LOAD_TEST_VUS`, `LOAD_TEST_DURATION`, `LOAD_TEST_SLEEP_SECONDS` | No | Control sustained submit rate. Start low and scale deliberately. |
| `LOAD_TEST_RUN_ID` | No | Stored in document metadata for correlation and cleanup. |
| `LOAD_TEST_PAYLOAD_SIZE_TIER` | No | `small`, `medium`, or `large`; defaults to `small`. |
| `LOAD_TEST_PAYLOAD_SMALL_BYTES`, `LOAD_TEST_PAYLOAD_MEDIUM_BYTES`, `LOAD_TEST_PAYLOAD_LARGE_BYTES` | No | Tier byte targets before base64 expansion; defaults are 256 KiB, 1 MiB, and 5 MiB. |
| `LOAD_TEST_UPLOAD_PAYLOAD_BYTES` | No | Exact generated PDF byte target for this upload run. |
| `LOAD_TEST_UPLOAD_FILE_PATH` | No | Optional generated/license-clear PDF path available to k6. |
| `LOAD_TEST_UPLOAD_FILE_BASE64` | No | Optional synthetic/license-clear PDF override. The built-in payload is a generic generated PDF. |
| `LOAD_TEST_BODY_LIMIT` / `BODY_LIMIT` | No | Nest JSON body limit used by k6 for preflight validation; defaults to `50mb`. |

Mock and wiring prerequisites:

- Backend-services should run with `DOCUMENT_INTELLIGENCE_MODE=mock` for disposable load/integration environments so backend DI-dependent routes remain mock-safe.
- Temporal worker must run with `MOCK_AZURE_OCR=true` to avoid live Azure Document Intelligence calls from `azureOcr.submit` and `azureOcr.poll`.
- Backend-services must reach Temporal using the same `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_TASK_QUEUE` that the worker is polling.
- API keys must authorize the target group and the workflow version must belong to that disposable group.

Backlog signals to collect with k6 output:

- k6 summary: `tools/load-testing/results/k6-upload-ocr-summary.json`, especially `http_req_duration`, `http_req_failed`, `upload_success`, and `upload_created_duration`.
- Temporal UI or metrics: workflows with ids beginning `graph-`, task queue backlog, schedule-to-start latency, pending activities, worker poller health, completed count, and failed count.
- Backend logs: `POST /api/upload`, `Starting OCR processing`, and `Graph workflow started` entries.
- Worker logs: `azureOcr.submit`, `azureOcr.poll`, extraction, cleanup, confidence, and store-result activity progress.
- Database: document status counts filtered by `metadata.loadTestRunId`.

Cleanup:

- After workflows drain, delete generated documents through `DELETE /api/documents/<documentId>` where practical; the API also deletes the OCR blob prefix.
- For large disposable-only runs, use `metadata.loadTestRunId` to identify generated rows before cleanup. Do not use broad metadata deletes against shared or production-like data.

## Blob / object storage pressure

Use this scenario only in disposable environments. It creates generated binary objects without document-specific content, then list-checks and prefix-deletes those objects through platform APIs.

Run from repo root:

```bash
export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_BLOB_CLASSIFIER_NAME="<existing-classifier-name>"
export LOAD_TEST_RUN_ID="k6-blob-$(date +%Y%m%d%H%M%S)"
export LOAD_TEST_BLOB_PAYLOAD_BYTES=1048576
npm run load-test:k6:blob-storage
```

Routes used by the scenario:

| Route | Purpose |
|-------|---------|
| `POST /api/azure/classifier/documents?group_id=<group>` | Multipart upload of generated `application/octet-stream` payloads under classifier label/folder `<label>`. |
| `GET /api/azure/classifier/documents?group_id=<group>&name=<classifier>` | Lists classifier-backed object names to exercise storage prefix listing. |
| `DELETE /api/azure/classifier/documents?group_id=<group>&name=<classifier>&folder=<label>` | Deletes only the generated run label/folder. |

Runtime variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `LOAD_TEST_API_KEY` | Yes | Sent as `x-api-key`; never commit the value. |
| `LOAD_TEST_GROUP_ID` | Yes | Disposable group that owns the classifier and generated blobs. |
| `LOAD_TEST_BLOB_CLASSIFIER_NAME` | Yes | Existing classifier name in the target group. |
| `LOAD_TEST_PAYLOAD_SIZE_TIER` | No | `small`, `medium`, or `large`; defaults to `small` when `LOAD_TEST_BLOB_PAYLOAD_BYTES` is unset. |
| `LOAD_TEST_PAYLOAD_SMALL_BYTES`, `LOAD_TEST_PAYLOAD_MEDIUM_BYTES`, `LOAD_TEST_PAYLOAD_LARGE_BYTES` | No | Shared tier byte targets; defaults are 256 KiB, 1 MiB, and 5 MiB. |
| `LOAD_TEST_BLOB_PAYLOAD_BYTES` | No | Exact generated bytes per multipart file. |
| `LOAD_TEST_BLOB_FILE_PATH` | No | Optional generated/license-clear fixture path available to k6. |
| `LOAD_TEST_BLOB_FILES_PER_ITER` | No | Defaults to `1`; files per upload request. |
| `LOAD_TEST_BLOB_LABEL` | No | Defaults to sanitized `LOAD_TEST_RUN_ID`; this is the prefix-scoped cleanup folder. |
| `LOAD_TEST_BLOB_CLEANUP` | No | Defaults to `true`; k6 teardown deletes the generated label/folder. |
| `LOAD_TEST_BLOB_DELETE_BEFORE_RUN` | No | Defaults to `false`; set `true` for repeat runs with the same label. |
| `LOAD_TEST_BODY_LIMIT` / `BODY_LIMIT` | No | Nest multipart body limit used by k6 for preflight validation; defaults to `50mb`. |

Storage backend assumptions:

- The scenario drives backend APIs, so configure storage on backend-services, not in k6.
- Local/filesystem providers must point at disposable roots with enough disk for `payload size * files * iterations`.
- MinIO/S3-compatible providers must use disposable buckets or a disposable prefix; manual cleanup must target only `<group>/classification/<classifier>/<label>/`.
- Azure Blob Storage uses the app's current env: `BLOB_STORAGE_PROVIDER=azure`, `AZURE_STORAGE_CONTAINER_NAME`, and either `AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_ACCOUNT_NAME` plus `AZURE_STORAGE_ACCOUNT_KEY`. Keep these in OpenShift Secrets or external secret management. Do not paste secrets into commands, docs, ConfigMaps, or k6 scripts.

Summary and thresholds:

- k6 writes `tools/load-testing/results/k6-blob-storage-summary.json`.
- Default thresholds are `http_req_failed < 5%`, `p(95) < 60s`, `blob_upload_success > 95%`, and `blob_list_success > 95%`.
- Treat thresholds as starting guidance, not production SLOs. Increase payload size, VUs, file count, and duration gradually while recording backend request latency, pod memory, body-limit failures, storage provider throttling, bucket/container latency, and cleanup duration.

Cleanup and abort recovery:

- By default, k6 teardown deletes `LOAD_TEST_GROUP_ID/classification/<classifier>/<label>/` through the API.
- If a run aborts before teardown, rerun the scenario with `LOAD_TEST_BLOB_CLEANUP=true` and the same `LOAD_TEST_BLOB_LABEL`, issue the API delete route manually, or delete exactly that prefix in the backing filesystem/bucket/container.
- Never delete the broader classifier prefix unless the classifier and all files under it are known disposable.

## Realistic document payload sizes

Use this scenario path only in disposable environments. It parameterizes upload-related load by small/medium/large byte tiers so request body limits, base64 expansion, PDF normalization, OCR enqueue, and storage bandwidth are visible in the same runbook as the other k6 scenarios.

Run from repo root:

```bash
export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_WORKFLOW_VERSION_ID="<workflow-version-id>"
export LOAD_TEST_PAYLOAD_SIZE_TIER="large"
export LOAD_TEST_BODY_LIMIT="50mb"
npm run load-test:k6:payload-sizes
```

Payload configuration:

| Variable | Default | Notes |
|----------|---------|-------|
| `LOAD_TEST_PAYLOAD_SIZE_TIER` | `small` | Selects `small`, `medium`, or `large`. |
| `LOAD_TEST_PAYLOAD_SMALL_BYTES` | `262144` | Small generated payload target before base64 or multipart overhead. |
| `LOAD_TEST_PAYLOAD_MEDIUM_BYTES` | `1048576` | Medium generated payload target. |
| `LOAD_TEST_PAYLOAD_LARGE_BYTES` | `5242880` | Large generated payload target. |
| `LOAD_TEST_UPLOAD_PAYLOAD_BYTES` | tier-derived | Exact generated PDF bytes for `POST /api/upload`. |
| `LOAD_TEST_BLOB_PAYLOAD_BYTES` | tier-derived | Exact generated binary bytes for classifier blob pressure. |
| `LOAD_TEST_UPLOAD_FILE_PATH`, `LOAD_TEST_BLOB_FILE_PATH` | generated content | Optional fixture paths; use generated or license-clear files only. |
| `LOAD_TEST_UPLOAD_FILE_BASE64` | generated PDF | Optional base64 PDF override; use generated or license-clear content only. |
| `LOAD_TEST_BODY_LIMIT` / `BODY_LIMIT` | `50mb` | Backend Nest limit used by k6 to fail setup before oversize requests are sent. |

No proprietary fixtures are checked in or required. The upload path generates a syntactically valid synthetic PDF with generic text and padding; the blob path generates deterministic binary text. If operators provide fixture paths, those files must be generated or openly licensed, and any committed fixture must include clear license documentation.

`POST /api/upload` sends JSON, so raw PDF bytes expand by roughly 4/3 as base64 before Nest applies `BODY_LIMIT`. k6 estimates the JSON body size and aborts setup if the selected tier would exceed the configured limit. The backend validates uploads with a cheap header/metadata probe, starts the original blob write, normalizes to PDF under an in-process cap of `Math.max(2, available CPU parallelism)`, awaits the original write, drops the decoded upload buffer, writes the normalized PDF, creates the document row, and queues OCR/workflow processing. Thumbnails are generated from the normalized PDF so the original bytes are not retained for the full request. Keep backend-services on `DOCUMENT_INTELLIGENCE_MODE=mock` and Temporal worker on `MOCK_AZURE_OCR=true` for these runs so live Azure Document Intelligence latency or quota errors do not mask platform body-limit, normalization, storage, or queue behavior.

The current upload API contract is JSON/base64, not multipart. That means the decoded request bytes must still exist at least long enough for validation, original storage, and `pdf-lib` normalization; true request-stream normalization would require changing `/api/upload` to accept multipart or adding a replacement upload contract.

## Review / HITL API scenario

Use this scenario only in disposable environments. It drives generic review/HITL HTTP endpoints with synthetic documents and OCR results; it does not embed domain-specific document fixtures.

Run from repo root:

```bash
export DATABASE_URL="postgresql://..."
npm run load-test:hitl-fixtures -- --delete-by-prefix --count=100 --group-id=seed-default-group

export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_HITL_SESSION_MODE="skip"
npm run load-test:k6:review-hitl
```

Routes used by the k6 script, matching the Nest controllers and Swagger decorators:

| Verb | Path and scenario params | Body | Notes |
|------|--------------------------|------|-------|
| `GET` | `/api/hitl/queue?group_id=<group>` plus optional `status`, `modelId`, `maxConfidence`, `limit`, `offset`, `reviewStatus` | None | Queue read from `HitlController.getQueue`. |
| `GET` | `/api/hitl/queue/stats?group_id=<group>` plus optional `reviewStatus` | None | Queue stats from `HitlController.getQueueStats`. |
| `GET` | `/api/hitl/analytics?group_id=<group>` plus optional `startDate`, `endDate`, `reviewerId` | None | Analytics read from `HitlController.getAnalytics`. |
| `POST` | `/api/hitl/sessions/next?group_id=<group>` plus optional `modelId`, `maxConfidence`, `reviewStatus` | None | Claims the next eligible document when `LOAD_TEST_HITL_SESSION_MODE` is not `off`. |
| `GET` | `/api/hitl/sessions/:id` | None | Reads the claimed session. |
| `POST` | `/api/hitl/sessions/:id/heartbeat` | None | Extends the session lock. |
| `POST` | `/api/hitl/sessions/:id/corrections` | `corrections[]` with `field_key`, optional `original_value`, optional `corrected_value`, optional `original_conf`, and `action` | Writes one synthetic correction. |
| `GET` | `/api/hitl/sessions/:id/corrections` | None | Reads correction history. |
| `POST` | `/api/hitl/sessions/:id/skip` | None | Default cleanup action for claimed sessions. |
| `POST` | `/api/hitl/sessions/:id/submit` | None | Optional action with `LOAD_TEST_HITL_SESSION_MODE=submit`; marks documents approved. |
| `POST` | `/api/hitl/sessions/:id/escalate` | `{ "reason": "..." }` | Optional action with `LOAD_TEST_HITL_SESSION_MODE=escalate`. |
| `GET` | `/api/benchmark/datasets/from-hitl/eligible-documents?group_id=<group>` plus optional `page`, `limit`, `search` | None | Read-only HITL dataset eligibility route. |

Additional review/HITL routes are documented for manual disposable exercises but are not part of the default k6 loop:

- `POST /api/hitl/sessions` with `documentId` and optional `minConfidence`.
- `DELETE /api/hitl/sessions/:id/corrections/:correctionId`.
- `POST /api/hitl/sessions/:id/reopen`.
- `POST /api/benchmark/datasets/from-hitl` with `name`, optional `description`, optional `metadata`, `groupId`, and `documentIds[]`.
- `POST /api/benchmark/datasets/:id/versions/from-hitl` with optional `version`, optional `name`, and `documentIds[]`.

Authentication and identity assumptions:

- These routes use `@Identity({ allowApiKey: true })`; the k6 scenario sends `LOAD_TEST_API_KEY` as `x-api-key`.
- The API key must belong to `LOAD_TEST_GROUP_ID`. API-key identity is resolved as a member of that group, so a mismatched `group_id` returns a group-access error.
- JWT/SSO authentication is also supported by the controllers, but this load-test path uses API keys to match the baseline scenarios. Obtain keys or SSO tokens only through normal disposable-environment admin/operator flows and store them in shell environment variables or OpenShift Secrets, never in committed docs, ConfigMaps, or scripts.

Data prerequisites and cleanup:

- Create fixtures with `npm run load-test:hitl-fixtures -- --delete-by-prefix --count=<N> --group-id=<group>`. The seeder writes synthetic document ids prefixed `ldt-hitl-` plus OCR result ids prefixed `ldt-hitl-ocr-`.
- For read-only queue/analytics pressure without session claims, set `LOAD_TEST_HITL_SESSION_MODE=off`; this still requires API-key access but does not require pending fixture availability.
- Default `LOAD_TEST_HITL_SESSION_MODE=skip` claims sessions, records one synthetic correction, reads it back, and skips the session to avoid creating approved HITL dataset inputs.
- Use `submit` or `escalate` only when those review states are part of the disposable test plan.
- Clean generated data with `npm run load-test:hitl-fixtures -- --delete-by-prefix --count=0 --group-id=<group>`. Deleting the generated documents cascades generated review sessions, locks, corrections, and OCR results. Do not run prefix cleanup against shared or production-like databases.

Artifacts and thresholds:

- k6 writes `tools/load-testing/results/k6-review-hitl-summary.json`.
- Default thresholds are `http_req_failed < 5%`, `p(95) < 30s`, `hitl_read_success > 95%`, and `hitl_session_success > 90%` when session mode is enabled.
- Correlate the summary with backend latency logs, audit event volume for `hitl_queue` / `hitl_eligible` reads, database row counts for `review_sessions` and `review_corrections`, and operator-facing latency in the review UI.

## Temporal worker queue saturation

Use this harness only in disposable Temporal namespaces. It bypasses Nest HTTP and starts the worker-hosted `graphWorkflow` directly through the Temporal SDK, using a generic `humanGate` node to hold executions open long enough to observe workflow-task queue depth, schedule-to-start latency, and poller behavior. It does not use document-specific fixtures or live Azure.

Run from repo root:

```bash
export TEMPORAL_ADDRESS="localhost:7233"
export TEMPORAL_NAMESPACE="default"
export TEMPORAL_TASK_QUEUE="ocr-processing"
export LOAD_TEST_RUN_ID="temporal-saturation-$(date +%Y%m%d%H%M%S)"
export LOAD_TEST_TEMPORAL_RATE_PER_SECOND=10
export LOAD_TEST_TEMPORAL_DURATION_SECONDS=300
npm run load-test:temporal:saturation
```

For an OpenShift namespace, port-forward Temporal from the disposable namespace before running the harness:

```bash
oc -n "$NAMESPACE" port-forward svc/temporal-server 7233:7233
```

Runtime variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `TEMPORAL_ADDRESS` | No | Defaults to `localhost:7233`; use a port-forward or in-cluster Temporal frontend address. |
| `TEMPORAL_NAMESPACE` | No | Defaults to `default`; target only disposable namespaces. |
| `TEMPORAL_TASK_QUEUE` | No | Defaults to `ocr-processing`; must match a worker hosting `graphWorkflow`. |
| `LOAD_TEST_RUN_ID` | No | Used in workflow ids: `load-test-temporal-<run-id>-000001`. |
| `LOAD_TEST_TEMPORAL_RATE_PER_SECOND` | No | Workflow starts per second; start low and increase deliberately. |
| `LOAD_TEST_TEMPORAL_DURATION_SECONDS` | No | Sustained start duration. |
| `LOAD_TEST_TEMPORAL_TOTAL_WORKFLOWS` | No | Exact workflow count override when a fixed run size is preferred. |
| `LOAD_TEST_TEMPORAL_START_CONCURRENCY` | No | Maximum concurrent start RPCs from the driver. |
| `LOAD_TEST_TEMPORAL_HOLD_TIMEOUT` | No | Defaults to `30 minutes`; the human-gate wait that keeps executions observable. |
| `LOAD_TEST_TEMPORAL_CLEANUP` | No | Defaults to `true`; terminates only workflows recorded in the summary artifact after the start phase. |

Artifacts and cleanup:

- Summary JSON is written to `tools/load-testing/results/temporal-queue-saturation-summary.json` by default.
- With `LOAD_TEST_TEMPORAL_CLEANUP=true`, the harness terminates the workflows it started after the start phase.
- To preserve executions for inspection, set `LOAD_TEST_TEMPORAL_CLEANUP=false`, then terminate them later from the recorded summary:

```bash
npm run load-test:temporal:saturation:cleanup
```

Target metrics and stop conditions:

- Temporal UI/metrics: watch task queue backlog, workflow task schedule-to-start latency, poll success/failure, completed/failed/terminated workflow counts, frontend/matching/history errors, and persistence latency. Stop if backlog or schedule-to-start latency keeps rising after lowering submit rate, or if Temporal service errors climb.
- Worker pods: watch CPU, memory, restart count, OOMKilled, and poller health for the worker deployment. Stop if CPU is pinned, memory nears limits, pollers stop making progress, or restarts appear.
- Harness summary/stdout: stop if start RPC failures appear, started count diverges from requested count, or Temporal rejects starts due to namespace capacity.
- Cluster health: stop if Temporal persistence, database, or namespace resource quotas show sustained saturation. These runs are prohibited in shared, production, or production-like environments.

Worker and Nest configuration knobs:

- Worker replica count and rollout behavior are in [`temporal-worker-deployment.yml`](../deployments/openshift/kustomize/base/temporal/temporal-worker-deployment.yml).
- Worker queue names are in [`temporal-worker-configmap.yml`](../deployments/openshift/kustomize/base/temporal/temporal-worker-configmap.yml): `TEMPORAL_TASK_QUEUE`, `BENCHMARK_TASK_QUEUE`, and `ENABLE_BENCHMARK_QUEUE`.
- Backend queue settings are in [`backend-services/configmap.yml`](../deployments/openshift/kustomize/base/backend-services/configmap.yml) and injected by [`backend-services/deployment.yml`](../deployments/openshift/kustomize/base/backend-services/deployment.yml). Align these when comparing direct Temporal starts with HTTP-started workflow load.
- Harness pressure is controlled by `LOAD_TEST_TEMPORAL_RATE_PER_SECOND`, `LOAD_TEST_TEMPORAL_DURATION_SECONDS`, `LOAD_TEST_TEMPORAL_TOTAL_WORKFLOWS`, and `LOAD_TEST_TEMPORAL_START_CONCURRENCY`.

Mock-mode compatibility:

- The direct Temporal hold-graph harness does not call OCR activities, backend DI routes, blob storage, or Azure; `MOCK_AZURE_OCR` is not required for the harness itself.
- For combined saturation plus upload/OCR exercises, keep Temporal worker `MOCK_AZURE_OCR=true` and backend-services `DOCUMENT_INTELLIGENCE_MODE=mock` so live Azure or backend DI errors are not misread as queue capacity limits.

## OpenShift: disposable stack in `fd34fb-test`

To deploy an extra isolated instance (separate Postgres / Temporal) in **`fd34fb-test`** with images built from your branch, follow **[MANUAL_LOAD_TEST_INSTANCE.md](./openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md)** (`scripts/oc-build-push.sh` + `scripts/oc-deploy-instance.sh`).

For blob-heavy scenarios (`npm run load-test:k6:upload-ocr`, `:blob-storage`, `:payload-sizes`) you can keep all object I/O **inside the cluster** by passing **`--blob-storage-provider minio`** to the deploy script. The instance then includes a per-instance `<instance>-minio` Deployment + PVC and routes backend / worker writes to it instead of the shared Azure container — see the **Mock blob storage with in-cluster MinIO** section of [MANUAL_LOAD_TEST_INSTANCE.md](./openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md).

## OpenShift: in-cluster k6 (egress blocked)

Some namespaces cannot rely on **outbound** access from laptops through public Routes for running load generators, or operators prefer traffic that stays entirely **inside the cluster**. Run k6 as an **in-cluster** workload instead.

**Repo manifests:** [`tools/load-testing/kustomization.yml`](../tools/load-testing/kustomization.yml) plus Job YAML under [`tools/load-testing/openshift/`](../tools/load-testing/openshift/). Apply with:

```bash
oc apply -k tools/load-testing -n "$NAMESPACE"
```

(after creating the `load-test-k6-secrets` Secret documented in that folder’s README).

**Kustomize layout:** `configMapGenerator` file sources must live **under the directory that contains `kustomization.yml`** (Kustomize security). Do not point generators at `tools/load-testing/k6/` from `deployments/openshift/...`; keep the kustomization under `tools/load-testing/` as committed, or build the ConfigMap with `oc create configmap ... --from-file=...` instead.

Recommended pattern:

- **`Job`** or **`CronJob`** whose container image runs `k6` (use `grafana/k6` or a copy mirrored to your allowed registry).
- **`BASE_URL`** targeting the backend **ClusterIP Service**, for example `http://backend-services:3002` (see [backend-services/service.yml](../deployments/openshift/kustomize/base/backend-services/service.yml)).
- **Scripts**: mount the same `.js` files as under [`tools/load-testing/k6/`](../tools/load-testing/k6/) via a **ConfigMap** volume.
- **API key**: set `LOAD_TEST_API_KEY` from a **Secret** (`env.valueFrom.secretKeyRef`), never plain text in YAML committed to git.
- **`LOAD_TEST_GROUP_ID`**: ConfigMap or env as appropriate.

Operational checks:

- **NetworkPolicy**: allow the Job pod to connect to `backend-services` on port **3002** (label selectors vary per overlay).
- **Disconnected clusters**: mirror the k6 image; reference your mirror in the Job/CronJob `image:` field.
- **Artifacts**: write k6 summary to container stdout, an `emptyDir`, or a mounted PVC if you need retained JSON (summary export path must be writable).

The bulk **seed** script still needs PostgreSQL: run it from an admin network path with DB access (for example a one-off Job with `DATABASE_URL` from existing DB secrets, or port-forward), independent of k6 egress.

### Backend Document Intelligence mock mode

Set **`DOCUMENT_INTELLIGENCE_MODE=mock`** on **backend-services** to avoid live Azure calls for:

- classifier **polling** and **classification result** retrieval (deterministic stub via `AzureService`),
- mock **classify** submission responses (returns a synthetic `operation-location` under the mock endpoint origin),
- labeling pipeline OCR HTTP calls (`TemplateModelOcrService` returns a minimal succeeded analysis payload),

while **template training** and **classifier training** requests that require Azure return **503** with a clear message. Use **`live`** (default) for normal operation.

## Document Intelligence stubbing

### Temporal worker (OCR graph activities)

Submit and poll activities short-circuit Azure when:

1. **`MOCK_AZURE_OCR=true`** — returns synthetic submit headers and a fixed succeeded `OCRResponse` from poll (see `apps/temporal/src/activities/submit-to-azure-ocr.ts` and `poll-ocr-results.ts`). Extract does not call Azure when `ocrResponse` is supplied from the graph.

2. **Benchmark OCR cache** — `__benchmarkOcrCache` with `ocrResponse` replays prior results (see [OCR_IMPROVEMENT_PIPELINE.md](./OCR_IMPROVEMENT_PIPELINE.md)).

Configure the worker with `MOCK_AZURE_OCR=true` for load or integration environments that must not call Azure (worker deployment ConfigMap key `MOCK_AZURE_OCR` in `deployments/openshift/kustomize/base/temporal/temporal-worker-configmap.yml`).

### Backend (NestJS)

Backend now supports `DOCUMENT_INTELLIGENCE_MODE=mock` for load/integration environments:

- classifier polling and classification retrieval return deterministic stub results,
- classify submission returns a synthetic `operation-location`,
- labeling OCR returns a deterministic minimal succeeded payload,
- classifier/template training routes return **503** with a clear message.

Only the blob storage pressure scenario invokes `/api/azure/classifier/documents`; the other bundled scenarios do not invoke `/api/azure/*`, training, or template OCR routes by default.

## Bottleneck findings template

Use one row per issue, ordered by severity after a run.

| Rank | Area | Symptom | Evidence (metric / query / file) | Notes |
|------|------|-----------|-----------------------------------|-------|
| 1 | | | | |
| 2 | | | | |

**Known hotspot:** `GET /api/documents` loads all matching rows and may call Temporal per document when `workflow_execution_id` is set and status is `ongoing_ocr` or `completed_ocr` — see [get-all-documents-fixes.md](../apps/backend-services/src/document/get-all-documents-fixes.md). Seeded load-test rows use `completed_ocr` without `workflow_execution_id` to isolate the full-table read and response mapping cost.

**Caution:** At very large row counts, `GET /api/documents` also builds an audit payload listing every document id (`document_list_accessed`), which can add memory and latency beyond the database read itself.

## High availability — configuration gap checklist

Assessment of **current** sample manifests (not a prescription for production without review).

| Topic | Finding | References |
|-------|---------|------------|
| Backend replicas | `replicas: 1` | [backend-services/deployment.yml](../deployments/openshift/kustomize/base/backend-services/deployment.yml) |
| Backend rollout | `strategy: Recreate` — deploy causes full downtime | Same file |
| Worker replicas | `replicas: 1`, `Recreate` | [temporal-worker-deployment.yml](../deployments/openshift/kustomize/base/temporal/temporal-worker-deployment.yml) |
| Temporal server | `replicas: 1` | [temporal-server-deployment.yml](../deployments/openshift/kustomize/base/temporal/temporal-server-deployment.yml) |
| PodDisruptionBudget | Not defined in sampled base kustomize | Search `PodDisruptionBudget` under `deployments/openshift` |
| Postgres HA | Crunchy `instances[0].replicas: 1` — single database instance | [postgrescluster.yml](../deployments/openshift/kustomize/base/crunchydb/postgrescluster.yml) |
| Connection pooling | pgBouncer stanza commented out | Same file (`proxy.pgBouncer`) |
| Backend blob storage | RWO PVC on backend — limits horizontal scale with local disk | [backend-services/deployment.yml](../deployments/openshift/kustomize/base/backend-services/deployment.yml) (`backend-services-storage`) |
| Health checks | TCP socket on port 3002 — no HTTP deep health | Same file (`livenessProbe` / `readinessProbe`) |

**Overlay:** For load-test namespaces only, you may patch the Temporal worker ConfigMap to set `MOCK_AZURE_OCR: "true"` without changing shared secrets for Azure (submit/poll still skip live calls when mock is enabled).
