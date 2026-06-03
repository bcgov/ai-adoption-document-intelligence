# Load Test Stress Run Sheet

This run sheet extends the baseline load tests with a repeatable stress matrix.
Run only in a disposable environment.

## Scope

- Upload OCR throughput (`load-test:k6:upload-ocr`)
- Payload-size throughput (`load-test:k6:payload-sizes`)
- Blob storage pressure (`load-test:k6:blob-storage`)
- Document list pressure (`load-test:k6:documents`)
- Benchmark dataset reads (`load-test:k6:datasets`)
- Review/HITL pressure (`load-test:k6:review-hitl`)
- Temporal queue saturation (`load-test:temporal:saturation`)

## Preconditions

1. Backend is reachable and healthy.
2. Temporal frontend and worker are reachable for workflow tests.
3. Mock-mode settings are enabled where applicable:
   - backend `DOCUMENT_INTELLIGENCE_MODE=mock`
   - worker `MOCK_AZURE_OCR=true`
4. Required vars are set for your disposable target:
   - `LOAD_TEST_API_KEY`
   - `LOAD_TEST_GROUP_ID`
   - `LOAD_TEST_WORKFLOW_VERSION_ID`
   - `LOAD_TEST_BLOB_CLASSIFIER_NAME`
   - `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, `TEMPORAL_TASK_QUEUE`

## Common environment template

Run from repo root:

```bash
export LOAD_TEST_API_KEY="<api-key>"
export LOAD_TEST_GROUP_ID="seed-default-group"
export LOAD_TEST_WORKFLOW_VERSION_ID="<workflow-version-id>"
export LOAD_TEST_BLOB_CLASSIFIER_NAME="<classifier-name>"
export LOAD_TEST_MODEL_ID="mistral-ocr-latest"
export LOAD_TEST_BODY_LIMIT="50mb"
```

## Phase 0: Baseline capture (quick confirmation)

Use these only to verify environment parity before stress tiers:

```bash
npm run load-test:k6:smoke
npm run load-test:k6:datasets
npm run load-test:k6:documents
npm run load-test:k6:upload-ocr
npm run load-test:k6:blob-storage
npm run load-test:k6:review-hitl
npm run load-test:temporal:saturation
```

## Phase 1: Single-axis step-up matrix

Increase one variable at a time and keep others fixed.

### A. Concurrency axis (VUs)

Use durations long enough to expose queuing:
- 60s for first pass
- 300s for confirmation

```bash
# Upload OCR
for V in 1 5 10 20; do
  LOAD_TEST_VUS="$V" LOAD_TEST_DURATION="60s" LOAD_TEST_SLEEP_SECONDS=0 npm run load-test:k6:upload-ocr
done

# Blob pressure
for V in 1 5 10; do
  LOAD_TEST_VUS="$V" LOAD_TEST_DURATION="60s" LOAD_TEST_SLEEP_SECONDS=0 npm run load-test:k6:blob-storage
done

# Documents list
for V in 2 10 25; do
  LOAD_TEST_VUS="$V" LOAD_TEST_DURATION="300s" npm run load-test:k6:documents
done
```

### B. Payload axis

```bash
# Upload payload tiers
for T in small medium large; do
  LOAD_TEST_PAYLOAD_SIZE_TIER="$T" LOAD_TEST_VUS=5 LOAD_TEST_DURATION="60s" LOAD_TEST_SLEEP_SECONDS=0 npm run load-test:k6:payload-sizes
done

# Blob explicit payload bytes (1 MiB, 5 MiB)
for B in 1048576 5242880; do
  LOAD_TEST_BLOB_PAYLOAD_BYTES="$B" LOAD_TEST_VUS=5 LOAD_TEST_DURATION="60s" LOAD_TEST_SLEEP_SECONDS=0 npm run load-test:k6:blob-storage
done
```

### C. Work-per-iteration axis

```bash
# Blob files per iteration
for F in 1 3 5; do
  LOAD_TEST_BLOB_FILES_PER_ITER="$F" LOAD_TEST_VUS=5 LOAD_TEST_DURATION="60s" LOAD_TEST_SLEEP_SECONDS=0 npm run load-test:k6:blob-storage
done

# HITL queue limit
for L in 20 50 100; do
  LOAD_TEST_HITL_QUEUE_LIMIT="$L" LOAD_TEST_VUS=2 LOAD_TEST_DURATION="120s" LOAD_TEST_SLEEP_SECONDS=0 LOAD_TEST_HITL_SESSION_MODE=skip npm run load-test:k6:review-hitl
done
```

### D. Think-time axis

Compare max-pressure versus user-like pacing:

```bash
for S in 0 0.2 1; do
  LOAD_TEST_SLEEP_SECONDS="$S" LOAD_TEST_VUS=10 LOAD_TEST_DURATION="120s" npm run load-test:k6:upload-ocr
done
```

## Phase 2: Temporal queue saturation ramp

Run with cleanup on for iterative testing. If you need backlog inspection,
set `LOAD_TEST_TEMPORAL_CLEANUP=false` and run cleanup afterward.

```bash
for R in 5 10 20; do
  LOAD_TEST_TEMPORAL_RATE_PER_SECOND="$R" LOAD_TEST_TEMPORAL_DURATION_SECONDS=300 LOAD_TEST_TEMPORAL_CLEANUP=true npm run load-test:temporal:saturation
done
```

Optional backlog-preserving pass:

```bash
LOAD_TEST_TEMPORAL_RATE_PER_SECOND=20 \
LOAD_TEST_TEMPORAL_DURATION_SECONDS=300 \
LOAD_TEST_TEMPORAL_CLEANUP=false \
npm run load-test:temporal:saturation

npm run load-test:temporal:saturation:cleanup
```

## Stop conditions

Stop a tier when one or more of these is sustained:

- HTTP failure rate rises above scenario threshold.
- p95/p99 latency step-changes upward between adjacent tiers.
- Temporal schedule-to-start latency keeps rising without draining.
- Worker/backend pods approach limits (CPU pinned, memory pressure, restarts).
- Storage backend throttling or persistent queue growth appears.

## What to record per tier

1. Test command and parameter values.
2. Summary artifact path under `tools/load-testing/results/`.
3. `http_req_failed`, p95/p99 latency, throughput (`http_reqs` or iterations/s).
4. Pod CPU/memory/restarts.
5. Temporal queue backlog and schedule-to-start latency (for workflow tests).
6. Any saturation or failure onset point.

## Suggested naming convention

Use deterministic run IDs for traceability:

```bash
export LOAD_TEST_RUN_ID="stress-<scenario>-$(date +%Y%m%d%H%M%S)-vus<value>-tier<value>"
```

## Cleanup checklist

1. Keep blob cleanup enabled unless preserving artifacts intentionally.
2. Run Temporal cleanup if any saturation run used `LOAD_TEST_TEMPORAL_CLEANUP=false`.
3. Remove synthetic seeded rows when done:

```bash
npm run load-test:seed -- --delete-by-prefix --count=0 --group-id="$LOAD_TEST_GROUP_ID"
```
