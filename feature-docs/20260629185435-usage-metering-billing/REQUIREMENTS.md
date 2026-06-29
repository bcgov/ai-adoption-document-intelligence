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
| **Storage Cost** | Units consumed per GB of blob storage in use per group | Periodically (nightly) based on a running ledger of stored bytes per group |
| **Training Cost** | Units consumed when a model training run is initiated | Explicit event recorded at training start, for template models and (in a future follow-on) classifiers |

### 2.3 Rate Version

A `RateVersion` record defines:
- A semantic version string (e.g., `"1.0.0"`)
- An effective date (`effective_from`)
- A `units_per_dollar` conversion factor (how many units equal $1.00)
- A `cost_per_gb_units` value for storage cost per GB per month

Rate versions are append-only. The active rate version at any point in time is the version with the highest `effective_from` date that is ≤ the event timestamp.

**Source of record**: A `rate_versions.json` file committed to the repository defines all rate versions. On application startup, the backend checks for versions in the file that do not yet exist in the database and inserts them. The database is the live source of truth; the JSON file is the authoritative record for auditing and deploying new rate versions.

---

## 3. Activity Cost Configuration

### 3.1 Global Activity Cost Table

Each Temporal activity type is mapped to a unit cost. The mapping key is the **activity function name** as registered in Temporal (e.g., `"extractOcr"`, `"runLlmEnrichment"`, `"classifyDocument"`).

- Costs are **global** — all workflows that invoke the same activity pay the same unit cost.
- There are no per-workflow or per-group overrides.
- The activity cost table is part of the `RateVersion` — each version can change any activity's unit cost.

**Example (stored in `rate_versions.json`):**
```json
{
  "version": "1.0.0",
  "effective_from": "2026-07-01T00:00:00Z",
  "units_per_dollar": 1000,
  "cost_per_gb_units_per_month": 10,
  "activity_costs": {
    "extractOcr": 50,
    "runLlmEnrichment": 200,
    "classifyDocument": 30,
    "runFieldFormatEngine": 10,
    "generateEmbeddings": 100
  }
}
```

Any activity not listed in the rate version has a unit cost of `0` (free).

---

## 4. Workflow Run Cost Estimation

Before a workflow run begins, the system must calculate its **estimated maximum cost** using a worst-case traversal of the workflow graph.

### 4.1 Algorithm

Use a **max-flow / longest-path algorithm** on the workflow DAG:
1. Load the workflow graph configuration (already fetched in `getWorkflowGraphConfig`).
2. For each node, look up the unit cost of the activity it executes (using the current active rate version).
3. Find the path through the graph that maximizes total unit cost (i.e., the most expensive possible execution).
4. Return this value as the **estimated cost** in units.

This worst-case estimate is used for the pre-flight cap check. If the actual execution takes a cheaper path, the group is charged only for completed activities.

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

When each Temporal activity completes successfully within a workflow, record a `UsageEvent` with:
- `event_type`: `"activity_completed"`
- `group_id`
- `workflow_execution_id`
- `activity_name`: the Temporal activity function name
- `units_consumed`: the unit cost of this activity (from the rate version)
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

Storage is billed in **GB-hours** — the product of file size and the duration it was stored. This ensures groups are only charged for the time data actually occupies storage. A document uploaded in the morning and deleted in the afternoon contributes only those hours to the bill, not a full day.

The billing unit in `rate_versions.json` is expressed as `cost_per_gb_hour_units` (units per GB per hour). The monthly rate `cost_per_gb_units_per_month` is retained as a human-readable reference value but the actual charge calculation uses the hourly rate derived from it: `cost_per_gb_hour_units = cost_per_gb_units_per_month / (30 * 24)`.

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
4. Multiply by `cost_per_gb_hour_units` from the active rate version.
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

### 6b.1 Template Model Training

Template model training is initiated via the backend training service (not a Temporal activity). When a training job is successfully submitted to Azure, record a `UsageEvent` with:
- `event_type`: `"model_training_started"`
- `group_id` (from `TemplateModel.group_id`)
- `resource_id`: the `TrainingJob.id`
- `resource_type`: `"template_model"` | `"classifier"` (see below)
- `units_consumed`: the unit cost defined in the active rate version under `training_costs.template_model` (or `training_costs.classifier`)
- `rate_version_id`
- `created_at`: timestamp

