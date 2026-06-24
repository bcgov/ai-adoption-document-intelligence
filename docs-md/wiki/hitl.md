---
status: active
updated: 2026-06-17
canonical_sources:
  - docs-md/HITL_ARCHITECTURE.md
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

HITL routes low-confidence or review-required document results to humans. It is session-oriented: a reviewer works through a bounded review session for a document, records corrections, and completes or escalates the review.

## Source Map

- Architecture and lifecycle concepts live in `docs-md/HITL_ARCHITECTURE.md`.
- Backend session, queue, lock, correction, and analytics behavior lives in `apps/backend-services/src/hitl/`.
- Persisted model truth lives in `apps/shared/prisma/schema.prisma`.
- Frontend review entrypoints are split between page-level routes and feature components under `apps/frontend/src/`.

## Design Notes

- HITL is per-document-instance state, not group-level reusable configuration.
- It differs from [Tables and extensions](tables-and-extensions.md) because it involves session lifecycle, locking, and human completion decisions.
- Corrections are audit-like records of review actions, not a replacement for the original document record.

## Related Topics

- [Graph workflows](graph-workflows.md): workflow pause/resume and review routing in the DAG.
- [Auth and groups](auth-and-groups.md): group-scoped access to review queues and sessions.
- [System overview](system-overview.md): where HITL sits across frontend and backend boundaries.

## Common Drift Risks

- Queue behavior, locking TTLs, and frontend session handling need to remain aligned.
- Workflow pause/resume expectations should be checked against current Temporal implementation before changing HITL behavior.
- Feature docs may lag behind the implemented session model; prefer stable `docs-md` and code paths.
