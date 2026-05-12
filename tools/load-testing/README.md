# Load testing toolkit

Bulk-insert synthetic `documents` rows and run [k6](https://k6.io/) scenarios against the Nest API. Use only on **disposable** databases.

## Prerequisites

- PostgreSQL reachable via `DATABASE_URL` (same connection string as backend migrations).
- A real `group_id` (default `seed-default-group` exists after `npm run test:db:reset` / `prisma db seed`).
- Backend running (default `http://localhost:3002`).
- API key with access to the target group: export as `LOAD_TEST_API_KEY` (never commit it).

## Install

From repo root (workspace):

```bash
npm install
```

Or only this package:

```bash
cd tools/load-testing && npm install
```

## Seed synthetic documents

Inserts rows with `id` prefix `ldt-`, status `completed_ocr`, and **no** `workflow_execution_id` (avoids per-row Temporal calls on list; the list endpoint still loads all rows into memory — see `apps/backend-services/src/document/get-all-documents-fixes.md`).

```bash
export DATABASE_URL="postgresql://..."
npm run load-test:seed -- --count=1000 --group-id=seed-default-group
```

Rerun safely against the same group/prefix by cleaning generated rows first:

```bash
npm run load-test:seed -- --delete-by-prefix --count=1000 --group-id=seed-default-group
```

Generated document ids use the deterministic `ldt-` prefix. Without cleanup, rerunning the same count/group tries to create overlapping ids such as `ldt-1` and PostgreSQL reports a duplicate-key error. That is expected; use `--delete-by-prefix` to delete only `ldt-*` rows in the target group before inserting again.

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--count=N` | 1000 | Rows to insert |
| `--group-id=...` | `seed-default-group` | Target group |
| `--batch-size=N` | 10000 | Insert chunk size |
| `--dry-run` | off | Plan only; with `DATABASE_URL`, verifies group exists |
| `--delete-by-prefix` | off | Deletes `ldt-*` documents in that group first |

Delete only (no inserts):

```bash
npm run load-test:seed -- --delete-by-prefix --count=0
```

Large runs (`~1M`): expect long runtime and large table size; monitor disk and WAL.

## Load scenarios

Environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3002` (native k6) / `http://host.docker.internal:3002` (Docker fallback) | API base |
| `LOAD_TEST_API_KEY` | (required) | `x-api-key` header |
| `LOAD_TEST_GROUP_ID` | `seed-default-group` | Group for scoped routes |
| `LOAD_TEST_VUS` | `1` | Virtual users (`stress-documents-list` only) |
| `LOAD_TEST_DURATION` | `60s` | Scenario duration |
| `LOAD_TEST_WORKFLOW_VERSION_ID` | (required for `upload-ocr`) | Existing `WorkflowVersion.id` used by `POST /api/upload` to start Temporal graph workflow execution |
| `LOAD_TEST_MODEL_ID` | `prebuilt-layout` | OCR model id for `upload-ocr` payloads |
| `LOAD_TEST_RUN_ID` | generated | Run marker stored in upload metadata for correlation and cleanup |
| `LOAD_TEST_PAYLOAD_SIZE_TIER` | `small` | Shared payload tier: `small`, `medium`, or `large` |
| `LOAD_TEST_PAYLOAD_SMALL_BYTES` | `262144` | Generated small payload target before base64/multipart overhead |
| `LOAD_TEST_PAYLOAD_MEDIUM_BYTES` | `1048576` | Generated medium payload target before base64/multipart overhead |
| `LOAD_TEST_PAYLOAD_LARGE_BYTES` | `5242880` | Generated large payload target before base64/multipart overhead |
| `LOAD_TEST_BODY_LIMIT` / `BODY_LIMIT` | `50mb` | Backend Nest body limit used by k6 to reject oversize generated requests before sending |
| `LOAD_TEST_UPLOAD_PAYLOAD_BYTES` | tier-derived | Exact generated PDF byte target for `upload-ocr` / `payload-sizes` |
| `LOAD_TEST_UPLOAD_FILE_PATH` | generated PDF | Optional local generated/license-clear PDF fixture path for native k6 or a path available inside the k6 container |
| `LOAD_TEST_UPLOAD_FILE_BASE64` | generated PDF | Optional base64 PDF payload override; must stay synthetic/license-clear |
| `LOAD_TEST_BLOB_CLASSIFIER_NAME` | (required for `blob-storage`) | Existing classifier name in `LOAD_TEST_GROUP_ID`; its document folder is used for storage pressure |
| `LOAD_TEST_BLOB_PAYLOAD_BYTES` | tier-derived | Exact generated binary payload size per uploaded file |
| `LOAD_TEST_BLOB_FILE_PATH` | generated binary | Optional local generated/license-clear fixture path for native k6 or a path available inside the k6 container |
| `LOAD_TEST_BLOB_FILES_PER_ITER` | `1` | Number of multipart files uploaded per k6 iteration |
| `LOAD_TEST_BLOB_LABEL` | sanitized `LOAD_TEST_RUN_ID` | Prefix-scoped classifier document label/folder used for generated blobs |
| `LOAD_TEST_BLOB_CLEANUP` | `true` | Delete the generated label/folder during k6 teardown |
| `LOAD_TEST_BLOB_DELETE_BEFORE_RUN` | `false` | Delete the generated label/folder in setup before writing new blobs |
| `LOAD_TEST_HITL_MAX_CONFIDENCE` | `0.9` | Maximum confidence filter for review queue/session selection |
| `LOAD_TEST_HITL_QUEUE_LIMIT` | `20` | Queue and eligible-document page size for `review-hitl` |
| `LOAD_TEST_HITL_SESSION_MODE` | `skip` | Session action after correction: `off`, `skip`, `submit`, or `escalate` |
| `LOAD_TEST_HITL_REVIEW_STATUS` | `pending` | Review status filter for queue reads |
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal frontend address for `temporal-queue-saturation` |
| `TEMPORAL_NAMESPACE` | `default` | Disposable Temporal namespace to target |
| `TEMPORAL_TASK_QUEUE` | `ocr-processing` | Worker task queue that hosts `graphWorkflow` |
| `LOAD_TEST_TEMPORAL_RATE_PER_SECOND` | `5` | Workflow starts per second |
| `LOAD_TEST_TEMPORAL_DURATION_SECONDS` | `60` | Sustained start duration |
| `LOAD_TEST_TEMPORAL_TOTAL_WORKFLOWS` | derived from rate * duration | Optional exact workflow count override |
| `LOAD_TEST_TEMPORAL_START_CONCURRENCY` | `10` | Maximum concurrent start RPCs from the harness |
| `LOAD_TEST_TEMPORAL_HOLD_TIMEOUT` | `30 minutes` | Human-gate timeout that keeps started workflows open for observation |
| `LOAD_TEST_TEMPORAL_CLEANUP` | `true` | Terminates workflows started by this harness after the start phase |
| `LOAD_TEST_TEMPORAL_SUMMARY_PATH` | `results/temporal-queue-saturation-summary.json` | Summary artifact path for start and cleanup runs |

From repo root:

```bash
export LOAD_TEST_API_KEY="your-key"
npm run load-test:k6:smoke
npm run load-test:k6:datasets
npm run load-test:k6:documents
npm run load-test:k6:upload-ocr
npm run load-test:k6:payload-sizes
npm run load-test:k6:blob-storage
npm run load-test:k6:review-hitl
npm run load-test:temporal:saturation
```

Or from `tools/load-testing`:

```bash
npm run k6:smoke
```

- **smoke**: few iterations, paginated benchmark datasets.
- **read-benchmark-datasets**: ramping VUs, paginated reads.
- **stress-documents-list**: repeated `GET /api/documents?group_id=...` (heavy once the table is large). Thresholds: **`http_req_failed` below 5%**, **`p(95)` latency under 120s** (aligned with the per-request timeout). Very large groups may exceed latency; use disposable DBs and tune VUs/duration, or establish a higher baseline before tightening further.
- **upload-ocr-workflow**: repeated `POST /api/upload` with a generic generated PDF. Requires `LOAD_TEST_WORKFLOW_VERSION_ID`, a running backend, Temporal connectivity, and a worker configured for disposable load testing.
- **payload-sizes**: root alias for the upload/OCR script with its own summary artifact (`k6-payload-sizes-summary.json`), intended for small/medium/large request-body exercises.
- **blob-storage-pressure**: repeated multipart `POST /api/azure/classifier/documents`, `GET /api/azure/classifier/documents`, and teardown `DELETE /api/azure/classifier/documents?folder=<label>` with generated binary files. Requires `LOAD_TEST_BLOB_CLASSIFIER_NAME` for an existing classifier in the disposable group.
- **review-hitl-apis**: repeated `GET /api/hitl/queue`, `GET /api/hitl/queue/stats`, `GET /api/hitl/analytics`, `GET /api/benchmark/datasets/from-hitl/eligible-documents`, and optional session lifecycle requests. Requires disposable HITL fixtures created by `npm run load-test:hitl-fixtures -- --delete-by-prefix --count=<N>`.
- **temporal-queue-saturation**: starts generic `graphWorkflow` executions directly through Temporal at a controlled rate. Workflows use a human-gate hold node and ids prefixed with `load-test-temporal-<run-id>` so queue depth, schedule-to-start latency, and worker polling can be observed without document-specific data.

Summaries are written under `tools/load-testing/results/` (gitignored). k6 exits non-zero when thresholds fail (for example if the API is down or the key is invalid); the Temporal harness exits non-zero when connection, start, or cleanup operations fail.

### Upload → OCR workflow throughput

Routes used:

- `POST /api/upload` with JSON body fields `title`, `file`, `file_type`, `original_filename`, `metadata`, `model_id`, `group_id`, and `workflow_config_id`.
- `GET /api/workflows?groupId=<group>` can be used before the run to find an existing workflow and copy its `workflow.workflowVersionId` into `LOAD_TEST_WORKFLOW_VERSION_ID`.

Prerequisites for disposable environments:

- `LOAD_TEST_API_KEY` has access to `LOAD_TEST_GROUP_ID`.
- `LOAD_TEST_WORKFLOW_VERSION_ID` points to an existing workflow version in the same disposable group.
- Backend can connect to Temporal (`TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`).
- Temporal worker is connected to the same namespace/task queue and has `MOCK_AZURE_OCR=true` to avoid production Azure calls.
- Backend-services should use `DOCUMENT_INTELLIGENCE_MODE=mock` in the same load-test environment so incidental DI-dependent backend calls remain mock-safe.

Backlog and throughput correlation:

- k6 writes `results/k6-upload-ocr-summary.json`; correlate `http_req_duration`, `http_req_failed`, `upload_success`, and `upload_created_duration` with the run id.
- Temporal UI/metrics: filter workflow ids with `graph-`, inspect task queue backlog, pending activities, schedule-to-start latency, and completed/failed workflow counts.
- Backend/worker logs: look for `POST /api/upload`, `Starting OCR processing`, `Graph workflow started`, and worker activity logs for `azureOcr.submit` / `azureOcr.poll`.
- Database: uploaded rows carry `metadata.loadTestRunId`; use that value to inspect status distribution after a run.

Cleanup after workflow drain:

- Prefer API cleanup for retained document ids: `DELETE /api/documents/<documentId>` also removes the OCR blob prefix once the document is no longer processing.
- In disposable databases, use the run marker in `metadata.loadTestRunId` to identify generated rows before deleting them. Do not run broad metadata deletes on shared or production-like data.

### Blob / object storage pressure

Use this scenario only in disposable environments. It writes generated binary multipart files through classifier document storage APIs, lists the classifier document prefix, and optionally deletes the generated label/folder in teardown. It does not embed document-specific or proprietary content.

Routes used:

- `POST /api/azure/classifier/documents?group_id=<group>` with multipart fields `name`, `label`, and `files`.
- `GET /api/azure/classifier/documents?group_id=<group>&name=<classifier>` to list stored object names under the classifier prefix.
- `DELETE /api/azure/classifier/documents?group_id=<group>&name=<classifier>&folder=<label>` to delete only the generated run label/folder.

Prerequisites:

- `LOAD_TEST_API_KEY` has member access to `LOAD_TEST_GROUP_ID`.
- `LOAD_TEST_BLOB_CLASSIFIER_NAME` names an existing classifier record in the disposable target group.
- Backend-services and any worker-visible storage clients point at the same storage backend.
- Do not run this against shared, production, or production-like storage accounts, buckets, containers, or filesystem roots.

Run from repo root:

```bash
export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_BLOB_CLASSIFIER_NAME="<existing-classifier-name>"
export LOAD_TEST_RUN_ID="k6-blob-$(date +%Y%m%d%H%M%S)"
export LOAD_TEST_BLOB_PAYLOAD_BYTES=1048576
npm run load-test:k6:blob-storage
```

Storage backend assumptions:

- Filesystem/local storage: set the backend storage provider to its local/filesystem mode and confirm the root path is disposable. Cleanup is the API `DELETE` above or manual deletion of the generated prefix if the process aborts before k6 teardown.
- MinIO/S3-compatible storage: set the backend provider and bucket/container env used by the deployment, then delete only the generated prefix for `LOAD_TEST_GROUP_ID/classification/<classifier>/<label>/` if manual cleanup is needed.
- Azure Blob Storage: set `BLOB_STORAGE_PROVIDER=azure`, `AZURE_STORAGE_CONTAINER_NAME`, and the deployment's Azure credential env (`AZURE_STORAGE_CONNECTION_STRING` or `AZURE_STORAGE_ACCOUNT_NAME` plus `AZURE_STORAGE_ACCOUNT_KEY`, as currently supported by the app). Store credentials in environment/Secret management, not in scripts or docs. Prefer managed identity for future Azure-hosted changes when app support exists.

Summary and thresholds:

- The npm script writes `tools/load-testing/results/k6-blob-storage-summary.json`.
- Default thresholds are `http_req_failed < 5%`, `p(95) < 60s`, and upload/list success rates above 95%.
- Start with low VUs and 1 MiB payloads, then increase `LOAD_TEST_BLOB_PAYLOAD_BYTES`, `LOAD_TEST_BLOB_FILES_PER_ITER`, `LOAD_TEST_VUS`, and `LOAD_TEST_DURATION` while watching backend memory, request body limits, storage latency, and container/bucket throughput.

Cleanup:

- Default k6 teardown calls `DELETE /api/azure/classifier/documents?...&folder=<label>` for the generated label/folder.
- For reruns with the same label, set `LOAD_TEST_BLOB_DELETE_BEFORE_RUN=true` to delete that label before uploading.
- If k6 or the pod is killed before teardown, rerun cleanup with the same `LOAD_TEST_BLOB_LABEL`/`LOAD_TEST_RUN_ID`, call the same API delete route, or manually delete the generated object prefix only: `<group>/classification/<classifier>/<label>/`.
- Keep `LOAD_TEST_BLOB_CLEANUP=true` unless deliberately preserving artifacts in a disposable environment for inspection.

### Realistic payload sizes

Use this path to exercise body limits, base64 expansion, PDF normalization, OCR enqueue, and storage bandwidth with production-like payload sizes. The default path does not check in or require proprietary fixtures: k6 generates synthetic PDF bytes for `POST /api/upload` and synthetic binary bytes for classifier blob pressure. If you set `LOAD_TEST_UPLOAD_FILE_PATH`, `LOAD_TEST_UPLOAD_FILE_BASE64`, or `LOAD_TEST_BLOB_FILE_PATH`, use only generated files or license-clear fixtures and keep them outside committed source unless the license is documented.

Run one tier from repo root:

```bash
export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_WORKFLOW_VERSION_ID="<workflow-version-id>"
export LOAD_TEST_PAYLOAD_SIZE_TIER="large"
export LOAD_TEST_BODY_LIMIT="50mb"
npm run load-test:k6:payload-sizes
```

Tune tier sizes with `LOAD_TEST_PAYLOAD_SMALL_BYTES`, `LOAD_TEST_PAYLOAD_MEDIUM_BYTES`, and `LOAD_TEST_PAYLOAD_LARGE_BYTES`, or override a single run with `LOAD_TEST_UPLOAD_PAYLOAD_BYTES` / `LOAD_TEST_BLOB_PAYLOAD_BYTES`. Values accept plain bytes or units such as `256kb`, `1MiB`, or `5mb`.

`POST /api/upload` sends a JSON body, so the raw PDF is base64 encoded before Nest applies `BODY_LIMIT`; k6 estimates that JSON size and fails setup before sending a request that would exceed the configured limit. The backend upload path validates the PDF signature, stores the original blob, normalizes to PDF, creates a document row, and queues OCR/workflow processing. In load-test environments keep backend-services on `DOCUMENT_INTELLIGENCE_MODE=mock` and the Temporal worker on `MOCK_AZURE_OCR=true` so normalization/queue cost is measured without live Azure Document Intelligence calls.

### Review / HITL APIs

Use this scenario only in disposable environments. It exercises generic review queue reads plus optional review-session actions against synthetic documents inserted by the HITL fixture seeder.

Run from repo root:

```bash
export DATABASE_URL="postgresql://..."
npm run load-test:hitl-fixtures -- --delete-by-prefix --count=100 --group-id=seed-default-group

export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_HITL_SESSION_MODE="skip"
npm run load-test:k6:review-hitl
```

Routes used by the default scenario:

| Route | Purpose |
|-------|---------|
| `GET /api/hitl/queue?group_id=<group>&reviewStatus=<status>&maxConfidence=<n>&limit=<n>&offset=<n>` | Paginated review queue read. |
| `GET /api/hitl/queue/stats?group_id=<group>&reviewStatus=<status>` | Queue statistics read. |
| `GET /api/hitl/analytics?group_id=<group>` | Review analytics read. |
| `GET /api/benchmark/datasets/from-hitl/eligible-documents?group_id=<group>&page=<n>&limit=<n>` | Paginated list of HITL-approved documents eligible for dataset creation. |
| `POST /api/hitl/sessions/next?group_id=<group>&reviewStatus=pending&maxConfidence=<n>` | Claims the next eligible review session when session mode is not `off`. |
| `GET /api/hitl/sessions/:id` | Reads the claimed review session. |
| `POST /api/hitl/sessions/:id/heartbeat` | Extends the session lock. |
| `POST /api/hitl/sessions/:id/corrections` | Writes one synthetic correction with `field_key`, `original_value`, `corrected_value`, `original_conf`, and `action`. |
| `GET /api/hitl/sessions/:id/corrections` | Reads correction history. |
| `POST /api/hitl/sessions/:id/skip` | Default session action to release the lock without approving the document. |
| `POST /api/hitl/sessions/:id/submit` | Optional action when `LOAD_TEST_HITL_SESSION_MODE=submit`; creates approved HITL documents that later appear in the eligible-documents route. |
| `POST /api/hitl/sessions/:id/escalate` | Optional action when `LOAD_TEST_HITL_SESSION_MODE=escalate`; body is `{ "reason": "..." }`. |

Additional HITL routes exist but are not part of the default mutating loop because they either require specific IDs produced by previous actions or create persistent benchmark datasets:

- `POST /api/hitl/sessions` starts a session for an explicit `documentId`.
- `DELETE /api/hitl/sessions/:id/corrections/:correctionId` deletes a specific correction.
- `POST /api/hitl/sessions/:id/reopen` reopens an eligible completed session.
- `POST /api/benchmark/datasets/from-hitl` creates a dataset from approved HITL document IDs.
- `POST /api/benchmark/datasets/:id/versions/from-hitl` creates a new dataset version from approved HITL document IDs.

Authentication and identity:

- All listed routes use `@Identity({ allowApiKey: true })` and accept `LOAD_TEST_API_KEY` as the `x-api-key` header. The key must be scoped to `LOAD_TEST_GROUP_ID`; the guard maps API-key requests to a member identity for that group.
- JWT/SSO can also authenticate these controllers, but the k6 script intentionally uses API keys for parity with the baseline scenarios. Obtain keys or SSO tokens only in disposable environments using the app's normal admin/operator flow; never paste secrets into docs, manifests, or committed scripts.

Fixtures and cleanup:

- `seed-hitl-fixtures.ts` inserts synthetic `documents` ids with prefix `ldt-hitl-` and matching `ocr_results` ids with prefix `ldt-hitl-ocr-`. The rows use `status=completed_ocr`, `model_id=prebuilt-layout`, and generic OCR key/value data.
- Rerun safely with `npm run load-test:hitl-fixtures -- --delete-by-prefix --count=<N> --group-id=<group>`.
- Delete only generated fixtures with `npm run load-test:hitl-fixtures -- --delete-by-prefix --count=0 --group-id=<group>`. Database cascades remove generated review sessions, locks, corrections, and OCR results for those documents.
- `LOAD_TEST_HITL_SESSION_MODE=skip` is the default because it avoids creating HITL-approved datasets. Use `submit` or `escalate` only when the resulting review state is part of the disposable test plan.

Summary and thresholds:

- The npm script writes `tools/load-testing/results/k6-review-hitl-summary.json`.
- Default thresholds are `http_req_failed < 5%`, `p(95) < 30s`, `hitl_read_success > 95%`, and `hitl_session_success > 90%` when session mode is enabled.

### Temporal queue saturation

Use this harness only against a disposable Temporal namespace and worker deployment. It bypasses Nest HTTP and starts `graphWorkflow` executions directly on `TEMPORAL_TASK_QUEUE`, using a generic `humanGate` node to keep workflows open long enough to observe queue and poller behavior.

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

If targeting OpenShift, port-forward Temporal from the disposable namespace before running the harness:

```bash
oc -n "$NAMESPACE" port-forward svc/temporal-server 7233:7233
```

The default `LOAD_TEST_TEMPORAL_CLEANUP=true` terminates only the workflows recorded in `results/temporal-queue-saturation-summary.json`. If you preserve workflows for inspection with `LOAD_TEST_TEMPORAL_CLEANUP=false`, clean them up later with the same summary path:

```bash
npm run load-test:temporal:saturation:cleanup
```

Signals and stop conditions:

- Temporal UI/metrics: stop if schedule-to-start latency keeps rising for the target queue, pending workflow tasks do not drain after reducing submit rate, workflow failures spike, or namespace persistence latency/error metrics climb.
- Worker pod metrics: stop if CPU is pinned, memory approaches limits, restarts/OOMKilled appear, or poller health drops while backlog grows.
- Harness output: stop if start RPC failures appear in `temporal-queue-saturation-summary.json` or Temporal rejects starts because namespace/task-queue capacity has been exceeded.
- Cluster/database: stop if Temporal persistence, frontend, matching, or history pods show sustained errors; this is a disposable-only exercise, not a production SLO test.

Configuration knobs that affect results:

- Worker replica count and rollout strategy live in `deployments/openshift/kustomize/base/temporal/temporal-worker-deployment.yml`.
- Worker task queue settings live in `deployments/openshift/kustomize/base/temporal/temporal-worker-configmap.yml` (`TEMPORAL_TASK_QUEUE`, `BENCHMARK_TASK_QUEUE`, `ENABLE_BENCHMARK_QUEUE`).
- Backend Temporal queue settings live in `deployments/openshift/kustomize/base/backend-services/configmap.yml` and `deployments/openshift/kustomize/base/backend-services/deployment.yml`; align these when comparing HTTP-started workflow load with this direct Temporal harness.
- Harness pressure is controlled by `LOAD_TEST_TEMPORAL_RATE_PER_SECOND`, `LOAD_TEST_TEMPORAL_DURATION_SECONDS`, `LOAD_TEST_TEMPORAL_TOTAL_WORKFLOWS`, and `LOAD_TEST_TEMPORAL_START_CONCURRENCY`.

Mock-mode compatibility:

- This direct harness does not call OCR activities, backend DI routes, blob storage, or Azure. `MOCK_AZURE_OCR` is not required for the hold graph itself.
- Keep worker `MOCK_AZURE_OCR=true` and backend `DOCUMENT_INTELLIGENCE_MODE=mock` in the same disposable environment when you run this alongside upload/OCR scenarios so live Azure failures are not mistaken for queue capacity limits.

### k6 binary vs Docker

Scripts prefer a local `k6` if installed; otherwise they run `grafana/k6` with the package directory mounted. On Linux, `host.docker.internal` is added via Docker’s `host-gateway`. If that fails, set `BASE_URL` to a reachable host IP from the container.

### OpenShift (no egress)

Apply from repo root (`kustomization.yml` is under `tools/load-testing/`):

```bash
oc apply -k tools/load-testing -n "$NAMESPACE"
```

(Create `load-test-k6-secrets` first — see [openshift/README.md](openshift/README.md).) Uses `BASE_URL=http://backend-services:3002` and mounts scripts from `k6/` via ConfigMap. Full notes: [docs-md/LOAD_TESTING.md](../docs-md/LOAD_TESTING.md).

## Document Intelligence stubbing

- **Temporal worker** OCR activities honor `MOCK_AZURE_OCR=true` (no Azure calls for submit/poll mock path). See `apps/temporal/.env.sample`.
- **Backend Nest** services honor `DOCUMENT_INTELLIGENCE_MODE=mock`:
  - classifier polling and classification retrieval return deterministic stubs,
  - classify submission returns a deterministic mock `operation-location`,
  - labeling OCR returns a deterministic minimal succeeded payload,
  - classifier/template training endpoints return `503` in mock mode.

Only `blob-storage-pressure` hits `/api/azure/classifier/documents`; the other bundled k6 scenarios do not hit `/api/azure/*`, training, or template OCR endpoints by default. Full behavior and scope: `docs-md/LOAD_TESTING.md`.

## Correlating results

- k6 and Temporal harness: `results/k6-*.json` summaries, `results/temporal-queue-saturation-summary.json`, stdout thresholds/errors.
- PostgreSQL: `pg_stat_statements`, slow query log, table size `pg_total_relation_size('documents')`.
- Pods: CPU/memory, OOMKilled, restart count.

Full runbook and HA checklist: [docs-md/LOAD_TESTING.md](../docs-md/LOAD_TESTING.md).

## Test matrix tracker

`run-matrix.sh` wraps the existing `npm run k6:*` scripts: it runs the scenario, parses the resulting `results/k6-<scenario>-summary.json`, and appends a single row to `tools/load-testing/test-matrix.csv`. Use it to track parameter sweeps (VUs, duration, dataset size, instance) over time and across operators.

Run from `tools/load-testing/` (or via the root npm alias):

```bash
# Workspace
npm run matrix -- documents --vus 5 --duration 60s --seeded-rows 10000 \
  --instance loadtest-1 --namespace fd34fb-test \
  --notes "5 VU baseline against 10k seeded rows"

# Repo root
npm run load-test:matrix -- documents --vus 5 --duration 60s --seeded-rows 10000 \
  --instance loadtest-1 --namespace fd34fb-test
```

Set `--namespace` to the OpenShift project that hosts the instance (for example `fd34fb-test` when using the manual extra-instance flow in [MANUAL_LOAD_TEST_INSTANCE.md](../../docs-md/openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md), or `fd34fb-dev` when targeting the CI `develop` auto-deploy namespace).

`BASE_URL`, `LOAD_TEST_API_KEY`, `LOAD_TEST_GROUP_ID`, and any other scenario env (`LOAD_TEST_WORKFLOW_VERSION_ID`, `LOAD_TEST_BLOB_CLASSIFIER_NAME`, ...) are read from the environment exactly as for the underlying `npm run k6:*` scripts. `--vus`/`--duration` are forwarded as `LOAD_TEST_VUS` / `LOAD_TEST_DURATION` for scenarios that respect them; the values you pass are recorded in the matrix as the *requested* parameters even if the underlying script uses a different default (the `iterations` and `req_total` columns reflect what k6 actually executed).

Useful flags:

| Flag | Purpose |
|------|---------|
| `--vus N` | Override `LOAD_TEST_VUS` for this run |
| `--duration STR` | Override `LOAD_TEST_DURATION` (`60s`, `5m`, ...) |
| `--seeded-rows N` | Recorded as-is; useful for documents/datasets/hitl reproducibility |
| `--instance NAME` | Records the OpenShift instance name (e.g. `loadtest-1`) |
| `--namespace NAME` | Records the OpenShift namespace |
| `--notes "..."` | Free-text column |
| `--extra-params "..."` | Free-text column for scenario-specific overrides (e.g. `LOAD_TEST_PAYLOAD_SIZE_TIER=large`) |
| `--no-run` | Skip the k6 run; just parse the existing summary JSON and append a row |
| `--matrix-csv PATH` | Override the CSV path (default `tools/load-testing/test-matrix.csv`) |
| `--summary-json PATH` | Override the summary JSON path |

Columns recorded:

`timestamp_utc, run_id, scenario, instance, namespace, base_url, group_id, api_key_present, vus_requested, duration_requested, seeded_rows, extra_params, iterations, req_total, req_per_sec, failure_rate, latency_avg_ms, latency_p50_ms, latency_p95_ms, latency_max_ms, data_received_mb, data_sent_kb, thresholds_pass, k6_exit_code, git_branch, git_sha, notes, result_summary`

`thresholds_pass=true` when every k6 threshold expression in the summary did not cross its bound (i.e. all green); `k6_exit_code=0` is the equivalent signal directly from k6. `api_key_present` only records *whether* `LOAD_TEST_API_KEY` was set — never the value. `notes` is the free-text value from `--notes`; `result_summary` is auto-generated for each row, e.g. `26 reqs · 0.4213 req/s · 0.00% fail · p50 1.37s · p95 1.60s · max 1.62s · thresholds pass` — no operator typing required. The CSV is plain RFC-4180 (`,` separator, quoted fields with embedded quotes/commas/newlines) so it opens cleanly in spreadsheets and `awk -F,`.

The CSV lives outside `results/` (which is gitignored) so a team can choose to commit it for shared history; it is appended chronologically by run completion order. Reorder by run timestamp with:

```bash
( head -1 test-matrix.csv && tail -n +2 test-matrix.csv | sort ) > test-matrix.sorted.csv
```

Requirements: `bash`, `jq`, the same k6 binary or Docker fallback used by the regular npm scripts.

### One-time fixture provisioning

Two scenarios — `upload-ocr` / `payload-sizes` and `blob-storage` — need API-side fixtures (a workflow version and a classifier) that the matrix runner cannot generate from k6 alone. `setup-fixtures.sh` provisions them once and is fully idempotent: subsequent runs reuse the existing resources by name.

```bash
# Workspace (from tools/load-testing/)
BASE_URL=https://<instance>-backend-<ns>.apps... \
LOAD_TEST_API_KEY=<key> \
LOAD_TEST_GROUP_ID=<group> \
eval "$(./setup-fixtures.sh)"

# Repo root
BASE_URL=... LOAD_TEST_API_KEY=... LOAD_TEST_GROUP_ID=... \
  eval "$(npm run --silent load-test:setup-fixtures)"
```

Stdout is a pair of `export KEY=VALUE` lines, suitable for `eval "$(...)"` (the script must be sourced via `eval` for child processes — npm scripts and the k6 Docker container — to inherit the values):

```text
export LOAD_TEST_WORKFLOW_VERSION_ID=<workflow_version_id>
export LOAD_TEST_BLOB_CLASSIFIER_NAME=<classifier_name>
```

What it does:

| Resource | Default name | Source if missing |
|----------|--------------|-------------------|
| Workflow + initial version | `loadtest-standard-ocr` | `POST /api/workflows` with the JSON template at [`docs-md/graph-workflows/templates/standard-ocr-workflow.json`](../../docs-md/graph-workflows/templates/standard-ocr-workflow.json) (the same template the prisma seed uses) |
| Classifier | `loadtest-blob-classifier` | `POST /api/azure/classifier` (PRETRAINING, source AZURE) |

Useful flags:

| Flag | Purpose |
|------|---------|
| `--workflow-name NAME` | Override the workflow lookup/create name |
| `--classifier-name NAME` | Override the classifier lookup/create name |
| `--workflow-template PATH` | Override the JSON template used when the workflow is missing |
| `--workflows-only` / `--classifier-only` | Skip the other half (e.g. when only one scenario is gated) |
| `--quiet` | Suppress info messages on stderr; only print the `export` lines |

`run-suite.sh` calls this script automatically when the corresponding env var is unset and at least one selected scenario depends on it; pass `--no-auto-fixtures` to opt out.

### Run every applicable scenario in one shot

`run-suite.sh` iterates a configurable list of scenarios, calls `run-matrix.sh` for each, and prints a final per-row summary. Auto-fixtures provisioning runs first when needed (see above). Scenarios whose prerequisites are missing — and cannot be auto-provisioned — are skipped (not failed), so a single command works regardless of which optional features are present in the target instance.

```bash
# Workspace (from tools/load-testing/)
npm run suite -- \
  --instance loadtest-1 --namespace fd34fb-test \
  --vus 1 --duration 60s --seeded-rows 100000 \
  --notes "Full sweep against loadtest-1"

# Repo root
npm run load-test:suite -- \
  --instance loadtest-1 --namespace fd34fb-test \
  --vus 1 --duration 60s --seeded-rows 100000
```

Required env (forwarded to underlying k6 scripts): `BASE_URL`, `LOAD_TEST_API_KEY`, `LOAD_TEST_GROUP_ID`. Optional env gates which scenarios are runnable:

| Scenario | Gate | Auto-provisioned? |
|----------|------|-------------------|
| `smoke`, `datasets`, `documents` | always runnable when required env is set | n/a |
| `upload-ocr`, `payload-sizes` | `LOAD_TEST_WORKFLOW_VERSION_ID` set to an existing workflow version in the group | yes — auto-created via `setup-fixtures.sh` if unset |
| `blob-storage` | `LOAD_TEST_BLOB_CLASSIFIER_NAME` set to an existing classifier in the group | yes — auto-created via `setup-fixtures.sh` if unset |
| `review-hitl` | requires HITL fixtures (run `npm run load-test:hitl-fixtures` first) and the `--include-hitl` flag | no — fixture seeder writes directly to the database |

Useful flags (suite-level; all are forwarded to `run-matrix.sh`):

| Flag | Purpose |
|------|---------|
| `--scenarios LIST` | Comma-separated subset (e.g. `smoke,datasets,documents`); default is every auto-detected scenario |
| `--vus N` / `--duration STR` | Forwarded as `LOAD_TEST_VUS` / `LOAD_TEST_DURATION` for scenarios that respect them |
| `--seeded-rows N` | Recorded in every matrix row for reproducibility (no DB action) |
| `--instance NAME` / `--namespace NAME` | Recorded in every matrix row |
| `--notes "..."` | Free-text recorded in every matrix row |
| `--include-hitl` | Force-include `review-hitl` (HITL fixtures must already be seeded) |
| `--matrix-csv PATH` | Override the CSV path |
| `--stop-on-fail` | Abort after the first scenario whose thresholds fail (default: continue) |
| `--no-auto-fixtures` | Skip the automatic call to `setup-fixtures.sh`; rely on existing env vars |

The suite exit code is `0` when every executed scenario passed its k6 thresholds, otherwise the exit code of the last failing scenario. Skipped scenarios do not affect the suite exit code.
