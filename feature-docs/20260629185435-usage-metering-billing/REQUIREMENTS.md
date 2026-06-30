# Usage Metering & Billing Requirements

**Feature slug**: `usage-metering-billing`  
**Created**: 2026-06-29  
**Status**: Ready for User Story authoring

---

## 1. Overview

This feature introduces a lightweight but comprehensive usage metering system that tracks the cost of OCR and workflow processing per group, enabling accurate client billing. Costs are denominated in an abstract "unit" that converts to dollars via a versioned exchange rate, allowing pricing to be adjusted without schema changes. The system also tracks Azure blob storage costs as a separate ongoing cost dimension.

The system must support:
- Accurate per-workflow-run cost attribution
- Group-level monthly spending caps enforced at workflow start
- Self-serve usage dashboards for group admins and a platform-wide view for platform admins
- Forward-only tracking from the implementation date (no historical backfill)

---

## 2. Key Concepts

### 2.1 Billing Unit

All costs are expressed in an abstract **unit**. A unit has no inherent dollar value — its dollar equivalent is determined by the active **Rate Version** at the time of the event.

This decouples the cost model from pricing decisions:
- Changing the unit-to-dollar conversion rate does not require changing activity cost definitions.
- Historical records retain the rate version used, so invoices can always be reproduced.

### 2.2 Cost Categories

There are three independent cost categories:

| Category | Description | Trigger |
|----------|-------------|---------|
| **Activity Cost** | Units consumed per completed Temporal workflow activity | Per activity completion within a workflow run |
| **Storage Cost** | Units consumed per GB-hour of blob storage per group | Nightly job reads the storage ledger, computes GB-hours for the day, and records a charge event |
| **Training Cost** | Units consumed when a model training run is initiated | Explicit event recorded at training start, for both template models and classifiers |

### 2.3 Rate Version

A `RateVersion` record defines:
- A semantic version string (e.g., `"1.0.0"`)
- An effective date (`effective_from`)
- A `unit_cost_dollars` value — the dollar cost of a single unit (e.g. `0.001` means 1 unit = $0.001, so 1000 units = $1.00). Dollar totals are calculated as `units_consumed × unit_cost_dollars`.
- A `cost_per_gb_units_per_month` value for storage cost per GB per month (operators set this; the nightly job derives the hourly rate at calculation time as `monthly / (days_in_month × 24)`)
- A `max_pages_assumption` for pre-flight estimation of per-page activities

Rate versions are append-only. The active rate version at any point in time is the version with the highest `effective_from` date that is ≤ the event timestamp.

**Source of record**: A `rate_versions.json` file committed to the repository defines all rate versions. On application startup, the backend checks for versions in the file that do not yet exist in the database and inserts them. The database is the live source of truth; the JSON file is the authoritative record for auditing and deploying new rate versions.

---

## 3. Activity Cost Configuration

### 3.1 Global Activity Cost Table

Each Temporal activity type is mapped to a cost entry. The mapping key is the **activity function name** as registered in Temporal (matching keys in `ActivityRegistryEntry`, e.g. `"azureOcr.extract"`, `"enrichment.run"`).

- Costs are **global** — all workflows that invoke the same activity pay the same rate.
- There are no per-workflow or per-group overrides.
- The activity cost table is part of the `RateVersion` — each version can change any activity's cost.

### 3.2 Cost Types

Each activity entry has a `cost_type` of either `flat` or `per_page`:

- **`flat`**: A fixed number of units is consumed per activity completion, regardless of input size.
- **`per_page`**: Units consumed = `page_count × units` (where `units` is the per-page rate). The page count is extracted from the activity's return value via a `_metered_quantity` field (see section 5.2). This type is used for OCR extraction activities where Azure charges per page processed.

Any activity not listed in the rate version has an implicit flat cost of `0` (free).

