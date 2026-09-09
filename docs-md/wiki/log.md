# Wiki Maintenance Log

Append wiki-level changes here. Keep entries short and link to canonical sources when useful.

Use grep-friendly headings: `## [YYYY-MM-DD] operation | Title` where operation is `ingest`, `query`, `lint`, or `maintenance`.

## [2026-06-17] ingest | Initial wiki seed

- Created the wiki compression layer under `docs-md/wiki/`.
- Added seed topic pages for system overview, graph workflows, HITL, auth/groups, and deployment/ops.
- Added a source registry and anti-bloat maintenance rules.
- Wiki pages publish to the docs site as generated `wiki*.html` at deploy time (not committed).

## [2026-06-17] maintenance | Wiki operations and validation

- Documented ingest, query, and lint workflows in `docs-md/wiki/README.md`.
- Adopted grep-friendly `log.md` entry format and extended `scripts/validate-wiki.js` for links, index coverage, and source registry paths.
- Added `.github/workflows/wiki-check.yml` and removed maintainer-only `README.md` from docs site navigation.

## [2026-06-17] maintenance | Wiki markdown renderer

- Replaced custom Markdown-to-HTML body parser with `marked` in `scripts/build-docs-wiki.js`.
- Kept custom frontmatter cards, sidebar nav, and wiki link rewriting.

## [2026-06-17] ingest | Topic pages and cross-links

- Added wiki topic pages for blob storage, tables/extensions, and workflow builder.
- Linked repo wiki from root `README.md` and expanded `index.md`.
- Added Related Topics cross-links across all active topic pages.

## [2026-06-17] maintenance | Deploy-time wiki HTML and agent parity

- Stopped committing generated `docs/wiki*.html`; build via `docs/build.sh` at docs deploy (`.github/workflows/pages.yml`).
- Added `AGENTS.md` and wiki rules to `.github/copilot-instructions.md`.
- Added PR template wiki checklist item and `paths:` filters to `wiki-check.yml`.
- Added wiki topic routing table to `sources.md`.

## [2026-06-19] maintenance | Documentation audit fixes

- Removed embedded API key from contributor docs; canonical wiki rules consolidated in `AGENTS.md`.
- Untracked generated `docs/wiki*.html`; fixed root README compose paths and docs site quick start.
- Updated API key module references (`actor/`, `auth/`); deduplicated workflow builder guide.
- Documented docs build dependencies and documentation ownership in wiki open questions.

## [2026-06-20] maintenance | Documentation audit phases 1–3

- Phase 1: fixed dev script scope, Prisma order, monitoring compose paths, docs site stats, TESTING.md scripts.
- Phase 2: aligned workflow builder claims, wiki auth sources (`actor/`), docs build description.
- Phase 3: trimmed `apps/README.md`, aligned copilot with CLAUDE Swagger/API rules, added `docs-md/archive/README.md`.

## [2026-06-20] lint | Holistic docs-vs-code alignment

- Verified backend routes, workflow engine, auth, and blob storage against code via exploration.
- Fixed API keys are group-scoped (not per user) in README and backend README.
- Replaced stale workflow node catalog (Start/OCR/HTTP/End) with real graph node types (`activity`, `switch`, `map`, `join`, `childWorkflow`, `pollUntil`, `humanGate`) in README and frontend README.
- Migrated labeling/training docs to the template-models API: README endpoints/tree, backend README, frontend README pages, `DATABASE_SERVICES.md`, and the `GROUP_RESOURCE_AUTHORIZATION.md` route tables.
- Fixed broken `TEMPLATE_TRAINING.md` links to `TEMPLATE_MODELS.md`.
- Noted workflow form editor (default) alongside JSON + read-only React Flow in wiki and READMEs.

## [2026-07-03] maintenance | docs-md topic reorganization and code-verified audit

- Reorganized docs-md from a flat dump into topic folders (architecture/ auth/ groups/ workflows/ extraction/ operations/ monitoring/ benchmarking/ frontend/ archive/); all repo references rewritten, taxonomy index at docs-md/README.md.
- Archived point-in-time artifacts (temp/ audits, rapid-assessment-2026-04-09/, PR-88 review, May load-test report, completed Temporal footprint plan, DATABASE_ROLES.md describing the removed Role/UserRole schema) under docs-md/archive/ with a policy README.
- Audited 32 docs against code and fixed drift (groups API endpoints, audit event catalog, database services map, classifier deletion flow, shared packages, ground-truth/HITL dataset flows); remaining docs tracked in feature-docs/20260702-docs-sync-cleanup/remaining-audit-checklist.md.
- Added the docs-sync skill (.claude/skills/docs-sync/) encoding ingest/audit/add/archive workflows and a docs-md-wide link checker.
- Untracked generated docs/wiki*.html (gitignored; built at deploy).

## [2026-07-03] lint | Completed code-verified audit of all 88 active docs

