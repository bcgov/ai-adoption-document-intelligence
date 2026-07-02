# Transaction and Audit Compliance Audit

**Date:** 2026-07-02  
**Scope:** `apps/backend-services`, `apps/temporal`, shared packages  
**Related docs:** [DATABASE_SERVICES.md](./DATABASE_SERVICES.md), [AUDIT.md](./AUDIT.md)

This document records a full codebase review of database write patterns against two rules:

1. **Atomicity:** Two or more database writes that must succeed or fail together must run inside a single Prisma transaction.
2. **Audit coupling:** Every user-initiated mutation (and every service-layer transaction that performs a mutation) must record an audit event. Audit writes participate in the same transaction when the mutation is transactional; otherwise they run immediately after a successful commit (best-effort, non-fatal).

---

## Summary

| Category | Count (approx.) | Severity |
|----------|-----------------|----------|
| Multi-step mutations without a transaction | 15+ call sites | High |
| Service-layer transactions without audit | 8 call sites | Medium |
| Audit called inside a transaction without passing `tx` | 1 call site | Medium |
| Read-only `$transaction` usage (compliant) | 1 | OK |
| Correctly transactional + audited | Several (group approve/cancel, tables, benchmark run start/promote) | OK |

Infrastructure gap: `AuditDbService.createAuditEvent(data, tx?)` and `AuditLogDbService.createAuditLog(data, tx?)` accept an optional transaction client, but **`AuditService.recordEvent()` and `AuditLogService.logAuditEvent()` do not expose `tx`** — so audit cannot participate in transactions today even when callers try.

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

### HITL (`hitl.service.ts`) — **High**

All of the following perform multiple DB writes without a shared transaction:

| Method | Writes | Risk |
|--------|--------|------|
| `startSession` | `createReviewSession` + `acquireDocumentLock` | Session exists without lock, or lock without session |
| `submitCorrections` | N × `createFieldCorrection` (parallel, not transactional) | Partial corrections persisted |
| `approveSession` | `updateReviewSession` + `documentService.updateDocument` + `releaseDocumentLock` | Document status and session can diverge |
| `escalateSession` | `createFieldCorrection` + `updateReviewSession` + `releaseDocumentLock` | Partial completion |
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

- `group-db.service.ts`: `approveRequestTransaction`, `cancelRequestTransaction`, `resolveRequestTransaction`
- `tables-db.service.ts`: `addColumnAndBackfill`, row upsert batch
- `benchmark-run-db.service.ts`: `postTemporalStartTransaction`, `promoteRunToBaseline`, `deleteBenchmarkRun`
- `actor/api-key-db.service.ts`: `createApiKey`, `deleteApiKeyById`
- `training-db.service.ts`: `replaceActiveTrainedModel` (internal only)
- `ground-truth-job-db.service.ts`: `createManyJobs`, `deleteJobsForVersions`
- `template-model-db.service.ts`: `replaceDocumentLabels`

---

## Findings: Transactions Without Audit

These service/db transaction boundaries perform **mutations** but do not record audit (or record it non-atomically):

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

**Still open:** None from the original audit list. Future mutations should follow the patterns in [DATABASE_SERVICES.md](./DATABASE_SERVICES.md) and [AUDIT.md](./AUDIT.md).

## Recommended remediation priority (remaining)

1. **HITL session lifecycle** — wrap session + lock (+ document status on approve) in `prismaService.transaction`; pass `tx` through `HitlService` → `ReviewDbService` / `DocumentService`.
2. **`dataset.service.ts` delete paths** — single transaction for DB cascade; audit `dataset_deleted` / `version_deleted` after commit.
3. **Extend `AuditService.recordEvent(events, tx?)`** — delegate `tx` to `AuditDbService`; same for `AuditLogService`.
4. **Workflow / benchmark definition mutations** — add benchmark or global audit events for create/update/promote.
5. **Training poller** — single transaction for job SUCCEEDED + `replaceActiveTrainedModel`; audit model activation.
6. **API key lifecycle** — audit create/revoke events.
7. **`bootstrap.service.ts`** — pass `tx` into `recordEvent` once (1) is done.

---

## Enforcement

Agent and contributor rules are defined in:

- [CLAUDE.md](../CLAUDE.md) — workspace agent rules
- [.github/copilot-instructions.md](../.github/copilot-instructions.md) — Copilot rules
- [DATABASE_SERVICES.md](./DATABASE_SERVICES.md) — transaction layer rules
- [AUDIT.md](./AUDIT.md) — audit event catalog and placement rules

When adding or reviewing backend mutations, verify both atomicity and audit before merging.