**Example (stored in `rate_versions.json`):**
```json
{
  "version": "1.0.0",
  "effective_from": "2026-07-01T00:00:00Z",
  "unit_cost_dollars": 0.001,
  "cost_per_gb_units_per_month": 10,
  "max_pages_assumption": 50,
  "activity_costs": {
    "azureOcr.submit": { "cost_type": "flat", "units": 10 },
    "azureOcr.extract": { "cost_type": "per_page", "units": 40 },
    "enrichment.run": { "cost_type": "flat", "units": 200 },
    "classifyDocument": { "cost_type": "flat", "units": 30 },
    "runFieldFormatEngine": { "cost_type": "flat", "units": 10 }
  },
  "training_costs": {
    "template_model": 500,
    "classifier": 300
  }
}
```

For `per_page` activities, `units` means "units per page". For `flat` activities, `units` means "units per completion". The `max_pages_assumption` field is used exclusively for pre-flight cost estimation of `per_page` activities (see section 4.1).

---

## 4. Workflow Run Cost Estimation

Before a workflow run begins, the system must calculate its **estimated maximum cost** using a worst-case traversal of the workflow graph.

### 4.1 Algorithm

Use a **max-flow / longest-path algorithm** on the workflow DAG:
1. Load the workflow graph configuration (already fetched in `getWorkflowGraphConfig`).
2. For each node, look up the cost entry of the activity it executes (using the current active rate version):
   - If `cost_type === "flat"`: node cost = `units`
   - If `cost_type === "per_page"`: node cost = `max_pages_assumption × cost_per_page_units` (from the rate version)
3. Find the path through the graph that maximizes total unit cost (i.e., the most expensive possible execution).
4. Return this value as the **estimated cost** in units.

Using `max_pages_assumption` for per-page activities means the pre-flight estimate is a conservative upper bound. Actual charges will be lower for documents with fewer pages than the assumption, and higher for documents exceeding it. The cap check does not retroactively block a workflow that exceeded the page assumption — the cap applies only at workflow start.

### 4.2 Pre-flight Cap Check

Before the workflow is submitted to Temporal:
1. Calculate estimated cost in units.
2. Convert to dollars using the active rate version.
3. Retrieve the group's monthly spending cap and their current-month total spend (in dollars).
4. If `current_month_spend + estimated_cost_dollars > monthly_cap`, **reject the workflow** with a descriptive error:
   - HTTP 402 (Payment Required) with a body indicating the shortfall in dollars.
5. If the check passes, proceed to start the workflow.

The cap check is **atomic** — it must be performed in a database transaction or with a row-level lock on the group's current-period record to prevent concurrent runs from simultaneously passing the check and collectively exceeding the cap.

---

## 5. Usage Event Recording

### 5.1 Workflow Start Event

When a workflow is successfully submitted to Temporal, record a `UsageEvent` with:
- `event_type`: `"workflow_started"`
- `group_id`
- `workflow_execution_id`
- `workflow_config_id` (workflow slug + version)
- `estimated_units`: result of the max-flow cost estimation
- `rate_version_id`: the active rate version at this moment
- `created_at`: timestamp

### 5.2 Activity Completion Events

When each Temporal activity completes successfully within a workflow, the `ActivityInboundCallsInterceptor` records a `UsageEvent`. The interceptor determines `units_consumed` based on the activity's cost type:

- **Flat cost**: `units_consumed = activity_cost.units`
- **Per-page cost**: The interceptor inspects the activity's return value for a `_metered_quantity` field (a number). `units_consumed = _metered_quantity × activity_cost.units`. If the field is absent or zero, `units_consumed = 0`.

Activities that are to be billed per-page (e.g. `azureOcr.extract`) **must** include `_metered_quantity: pageCount` in their return value. This is a contract between the activity implementation and the billing system. The field is ignored by all other consumers.

`UsageEvent` fields:
- `event_type`: `"activity_completed"`
- `group_id`
- `workflow_execution_id`
- `activity_name`: the Temporal activity function name
- `metered_quantity`: the raw quantity used (page count for per-page activities, `null` for flat)
- `units_consumed`: the calculated units
- `rate_version_id`
- `created_at`: timestamp

Activities that fail or are skipped due to branching are **not charged**.

### 5.3 Workflow Completion Event

