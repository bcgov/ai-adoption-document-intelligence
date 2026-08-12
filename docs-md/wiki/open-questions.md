# Open Questions

Use this page for contradictions, drift candidates, and ownership gaps that should not be hidden inside topic pages.

## Current Questions

- Should historical or audit folders (`docs-md/archive/temp/`, `docs/superpowers/`, old feature specs) be promoted, archived, or linked as historical context after implementation is complete? **Partially addressed:** see `docs-md/archive/README.md` for index and stale-pattern warnings; per-feature archive policy still TBD.
- ~~Which docs from `docs-md/` should eventually be published through the generated `docs/` site, and which should remain repo-only?~~ Partially resolved: selected guides (benchmarking, authentication, integrations) are published via `docs/_pages/`; implementation docs and the repo wiki remain in `docs-md/` (wiki HTML is generated at deploy, not committed). Revisit when adding new public pages.
- ~~Should the wiki validator become a CI check after the team has used it for a few PRs?~~ Resolved: `.github/workflows/wiki-check.yml` runs `npm run docs:wiki:check` on PRs to `main` and `develop`.

## Billing (AI-1580, in review)

- **Cap semantics contradict the spec.** `feature-docs/20260629185435-usage-metering-billing/REQUIREMENTS.md` describes the spending cap as "atomic" (no two concurrent starts can both pass), but the shipped `preflight-cap-check.service.ts` is a read-only soft check with no budget reservation. `docs-md/architecture/USAGE_METERING_AND_BILLING.md` documents the soft-cap behavior; the REQUIREMENTS wording should be reconciled (or the reservation implemented).
- **`.env.sample` blob-flag name drift.** `.env.sample` lists `CHARGE_FOR_BLOB_TRANSACTION`, but the temporal code reads `CHARGE_FOR_TEMPORAL_BLOB_TRANSACTION_SEPARATELY`. Setting the sample name has no effect; align the sample to the code name.

## Documentation Ownership

- **Root `README.md`**: local setup, prerequisites, development commands, project tree.
- **`docs/_pages/`**: public site overview and links; defer detailed setup to root README.
- **`apps/README.md`**: app boundaries and module map; link to root README for setup.
- **`docs-md/wiki/`**: routing map for agents and contributors (see `AGENTS.md`).

## Drift Candidates

- ~~Monitoring compose path in `docs-md/monitoring/LOCAL_MONITORING_STACK.md` / `ALERTING.md`~~ Resolved: root `docker compose --profile monitoring`.
- ~~`npm run dev` scope in README~~ Resolved: includes temporal worker per `package.json`.
- `README.md`, `apps/README.md`, and `docs-md/wiki/system-overview.md` all describe platform shape at different levels — README owns setup; apps/README is module map; wiki routes only.
- `docs-md/workflows/` and `docs-md/workflows/` intentionally overlap; the wiki should keep routing clear between engine behavior and UI authoring.
- Operational docs under `docs-md/operations/`, `scripts/README.md`, and workflow files in `.github/workflows/` should stay aligned.
- `docs-md/workflows/WORKFLOW_BUILDER_GUIDE.md` describes target drag-and-drop authoring; current UI is read-only visualization — guide is marked as design reference.

## Post-audit follow-ups (2026-07-03)

- ~~Branch AI-1296: Dockerfiles do not COPY/build `packages/graph-workflow-config` and `packages/temporal-payload-codec`~~ Resolved 2026-07-08: `graph-workflow-config` was consolidated into `@ai-di/graph-workflow` (package removed); both Dockerfiles now COPY/build `temporal-payload-codec` and `graph-workflow`.
- ~~`docs-md/extraction/` (11 OCR/extraction docs) has no dedicated wiki topic page~~ Resolved 2026-07-03: added [Extraction](extraction.md) topic page.
- ~~Frontend `GroupRequest` interface declares an `actorId` field the backend never returns~~ Resolved: `actorId` removed from `apps/frontend/src/data/hooks/useGroups.ts`.
- `scripts/lib/instance-name.test.sh` has 2 pre-existing failing expectations (1.4, 2.7) exceeding the 20-char truncation documented in `docs-md/operations/INSTANCE_NAME_DERIVATION.md`.
- ~56 docs still need code-verified audit; checklist: `feature-docs/20260702-docs-sync-cleanup/remaining-audit-checklist.md`.
