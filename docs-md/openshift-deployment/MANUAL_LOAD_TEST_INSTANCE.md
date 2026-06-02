# Manual instance deploy for load testing (OpenShift test namespace)

Use this flow when you need an **isolated stack** in **`fd34fb-test`** (alongside the CI-managed **`bcgov-di-test`** instance) and images built from **your current branch**.

Automation lives in:

| Script | Role |
|--------|------|
| [`scripts/oc-build-push.sh`](../../scripts/oc-build-push.sh) | Docker build + push `backend-services`, `frontend`, `temporal` to Artifactory |
| [`scripts/oc-deploy-instance.sh`](../../scripts/oc-deploy-instance.sh) | Kustomize apply + secrets + optional PLG + rollouts (mirrors `.github/workflows/deploy-instance.yml`) |

Prerequisites:

1. `deployments/openshift/config/dev.env` populated (same keys as for other tooling — Artifactory, SSO, Azure, Temporal defaults). Optionally add **`deployments/openshift/config/<instance>.env`** merges for overrides ([ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md)).
2. Service account for **`fd34fb-test`**: `./scripts/oc-setup-sa.sh --namespace fd34fb-test` (one-time), token file `.oc-deploy/token-fd34fb-test`.
3. **`oc`** (uses its built-in kustomize via `oc apply -k`), **`docker`**, **`helm`** (omit PLG with `--skip-plg` if helm not desired), **`openssl`** (used to seed MinIO credentials when `--blob-storage-provider minio`).

## 1. Choose instance name and image tag

- Instance name: lowercase, hyphenated, **≤ 20 characters** (see [`scripts/lib/instance-name.sh`](../../scripts/lib/instance-name.sh)).
- Image tag: any Docker-safe tag; default for **`oc-build-push.sh`** is the sanitized **git branch name** (same rules as GitHub `workflow_dispatch`).

Pick an explicit instance name if the branch-derived name would collide with **`bcgov-di-test`**:

```bash
./scripts/oc-deploy-instance.sh ... --instance loadtest-ai1209 ...
```

## 2. Push images from your branch

From repo root:

```bash
./scripts/oc-build-push.sh --env dev --all --tag <your-tag>
```

Examples:

```bash
./scripts/oc-build-push.sh --env dev --all --tag ai-1209-load-$(whoami)
```

Frontend builds pick up `VITE_*` variables from `dev.env`, consistent with CI.

## 3. Deploy the stack into `fd34fb-test`

Log in with the test-namespace SA token (writes **`./scripts/oc-login-sa.sh`** target):

```bash
./scripts/oc-login-sa.sh --namespace fd34fb-test
./scripts/oc-deploy-instance.sh \
  --env dev \
  --namespace fd34fb-test \
  --image-tag <your-tag> \
  --instance <optional-short-name> \
  --document-intelligence-mode mock \
  --mock-azure-ocr true \
  --confirm
```

Flags **`--confirm`** are mandatory (guards accidental applies).

URLs:

- `https://<instance>-backend-fd34fb-test.<CLUSTER_DOMAIN>`
- `https://<instance>-frontend-fd34fb-test.<CLUSTER_DOMAIN>`

with **`CLUSTER_DOMAIN`** from `dev.env` (e.g. `apps.silver.devops.gov.bc.ca`).

### Disposable load-test settings

For OCR-heavy scenarios use **`DOCUMENT_INTELLIGENCE_MODE=mock`** on the backend and **`MOCK_AZURE_OCR=true`** on the worker ([LOAD_TESTING.md](../LOAD_TESTING.md)). You can set these in **`dev.env`** / `<instance>.env` or pass:

```text
--document-intelligence-mode mock --mock-azure-ocr true
```

Reduce Postgres backup PVC pressure if quotas bite:

```text
PG_BACKUP_STORAGE_SIZE=2Gi
```

in `<instance>.env` merge file.

### Mock blob storage with in-cluster MinIO