When a workflow reaches a terminal state (success, failure, or cancellation), record a `UsageEvent` with:
- `event_type`: `"workflow_completed"` | `"workflow_failed"` | `"workflow_cancelled"`
- `group_id`
- `workflow_execution_id`
- `total_units_consumed`: sum of all `activity_completed` events for this run
- `total_dollars`: `total_units_consumed / rate_version.units_per_dollar`
- `rate_version_id`
- `created_at`: timestamp

### 5.4 Charge-on-Failure Policy

Only **completed activities** are charged. If a workflow fails partway through:
- Activities that ran to completion are charged.
- Activities that did not execute (due to failure or branching) are not charged.
- The `workflow_failed` event records the actual total, which will be less than the original estimate.

---

## 6. Storage Cost Tracking

### 6.1 Approach: GB-Hours

Storage is billed in **GB-hours** — the product of file size and the duration it was stored. This ensures groups are only charged for the time data actually occupies storage, including files that are written and deleted within the same day.

The rate in `rate_versions.json` is expressed as `cost_per_gb_units_per_month` because that is the natural unit for operators to reason about ("10 units per GB per month"). The nightly job converts this to an hourly rate at calculation time:

```
cost_per_gb_hour = cost_per_gb_units_per_month / (days_in_month × 24)
```

Using the actual days in the billing month (28–31) ensures the monthly total always adds up to exactly `cost_per_gb_units_per_month` regardless of month length.

### 6.2 Blob Storage Ledger

All groups share a single Azure Blob Storage container (`document-blobs`). Blobs are prefixed by group ID (`{groupId}/{category}/...`), enforced by the `validateBlobFilePath` utility. There is no per-group container to query directly.

Storage usage is tracked via a **`GroupStorageLedger`** table maintained by instrumenting the shared `BlobStorageClient` used by both the backend services and the Temporal worker:

- On every `write(key, data)` call: insert a row into `GroupStorageLedger` with `blob_key`, `group_id`, `size_bytes = data.byteLength`, `written_at = now()`, `deleted_at = null`. The `groupId` is extracted from the first path segment of `key` (guaranteed valid by `validateBlobFilePath`).
- On every `delete(key)` call: set `deleted_at = now()` on the matching `GroupStorageLedger` row.
- On every `deleteByPrefix(prefix)` call: set `deleted_at = now()` on all matching rows in a single update.

Rows are **never deleted** from `GroupStorageLedger` — `deleted_at` is the tombstone. This preserves the full history needed for GB-hour calculations and billing audits.

**Coverage of this approach:**

| Write path | Captured? | Notes |
|---|---|---|
| OCR workflow blobs | Yes | All activities use shared client |
| Intermediate payload refs | Yes | Uses shared client |
| Page splits / segments | Yes | Uses shared client |
| Classifier training data blobs | Yes | Uses shared client via `OperationCategory.CLASSIFICATION` |
| Template model training data blobs | No | Uses a separate per-training-run Azure container accessed via SAS URL — these blobs are transient (deleted automatically after training completes) and not worth tracking |

### 6.3 Daily Charge Job

A scheduled Temporal workflow runs nightly. For each group that has any ledger activity:

1. Query all `GroupStorageLedger` rows for the group where:
   - `written_at < end_of_day` (blob existed at some point during the day)
   - `deleted_at IS NULL OR deleted_at > start_of_day` (blob was alive for at least part of the day)
2. For each matching row, compute the hours the blob was alive during that 24-hour window:
   ```
   alive_from = max(written_at, start_of_day)
   alive_until = min(deleted_at ?? end_of_day, end_of_day)
   hours_alive = (alive_until - alive_from) / 3_600_000
   gb_hours = (size_bytes / 1_073_741_824) * hours_alive
   ```
3. Sum `gb_hours` across all rows for the group.
4. Multiply by the derived `cost_per_gb_hour` from the active rate version (`cost_per_gb_units_per_month / (days_in_month × 24)`).
5. Record a `UsageEvent` with:
   - `event_type`: `"storage_daily_charge"`
   - `group_id`
   - `storage_gb_hours`: the total GB-hours for the day
   - `units_consumed`: the computed cost
   - `rate_version_id`
   - `created_at`: timestamp

