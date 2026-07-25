# PR #219 Review — AI-1580 Group Usage Tracking

| | |
|---|---|
| **PR** | [bcgov/ai-adoption-document-intelligence#219](https://github.com/bcgov/ai-adoption-document-intelligence/pull/219) |
| **Author** | @dbarkowsky |
| **Branch** | `AI-1580` → `develop` |
| **Size** | 111 files, +9,866 / −17 |
| **Reviewed** | 2026-07-10, against PR head `a0e49ae0` |

## Overview

The PR introduces a usage-metering and spending-cap system: six new Prisma tables (`rate_versions`, `activity_costs`, `usage_events`, `usage_period_summaries`, `group_billing_configs`, `group_storage_ledger`), a shared `packages/billing` package with a single write-op builder, a rate-version seeder driven by `rate_versions.json`, pre-flight cost estimation (longest-path DP over the workflow DAG) with cap enforcement before OCR/training/classifier submission, a Temporal activity interceptor that records per-activity costs, a nightly storage-charge workflow with month-end archival, blob-storage ledger instrumentation in both apps, usage query/config endpoints, and a billing UI page.

## Verdict

**Request changes.** The architecture is sound — Decimal money columns, a single shared write path with atomic summary increments, consistent UTC period keys, clean service layering, and solid controller auth. But the PR has four defects that break it outright at deploy/runtime (§1.1–1.4), and — more fundamentally for a billing feature — **no idempotency story anywhere**: Temporal activity retries, nightly-job retries, and schedule catch-ups all double-charge, and the cap check provides no actual concurrency protection despite comments and tests claiming it does. The blob ledger cannot represent a key written more than once, which occurs in real flows today.

All Critical and most Major findings below were verified directly against PR-head source (quoted lines checked), not just pattern-matched.

---

## 1. Critical — broken at build, migrate, or first use

### 1.1 Cap check queries a non-existent table — caps cause a full outage for the group
`apps/backend-services/src/billing/preflight-cap-check.service.ts:58-65`

The raw SQL reads `SELECT total_dollars_spent FROM "UsagePeriodSummary" ... FOR UPDATE`, but the model is `@@map("usage_period_summaries")` and the migration creates `CREATE TABLE "usage_period_summaries"`. Postgres raises `relation "UsagePeriodSummary" does not exist` (42P01).

**Failure scenario:** an admin sets *any* cap on a group → every OCR submission, training start, and classifier training for that group (all three call `checkCap`) throws a 500. The cap becomes a denial of service, not a spend limit. The spec mocks `tx.$queryRaw` and only asserts it "was called", so the suite cannot catch this.

### 1.2 Migration enum drifts from schema — training billing inserts fail on migrated DBs
`apps/shared/prisma/migrations/20260630232754_.../migration.sql:2` vs `apps/shared/prisma/schema.prisma`

Migration: `CREATE TYPE "UsageEventType" AS ENUM ('activity_completed', 'workflow_cost', 'model_training_started', 'blob_storage')`. Schema and code use `model_training` (`training.service.ts:586`, `classifier.service.ts:424`). No later migration renames the value.

**Failure scenario:** on any database migrated via `prisma migrate deploy`, recording a training usage event throws `invalid input value for enum "UsageEventType": "model_training"`. `migrate dev` will also report drift and block new migrations. Dev environments presumably used `db push`, masking it. (The classifier spec even betrays the confusion: the test *name* says `model_training_started` while asserting `model_training`.)

### 1.3 Both production Docker images fail to build — `packages/billing` never copied into the production stage
`apps/temporal/Dockerfile` and `apps/backend-services/Dockerfile`

Builder stages `COPY packages/billing /packages/billing` and build it, but both production stages' `COPY --from=builder /packages/...` blocks stop at `/packages/monitoring`. Each production stage then runs `npm install --omit=dev` against a `package.json` declaring `"@ai-di/billing": "file:../../packages/billing"` → resolves to a missing path → npm install fails. Nothing deploys.

### 1.4 Shipped env examples turn month-end archival into "delete the entire billing audit log"
`apps/temporal/src/billing/nightly-storage-charge.activity.ts:185` + both `deployments/openshift/config/*.env.example`

```ts
const retentionDays = Number(process.env.USAGE_EVENT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
```
Both env examples ship `USAGE_EVENT_RETENTION_DAYS=` (empty). `"" ?? 730` is `""`; `Number("")` is `0`; `retentionCutoff = now`. The first month-end archival after an env-file-driven deploy runs `usageEvent.deleteMany({ created_at: { lt: now } })` — purging **all** usage events. Needs `Number(x || default)` or an explicit empty/NaN guard (a NaN value also produces an invalid cutoff). The configmap sets `"730"`, so only env-file deploys hit this — still a loaded gun.

### 1.5 No idempotency anywhere — retries double-bill
`activity-billing-interceptor.ts`, `nightly-storage-charge.activity.ts`, schema `usage_events`

- `usage_events` has **no unique constraint** of any kind; the interceptor ignores `activityInfo().activityId`/`attempt`. If a worker dies or times out after the billing write but before the activity completion is acked, Temporal re-dispatches the activity, it succeeds again, and the group is charged twice (event + summary increment both duplicated).
- The nightly storage charge loops `recordUsageEvent` per group inside one activity with `retry: { maximumAttempts: 3 }` and no existing-charge check. A DB error on group #150 of 200 → retry re-runs the whole loop → groups 1–149 get a second full-day storage charge.

**Fix direction:** deterministic idempotency key (e.g. `(workflow_execution_id, run_id, activity_id)` for interceptor events; `(group_id, 'storage_daily_charge', target_day)` for nightly) backed by a DB unique constraint with ignore-on-conflict.

### 1.6 Storage ledger can't represent a key written twice — silent stale sizes and permanent under-billing
`storage-ledger-db.service.ts` (backend), `storage-ledger.ts` (temporal), schema `group_storage_ledger.blob_key @unique`

Writes use bare `create`; deletes are soft (`deleted_at` set), so the key stays occupied; purge only removes tombstones deleted before the current month.

- **Overwrite** (rewriting `dataset-manifest.json`, re-running extraction that rewrites the same result key, re-uploading a training file): `create` throws P2002 → swallowed into an error log → ledger keeps the stale `size_bytes` and `written_at` forever.
- **Delete-then-rewrite** of the same key within the tombstone's lifetime: the insert hits the unique constraint → the blob physically exists but the ledger says deleted → storage never billed for it again. In the temporal path the ledger insert and the `blob.write` usage event share one `try`, so the billable write event is *also* silently dropped.

Should be an upsert on `blob_key` that resets `deleted_at`/`size_bytes`/`written_at`. No test covers overwrite at all.

### 1.7 With the recommended flag default, the Temporal worker maintains no ledger at all
`apps/temporal/src/blob-storage/blob-storage-client.ts:41-53`

```ts
_ledgerPrisma = CHARGE_FOR_BLOB_TRANSACTION ? prisma : undefined;
```
`CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY` (default off — the PR description recommends leaving it off) was meant to gate *per-transaction charging*, but it also disables all ledger **inventory** maintenance: temporal-written blobs (page PNGs, split segments, normalized PDFs) never enter `GroupStorageLedger` (storage under-billed), and — worse — blobs that backend-services recorded but temporal later deletes are **never tombstoned**, so groups are billed for deleted storage forever. Two unrelated concerns are conflated in one flag; the flag also appears in no env example or doc.

---

## 2. Major

### Cap enforcement

**2.1 The cap check is a TOCTOU no-op — the claimed atomicity doesn't exist.** `preflight-cap-check.service.ts:21-26,44-72`. The transaction is read-only: `FOR UPDATE` + Serializable serialize the *checks*, but nothing is written, the lock is released at commit, and actual spend lands later in separate transactions. Two concurrent starts each estimating $15 against $20 of headroom both pass; N concurrent starts give unbounded overshoot. Also, on the first spend of a month no summary row exists, so `FOR UPDATE` locks nothing. This contradicts REQUIREMENTS.md §4.2/§10 ("no two concurrent workflow starts may both pass"), the code comment, and the Scenario-4 spec, all of which assert protection that isn't there. A real fix needs a reservation write (e.g. increment a committed/estimated column) inside the same transaction — or the docs/comments/tests should be softened to describe the soft cap actually implemented.

**2.2 The flagship upload path swallows the 402 — capped groups get silently stuck documents.** `upload.controller.ts:188-202` + `ocr.service.ts:244-248`. Upload fires OCR with `void ...processOcrForDocument(...).catch(log)`. `requestOcr` deliberately re-throws the 402 *without* updating document status ("the workflow was never submitted") — correct for synchronous callers, but on the upload path the rejection is only logged: the user gets `success: true` and the document sits in its pre-OCR status indefinitely. This is the same stuck-document failure class as the June `ongoing_ocr` incident. The cap UX only works for reprocess/training/classifier.

**2.3 Benchmarks are charged but never cap-checked.** `worker.ts:320-333` installs the billing interceptor on the benchmark worker; `benchmark-temporal.service.ts` starts workflows with no `checkCap`. A group at 100% of cap can incur unbounded spend via benchmarks. Either exempt benchmark queues from the interceptor or cap-check them.

**2.4 Estimation assumptions gut the cap for large documents.** `rate_versions.json` sets `max_pages_assumption: 3` (REQUIREMENTS example: 50). A 100-page document passes the pre-flight check at ~3% of its real per-page cost. (Estimator itself, minor: nested map nodes don't compound the multiplier, the map-body BFS follows *all* edge types including `error` edges, and parallel splits are costed as max-branch rather than sum — the "conservative upper bound" docblock claim is not strictly true.)

### Temporal billing

**2.5 Missed schedule days can never be charged; catch-up runs double-charge one day.** `nightly-storage-charge.workflow.ts`. The target day derives from the workflow clock ("yesterday" at run time), not the scheduled action time or an argument. If the worker is down 2 days, Temporal's catch-up fires the buffered runs on recovery — all compute the *same* "yesterday" (charged 3×) while the two actually-missed days are permanently unbilled. The docblock claims "backfillable", but there is no way to target a past day. Pass the target day in, derived from the schedule's scheduled time.

**2.6 Rate versions are loaded once at worker boot and cached forever.** `worker.ts:277`. A rate change doesn't apply until every worker restarts; if *no* rate version exists at boot, the interceptor factory returns `{}` permanently — billing stays off even after seeding. (The per-blob-op code paths, by contrast, query the rate version on every call — see 3.6; the two extremes should meet at a TTL cache.)

**2.7 Cancelled workflows record no terminal event; the `"cancelled"` branch is dead code.** `graph-workflow.ts` catch block calls the lifecycle activity with `status: "failed"` from inside a cancelled scope — the activity call throws immediately and is swallowed. The adjacent failure-path status hook is guarded with `!cancelled`; the billing call needs the same treatment plus `CancellationScope.nonCancellable` if cancelled runs should be recorded.

**2.8 `updateWorkflowUsageEvent` silently no-ops and lies about its return type.** `usage-event-writer.ts:48-59`. If the anchor `workflow_cost` row is missing (its creation in `ocr.service.ts` is try/catch-warn'd, and other start paths don't create one), `updateManyAndReturn` matches zero rows and `updated[0]` returns `undefined` despite the `Promise<UsageEvent>` signature; the run's total units are silently lost. Nothing enforces the "should give a unique record" comment — duplicates would all be overwritten. Additionally, workflow IDs like `graph-<documentId>` are reused across reruns, so the lifecycle aggregation sums `activity_completed` events across *all* runs of that ID, inflating the terminal total.

### Backend services

**2.9 `getGroupActivityHistory` is an unbounded full scan aggregated in JS.** `usage-query.service.ts:103+`. `findMany({ where: { group_id } })` with no date bound, no pagination — every usage event ever recorded for the group (per-activity, per-document; millions after months of per-page metering) loads into memory on each dashboard render. Use `groupBy`/raw aggregation with a period window. Its response also mixes `workflow_cost` buckets (whose units are the *sum* of the run's activity units) with `activity_completed` buckets — a consumer summing rows reports 2× spend, and the bucket key includes `workflow_version_id` which isn't in the DTO, so distinct buckets can be indistinguishable to the client.

**2.10 Post-spend billing failures are handled three different ways.** After Azure accepts a paid job: `classifier.service.ts:423` awaits `recordUsageEvent` unguarded — a billing DB blip throws before `updateClassifierModel`, leaving the classifier stuck (never marked TRAINING) while Azure runs the paid job; `training.service.ts:585` has the same call inside a try whose catch marks the job FAILED though Azure accepted it; `ocr.service.ts:183-195` wraps in try/catch-warn (fail-open). Pick one policy — after money is spent, billing recording should not fail the operation.

**2.11 Cap mutations record no audit event, and an empty PATCH body silently removes the cap.** `billing-config.service.ts:39-70`, `group.controller.ts:595+`. PR-head CLAUDE.md requires every user-initiated mutation to record an audit event via `AuditService` — setting/removing a spending cap is exactly the mutation needing a trail (`cap_configured_by` is not an audit log). And because `SetBillingCapDto.monthly_cap_dollars` is `@IsOptional()` and the service maps `undefined → null`, `PATCH {}` (or a typo'd field name) clears the cap; a missing field should 400.

**2.12 Seeder is not concurrency-safe across replicas.** `rate-version-seeder.service.ts:33-66`. Check-then-insert with no P2002 handling, and `onApplicationBootstrap` doesn't catch — two replicas booting with a new version in the JSON: the loser crash-loops the pod. Related: `activity_costs` lacks `@@unique([rate_version_id, activity_name])` and the backfill `createMany` omits `skipDuplicates`, so concurrent backfill inserts duplicate cost rows that downstream `find()`s pick arbitrarily.

### Frontend

**2.13 The billing page is visible to everyone but its APIs aren't, and errors are swallowed.** `RootLayout.tsx:157-162`, `BillingPage.tsx`. `GET /groups/:id/billing-config` is `requireSystemAdmin: true` (verified at `group.controller.ts:570`), yet `SpendingCapView` fetches it for every viewer and ignores errors — a **group admin with a real cap sees the "Unlimited" badge** because the 403 is discarded. Regular members get 403s on summary/history rendered as "No billing history available yet." No `isError` handling exists on the page.

### Tests (CLAUDE.md requires tests with backend changes)

**2.14** The suite is shaped around mocks precisely where the defects live: `preflight-cap-check` spec mocks `$queryRaw` (hides 1.1); the `getRunDetail` tests are **commented out** rather than updated (they still assert a removed response shape); `getGroupActivityHistory` (the buggiest query) has zero tests; `record-workflow-lifecycle.activity.ts`, `updateWorkflowUsageEvent`, the nightly workflow's date logic (2.5), schedule creation, OCR cap integration (402 propagation), retention parsing (1.4), ledger overwrite/rewrite (1.6), and interceptor retry semantics (1.5) are all untested. No spec loads the real `rate_versions.json` against its types.

---

## 3. Minor

1. **Float money math throughout.** `units_consumed * unit_cost_dollars` (packages/billing `write.ts`), `gbHours * costPerGbHour`, and the cap comparison `currentSpend + estimatedCostDollars > cap` all run in IEEE-754 before hitting `Decimal(18,8)` columns. Storage rounding absorbs most drift, but the cap boundary can flip on ~1e-16 error; a billing system should compute in `Prisma.Decimal` or integer micro-units, at minimum in the cap comparison and summary increment.
2. **`daysInMonth` mixes local time with UTC.** `nightly-storage-charge.activity.ts:81`: `new Date(y, m+1, 0).getUTCDate()` builds *local* midnight then reads the UTC date — in any TZ ahead of UTC, July yields 30, overcharging every group ~3.3% that month. Use `new Date(Date.UTC(y, m+1, 0)).getUTCDate()`. Containers are usually UTC, which is why it passes today.
3. **Hot-path DB amplification on every blob op in backend-services.** Every `read()` now awaits rate-version lookup + a 2-op transaction (3 sequential roundtrips) before returning; writes add ~4. No caching, no flag (unlike temporal). A slow Postgres stalls every download/page render. Cache the rate version and/or make recording fire-and-forget.
4. **Rate-version lookup semantics:** publishing a new rate version that omits `blob.read`/`blob.write` silently stops that billing even if older versions define it (`findActiveRateVersionWith*Cost` checks only the latest version, despite the name). Same latest-only semantics in the interceptor's map. May be intended; document it.
5. **Overwrite billing differs by app** (backend charges `blob.write` even when the ledger insert fails; temporal drops both — one physical operation, two billing outcomes) and **`deleteByPrefix` ledger behavior differs by provider** (MinIO early-returns on empty list and never tombstones drifted rows; Azure always records).
6. **`group_id` is derived from `key.split("/")[0]` with no FK and no validation** on `usage_events` / `usage_period_summaries` / `group_storage_ledger` — any non-`_shared` key with an unexpected first segment silently creates billing rows for a nonexistent group. Inconsistent with `group_billing_configs`, which does have an FK.
7. **`activityInfo()` inside ledger billing paths** throws outside activity context; in `recordLedgerWrite` the ledger row is already inserted when it throws → inventory without a usage event, error log only.
8. **`_metered_quantity` leaks into workflow history** (`extract-ocr-results.ts` result payload; interceptor reads but doesn't strip). Every future per-page activity must remember this magic field; forgetting it is a silent un-billing (the spec enshrines the silent skip).
9. **`workflow_execution_id` is the workflowId, not runId** — resets/reruns merge costs across runs (compounds 2.8).
10. **Swagger map shape wrong:** `GroupActivityHistoryItemDto.activities` is a `Record<string, ActivityItemDto>` declared as `@ApiProperty({ type: ActivityItemDto })` — generated clients get a single object, not a map. Use `additionalProperties` + `getSchemaPath`. PATCH billing-config also lacks `@ApiBadRequestResponse`.
11. **`usage_percentage` is `null` for a $0 cap**, indistinguishable from "no cap", though `@Min(0)` allows a $0 (maximally restrictive) cap.
12. **`getRunDetail`:** `findFirst` without `orderBy` on a hoped-unique filter; `toNumber() ?? null` is dead code; docblock claims it returns "all usage events" but it returns one row.
13. **Seeder:** `JSON.parse(raw) as RateVersionEntry[]` with zero validation (bad JSON = opaque boot crash); silently ignores changed values on existing versions with no drift warning (correct not to mutate history, but US-017 calls the JSON "authoritative", which is now silently false); no tiebreak on equal `effective_from` (nondeterministic active version).
14. **`useSetBillingCap` invalidates only `["billing-config", groupId]`** — the cap bar reads `monthly_cap_dollars` from the usage summary, which shows the old cap after saving.
15. **`db:migrate` changed from `migrate dev` to `migrate deploy`** in `apps/backend-services/package.json` — unrelated to this PR and changes the local dev workflow.
16. **Behavior change to existing OCR error paths:** `if (error instanceof HttpException) throw error;` now converts "no normalized PDF" / "missing workflow config" from a 200-with-failed-status (document marked failed) into a thrown 400 leaving status untouched. Possibly desirable; unflagged.
17. **Docs drift:** REQUIREMENTS/US-001 specify enum values (`workflow_started`, `workflow_completed/failed/cancelled`, `model_training_started`, `storage_daily_charge`) that don't exist in the schema; §5.3 (terminal state / actual-vs-estimate on run detail) is unimplemented; the `ocr.service` comment "Record workflow_started lifecycle event" records a `workflow_cost` row. `packages/billing` type docs reference the same phantom event types.
18. **Schedule creation failure is warn-only** — a connectivity blip at boot means nightly charging silently never runs.
19. **Billing worker + schedule are unconditional** (benchmark worker has `ENABLE_BENCHMARK_QUEUE`; billing has no equivalent), and `CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY` appears in no env example or doc.

## 4. Nits

- `storage-ledger.ts`: variable named `readCost` in the `blob.write` branch (copy-paste).
- Duplicated/contradictory JSDoc on `getActiveTrainingCosts` (first block claims costs are "not stored in the DB"; the code reads `ActivityCost` rows).
- `20260702203621_add_max_array_items_assumption/migration.sql` carries a pasted comment about trigram GIN indexes irrelevant to its ADD COLUMN.
- `BillingPage.tsx`: stray `defaultValue={"workflow"}` on the *Period* select; breakdown `onChange` falls back to `"all"` which no switch case handles (blank view); `MONTH_NAMES` mixes full names and abbreviations; "Monthly cap (CAD)" label vs "dollars" everywhere else; leftover `maxBarSize={100} // Misleading...` comment. `App.tsx` has a duplicated "Confusion profiles" comment.
- `group.controller.ts:601-603`: `actorId ?? userId ?? "unknown"` writes the literal `"unknown"` into `cap_configured_by`; its spec uses `as any` (forbidden) for the request object; several specs use `as never` casts — technically not `any`, same soundness hole.
- `docs-md/TEMPORAL_WORKER_CONCURRENCY.md` gains billing env docs in an unrelated concurrency doc and references a nonexistent `apps/temporal/.env.sample`.
- Classifier spec test name says `model_training_started` while asserting `model_training` (symptom of 1.2).

## 5. What's good

- **Schema fundamentals are right:** money is `Decimal @db.Decimal(18,8)` (not Float); `usage_period_summaries` has the compound unique that makes the upsert atomic; indexes match the PR's actual read paths.
- **Single shared write path** (`buildUsageEventWriteOps` → transaction with `{ increment }` upsert) is clean, Prisma-native-upsert eligible (no read-modify-write race on the summary), and consistently UTC on both write and read sides.
- **Controller auth is sound:** group-scoped routes use `groupIdFrom` + `minimumRole: ADMIN`, cross-group summary requires system admin, `getRunDetail` re-verifies run ownership in the service. Swagger discipline (specific decorators, dedicated DTOs) is followed apart from 3.10.
- **Workflow determinism handled correctly** (DB work in activities; `Date.now()` only in SDK-virtualized workflow context).
- **Blob error isolation:** ledger/billing failures never break user-facing blob operations; failed uploads are correctly not recorded; `_shared/` exclusion is consistent and tested in both apps.
- No `any` types in production source; happy-path unit coverage of the write-op builder, interceptor, seeder, and config service is genuinely good.

## 6. Recommended path to merge

**Must fix (blocking):** 1.1–1.7, 2.1 (or explicitly re-scope to a documented soft cap and fix the lying comment/spec), 2.2, 2.14 (at minimum: un-mock the cap-check table name, restore `getRunDetail` tests, add overwrite/retry/retention tests).

**Should fix before enabling billing for real groups:** 2.3–2.13, 3.1–3.3.

**Fine as follow-ups:** remaining §3 and §4 items, plus the PR's own open questions (whether Minio-backed storage should be metered, and whether backend-services blob spend should be operator-absorbed — given 1.7 and 3.3, deciding this early would simplify the ledger design).
