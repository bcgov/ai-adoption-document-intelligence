# Open Questions

Use this page for contradictions, drift candidates, and ownership gaps that should not be hidden inside topic pages.

## Current Questions

- Should historical or audit folders (`docs-md/archive/temp/`, `docs/superpowers/`, old feature specs) be promoted, archived, or linked as historical context after implementation is complete? **Partially addressed:** see `docs-md/archive/README.md` for index and stale-pattern warnings; per-feature archive policy still TBD.
- ~~Which docs from `docs-md/` should eventually be published through the generated `docs/` site, and which should remain repo-only?~~ Partially resolved: selected guides (benchmarking, authentication, integrations) are published via `docs/_pages/`; implementation docs and the repo wiki remain in `docs-md/` (wiki HTML is generated at deploy, not committed). Revisit when adding new public pages.
- ~~Should the wiki validator become a CI check after the team has used it for a few PRs?~~ Resolved: `.github/workflows/wiki-check.yml` runs `npm run docs:wiki:check` on PRs to `main` and `develop`.

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

- Branch AI-1296: `apps/backend-services/Dockerfile` and `apps/temporal/Dockerfile` do not COPY/build `packages/graph-workflow-config` and `packages/temporal-payload-codec` although both apps declare them as `file:` dependencies — image builds from this branch fail at `npm install`. Develop is unaffected (packages not merged there yet). Needs a code fix, not a docs fix.
- `docs-md/extraction/` (11 OCR/extraction docs) has no dedicated wiki topic page; routing currently goes through folder browsing only. Create an extraction topic page if navigation demand appears.
- Frontend `GroupRequest` interface (`apps/frontend/src/data/hooks/useGroups.ts`) declares an `actorId` field the backend never returns (dead field).
- `scripts/lib/instance-name.test.sh` has 2 pre-existing failing expectations (1.4, 2.7) exceeding the 20-char truncation documented in `docs-md/operations/INSTANCE_NAME_DERIVATION.md`.
- ~56 docs still need code-verified audit; checklist: `feature-docs/20260702-docs-sync-cleanup/remaining-audit-checklist.md`.