Storage costs count toward the group's monthly spend for cap enforcement purposes.

Note: `_shared/` prefixed blobs (used for shared training resources not scoped to a group) are not attributed to any group and are not charged.

### 6.4 Monthly Ledger Archival

To prevent unbounded growth of `GroupStorageLedger`, a **monthly archival job** runs after the last daily charge job of each calendar month (i.e., after the day-31/day-28/etc. charge has been recorded).

The archival rule is straightforward: any ledger row where `deleted_at IS NOT NULL AND deleted_at < start_of_next_month` has no future billing impact — its full GB-hour contribution has already been captured across the daily `storage_daily_charge` `UsageEvent` records for that month. These rows can be safely deleted from the live table.

Rows where `deleted_at IS NULL` (still live) are never archived — they must remain in the ledger to continue accruing GB-hours into the next month.

**Archival process** (runs as part of the same scheduled Temporal workflow as the daily charge job, triggered on the last day of each month after the daily charge):

1. Identify the month boundary: `cutoff = start of current month` (all rows deleted before this have been fully charged).
2. Delete from `GroupStorageLedger` where `deleted_at IS NOT NULL AND deleted_at < cutoff`.
3. Log the count of archived rows as a maintenance event (not a `UsageEvent` — no billing impact).

This means at any given time, `GroupStorageLedger` contains:
- All **live** blobs across all time (small set — only currently stored files)
- All **deleted** blobs from the **current month only** (bounded by churn within the month)

The `UsagePeriodSummary` table already holds the rolled-up monthly dollar totals, so no historical billing data is lost by archiving ledger rows.

### 6.5 New Tables

A `GroupStorageLedger` table tracks:
- `id`: primary key
- `group_id`: the group (indexed)
- `blob_key`: the full blob path (unique)
- `size_bytes`: size recorded at write time
- `written_at`: timestamp when the blob was created
- `deleted_at`: nullable timestamp when the blob was deleted; null = still live

Key indexes:
- Unique index on `blob_key` (for fast lookup on delete)
- Compound index on `(group_id, written_at, deleted_at)` for the daily charge job query

---

## 6b. Training Cost Recording

Both template model training and classifier training are driven directly in the backend (not via Temporal activities). Both must record a `model_training_started` `UsageEvent` when the training job is successfully submitted to Azure, and both must pass a pre-flight cap check before submission.

### 6b.1 Template Model Training

**Instrumentation point**: `TrainingService` — after a training job is successfully submitted to Azure Document Intelligence.

Record a `UsageEvent` with:
- `event_type`: `"model_training_started"`
- `group_id` (from `TemplateModel.group_id`)
- `resource_id`: the `TrainingJob.id`
- `resource_type`: `"template_model"`
- `units_consumed`: the unit cost from the active rate version under `training_costs.template_model`
- `rate_version_id`
- `created_at`: timestamp

### 6b.2 Classifier Training

**Instrumentation point**: `ClassifierService.requestClassifierTraining` — after `this.client.path("/documentClassifiers:build").post(...)` returns a `202 Accepted` response. Both `groupId` and `classifierName` (used as `resource_id`) are in scope at that point.

Record a `UsageEvent` with:
- `event_type`: `"model_training_started"`
- `group_id`
- `resource_id`: `classifierName`
- `resource_type`: `"classifier"`
- `units_consumed`: the unit cost from the active rate version under `training_costs.classifier`
- `rate_version_id`
- `created_at`: timestamp

### 6b.3 Rate Version Schema

The `rate_versions.json` schema includes a `training_costs` object alongside `activity_costs`:

```json
{
  "training_costs": {
    "template_model": 500,
    "classifier": 300
  }
}
```

### 6b.4 Pre-flight Cap Check

Both training paths apply the same pre-flight check as workflow runs: calculate training cost in units, convert to dollars, check against `UsagePeriodSummary`. Return HTTP 402 if the group's monthly cap would be exceeded. The check must be applied **before** the Azure training request is submitted.