The `rate_versions.json` schema is extended to include a `training_costs` object alongside `activity_costs`:

```json
{
  "training_costs": {
    "template_model": 500,
    "classifier": 300
  }
}
```

This event contributes to the group's monthly spend and is checked against the monthly cap before the training job is submitted (same pre-flight check pattern as workflow runs, returning HTTP 402 if insufficient budget).

### 6b.2 Classifier Training — Follow-on Work

Classifier training is also driven directly in the backend (not via Temporal activities) and should use the same `model_training_started` event with `resource_type: "classifier"`. However, the classifier training code path requires separate investigation and will be instrumented in a **follow-on task after this feature is complete**.

> **TODO (follow-on)**: Instrument `ClassifierService` and `ClassifierPollerService` with `model_training_started` usage events. Use the same `GroupBillingConfig` cap check and `rate_versions.json` `training_costs.classifier` rate. Ensure the pre-flight cap check is applied before the Azure classifier training request is submitted.

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

This record is updated (incremented) atomically whenever a `UsageEvent` that contributes to spending is recorded. It enables fast cap checks without scanning the full event log.

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
| **Retention** | `UsageEvent` records are never deleted; `UsagePeriodSummary` records are never deleted |
| **Backfill** | None — tracking begins from the deployment date of this feature |
| **Storage** | PostgreSQL (existing database); no additional data store required |

---

## 11. Out of Scope

- Automated invoicing or payment processing (Stripe integration, etc.)
- Per-user billing (billing boundary is the group)
- Real-time/sub-second usage dashboards
- Alerts or notifications when approaching cap (may be added as a follow-on feature)
- Rollover of unused monthly budget
- Per-group pricing tiers or overrides
- Template model training data blob storage tracking (blobs are transient — deleted automatically after training completes)
- Classifier training instrumentation (**deferred to follow-on task** — see section 6b.2)

---

## 12. Implementation Notes

1. **Temporal activity hooks**: Use `ActivityInboundCallsInterceptor` from `@temporalio/worker` v1.10.0 (confirmed available). The interceptor's `execute(input, next)` method fires after `await next(input)` returns — meaning it only runs on successful completion, which naturally enforces the charge-on-completion policy. Register the interceptor in both `ocrWorker` and `benchmarkWorker` in `worker.ts`. No existing activity code needs modification.

3. **Blob client instrumentation**: Both the backend (`apps/backend-services/src/blob-storage/`) and the Temporal worker (`apps/temporal/src/blob-storage/blob-storage-client.ts`) maintain separate `BlobStorageClient` implementations. Both must be instrumented. On `write`, insert a `GroupStorageLedger` row. On `delete`/`deleteByPrefix`, set `deleted_at` on matching rows. The `groupId` is always the first path segment of every blob key (enforced by `validateBlobFilePath`) and can be extracted without additional context. Ledger rows are never hard-deleted.

4. **Storage job scheduler**: Implement as a Temporal scheduled workflow for consistency with existing infrastructure. Runs nightly. Reads `GroupStorageSummary` directly — no Azure API calls required.

5. **Rate version seeding**: The backend startup check for new rate versions in `rate_versions.json` should be idempotent and safe to run on every deployment. The JSON schema includes both `activity_costs` (keyed by Temporal activity type string matching keys in the `ActivityRegistryEntry`) and `training_costs` (keyed by resource type).

6. **Estimation for dynamic graphs**: The worst-case cost estimation uses the workflow graph config fetched via `getWorkflowGraphConfig`. The max-flow / longest-path traversal must handle conditional branch nodes by summing the maximum-cost branch at each fork. Activities with no entry in the active rate version's `activity_costs` contribute 0 units to the estimate.

7. **Training pre-flight cap check**: Applied in the backend training service before submitting to Azure. Same pattern as workflow pre-flight: calculate training cost in units, convert to dollars, check against `UsagePeriodSummary`. Return HTTP 402 if insufficient. Classifier training instrumentation is deferred (see section 6b.2).