Add **`--blob-storage-provider minio`** to deploy a per-instance MinIO stack instead of using the shared Azure container:

```bash
./scripts/oc-deploy-instance.sh \
  --env dev \
  --namespace fd34fb-test \
  --image-tag <your-tag> \
  --instance <name> \
  --document-intelligence-mode mock \
  --mock-azure-ocr true \
  --blob-storage-provider minio \
  --minio-pvc-size 5Gi \
  --confirm
```

What the deploy script does on **`--blob-storage-provider minio`**:

- Creates **`<instance>-minio-credentials`** Secret with random root user / password (skipped if it already exists, so re-deploys reuse the same credentials).
- Pulls in the **`deployments/openshift/kustomize/components/minio`** component, which renders:
  - **`<instance>-minio`** Deployment (image `minio/minio`, single replica, `Recreate` strategy, ports 9000 API / 9001 console).
  - **`<instance>-minio`** Service (ClusterIP).
  - **`<instance>-minio`** PVC (RWO, size from **`--minio-pvc-size`**, default `5Gi`).
  - **`<instance>-minio-init`** Job (image `minio/mc`) that waits for MinIO to be ready and creates buckets **`document-blobs`** and **`benchmark-outputs`**.
- Patches the backend and worker ConfigMaps so **`BLOB_STORAGE_PROVIDER=minio`**, **`MINIO_ENDPOINT=http://<instance>-minio:9000`**, and **`MINIO_DOCUMENT_BUCKET=document-blobs`**. **`MINIO_ACCESS_KEY`** / **`MINIO_SECRET_KEY`** come from the credentials Secret.
- Deletes any prior **`<instance>-minio-init`** Job before re-applying (Job spec is immutable; this lets re-deploys recreate it cleanly).

No Azure egress is needed for blob operations under this mode, and **`./scripts/oc-teardown.sh --instance <name>`** removes the MinIO Deployment, Service, PVC, Secret, and Job along with the rest of the stack (label-scoped delete).

> **Image pulls:** the MinIO component references public images (**`minio/minio`**, **`minio/mc`**). If your cluster blocks egress to Docker Hub, mirror the images into **`${ARTIFACTORY_URL}/kfd3-fd34fb-local`** and patch the component to use the mirrored references before deploying.

### Optional

- **`--skip-plg`** — skip Grafana/Loki/Prometheus Helm release for the instance.
- **`--skip-oc-login`** — if `oc` is already authenticated against the right project.

## 4. Run load tests

From repo root, point **`BASE_URL`** at the backend route and supply **`LOAD_TEST_API_KEY`** ([`tools/load-testing/README.md`](../../tools/load-testing/README.md)).

Database seeding needs **`DATABASE_URL`** against **this** instance’s Postgres (typically via **`oc port-forward`** to the app Postgres service).

The `upload-ocr` / `payload-sizes` scenarios need an existing workflow version, and `blob-storage` needs an existing classifier. **`tools/load-testing/setup-fixtures.sh`** auto-provisions both via the public API (idempotent — reuses by name on subsequent runs):

```bash
BASE_URL=https://<instance>-backend-<ns>.apps... \
LOAD_TEST_API_KEY=<key> \
LOAD_TEST_GROUP_ID=<group> \
eval "$(npm run --silent load-test:setup-fixtures)"
```

`run-suite.sh` calls this automatically whenever **`LOAD_TEST_WORKFLOW_VERSION_ID`** or **`LOAD_TEST_BLOB_CLASSIFIER_NAME`** is unset and a selected scenario needs it; pass **`--no-auto-fixtures`** to opt out. See [`tools/load-testing/README.md`](../../tools/load-testing/README.md) for flags and overrides.

### Disable the global request throttler before sustained load

The backend installs **`@nestjs/throttler`** as an `APP_GUARD` (see [`apps/backend-services/src/app.module.ts`](../../apps/backend-services/src/app.module.ts)) and the **`dev.env`** profile keeps the production-realistic default of **100 requests / 60 s per IP**. Any k6 scenario beyond `smoke` will saturate that budget within seconds and the rest of the run will be **`HTTP 429 ThrottlerException: Too Many Requests`** instead of real backend work. Symptom in the matrix: `failure_rate` near 95 % and `latency_p95` in the tens of milliseconds (the throttler rejects fast).