---

## 7. Monthly Spending Caps

### 7.1 Configuration

Each group has a configurable monthly spending cap, stored in dollars. This is set by a **platform admin**. There is no default cap (unlimited) unless explicitly configured.

Fields on `Group` (or a related `GroupBillingConfig` table):
- `monthly_cap_dollars`: nullable decimal. If null, no cap is enforced.
- `cap_configured_by`: actor who set it
- `cap_configured_at`: timestamp

### 7.2 Period Tracking

The system maintains a `UsagePeriodSummary` record per group per calendar month:
- `group_id`
- `period_year`: integer (e.g., 2026)
- `period_month`: integer (1–12)
- `total_units_consumed`: running total of all units in the period
- `total_dollars_spent`: running total in dollars
- `updated_at`: last update timestamp

This record is **incrementally updated** (not recalculated) for one important reason: the pre-flight cap check must read the current month's total spend in real-time, before every workflow start and training submission. If it were calculated on-demand by summing `UsageEvent` rows, that aggregation could scan thousands of rows per cap check under load. The incremental row is a single indexed read. Historical months persist naturally as an accurate audit record.

---

## 8. Usage Visibility (Read / Query)

### 8.1 Group Admin View (Self-Service)

Group admins can see their own group's usage. Required views:

1. **Current period summary**: Total units and dollars spent in the current calendar month, remaining cap (if configured), and estimated cap exhaustion date based on current burn rate.
2. **Historical period summaries**: Monthly totals for all past periods since the feature was enabled.
3. **Per-run cost detail**: Given a `workflow_execution_id`, return the full list of `UsageEvent` records for that run (start, each completed activity, and completion), with unit costs and dollar values.

### 8.2 Platform Admin View

Platform admins can see usage across all groups. Required views:

1. **All-groups period summary**: A table of all groups with their current-month spend, monthly cap, and usage percentage.
2. **Group drill-down**: Full usage history (monthly summaries + run-level detail) for any selected group.
3. **Rate version management**: View all rate versions, their effective dates, and activity cost tables. Create/import a new rate version (or this is handled via the `rate_versions.json` file and the seeding mechanism).

### 8.3 API Access

Usage data is accessible via authenticated REST endpoints (JWT or API key). Group-scoped endpoints return only the calling group's data. Platform admin endpoints require the `PLATFORM_ADMIN` role.

---

## 9. Data Model Summary

### New Tables

| Table | Purpose |
|-------|---------|
| `RateVersion` | Versioned unit-to-dollar conversion rates, activity costs, and training costs |
| `ActivityCost` | Per-activity unit cost rows, foreign-keyed to `RateVersion` |
| `UsageEvent` | Immutable event log: workflow starts, activity completions, workflow endings, storage charges, training starts |
| `UsagePeriodSummary` | Incrementally updated monthly aggregate per group (for fast cap checks) |
| `GroupBillingConfig` | Per-group billing settings (monthly cap, etc.) |
| `GroupStorageLedger` | Per-blob-key size and lifetime tracking for GB-hour storage billing (rows are never deleted; `deleted_at` is the tombstone) |

### Modified Tables

| Table | Change |
|-------|--------|
| `Group` | Add relation to `GroupBillingConfig` |

### Key Indexes

- `UsageEvent`: compound index on `(group_id, created_at)` for time-range queries
- `UsageEvent`: index on `workflow_execution_id` for per-run drill-down
- `UsagePeriodSummary`: unique index on `(group_id, period_year, period_month)` for fast cap lookups
- `GroupStorageLedger`: unique index on `blob_key`; compound index on `(group_id, written_at, deleted_at)` for the daily charge job query
- `GroupStorageLedger`: rows are never deleted — `deleted_at` tombstone preserves billing history

---

## 10. Non-Functional Requirements

