# Open Questions

Use this page for contradictions, drift candidates, and ownership gaps that should not be hidden inside topic pages.

## Current Questions

- Should historical or audit folders (`docs-md/temp/`, `docs/superpowers/`, old feature specs) be promoted, archived, or linked as historical context after implementation is complete? **Partially addressed:** see `docs-md/ARCHIVE.md` for index and stale-pattern warnings; per-feature archive policy still TBD.
- ~~Which docs from `docs-md/` should eventually be published through the generated `docs/` site, and which should remain repo-only?~~ Partially resolved: selected guides (benchmarking, authentication, integrations) are published via `docs/_pages/`; implementation docs and the repo wiki remain in `docs-md/` (wiki HTML is generated at deploy, not committed). Revisit when adding new public pages.
- ~~Should the wiki validator become a CI check after the team has used it for a few PRs?~~ Resolved: `.github/workflows/wiki-check.yml` runs `npm run docs:wiki:check` on PRs to `main` and `develop`.

## Documentation Ownership

- **Root `README.md`**: local setup, prerequisites, development commands, project tree.
- **`docs/_pages/`**: public site overview and links; defer detailed setup to root README.
- **`apps/README.md`**: app boundaries and module map; link to root README for setup.
- **`docs-md/wiki/`**: routing map for agents and contributors (see `AGENTS.md`).

## Drift Candidates

- ~~Monitoring compose path in `docs-md/LOCAL_MONITORING_STACK.md` / `ALERTING.md`~~ Resolved: root `docker compose --profile monitoring`.
- ~~`npm run dev` scope in README~~ Resolved: includes temporal worker per `package.json`.
- `README.md`, `apps/README.md`, and `docs-md/wiki/system-overview.md` all describe platform shape at different levels — README owns setup; apps/README is module map; wiki routes only.
- `docs-md/graph-workflows/` and `docs-md/workflow-builder/` intentionally overlap; the wiki should keep routing clear between engine behavior and UI authoring.
- Operational docs under `docs-md/openshift-deployment/`, `scripts/README.md`, and workflow files in `.github/workflows/` should stay aligned.
- `docs-md/workflow-builder/WORKFLOW_BUILDER_GUIDE.md` describes target drag-and-drop authoring; current UI is read-only visualization — guide is marked as design reference.
