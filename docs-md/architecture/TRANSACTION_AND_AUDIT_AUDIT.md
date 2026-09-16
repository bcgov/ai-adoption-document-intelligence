# Transaction and Audit Compliance Audit

**Date:** 2026-07-02 (original); **rescan:** 2026-07-03  
**Scope:** `apps/backend-services`, `apps/temporal`, shared packages  
**Related docs:** [DATABASE_SERVICES.md](./DATABASE_SERVICES.md), [AUDIT.md](./AUDIT.md)

This document records a full codebase review of database write patterns against two rules:

1. **Atomicity:** Two or more database writes that must succeed or fail together must run inside a single Prisma transaction.
2. **Audit coupling:** Every user-initiated mutation (and every service-layer transaction that performs a mutation) must record an audit event. Audit writes participate in the same transaction when the mutation is transactional; otherwise they run immediately after a successful commit (best-effort, non-fatal).

---

## Summary

| Category | Status |
|----------|--------|
| Original audit list (HITL, group request, dataset cascade tx, training poller, bootstrap, workflow create/update/candidate, API keys, promote/apply, OCR) | **Fixed** |
| Infrastructure: `recordEvent` / `logAuditEvent` accept optional `tx` | **Fixed** |
| Rescan transaction gaps (definition revision, run delete, GT start/processJob, template-model labels/upload) | **Fixed** |
| Rescan mutation audit gaps (training, template-model, project/definition/run/dataset, GT, classifier, confusion-profile, upload, HITL `deleteCorrection`, workflow delete, document update event type) | **Fixed** |
| Follow-up pass: `configureSchedule`, `revertHeadToVersion`, temporal `upsert-ocr-result` transaction | **Fixed** |
| Compliant domains | Group, tables, API keys, HITL, workflow (incl. revert head), training, dataset, benchmark project/definition/run/schedule, GT, classifier, confusion-profile, template-model, document upload/update, temporal OCR upsert |

---

## Rule Reference

### When a transaction is required

| Writes | Transaction? |
|--------|----------------|
| Single `create` / `update` / `delete` | No |
| Read + write (e.g. find then update) where race matters | Prefer transaction or optimistic locking |
| Two or more writes that must stay consistent | **Yes — required** |
| Cross-module writes (e.g. review session + document status) | **Yes — service initiates `prismaService.transaction()`** |
| External side effect + DB (Temporal start, blob upload) | DB steps in a transaction; external call after commit unless idempotent compensation exists |

### When audit is required

| Operation | Audit system | Required? |
|-----------|--------------|-------------|
| User-initiated create/update/delete (API) | `AuditService.recordEvent` or `AuditLogService` | **Yes** |
| System/background job mutation affecting user-visible state | Same | **Yes** (actor may be null) |
| Read / list / download endpoints | `AuditService` access events | Per [AUDIT.md](./AUDIT.md) |
| Internal housekeeping (lock heartbeat, `last_used` bump) | No | No |

### Audit placement

```typescript
// Preferred: audit in the same transaction as the mutation
await this.prismaService.transaction(async (tx) => {
  await this.myDb.updateRecord(id, data, tx);
  await this.auditService.recordEvent({ ... }, tx);
});

// Acceptable: audit immediately after commit (best-effort)
await this.myDb.approveRequestTransaction(...);
await this.auditService.recordEvent({ ... });
```

Audit failures must never fail the main operation (except when audit is in the same transaction — then both roll back, which is intentional for strict consistency).

---

## Findings: Multi-Step Mutations Without Transactions

