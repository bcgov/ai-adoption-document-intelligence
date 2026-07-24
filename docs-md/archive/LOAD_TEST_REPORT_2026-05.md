# Load Test Report — May 2026

Disposable OpenShift instance **`loadtest-1`** in **`fd34fb-dev`**, May 8 – May 11 2026.
Branch **`AI-1209`**. Backend image built from that branch with mock OCR + mock document-intelligence + in-cluster MinIO.

The full per-run dataset lives in [`tools/load-testing/test-matrix.csv`](../tools/load-testing/test-matrix.csv) (38 rows). Operator-facing playbook and findings notes are in [`docs-md/openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md`](./openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md).

## Executive summary

Every k6 scenario in [`tools/load-testing/k6/`](../tools/load-testing/k6/) plus the Temporal start-rate harness was exercised at multiple VU counts and payload sizes. The system **passed thresholds on every read-only scenario at every VU count tested** and **passed all Temporal start-rate scenarios up to 50 starts/s**, but **five product issues** were discovered that either block real-world load or silently degrade it. One of the five (Prisma connection pool = 3) is a **system-wide** ceiling that caps every backend route at roughly **7 requests per second per pod** regardless of how the pod is sized.

Recommended action: land five small source-code fixes (each scoped to a single ticket below) before claiming the platform is ready for production-scale load.

## Scope and method

| Scenario | k6 / harness file | Tests |
|---|---|---|
| `smoke` | `k6/smoke.js` | Single-VU health probe of read endpoints |
| `datasets` | `k6/datasets-list.js` | Paginated dataset listing throughput |
| `documents` | `k6/documents-list.js` | Full-table document listing throughput |
| `upload-ocr` | `k6/upload-ocr-workflow.js` | End-to-end upload + Temporal start path |
| `payload-sizes` | `k6/payload-sizes-upload-ocr.js` | Same path with 256 KB / 1 MB / 5 MB PDFs |
| `blob-storage` | `k6/blob-storage-pressure.js` | Classifier-document multipart upload pressure |
| `review-hitl` | `k6/review-hitl-apis.js` | HITL queue + session APIs, with seeded fixtures |
| `temporal:saturation` | `temporal-queue-saturation.ts` | Direct gRPC workflow-start pressure on Temporal frontend |

Methodology:

- Each scenario was run at 1 VU as a baseline, then escalated (typically to 5 and 10 VUs) to find the saturation point.
- Backend `THROTTLE_GLOBAL_LIMIT` was raised from **100/min** (prod default) to **1,000,000/min** on the load-test instance to remove the throttler from the measurement window.
- Each row in the matrix records `req/s`, `failure_rate`, `p50/p95/max latency`, threshold pass/fail, and human-readable notes.
- Synthetic fixtures (workflow version, classifier name, HITL-eligible documents) are provisioned idempotently by [`tools/load-testing/setup-fixtures.sh`](../tools/load-testing/setup-fixtures.sh) and [`tools/load-testing/seed-hitl-fixtures.ts`](../tools/load-testing/seed-hitl-fixtures.ts).

## Headline results

Selected rows from the matrix (full data in CSV). Pod resources are unchanged from CI defaults: `cpu=500m`, `memory=512Mi`.