| Requirement | Specification |
|-------------|---------------|
| **Correctness** | Cap check must be atomic; no two concurrent workflow starts for the same group may both pass a cap check they would collectively exceed |
| **Auditability** | Every `UsageEvent` references a `rate_version_id`; historical dollar values are always reproducible |
| **Performance** | Cap check adds ≤ 100ms to workflow start latency (single indexed read on `UsagePeriodSummary`) |
| **Retention** | `UsageEvent` records are retained for a configurable period (default: 2 years). After that, raw event rows may be purged — `UsagePeriodSummary` preserves the monthly totals permanently, so billing history is never lost. `UsagePeriodSummary` records are never deleted. Retention period is a deployment-level environment variable. |
| **Backfill** | None — tracking begins from the deployment date of this feature |
| **Storage** | PostgreSQL (existing database); no additional data store required |
| **Table growth** | `UsageEvent` is the largest table (~10–15 rows per workflow run) but is bounded by the configurable retention policy. `GroupStorageLedger` is bounded by the end-of-month archival job. All other tables are small. |

---

## 11. Out of Scope

- Automated invoicing or payment processing (Stripe integration, etc.)
- Per-user billing (billing boundary is the group)
- Real-time/sub-second usage dashboards
- Alerts or notifications when approaching cap (may be added as a follow-on feature)
- Rollover of unused monthly budget
- Per-group pricing tiers or overrides
- Template model training data blob storage tracking (blobs are transient — deleted automatically after training completes)

---

## 12. Implementation Notes

1. **Temporal activity interceptor**: Use `ActivityInboundCallsInterceptor` from `@temporalio/worker` v1.10.0 (confirmed available). The interceptor's `execute(input, next)` method fires after `await next(input)` returns — meaning it only runs on successful completion, which naturally enforces the charge-on-completion policy. The interceptor checks the activity's cost type from the active `RateVersion`: flat activities use a fixed `units` value; per-page activities read `result._metered_quantity` from the return value and multiply by the activity's `units` (per-page rate). Register the interceptor in both `ocrWorker` and `benchmarkWorker` in `worker.ts`. No existing activity code needs modification **except** per-page activities, which must add `_metered_quantity: pageCount` to their return value.

3. **Blob client instrumentation**: Both the backend (`apps/backend-services/src/blob-storage/`) and the Temporal worker (`apps/temporal/src/blob-storage/blob-storage-client.ts`) maintain separate `BlobStorageClient` implementations. Both must be instrumented. On `write`, insert a `GroupStorageLedger` row. On `delete`/`deleteByPrefix`, set `deleted_at` on matching rows. The `groupId` is always the first path segment of every blob key (enforced by `validateBlobFilePath`) and can be extracted without additional context. Ledger rows are never hard-deleted.

4. **Storage job scheduler (nightly job)**: Implemented as a Temporal scheduled workflow. Its purpose is to convert the raw `GroupStorageLedger` (which tracks blob sizes and timestamps) into billable `UsageEvent` records. Without this job, storage usage is tracked but never charged. It runs nightly, reads the ledger to compute GB-hours per group for the past 24 hours (using the `written_at`/`deleted_at` timestamps), records a `storage_daily_charge` `UsageEvent` for each group with non-zero usage, and increments `UsagePeriodSummary`. No Azure API calls are required — all data comes from the local ledger table.

5. **Rate version seeding**: The backend startup check for new rate versions in `rate_versions.json` should be idempotent and safe to run on every deployment. The JSON schema includes both `activity_costs` (keyed by Temporal activity type string matching keys in the `ActivityRegistryEntry`) and `training_costs` (keyed by resource type).

6. **Estimation for dynamic graphs**: The worst-case cost estimation uses the workflow graph config fetched via `getWorkflowGraphConfig`. The max-flow / longest-path traversal must handle conditional branch nodes by summing the maximum-cost branch at each fork. Activities with no entry in the active rate version's `activity_costs` contribute 0 units to the estimate.

7. **Training pre-flight cap check**: Applied in both `TrainingService` (template models) and `ClassifierService.requestClassifierTraining` (classifiers) before submitting to Azure. Same pattern as workflow pre-flight: calculate training cost in units, convert to dollars, check against `UsagePeriodSummary`. Return HTTP 402 if insufficient.
