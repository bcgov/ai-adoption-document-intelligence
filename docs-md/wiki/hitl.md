---
status: active
updated: 2026-08-25
canonical_sources:
  - docs-md/architecture/HITL_ARCHITECTURE.md
  - docs-md/architecture/HITL_REVIEW_CRITERIA.md
  - docs-md/extraction/HITL_DEMO_RESET.md
  - apps/backend-services/src/hitl/
  - apps/frontend/src/pages/
  - apps/frontend/src/features/
  - apps/shared/prisma/schema.prisma
do_not_duplicate:
  - Review session schema
  - Locking algorithm details
  - API endpoint details
  - Full UI walkthroughs
---

# Human-In-The-Loop

HITL routes low-confidence or review-required document results to humans. It is session-oriented: a reviewer works through a bounded review session for a document, records corrections, and then approves it, flags it for someone else, or skips it back to the queue.

## Source Map

- Architecture and lifecycle concepts live in `docs-md/architecture/HITL_ARCHITECTURE.md`.
- Field-level review gating (the `hitl.applyReviewCriteria` graph activity — a prediction-only rule engine deciding which fields need review) is documented in `docs-md/architecture/HITL_REVIEW_CRITERIA.md`; it produces a review plan in workflow context but does not itself touch session/queue state.
- Backend session, queue, lock, correction, and analytics behavior lives in `apps/backend-services/src/hitl/`.
- Persisted model truth lives in `apps/shared/prisma/schema.prisma`.
- Frontend review entrypoints are split between page-level routes and feature components under `apps/frontend/src/`.

## Design Notes

- HITL is per-document-instance state, not group-level reusable configuration.
- The queue reads persisted `ocr_results` only — gated workflow templates persist OCR *before* the human gate (`persistOcr` node, since 2026-08-01); the post-gate store persists reviewer corrections. See the queue-entry note in `HITL_ARCHITECTURE.md`.
- Reviewers edit inline on the document canvas (`CanvasFieldOverlay` under `apps/frontend/src/features/annotation/hitl/`), not only in the side panel.
- A demo/reset seed exists for local review-queue demos without paid OCR: `npm run demo:reset` — see `docs-md/extraction/HITL_DEMO_RESET.md`.
- It differs from [Tables and extensions](tables-and-extensions.md) because it involves session lifecycle, locking, and human completion decisions.
- Corrections are audit-like records of review actions, not a replacement for the original document record.
- A session ends in one of three states: `approved`, `flagged` (handed on for attention; read-only in the Flagged tab, so it holds no lock) or `abandoned` (skipped, or the lock expired). A skipped document returns to the Pending queue and the next reviewer gets a fresh session.
- Locks are reclaimed by `LockExpiryService`, a per-minute cron that abandons the session, deletes the lock row, and audits the expiry.
- Queue statistics are database counts over the whole queue, not a summary of the page in view.

## Related Topics

- [Graph workflows](graph-workflows.md): workflow pause/resume and review routing in the DAG.
- [Auth and groups](auth-and-groups.md): group-scoped access to review queues and sessions.
- [System overview](system-overview.md): where HITL sits across frontend and backend boundaries.

## Common Drift Risks

- Queue behavior, locking TTLs, and frontend session handling need to remain aligned.
- Workflow pause/resume expectations should be checked against current Temporal implementation before changing HITL behavior.
- Feature docs may lag behind the implemented session model; prefer stable `docs-md` and code paths.