| Scenario | VUs / config | req/s | p50 | p95 | failure | Notes |
|---|---|---|---|---|---|---|
| `smoke` | 1 VU × 60 s | **6.18** | 117 ms | 162 ms | 0 % | Stable across sessions |
| `datasets` | 1 VU × 60 s, 100k seeded | **7.87** | 466 ms | 892 ms | 0 % | Post-throttle-fix baseline |
| `documents` | 1 VU × 60 s, 100k seeded | 0.092 | 10.6 s | 10.9 s | 0 % | Full-table read, ~50 MB response |
| `upload-ocr` | 1 VU × 60 s, 256 KB PDF | **0.82** | 194 ms | 301 ms | 0 % | Clean-state baseline |
| `upload-ocr` | 10 VU × 60 s, 256 KB PDF | **5.97** | 602 ms | 1.09 s | 0 % | Scales linearly until 10 VU |
| `payload-sizes` | 5 VU × 60 s, **5 MB PDF** | 1.61 | 1.93 s | 2.76 s | **73 %** | OOMKills the backend pod |
| `blob-storage` | 1 VU × 60 s, 256 KB blob | 1.20 | 141 ms | 265 ms | **20.6 %** | Multipart >64 KB → HTTP 500 |
| `review-hitl` | 1 VU × 60 s, skip mode | **7.49** | 116 ms | 198 ms | 0 % | 1,000 fixtures seeded |
| `review-hitl` | 10 VU × 60 s, reads only | 6.34 | 1.50 s | 2.42 s | 0 % | **Throughput flat 1→10 VU** |
| `temporal:saturation` | 50 starts/s × 60 s | **50.0** | n/a | n/a | 0 % | 3,000 / 3,000 started, 0 backlog |

Key observations:

1. **Single-pod read ceiling is ~7 req/s** regardless of VUs or scenario. `datasets`, `review-hitl` (skip), and `review-hitl` (off) all converge on the same number from different code paths — that's the Prisma pool, not the routes (see Finding #1).
2. **Temporal is the only consumer that scales linearly**. The single worker pod drained at exactly the rate we fed it (29.8 tasks/s observed at 50 starts/s) and the 1,278 OCR workflows we queued via `upload-ocr` runs all reached `Completed` status without intervention. Worker is **not** the bottleneck on this stack.
3. **The write path falls over before the read path does.** `payload-sizes large × 5 VU` and the classifier multipart endpoint both produce confirmed failure modes at modest load, while every read scenario merely slows down.

## Findings

### Finding 1 — Prisma `connection_limit` defaults to 3 in this pod

Holistic ceiling: backend reads max out at ~7 req/s per pod even though the pod is at 50 % CPU and Postgres has 99 idle connection slots.

**Evidence.** `review-hitl` reads-only mode, 1,000 seeded fixtures, four read endpoints per iteration:

| VUs | req/s | p50 | p95 |
|---|---|---|---|
| 1 | 6.76 | 126 ms | 268 ms |
| 5 | 6.36 | 710 ms | 1.20 s |
| 10 | 6.34 | 1.50 s | 2.42 s |

Throughput flat, latency linear — the signature of a fixed-size pool with an unbounded queue. Backend pod healthy (0 restarts, ~50 % CPU, ~53 % memory), Postgres `max_connections=100` with ~1 active connection during the test. The Prisma default is `num_physical_cpus * 2 + 1`, which evaluates to **3** in a 500 m container reporting 1 logical CPU to Node.

### Finding 2 — Backend OOMKilled by concurrent large uploads

`payload-sizes large × 5 VU` (5 MB raw PDF, ~7 MB JSON body) triggers a backend pod restart with `Last State: Terminated · Reason: OOMKilled · Exit Code: 137`. During the restart window the router returns HTTP 502 / 503 to all clients and the smoke scenario fails too. `large × 1 VU` runs cleanly; the failure is concurrency-induced memory pressure (each request holds at minimum the JSON parse buffer + `Buffer.from(b64,'base64')` + `pdf-lib` workspace simultaneously).

### Finding 3 — Classifier multipart upload returns HTTP 500 above ~64 KB

`POST /api/azure/classifier/documents` (in [`apps/backend-services/src/azure/azure.controller.ts:223`](../apps/backend-services/src/azure/azure.controller.ts)) uses `@UseInterceptors(FilesInterceptor("files"))` with no explicit limits. Curl confirms: ≤64 KB → HTTP 201, ≥96 KB → HTTP 500 in under 250 ms (consistent with a multer `LIMIT_FILE_SIZE` rejection that the controller surfaces as a generic 500). Sibling dataset endpoint in `apps/backend-services/src/benchmark/dataset.controller.ts:222` sets `limits: { fileSize: 100 * 1024 * 1024 }` explicitly. List / delete endpoints on the same controller are unaffected.

### Finding 4 — Upload path latency degrades ~20× after an OOM event and doesn't recover