> **Historical.** The findings in this section describe the state at the time of
> the 2026-07-02/03 audit. Every item below has since been **remediated** — see
> [Remediation status](#remediation-status-2026-07-02) and
> [Remaining gaps (rescan) — Done](#remaining-gaps-2026-07-03-rescan--done). The
> severity labels reflect the original risk assessment, not current risk. The
> [Compliant domains (rescan)](#compliant-domains-rescan) section is the
> authoritative current-state summary.

### HITL (`hitl.service.ts`) — **High** *(remediated)*

All of the following perform multiple DB writes without a shared transaction:

| Method | Writes | Risk |
|--------|--------|------|
| `startSession` | `createReviewSession` + `acquireDocumentLock` | Session exists without lock, or lock without session |
| `submitCorrections` | N × `createFieldCorrection` (parallel, not transactional) | Partial corrections persisted |
| `approveSession` | `updateReviewSession` + `documentService.updateDocument` + `releaseDocumentLock` | Document status and session can diverge |
| `flagSession` | `updateReviewSession` + `releaseDocumentLock` | Partial completion |
| `skipSession` | `updateReviewSession` + `releaseDocumentLock` | Lock leaked if update fails |
| `reopenSession` | `updateReviewSession` + `acquireDocumentLock` | Session reopened without lock |

Audit is present for each (after writes). Cross-module `approveSession` is the highest priority fix.

### Group (`group.service.ts`) — **Medium**

| Method | Writes | Notes |
|--------|--------|-------|
| `requestMembership` | `deleteResolvedMembershipRequests` + `createMembershipRequest` | Unique-constraint race; approve/cancel already use `*Transaction` helpers |

Other group mutations are single writes or use `approveRequestTransaction` / `cancelRequestTransaction` correctly.

### Benchmark dataset (`dataset.service.ts`) — **High**

| Method | Writes | Notes |
|--------|--------|-------|
| `createDataset` | `createDataset` + `updateDataset` (storage path) | Orphan row with empty path on failure |
| `deleteDataset` | Nested loops: delete runs, definitions, splits, GT jobs, versions, dataset | Partial delete leaves inconsistent FK graph |
| `deleteSample` | Blob + manifest + `updateDatasetVersion` + N × `updateSplit` + `deleteJobsForSample` | Partial sample removal |
| `deleteVersion` | Multiple deletes without wrapping transaction | Same as dataset delete |
| Version publish / materialize flows | Multiple version + split updates | Review individual call paths when changing |

Only `createDataset` has benchmark audit (`auditLogDbService.createAuditLog`); deletes and most updates have **no** benchmark audit.

### Training (`training-poller.service.ts`) — **Medium**

| Method | Writes | Notes |
|--------|--------|-------|
| Poll success path | `updateTrainingJob(SUCCEEDED)` then `replaceActiveTrainedModel(...)` | Job marked succeeded even if model swap fails; `replaceActiveTrainedModel` is transactional internally but not coupled to job update |

### OCR (`ocr.service.ts`) — **Medium**

| Method | Writes | Notes |
|--------|--------|-------|
| `processDocument` | Temporal start + `updateDocument` | External + DB; audit after update. Document can reference workflow that failed to start |

### Benchmark run start (`benchmark-run.service.ts`) — **Low**

`createBenchmarkRun` → Temporal start → `postTemporalStartTransaction` — the last step is transactional; earlier steps are intentionally separate with failure compensation (`updateBenchmarkRun` to failed).

### Workflow / benchmark definition — **Partially compliant**

Transactional where needed (`createWorkflow`, version append, `promoteCandidateWorkflow`, `applyToBaseWorkflow`) but see audit gaps below.

### Compliant examples (reference)

- `group-db.service.ts`: `approveRequestTransaction`, `cancelRequestTransaction`
- `tables-db.service.ts`: `addColumnAndBackfill`, row upsert batch
- `benchmark-run-db.service.ts`: `postTemporalStartTransaction`, `promoteRunToBaseline`, `deleteBenchmarkRun`
- `actor/api-key-db.service.ts`: `createApiKey`, `deleteApiKeyById`
- `training-db.service.ts`: `replaceActiveTrainedModel` (internal only)
- `ground-truth-job-db.service.ts`: `createManyJobs`, `deleteJobsForVersions`
- `template-model-db.service.ts`: `replaceDocumentLabels`

---

## Findings: Transactions Without Audit

> **Historical.** As with the section above, these were the audit gaps found in
> the 2026-07-02/03 review. All are now remediated (the listed mutations emit
> audit events); this is retained as the record of what was fixed.

These service/db transaction boundaries performed **mutations** but did not record audit (or recorded it non-atomically) at the time of the audit:

| Location | Transaction | Audit |
|----------|-------------|-------|
| `workflow.service.ts` — `createWorkflow` | Yes | **None** |
| `workflow.service.ts` — `updateWorkflow` (config version append) | Yes | **None** |
| `workflow.service.ts` — `createCandidateFromVersion` | Yes | **None** |
| `benchmark-definition.service.ts` — `promoteCandidateWorkflow` | Yes | **None** |
| `benchmark-definition.service.ts` — `applyToBaseWorkflow` | Yes | **None** |
| `bootstrap.service.ts` — `performBootstrap` | Yes | Called inside callback but **`recordEvent` does not use `tx`** — not atomic |
| `actor/api-key-db.service.ts` — `createApiKey` / delete | Yes | **None** at service layer |
| `training-db.service.ts` — `replaceActiveTrainedModel` | Yes | **None** |
| `template-model-db.service.ts` — `replaceDocumentLabels` | Yes | **None** (labeling may need audit if user-initiated) |

### Transactions with audit (correct pattern)

| Location | Audit |
|----------|-------|
| `group.service.ts` — approve/cancel membership | `recordEvent` after `*Transaction` |
| `tables.service.ts` — schema/data mutations | `recordEvent` after db call |
| `benchmark-run.service.ts` — `postTemporalStartTransaction` | `logRunStarted` after commit |
| `benchmark-run.service.ts` — `promoteRunToBaseline` | `logBaselinePromoted` after commit (try/catch) |
| `dataset.service.ts` — `createDataset` | `createAuditLog` after writes (not in same tx) |

### Read-only transactions (audit N/A)

- `document-db.service.ts` — `findAllDocuments` uses `$transaction` for consistent count + page read only.

---

## Temporal Worker (`apps/temporal`)

Temporal activities use `getPrismaClient()` directly with **no** `$transaction` usage. Most activities perform single writes (`update-document-status`, `benchmark-update-run`). Multi-step persistence in activities should follow the same rules if added later.

---

## Remediation status (2026-07-02)

The following items from this audit have been **implemented**:

| Item | Status |
|------|--------|
| `AuditService.recordEvent(events, tx?)` | Done |
| `AuditLogService.logAuditEvent(params, tx?)` | Done |
| HITL session lifecycle transactions + in-tx audit | Done |
| Group `requestMembership` transaction + in-tx audit | Done |
| Dataset `createDataset` / `deleteDataset` DB cascade transaction | Done |
| Training poller job SUCCEEDED + `replaceActiveTrainedModel` atomicity | Done |
| Bootstrap audit passes `tx` | Done |
| `replaceActiveTrainedModel` accepts external `tx` | Done |
| Workflow / benchmark-definition mutation audit | Done |
| API key create/delete/regenerate audit | Done |
| Dataset `deleteSample` / `deleteVersion` DB transactions | Done |
| OCR document update + audit in one transaction | Done |

**Original audit list:** all items implemented (see table above).

**Rescan (2026-07-03):** additional gaps remain outside the original list. See [Remaining gaps](#remaining-gaps-2026-07-03-rescan).

## Remaining gaps (2026-07-03 rescan) — **Done**

Original remediation covered HITL lifecycle, group membership request, dataset create/delete *transactions*, training poller atomicity, bootstrap `tx`, workflow create/update/candidate, API keys, promote/apply, and OCR `processDocument`. A full rescan of user-facing mutations found further gaps; those are now remediated (2026-07-03 follow-up).

### Transaction gaps (multi-write without a shared transaction) — **Done**

| Location | Method | Status |
|----------|--------|--------|
| `benchmark-definition.service.ts` | `updateDefinition` (has-runs revision path) | **Done** |
| `benchmark-run.service.ts` | `deleteRun` | **Done** |
| `ground-truth-generation.service.ts` | `startGeneration` | **Done** |
| `template-model.service.ts` | `saveDocumentLabels` | **Done** |
| `template-model.service.ts` | `uploadLabelingDocument` | **Done** |
| `hitl-dataset.service.ts` | `packageDocumentsIntoVersion` | **Done** (pre-assign version id + storagePrefix at create) |
| `ground-truth-generation.service.ts` | `processJob` (background) | **Done** (document + job tx) |

### Audit gaps (user-initiated mutation with no mutation audit) — **Done**

| Domain | Methods | Status |
|--------|---------|--------|
| **Training** | `startTraining`, `cancelTrainingJob`, `setActiveTrainedVersion`, `deleteTrainedVersion`; poller activation | **Done** |
| **Template model** | create/update/delete, field CRUD, documents, labels, upload | **Done** |
| **Benchmark project** | `createProject`, `deleteProject` | **Done** |
| **Benchmark definition** | `createDefinition`, `updateDefinition`, `deleteDefinition` | **Done** |
| **Benchmark run** | `cancelRun`, `deleteRun` | **Done** |
| **Dataset** | deletes, version/split/freeze/upload mutations | **Done** (via global `AuditService`) |
| **Ground truth** | `startGeneration` | **Done** |
| **Classifier** | create/update/train/delete | **Done** |
| **Confusion profile** | create/update/delete | **Done** |
| **Document / upload** | `document_uploaded`; `updateDocument` → `document_updated` | **Done** |
| **HITL** | `deleteCorrection` | **Done** |
| **Workflow** | `deleteWorkflow` | **Done** |

Benchmark lifecycle events not covered by the limited `AuditAction` enum use global `AuditService` event types (see [AUDIT.md](./AUDIT.md)).

### Compliant domains (rescan)

- **Group** — mutations audited; membership request/approve/cancel transactional where needed
- **Tables** — mutations audited; multi-write paths use db-service transactions
- **API keys** — create/delete/regenerate audited
- **HITL** — session lifecycle transactional + in-tx audit; `deleteCorrection` audited after delete
- **Workflow** create/update/candidate/delete, **OCR processDocument**, **bootstrap**, **promote/apply**
- **Training**, **dataset**, **benchmark project/definition/run**, **ground truth**, **classifier**, **confusion profile**, **template model**, **document upload/update**

### Intentional exceptions (not gaps)

| Area | Notes |
|------|--------|
| HITL `heartbeat`, API key `last_used` | Housekeeping |
| `EphemeralDocumentCleanupService`, `ClassifierOrphanCleanupService` | Background janitors |
| Benchmark `startRun` | Create → Temporal → `postTemporalStartTransaction` with failure compensation |
| Classifier / training delete | DB-first then best-effort external cleanup (audit still required) |
| Blob-then-DB uploads | External storage before DB is not a multi-DB-write atomicity issue |
| HITL package `documentCount` update after blobs | Version id + storagePrefix set at create; count update is a single post-blob write |

---

## Enforcement

Agent and contributor rules are defined in:

- [CLAUDE.md](../../CLAUDE.md) — workspace agent rules
- [.github/copilot-instructions.md](../../.github/copilot-instructions.md) — Copilot rules
- [DATABASE_SERVICES.md](./DATABASE_SERVICES.md) — transaction layer rules
- [AUDIT.md](./AUDIT.md) — audit event catalog and placement rules

When adding or reviewing backend mutations, verify both atomicity and audit before merging.
