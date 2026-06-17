# Open Questions

Use this page for contradictions, drift candidates, and ownership gaps that should not be hidden inside topic pages.

## Current Questions

- Should stable feature docs in `feature-docs/` be promoted, archived, or linked as historical context after implementation is complete?
- Which docs from `docs-md/` should eventually be published through the generated `docs/` site, and which should remain repo-only?
- ~~Should the wiki validator become a CI check after the team has used it for a few PRs?~~ Resolved: `.github/workflows/wiki-check.yml` runs `npm run docs:wiki:check` on PRs to `main` and `develop`.

## Drift Candidates

- `README.md`, `apps/README.md`, and `docs-md/wiki/system-overview.md` all describe platform shape at different levels.
- `docs-md/graph-workflows/` and `docs-md/workflow-builder/` intentionally overlap; the wiki should keep routing clear between engine behavior and UI authoring.
- Operational docs under `docs-md/openshift-deployment/`, `scripts/README.md`, and workflow files in `.github/workflows/` should stay aligned.