The same `POST /api/upload` that ran at p50 ~190 ms / p95 ~300 ms on a clean instance ran at p50 ~3.8 s later in the session, after two OOMKills induced by Finding #2. `oc rollout restart` does **not** restore baseline, ruling out V8 heap accumulation. Read-only scenarios re-tested at baseline post-rollout, confirming the regression is **isolated to the upload pipeline**. The upload service performs two **sequential** MinIO writes (`original.<ext>` then `normalized.pdf`) plus a `pdfNormalization.normalizeToPdf()` step ([`apps/backend-services/src/document/document.service.ts:139,153`](../apps/backend-services/src/document/document.service.ts)) — all on the same request path, all single-threaded.

### Finding 5 — In-cluster MinIO PVC fills up after ~1,500 documents

After ~1,500 documents uploaded across `upload-ocr` and `payload-sizes` runs (256 KB – 5 MB), `POST /api/upload` returns HTTP 400 with `Storage backend has reached its minimum free drive threshold`. The default PVC size in [`deployments/openshift/kustomize/components/minio/pvc.yml`](../deployments/openshift/kustomize/components/minio/pvc.yml) is **2 Gi** (override via `MINIO_PVC_SIZE` / `--minio-pvc-size`). The `netapp-file-standard` storage class supports online expansion (used during this session to grow `loadtest-1-minio` from 2 Gi → 6 Gi), but the namespace `storage-quota` (64 Gi total in `fd34fb-dev`) constrains how far you can grow without operations work.

### Operational note — Temporal frontend rejects `oc port-forward`

Helm chart for `temporalio/server:1.28.1` binds frontend gRPC to the **pod IP**, not loopback. Plain `oc port-forward svc/<instance>-temporal 7233:7233` fails with `dial tcp [::1]:7233: connect: connection refused`. Workaround documented in [MANUAL_LOAD_TEST_INSTANCE.md](./openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md): spin up an `alpine/socat` bridge pod in the same namespace and forward to that. Not a product bug per se — just friction for anyone testing Temporal outside the cluster.

## Recommended Jira tickets

Each ticket below is scoped to a single source-code change and has explicit acceptance criteria expressed against the existing load-test matrix.

---

### AI-XXXX — Configure Prisma connection pool to match backend pod capacity

- **Type**: Bug
- **Priority**: Highest (P1)
- **Components**: `apps/backend-services`, `deployments/openshift`
- **Linked finding**: #1

**Problem.** The backend's effective read throughput is capped at ~7 req/s per pod regardless of how many concurrent clients are connected, because Prisma's connection pool defaults to `num_physical_cpus * 2 + 1` (= 3 in the current 500 m container). Postgres has 100 idle connection slots and the pod sits at 50 % CPU during the saturation. The ceiling applies to **every backend route**, not just HITL — it just happens to be most visible on `review-hitl` because it fires four queries per iteration.

**Reproduce.** With `LOAD_TEST_HITL_SESSION_MODE=off` and 1,000 HITL fixtures seeded, run `review-hitl` at 1 / 5 / 10 VUs. Throughput stays flat at ~6.4 req/s; p95 latency multiplies with VU count.

**Fix.** Set Prisma's `connection_limit` explicitly:

- Easiest: append `?connection_limit=<N>` to `DATABASE_URL` in [`deployments/openshift/kustomize/base/backend-services/configmap.yml`](../deployments/openshift/kustomize/base/backend-services/configmap.yml). Sized to (a) what the pod can drive given its CPU budget and (b) Postgres `max_connections` / number of backend replicas.
- Better: parameterise via a new `DATABASE_POOL_SIZE` env var with a sane default (e.g. **20** for the current 500 m / 512 Mi pod) and override in [`deployments/openshift/config/dev.env.example`](../deployments/openshift/config/dev.env.example) and `prod.env.example`. Compute it from `resources.requests.cpu` if you want it to scale with pod size.

**Acceptance criteria.**

