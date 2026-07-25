# Docs Sync, Cleanup & Maintenance Skill — Design

Date: 2026-07-02
Branch: `AI-1296-docs-sync` (based on `AI-1296`, PR targets `AI-1296` to stack on #198)

## Goal

Fully synchronize `docs-md/` with the codebase, reorganize it from a flat dump into a topic-folder taxonomy, sync the repo wiki (`docs-md/wiki/`, introduced in PR #198) to the new structure, fix drift in the hand-written `docs/` site pages, and add a Claude Code skill that keeps documentation maintained going forward.

## Decisions (confirmed with Alex)

- Stale/point-in-time docs move to `docs-md/archive/` (delete only truly worthless files); `git mv` preserves history.
- Reorganize into topic subfolders aligned with wiki topics; keep existing filenames to minimize churn; add `docs-md/README.md` index.
- Full accuracy audit of every active doc against code, executed with multi-agent workflows (explicitly approved).
- Hand-written `docs/_pages/` HTML pages are in scope for drift review.
- Maintenance skill is a project skill checked into `.claude/skills/`.

## Phases

### Phase 1 — Triage & reorganize

Classify every file in `docs-md/` as active / archive / delete. Move active docs into:

- `architecture/` — system-level design docs (HITL architecture, database services/roles, tables, template models, shared packages, blob storage, HA)
- `workflows/` — merges `graph-workflows/`, `workflow-builder/`, `temporal/`; plus workflow lineage, config overrides, worker concurrency
- `extraction/` — OCR/AI model docs, confusion profiles, enrichment, field format engine, ground truth, HITL dataset creation
- `auth/` — authentication, group resource authorization
- `groups/` — existing `group/` content
- `operations/` — merges `openshift-deployment/`; Azure infrastructure, secrets, npm hardening, archive/audit runbooks
- `monitoring/` — PLG stack, Grafana/Loki/Prometheus/Promtail, logging, dashboards, metrics, alerting
- `benchmarking/` — benchmarking docs, load testing
- `frontend/` — BC design system, UI patterns, reference data tables UI
- `archive/` — point-in-time artifacts (load test reports, rapid assessment, migration statuses, PR reviews, old plans/audits) with a README stating the policy
- `wiki/` — unchanged location and rules

Add `docs-md/README.md` describing the taxonomy and pointing to `docs-md/wiki/index.md` as the entrypoint.

### Phase 2 — Accuracy audit & gap closure

Multi-agent workflow: one auditor per active doc (grouped by folder) verifies concrete claims against code — file paths, commands, env vars, endpoints, Prisma models, node/activity names — and returns structured findings. Fixer agents apply corrections. A gap-analysis pass sweeps `apps/` (and `scripts/`, infra) for substantive subsystems with no doc coverage and writes missing docs into the taxonomy.

### Phase 3 — Wiki sync

Follow the ingest/lint workflows in `docs-md/wiki/README.md`: update topic pages' `canonical_sources` to new paths, refresh `sources.md`, record contradictions in `open-questions.md`, append `log.md` entries, run `npm run docs:wiki:check` until green. Wiki remains a routing layer — no duplicated content.

### Phase 4 — docs/ site

Review `docs/_pages/` for drift against reality and broken references from the reorg; verify `docs/build.sh` succeeds. Do not commit generated `docs/wiki*.html`.

### Phase 5 — Maintenance skill

New project skill `.claude/skills/docs-sync/` encoding the recurring workflow: triage what changed → verify affected docs against code → update docs in the correct topic folder → wiki ingest steps → `npm run docs:wiki:check`. References wiki README / AGENTS.md rules instead of duplicating them. Triggers: "sync docs", "audit docs", "docs maintenance".

## Verification

- `npm run docs:wiki:check` green
- Link sweep across `docs-md/` for dangling relative links
- `docs/build.sh` succeeds
- Final summary lists every file moved, archived, and deleted for review
