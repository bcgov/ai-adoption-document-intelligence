# Usage Metering and Billing

Group-scoped usage metering, cost accrual, and optional monthly spending caps. The
system meters every activity that carries a cost (OCR, classification, enrichment,
model/classifier training, and blob storage), records it against the owning group,
rolls it up into per-month summaries, and can block new work before it starts when a
group is about to exceed a configured cap.

The system is generic: costs are driven entirely by a versioned rate file, not by any
document- or workflow-specific logic.

## At a Glance

| Concern | Where it lives |
| --- | --- |
| Shared write path + arg builder | `packages/billing/` |
| Rate seeding, cost estimation, cap check, usage queries, config | `apps/backend-services/src/billing/` |
| Activity interceptor, nightly storage charge, month-end archival | `apps/temporal/src/billing/` |
| Blob storage ledger instrumentation | `apps/backend-services/src/blob-storage/storage-ledger-db.service.ts`, `apps/temporal/src/blob-storage/storage-ledger.ts` |
| Rate definitions (authoritative input) | `apps/backend-services/src/billing/rate_versions.json` |
| Prisma tables | `apps/shared/prisma/schema.prisma` |
| Billing UI | `apps/frontend/src/pages/BillingPage.tsx` |

## Data Model

Six tables (see `schema.prisma` for the source of truth). Money is stored as
`Decimal @db.Decimal(18,8)`, never float.

- **`rate_versions`** — one row per published rate version (`version`, `effective_from`,
  `unit_cost_dollars`, `units_per_gb_per_month`, and the estimation assumptions
  `max_pages_assumption` / `max_array_items_assumption`).
- **`activity_costs`** — child rows of a rate version: `(rate_version_id, activity_name)`
  unique, with `cost_type` (`flat` | `per_page`) and `units`.
- **`usage_events`** — append-only record of every billable event (`activity_completed`,
  `workflow_cost`, `model_training`, `blob_storage`). Purged after a retention period.
- **`usage_period_summaries`** — per-group, per-month rollup with a compound unique key
  `(group_id, period_year, period_month)` so the summary increment is an atomic upsert.
- **`group_billing_configs`** — the optional monthly cap per group (FK to the group).
- **`group_storage_ledger`** — one row per blob key (`blob_key` unique) tracking
  `size_bytes` / `written_at` / `deleted_at`; the input to the nightly storage charge.

Group ownership is derived from the blob key convention `{groupId}/{category}/...`
(see [Blob storage](../wiki/blob-storage.md)); `_shared/` keys are never billed.

## Rate Versions

`rate_versions.json` is the authoritative input. On backend boot,
`RateVersionSeederService` inserts any version present in the file but missing from the
database, and backfills missing `activity_costs` rows (`skipDuplicates`). Existing
versions are **never mutated** — history is immutable, so a rate change means adding a
**new** version with a later `effective_from`.

Each activity cost is either:

- `flat` — a fixed unit count per activity run (e.g. `azureOcr.submit`), or
- `per_page` — units multiplied by the page count reported by the activity.

Dollar cost = `units × unit_cost_dollars`. Storage cost uses
`units_per_gb_per_month` prorated by GB-hours.

> To change pricing: add a new entry to `rate_versions.json` with a bumped `version`
> and a future `effective_from`, then restart the backend to seed it. Do not edit an
> already-seeded version.

## How Costs Are Recorded

All writes go through a single path — `buildUsageEventWriteOps` in `packages/billing`,
executed as one transaction that inserts the `usage_events` row and applies an
`{ increment }` upsert to the month's `usage_period_summaries` row. Period keys are
always UTC.

- **Temporal activities** — the `ActivityBillingInterceptor` records an
  `activity_completed` event after each billable activity, looking up the active rate
  version per run. Per-page activities report their page count; activities with no cost
  entry are skipped.
- **Model / classifier training** — recorded as `model_training` after Azure accepts the
  job (`training.service.ts`, `classifier.service.ts`). Billing-write failures here are
  logged and do **not** fail the training operation.
- **Blob storage** — the storage ledger tracks inventory; the nightly job converts
  stored bytes into `blob_storage` charges (see below).

## Spending Caps (Pre-flight Check)

When a group has a `monthly_cap_dollars` set, cost-incurring entry points estimate the
job cost first and block it if the group's current-period spend plus the estimate would
exceed the cap:

- OCR submission (`ocr.service.ts`) — a blocked document is marked `failed` and a
  `402` is raised.
- Model training and classifier training.

Cost estimation (`preflight-cost-estimator.service.ts`) walks the workflow DAG and sums
the longest cost path, applying `max_pages_assumption` / `max_array_items_assumption`
for per-page and fan-out nodes.