1. With the new pool size, `review-hitl` reads-only at 10 VUs achieves **≥ 4× the 1-VU throughput** (current scaling factor: 0.94×).
2. `datasets` at 5 / 10 VUs scales similarly (regression check against the post-throttle-fix 1-VU baseline of 7.87 req/s).
3. `smoke` baseline latency does not regress.
4. The new env var is documented in [`docs-md/openshift-deployment/ENVIRONMENT_CONFIGURATION.md`](./openshift-deployment/ENVIRONMENT_CONFIGURATION.md).

---

### AI-XXXX — Add `fileSize` limit to classifier multipart upload

- **Type**: Bug
- **Priority**: High (P2)
- **Components**: `apps/backend-services`
- **Linked finding**: #3

**Problem.** `POST /api/azure/classifier/documents` returns HTTP 500 for any file > ~64 KB. Curl: 64 KB → 201, 96 KB → 500 in <250 ms. Failure rate on `blob-storage` baseline at 256 KB blobs is **20.6 %**.

**Fix.** In [`apps/backend-services/src/azure/azure.controller.ts:223`](../apps/backend-services/src/azure/azure.controller.ts), change:

```ts
@UseInterceptors(FilesInterceptor("files"))
```

to:

```ts
@UseInterceptors(FilesInterceptor("files", { limits: { fileSize: 100 * 1024 * 1024 } }))
```

Match the limit used in [`apps/backend-services/src/benchmark/dataset.controller.ts:222`](../apps/backend-services/src/benchmark/dataset.controller.ts). Optionally surface a 413 instead of 500 when the limit is exceeded.

**Acceptance criteria.**

1. `curl -F files=@<1MB.pdf>` against the classifier endpoint returns 201.
2. `blob-storage` scenario at 1 VU / 256 KB blobs reports 0 % failure (current: 20.6 %).
3. Files > 100 MB return HTTP 413 (not 500).

---

### AI-XXXX — Parallelize and stream the document upload write path

- **Type**: Bug / performance
- **Priority**: High (P2)
- **Components**: `apps/backend-services`
- **Linked findings**: #2 + #4

**Problem.** `POST /api/upload` (a) holds the full request buffer in memory twice (b64-decoded body + pdf-lib workspace), which OOMs the pod at concurrent 5 MB payloads, and (b) does two **sequential** `blobStorage.write()` calls and a synchronous `pdfNormalization.normalizeToPdf()` call. After two OOM events, p50 stays at ~3.8 s indefinitely.

**Reproduce.** Run `payload-sizes` at `large × 5 VU` — backend pod is OOMKilled (`Exit Code: 137`) and the pod returns HTTP 502 / 503 for 30 – 60 s; failure rate on the run reaches 73 %. After the restart, baseline `upload-ocr × 1 VU × 256 KB` p50 is ~20× higher than before.

**Fix.**

1. **Parallelize the two blob writes** in [`apps/backend-services/src/document/document.service.ts:139,153`](../apps/backend-services/src/document/document.service.ts) via `Promise.all`. Both writes are independent (one is the original bytes, one is the normalized PDF).
2. **Stream the upload** through pdf-lib instead of holding the b64-decoded body in memory across the whole request lifecycle. Specifically, pipe the multipart stream directly into `pdfNormalization.normalizeToPdf` so the original buffer can be GC'd before the second blob write begins.
3. **Optional cap**: a per-controller semaphore (e.g. `bottleneck` or `p-limit`) bounding concurrent upload normalizations to `Math.max(2, cpus)` so memory pressure can't OOM the pod regardless of VU count.

**Acceptance criteria.**

1. `payload-sizes` at `large × 5 VU × 60 s` completes with **< 5 % failure rate** (current: 73 %).
2. Backend pod `restartCount` is 0 after the run.
3. `upload-ocr` baseline at 1 VU / 256 KB / clean instance returns to p50 ≤ 250 ms.
4. `upload-ocr` baseline still hits the same p50 on a "warm" instance (one that has already run a `payload-sizes large × 5 VU` round) — i.e. no post-OOM regression.

---

### AI-XXXX — Right-size MinIO PVC default and add cleanup tooling