For a load-test instance, raise the limit on the running ConfigMap and roll the backend once after the deploy:

```bash
oc -n fd34fb-dev patch configmap <instance>-backend-services-config --type=merge \
  -p '{"data":{"THROTTLE_GLOBAL_LIMIT":"1000000"}}'
oc -n fd34fb-dev rollout restart deployment/<instance>-backend-services
oc -n fd34fb-dev rollout status  deployment/<instance>-backend-services --timeout=120s
oc -n fd34fb-dev exec deployment/<instance>-backend-services -- printenv THROTTLE_GLOBAL_LIMIT
# expected: 1000000
```

The patch lasts for the life of the ConfigMap; re-running **`oc-deploy-instance.sh`** against the same instance reverts it back to the **`dev.env`** value, so re-apply the patch after every redeploy. There is currently no per-instance override mechanism in **`scripts/oc-deploy-instance.sh:188`**; the only durable knob is the shared **`THROTTLE_GLOBAL_LIMIT`** key in **`dev.env`**, which would also raise the limit on **`bcgov-di-test`** if changed there. The same applies to the auth-specific limits (**`THROTTLE_AUTH_LIMIT`**, **`THROTTLE_AUTH_REFRESH_LIMIT`**) when load-testing login or refresh paths.

### Findings worth fixing in source

The matrix runs in [`tools/load-testing/test-matrix.csv`](../../tools/load-testing/test-matrix.csv) surfaced two reproducible issues that are not specific to the load-test instance — they are **product limits** that any operator will hit. They are documented here so the next person running the suite knows what they are seeing and is not blocked by them.

1. **Backend pod becomes unavailable under concurrent large uploads.** Running `payload-sizes` at **`large` (5 MB raw PDF) × 5 VUs** drove the **`backend-services`** pod into a restart that returned **`HTTP 502`** (router→dead pod) followed by **`HTTP 503`** (router→no healthy upstream) for ~30–60 s. **`smoke`** and **`datasets`** were both unreachable during the window. **`large × 1 VU`** runs cleanly. The most likely cause is per-request memory pressure from `JSON.parse` + `Buffer.from(b64,'base64')` + `pdf-lib` normalization at the same time, exceeding the pod's `memory.limit`. Confirm with **`oc describe pod <instance>-backend-services-<id>`** and look for **`Last State: Terminated · Reason: OOMKilled · Exit Code: 137`** after a failing run. Workaround for the load-test instance: raise the deployment **`resources.limits.memory`**. Real fix (in source): stream the upload through pdf-lib instead of holding the full buffer twice, or cap concurrent uploads at the controller via a semaphore.
2. **Classifier-document upload fails with HTTP 500 above ~64 KB.** The endpoint **`POST /api/azure/classifier/documents`** in **[`apps/backend-services/src/azure/azure.controller.ts`](../../apps/backend-services/src/azure/azure.controller.ts:223)** uses **`@UseInterceptors(FilesInterceptor("files"))`** with no explicit limits. Files **≤ 64 KB** return 201; **≥ 96 KB** consistently return **`HTTP 500 {"statusCode":500,"message":"Internal server error"}`** in under 250 ms. The list and delete endpoints on the same controller (`GET`/`DELETE /api/azure/classifier/documents`) are unaffected. The OCR upload at **`POST /api/upload`** is unaffected because it is JSON-bodied (governed by **`BODY_LIMIT`**), not multipart. Compare with **[`apps/backend-services/src/benchmark/dataset.controller.ts:222`](../../apps/backend-services/src/benchmark/dataset.controller.ts)** where the dataset multipart endpoint explicitly sets **`limits: { fileSize: 100 * 1024 * 1024 }`** — the classifier endpoint should do the same. Without **`oc`** access to read the backend log this could not be confirmed end-to-end, but the failure is fast, deterministic, and size-correlated, which fits a multer **`limits.fileSize`** rejection. Fix: add **`@UseInterceptors(FilesInterceptor("files", { limits: { fileSize: 100 * 1024 * 1024 } }))`** on the classifier upload route, or register a global **`MulterModule.register`** with a project-wide default that matches **`BODY_LIMIT`**.
3. **In-cluster MinIO fills up after a few sustained upload runs.** After roughly **~1,500** documents uploaded across **`upload-ocr`** and **`payload-sizes`** runs at 256 KB–5 MB tiers, **`POST /api/upload`** starts returning **`HTTP 400 {"message":"Failed to write blob \"<group>/ocr/<id>/original.pdf\": Storage backend has reached its minimum free drive threshold. Please delete a few objects to proceed."}`**. The latency on the failed call is ~4 s (MinIO retries before erroring), and the error is upstream of the backend — it surfaces directly from the AWS S3 SDK call inside **[`apps/backend-services/src/blob-storage/minio-blob-storage.service.ts:86`](../../apps/backend-services/src/blob-storage/minio-blob-storage.service.ts)**. The MinIO PVC sizing comes from **[`deployments/openshift/kustomize/components/minio/pvc.yml`](../../deployments/openshift/kustomize/components/minio/pvc.yml)** with the size templated by **`scripts/lib/generate-overlay.sh`** (default `5Gi`, override with **`--minio-pvc-size`** or `MINIO_PVC_SIZE` in **`dev.env`**). The storage class **`netapp-file-standard`** has **`allowVolumeExpansion=true`**, so an existing PVC can be grown online with no pod restart and no data loss:

```bash
oc -n <namespace> patch pvc <instance>-minio --type=merge \
  -p '{"spec":{"resources":{"requests":{"storage":"<new-size>"}}}}'
oc -n <namespace> exec deployment/<instance>-minio -- df -h /data
```

Be aware the namespace **`storage-quota`** caps total PVC requests across the namespace (e.g. **64 Gi** in **`fd34fb-dev`**, with shared PLG and PG-backup PVCs already consuming roughly **40 Gi**). Check **`oc get resourcequota storage-quota`** before patching; the expand will be rejected with **`exceeded quota`** if not enough headroom is free. Recommended default for sustained load testing is **`5–10 Gi`** per instance — a real fix in source would be a sibling **`tools/load-testing/cleanup-blobs.sh`** that prunes the load-test prefixes for a group, freeing actual disk space without changing the PVC request.
5. **HITL read throughput is flat from 1 → 10 VUs and indicates a tiny backend DB pool.** Running `review-hitl` with `LOAD_TEST_HITL_SESSION_MODE=off` (the four read endpoints only — **`GET /api/hitl/queue`**, **`GET /api/hitl/queue/stats`**, **`GET /api/hitl/analytics`**, **`GET /api/benchmark/datasets/from-hitl/eligible-documents`**) against **1,000 seeded HITL-eligible documents** showed:

   | VUs | req_total | req/s | p50 | p95 | fail |
   |---|---|---|---|---|---|
   | 1 | 408 | **6.76** | 126 ms | 268 ms | 0 % |
   | 5 | 392 | **6.36** | 710 ms | 1.20 s | 0 % |
   | 10 | 400 | **6.34** | 1.50 s | 2.42 s | 0 % |

   Throughput is essentially **constant** while latency grows **linearly** with VU count — the textbook signature of a fixed-size processing pool fronted by an unbounded queue. The backend pod was healthy throughout (0 restarts, ~249 m CPU = 50 % of the 500 m limit, ~269 MiB memory = 53 % of the 512 MiB limit), and the **`api`** Postgres database had `max_connections=100` with only ~1 active connection. The only plausible bottleneck is **Prisma's default connection pool**, which is **`num_physical_cpus * 2 + 1`**. In a 500 m container Node sees 1 logical CPU, so the pool is exactly **3**. With four HITL read endpoints fired per iteration, three concurrent in-flight reads × ~200 ms ≈ 15 reads/s ÷ 4 ≈ 3.75 iters/s ≈ ~7 req/s including overhead — which matches the observed ceiling. Adding the session-flow endpoints (`skip` mode) on top of the same reads pushes per-iter latency higher and triggers heartbeat-status check failures (14/50 at 10 VU), which is a *symptom* of the same pool starvation, not a separate deadlock. Fix in source: configure Prisma's pool explicitly via the **`connection_limit`** query-string parameter on **`DATABASE_URL`** (e.g. `?connection_limit=20`) or set **`prisma.datasourceUrl`** with an explicit pool, sized to match what the backend pod is expected to sustain (e.g. **`connection_limit=20`** for the current 500 m / 512 Mi pod, or a per-instance override that scales with **`resources.requests.cpu`**). The same pool size applies to all backend routes, so this is a system-wide ceiling, not HITL-specific — it just happens to be most visible here because the HITL flow fires the most queries per iteration.