> **The cap is a soft cap, not a hard reservation.** The pre-flight check reads current
> spend and compares; it does not reserve budget. Concurrent starts can each pass the
> check and collectively exceed the cap, and jobs that use more pages than the
> assumption can overshoot. See [Known Limitations](#known-limitations).

## Storage Charging

- Every blob write/delete updates `group_storage_ledger` (upsert on `blob_key`, so
  re-writing a key refreshes size and clears any tombstone; deletes set `deleted_at`).
- A Temporal **schedule** (`nightlyStorageChargeWorkflow`, cron `5 0 * * *` — 00:05 UTC
  daily) charges each group for the previous day's stored bytes as a `blob_storage`
  event.
- **Month-end archival** purges `usage_events` older than the retention window
  (default 730 days) while preserving the `usage_period_summaries` rollups.

## Configuration

### Environment variables

| Variable | Applies to | Default | Purpose |
| --- | --- | --- | --- |
| `CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY` | temporal | `false` | When `true`, Temporal records a per-transaction `blob.write`/`blob.read` charge in addition to activity costs. Recommended `false`: lump blob cost into activity unit costs. |
| `BILLING_TASK_QUEUE` | temporal | `billing-maintenance` | Task queue for the nightly storage charge and archival workflows. |
| `USAGE_EVENT_RETENTION_DAYS` | temporal | `730` | Retention window for `usage_events` before month-end archival purges them. A blank/`0`/invalid value falls back to the default (guards against wiping the audit log). |

> **Known drift:** `.env.sample` currently lists this flag as `CHARGE_FOR_BLOB_TRANSACTION`
> (no value), but the code reads `CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY`. Use
> the code name. Tracked in [wiki/open-questions.md](../wiki/open-questions.md).

### Setting a spending cap

`PATCH /api/groups/:groupId/billing-config` — group **ADMIN** (or system admin).

```jsonc
{ "monthly_cap_dollars": 250.00 }   // set/raise the cap
{ "monthly_cap_dollars": null }     // remove the cap (unlimited)
```

The mutation runs in a transaction that also writes a `billing_cap_update` audit event.
In the UI, admins manage this from the **Billing** page (`SpendingCapView`); the Billing
nav item and page are hidden/redirected for non-admins.

## API

All routes are group-scoped (`minimumRole: ADMIN`) unless noted. Base prefix `/api`.

| Method & path | Access | Purpose |
| --- | --- | --- |
| `GET /usage/summary` | system admin | Cross-group current-period spend. |
| `GET /usage/groups/:groupId/summary` | group admin | Current-period spend, cap, and `usage_percentage`. |
| `GET /usage/groups/:groupId/history` | group admin | Per-month spend history. |
| `GET /usage/groups/:groupId/activity-history?startDate&endDate` | group admin | Per-activity breakdown (optional date window). |
| `GET /usage/groups/:groupId/runs/:workflowExecutionId` | group admin | Cost detail for a single run. |
| `GET /usage/rate-versions` | authenticated | List rate versions. |
| `GET /usage/rate-versions/:versionId/activity-costs` | authenticated | Activity costs for a rate version. |
| `GET /api/groups/:groupId/billing-config` | group-scoped | Read the group's cap. |
| `PATCH /api/groups/:groupId/billing-config` | group admin | Set or clear the cap. |

## Known Limitations

These are current, intentional-or-tracked gaps. Update this section as they are closed;
contradictions with the pre-implementation spec are tracked in
[wiki/open-questions.md](../wiki/open-questions.md).

- **Cap is soft (TOCTOU).** The pre-flight check does not reserve budget, so concurrent
  starts can collectively exceed the cap. The `feature-docs` REQUIREMENTS still describe
  it as "atomic"; the shipped behavior is a soft cap.
- **No idempotency on retries.** `usage_events` has no idempotency key; a Temporal
  activity retry after a completed billing write, or a nightly-job retry, can double-charge.
- **Benchmarks are metered but not cap-checked.** Benchmark workflows can accrue cost
  past a cap.
- **Page-assumption undercount.** `max_pages_assumption` (currently `3`) means large
  documents pass the pre-flight check well under their real per-page cost.
- **Temporal write-inventory gating.** With `CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY`
  off (the recommended default), Temporal-written blobs are not added to the storage
  ledger, so storage can be under-counted; deletes are always tombstoned regardless.

## Related

- [Blob storage](../wiki/blob-storage.md) — key scheme and provider abstraction the
  ledger builds on.
- [Auth and groups](../wiki/auth-and-groups.md) — group scoping and role checks used by
  the cap endpoints.
- [Audit](AUDIT.md) — the `billing_cap_update` audit event.
- Pre-implementation context: `feature-docs/20260629185435-usage-metering-billing/`
  (REQUIREMENTS, ARCHITECTURE, user stories) — historical, not current-behavior.