- **Type**: Task
- **Priority**: Medium (P3)
- **Components**: `deployments/openshift`, `tools/load-testing`
- **Linked finding**: #5

**Problem.** The current 2 Gi default in [`deployments/openshift/kustomize/components/minio/pvc.yml`](../deployments/openshift/kustomize/components/minio/pvc.yml) fills up after ~1,500 documents in mixed-size load runs. MinIO returns HTTP 400 with `Storage backend has reached its minimum free drive threshold`. Manual PVC expansion is gated by the namespace `storage-quota` (64 Gi total in `fd34fb-dev`), so operators can't always self-serve.

**Fix.**

1. Raise the kustomize default to **8 Gi** in [`deployments/openshift/config/dev.env.example`](../deployments/openshift/config/dev.env.example) (currently 2 Gi) and the `prod.env.example`, with comment noting the namespace quota interaction.
2. Ship `tools/load-testing/cleanup-blobs.sh` that lists object prefixes by group and deletes blobs older than N hours via the existing AWS S3 SDK path — so a long-running load-test instance can be reset without redeploying.
3. Document both the size knob and the cleanup script in [MANUAL_LOAD_TEST_INSTANCE.md](./openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md) (the size note is already there; the cleanup script is not yet implemented).

**Acceptance criteria.**

1. A fresh `loadtest-1` instance deploys with a MinIO PVC ≥ 8 Gi.
2. `cleanup-blobs.sh --group <id> --older-than 1h` removes load-test blobs and reports total bytes freed.
3. CI deploy workflow still passes with the new default (i.e. doesn't bust the test namespace quota).

---

### AI-XXXX — Make Temporal frontend reachable via `oc port-forward`

- **Type**: Task
- **Priority**: Low (P4)
- **Components**: `deployments/openshift/kustomize/base/temporal`
- **Linked finding**: Operational note

**Problem.** The Temporal frontend binds to the pod IP only (`10.97.x.x:7233`), not loopback, so `oc port-forward svc/<instance>-temporal 7233:7233` always fails with `connect: connection refused`. Today's workaround is a one-pod `alpine/socat` bridge; that works but is awkward to discover.

**Fix.** Either (a) patch the Temporal deployment manifest in [`deployments/openshift/kustomize/base/temporal/`](../deployments/openshift/kustomize/base/temporal/) to set `frontendIPAddress: 0.0.0.0` (or whatever the equivalent `temporalio/server:1.28.1` env / dynamic-config key is — check `temporal/server` chart values for the bind-address override), or (b) ship a small `tools/load-testing/temporal-port-forward.sh` that wraps the socat-bridge dance.

**Acceptance criteria.**

1. From the workstation: `oc port-forward svc/<instance>-temporal 7244:7233` succeeds and `temporal:saturation` connects without a bridge pod.
2. Existing in-cluster workers continue to connect (no regression on the worker pod's outbound).

---

## What was not tested

These are explicitly out of scope for this round; flagging them so they're not surprises later:

- **Live Azure Document Intelligence calls.** Tests ran with `DOCUMENT_INTELLIGENCE_MODE=mock` and `MOCK_AZURE_OCR=true`. Real-Azure throughput is gated by an external rate limit (~5 RPS on the standard tier) that the in-process mock cannot reproduce.
- **Auth / SSO under load.** The throttler was deliberately raised; the `THROTTLE_AUTH_*` limits were not stressed.
- **Multi-pod horizontal scaling.** The backend deployment ran with `replicas=1` throughout. Findings #1 and #4 may have different shapes at `replicas=3+`.
- **Frontend load.** Only the backend API surface and Temporal were exercised; no Playwright / browser-side runs.
- **Stress runs longer than 60 s.** All scenarios used 60 s windows. Some failure modes (PG autovacuum thrashing, MinIO compaction) may only show up after 30+ minutes of sustained load.
- **Failover.** No primary-DB failover, no MinIO node loss, no Temporal frontend restart during a run.

A follow-up suite that re-runs the matrix after AI-XXXX (Prisma pool) and AI-XXXX (upload streaming) merge is recommended; the post-fix numbers will be the first defensible "production-ready" baseline.