6. **Backend upload path latency degrades after OOMKill events.** The same **`POST /api/upload`** that ran at **~190 ms p50 / ~300 ms p95** at the start of the session ran at **~3.8 s p50** later in the session, after the **`payload-sizes large × 5 VU`** run OOM-killed the backend pod twice (current resource limits **`cpu=500m memory=512Mi`**). Restarting the deployment via **`oc rollout restart deployment/<instance>-backend-services`** does **not** restore baseline latency, ruling out V8 heap accumulation as the sole cause. The pod is healthy by every metric (CPU ~5%, memory ~36%, no error logs), but **`pdfNormalization.normalizeToPdf`** plus the two sequential MinIO writes per upload (**[`apps/backend-services/src/document/document.service.ts:139,153`](../../apps/backend-services/src/document/document.service.ts)** — `original.<ext>` then `normalized.pdf`) take ~20× longer than the warm baseline. Read paths that don't touch blob storage (**`smoke`**, **`datasets`**) re-tested at the same baseline (smoke 6.18 req/s vs 6.10 req/s before, datasets p95 801 ms vs 892 ms before), confirming the backend's HTTP layer + Postgres are healthy and the regression is **isolated to the upload pipeline**. Likely contributing factors are (a) bigger documents-table indexes with thousands of rows already inserted, (b) MinIO post-expansion background work after a PVC online resize, and (c) NFS-backed MinIO directory walking degrading with thousands of sibling object directories. None of these are the load test's fault — they are real-world conditions the backend will encounter in production. Workaround for the load-test instance: tear down and redeploy with a clean PVC and clean DB before every measurement-quality session. Real fix: parallelize the two **`blobStorage.write`** calls (`Promise.all`), or stream the second write directly from the normalization pipeline rather than holding the buffer.

### Running `temporal:saturation`

The Temporal start-rate harness ([`tools/load-testing/temporal-queue-saturation.ts`](../../tools/load-testing/temporal-queue-saturation.ts)) connects directly to the Temporal frontend over gRPC and bypasses the backend entirely, which makes it the cleanest way to measure worker drain throughput independent of any HTTP-side regressions.

