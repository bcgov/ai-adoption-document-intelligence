---
status: active
updated: 2026-08-13
canonical_sources:
  - docs-md/architecture/USAGE_METERING_AND_BILLING.md
  - apps/backend-services/src/billing/
  - apps/temporal/src/billing/
  - packages/billing/
  - apps/backend-services/src/billing/rate_versions.json
do_not_duplicate:
  - Rate version values and units
  - Full API endpoint list
  - Prisma table definitions
  - Cost estimation algorithm
---

# Billing and Usage Metering

Group-scoped metering of billable activities (OCR, classification, enrichment,
training, blob storage), per-month cost rollups, and optional monthly spending caps
enforced before work starts. Rates come from a versioned rate file, not per-workload
logic. Full behavior, configuration, and API live in the canonical doc
`docs-md/architecture/USAGE_METERING_AND_BILLING.md`.

## Source Map

- Canonical doc: `docs-md/architecture/USAGE_METERING_AND_BILLING.md`.
- Shared write path and arg builder: `packages/billing/`.
- Backend billing (seeder, cost estimation, cap check, usage queries, config):
  `apps/backend-services/src/billing/`; authoritative rates in that folder's
  `rate_versions.json`.
- Temporal billing (activity interceptor, nightly storage charge, month-end archival):
  `apps/temporal/src/billing/`.
- Blob inventory feeding storage charges: `storage-ledger-db.service.ts` (backend) and
  `blob-storage/storage-ledger.ts` (temporal).
- Schema (six `Decimal` money tables): `apps/shared/prisma/schema.prisma`.
- UI: `apps/frontend/src/pages/BillingPage.tsx`.

## Design Notes

- One shared write path: insert a `usage_events` row and atomically `{ increment }` the
  `usage_period_summaries` rollup in a single UTC-keyed transaction.
- Rate versions are immutable; a price change is a new version, seeded on backend boot.
- The spending cap is a **soft** pre-flight check, not a budget reservation — see the
  canonical doc's Known Limitations and [open-questions](open-questions.md).

## Related Topics

- [Blob storage](blob-storage.md): key scheme and provider abstraction the ledger uses.
- [Auth and groups](auth-and-groups.md): group scoping and role checks for cap endpoints.
- [Graph workflows](graph-workflows.md): the activities the interceptor meters.
- [System overview](system-overview.md): backend vs Temporal vs frontend boundaries.

## Common Drift Risks

- `rate_versions.json` values drift from documented examples; treat the JSON as
  authoritative and never restate specific units in the wiki.
- The `feature-docs` REQUIREMENTS describe an "atomic" cap; the shipped behavior is a
  soft cap — do not let planning docs be read as current behavior.
- `.env.sample` names the blob-transaction flag differently from the code
  (`CHARGE_FOR_BLOB_TRANSACTION` vs `CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY`).