- Finished the remaining 56 doc audits inline (architecture, auth, benchmarking, extraction, frontend, groups UI, monitoring, operations, workflows batches); notable fixes: blob key scheme is group-scoped `{groupId}/{category}/...`, confusion-matrix derivation is the confusion-profiles module, legacy step-based enrichment config removed, node catalog now covers all registry activities, DAG engine historical migration appendix replaced.
- Gap scan across backend/temporal/frontend/packages/ops/CI found one substantive gap: added docs-md/operations/CI_WORKFLOWS.md (GitHub Actions map). Thin modules (queue, health, ocr) are covered indirectly by upload/HA/template-model docs.
- Archived stray docs/LOGGING.md as docs-md/archive/LOGGING_CATEGORIES_2026-03.md.

## [2026-07-03] ingest | Add Extraction wiki topic page

- Added `extraction.md` topic page routing the 11 OCR/extraction docs (previously reachable only by folder browsing); linked from `index.md` and registered in `sources.md`. Resolves the extraction-topic open question.

## [2026-07-08] ingest | Reconcile develop-merged feature docs with topic taxonomy

- Relocated 7 feature docs merged from develop that had landed in `docs-md/` root into topic folders: `architecture/DOCUMENT_CONTENT_HASH.md`, `architecture/EPHEMERAL_DOCUMENT_CLEANUP.md`, `architecture/TRANSACTION_AND_AUDIT_AUDIT.md`, `extraction/OCR_FAILURE_HANDLING.md`, and three `frontend/` UX docs; fixed all resulting dangling links and updated `CLAUDE.md` / `.github/copilot-instructions.md` paths.
- Corrected package drift: `@ai-di/graph-workflow-config` was consolidated into `@ai-di/graph-workflow` (fixed `SHARED_PACKAGES.md`, `workflows/workflow-config-overrides.md`, `workflows/DAG_WORKFLOW_ENGINE.md`, `extraction/OCR_IMPROVEMENT_PIPELINE.md`; removed the dead temporal `build:graph-workflow-config` script).
- Added new docs for previously-undocumented merged subsystems: `workflows/TEMPORAL_PAYLOAD_FOOTPRINT.md` (gzip codec + OCR payload refs) and `extraction/OCR_RESULT_VIEWS.md` (AI-1445); routed both from `graph-workflows.md` / `extraction.md` and registered the codec package in `sources.md`.
- Expanded `architecture/AUDIT.md` (group, tables, `document_deleted`, `system_bootstrap` domains; hybrid benchmark audit; `recordEvent(events, tx?)`) and reconciled the stale Findings-vs-Summary contradiction in `TRANSACTION_AND_AUDIT_AUDIT.md`.
- Fixed `benchmarking/LOAD_TESTING.md` HA row: backend `backend-services/pvc.yml` (RWX blob PVC) was removed; blob storage is object storage via `BLOB_STORAGE_PROVIDER`.

## [2026-07-17] ingest | pgBackRest restore runbook

- Added `docs-md/operations/PGBACKREST_RESTORE.md`: step-by-step runbook for restoring the backend (`app-pg`) and Temporal (`temporal-pg`) databases from automated pgBackRest backups in OpenShift. Covers inspecting available backups, scaling down application pods, patching `spec.backups.pgbackrest.restore` for a latest or named-backup restore, triggering the operator's in-place restore by annotation (the cluster is not shut down), monitoring it, removing the restore spec, and scaling back up.
- Added the `pgBackRest List Backups` and `pgBackRest Database Restore` GitHub Actions workflows, which automate that runbook for the test and prod environments.

## [2026-07-23] ingest | Add Billing topic and canonical usage-metering doc (AI-1580)

- Added `docs-md/architecture/USAGE_METERING_AND_BILLING.md` as the canonical how-it-works/how-to-use doc for the AI-1580 usage-metering + spending-cap feature (data model, rate versions, cap check, storage charging, env config, API, known limitations).
- Added `billing.md` topic page routing to it and the `packages/billing/` + backend/temporal billing source areas; linked from `index.md` and registered in `sources.md` (routing row, stable-docs entry, code-adjacent sources).
- Recorded the soft-cap-vs-"atomic"-REQUIREMENTS contradiction and the `.env.sample` blob-flag name drift in `open-questions.md`.

## [2026-08-18] maintenance | Retire resolved billing drift risks

- Removed the soft-cap-vs-"atomic"-REQUIREMENTS contradiction and the `.env.sample` blob-flag name drift from `open-questions.md` and `billing.md`: `REQUIREMENTS.md` now describes the cap as a best-effort soft cap, and `.env.sample` now carries the flag name the temporal code reads (`CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY`).
- Replaced them in `billing.md` with the standing risk that the backend and Temporal activity registries can diverge, leaving an activity unpriced and therefore silently free.
- Dropped `billing.md`'s pointer to `open-questions.md`, which no longer carries a billing section.

## [2026-08-28] maintenance | Backup RPO/RTO doc + DOCUMENT_RETENTION_DAYS agreed value

- Created `docs-md/operations/BACKUP_RPO_RTO.md` recording RPO (4 h) and RTO (~2 weeks) as set by PR #238 (weekly fulls, 4-hour incrementals, 2-full count retention).