The Temporal frontend in this Helm-deployed stack binds to the **pod IP only** (`10.97.x.x:7233`), not to `0.0.0.0` and not to `localhost`, so a plain **`oc port-forward svc/<instance>-temporal 7233:7233`** fails with `dial tcp [::1]:7233: connect: connection refused` (port-forward enters the pod's netns and tries to reach `localhost:7233`, where nothing is listening). The fix is a one-pod **socat** bridge in the same namespace:

```bash
LOCAL_PORT=7244  # avoid 7233 if you have a local Temporal dev server running

oc -n <namespace> run temporal-fwd \
  --image=alpine/socat:1.8.0.0 \
  --restart=Never \
  --labels='app=loadtest-temporal-fwd' \
  -- TCP-LISTEN:7233,fork,reuseaddr TCP:<instance>-temporal:7233

oc -n <namespace> wait pod/temporal-fwd --for=condition=Ready --timeout=60s
oc -n <namespace> port-forward pod/temporal-fwd ${LOCAL_PORT}:7233 &
```

Then run the harness, pointing **`TEMPORAL_ADDRESS`** at the local port. The harness creates simple `humanGate` workflows that block on a signal, which lets it stress *workflow start throughput* (frontend gRPC + history shards + persistence) without depending on any document fixtures:

```bash
TEMPORAL_ADDRESS=localhost:${LOCAL_PORT} \
TEMPORAL_NAMESPACE=default \
TEMPORAL_TASK_QUEUE=ocr-processing \
LOAD_TEST_TEMPORAL_RATE_PER_SECOND=50 \
LOAD_TEST_TEMPORAL_DURATION_SECONDS=60 \
LOAD_TEST_TEMPORAL_START_CONCURRENCY=50 \
LOAD_TEST_TEMPORAL_CLEANUP=false \
LOAD_TEST_RUN_ID="stress50-$(date -u +%Y%m%d-%H%M%S)" \
LOAD_TEST_TEMPORAL_SUMMARY_PATH=tools/load-testing/results/temporal-stress50-summary.json \
npm run --silent temporal:saturation -w @ai-di/load-testing
```

When done, terminate the held workflows and tear the bridge back down:

```bash
LOAD_TEST_TEMPORAL_SUMMARY_PATH=tools/load-testing/results/temporal-stress50-summary.json \
TEMPORAL_ADDRESS=localhost:${LOCAL_PORT} \
npm run --silent temporal:saturation:cleanup -w @ai-di/load-testing

oc -n <namespace> delete pod temporal-fwd --ignore-not-found
```

Observed in the matrix today (single-replica worker, `cpu=500m memory=512Mi`):

| Run | Started | Failures | Backlog peak | TasksAddRate / DispatchRate |
|---|---|---|---|---|
| 5 starts/s × 60 s | 300 / 300 | 0 | 0 | matched |
| 25 starts/s × 60 s | 1500 / 1500 | 0 | 0 | matched |
| 50 starts/s × 60 s | 3000 / 3000 | 0 | 0 | 29.8 / 29.8 |

`temporal task-queue describe ocr-processing` reported `ApproximateBacklogCount=0` throughout — every workflow task got picked up at the rate it was added. Combined with the earlier datapoint that the **1,278 mock OCR workflows from the upload-ocr matrix runs all reached `Completed` status without intervention**, this is strong evidence that the Temporal worker is **not** the bottleneck for the upload pipeline regression.

## 5. Tear down when finished

```bash
./scripts/oc-login-sa.sh --namespace fd34fb-test
./scripts/oc-teardown.sh --namespace fd34fb-test --instance <instance-name>
```

This deletes labeled resources including PostgresClusters for that instance.

## Operational notes

- **`Deploy Instance`** on **`workflow_dispatch`** still targets the **`dev`** GitHub environment / **`fd34fb-dev`**; this manual path is how you land an extra stack in **`fd34fb-test`** without changing CI.
- Registry paths remain **`${ARTIFACTORY_URL}/kfd3-fd34fb-local/<service>:<tag>`**, identical to CI.
- Overlay placeholders **`DOCUMENT_INTELLIGENCE_MODE`** and **`MOCK_AZURE_OCR`** are substituted by [`scripts/lib/generate-overlay.sh`](../../scripts/lib/generate-overlay.sh); CI defaults stay **`live`** / **`false`** when those flags are omitted.
- The **`minio`** Kustomize component lives at [`deployments/openshift/kustomize/components/minio`](../../deployments/openshift/kustomize/components/minio) and is opt-in. CI’s **`Deploy Instance`** workflow does **not** pass **`--blob-storage-provider minio`**, so it has no effect on the **`bcgov-di-test`** or **`bcgov-di-prod`** stacks.
