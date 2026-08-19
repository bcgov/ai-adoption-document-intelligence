# CI Workflows Overview

Map of the GitHub Actions workflows in `.github/workflows/`. Deployment mechanics are detailed in [AUTO_DEPLOY.md](AUTO_DEPLOY.md); this page is the index.

## Quality assurance (per PR to `main`/`develop`)

| Workflow | File | What it runs |
| --- | --- | --- |
| Backend Quality Assurance | `backend-qa.yml` | Lint, type-check, and tests for `apps/backend-services` |
| Frontend Quality Assurance | `frontend-qa.yml` | Lint, type-check, and tests for `apps/frontend` |
| Temporal Quality Assurance | `temporal-qa.yml` | Lint, type-check, and tests for `apps/temporal` |
| Wiki Check | `wiki-check.yml` | `npm run docs:wiki:check` — only when `docs-md/wiki/**` or the validator changes |

All QA workflows also support `workflow_dispatch`. Local equivalents run as lefthook pre-commit hooks (`lefthook.yml`): per-app biome lint + `tsc --noEmit`, scoped to matching staged files.

## Security scanning (PRs and pushes to `main`/`develop`)

| Workflow | File | What it scans |
| --- | --- | --- |
| CodeQL | `codeql.yml` | Static analysis of JS/TS code |
| Checkov | `checkov.yml` | IaC misconfiguration (Kubernetes/OpenShift manifests, Dockerfiles) |
| Hadolint | `hadolint.yml` | Dockerfile linting (PRs only) |
| Dependency Review | `dependency-review.yml` | New dependency vulnerabilities/licenses (PRs only) |

## Deploy and publish

| Workflow | File | Trigger | What it does |
| --- | --- | --- | --- |
| Deploy Instance | `deploy-instance.yml` | Push to `develop`/`main`, or manual dispatch from any branch | Builds images and deploys to OpenShift — see [AUTO_DEPLOY.md](AUTO_DEPLOY.md) |
| Deploy GitHub Pages | `pages.yml` | Push to `main` touching `docs/**`, `docs-md/wiki/**`, the wiki builder, or `package.json` | Runs `docs/build.sh` (pages, wiki HTML, Mermaid diagrams) and publishes the `docs/` site |

## Manual operations (`workflow_dispatch` only)

| Workflow | File | What it does |
| --- | --- | --- |
| Database Backup | `db-backup-manual.yml` | One-off backup of a named Crunchy PostgreSQL cluster (see also `scripts/oc-backup-db.sh` and [BACKUP_TO_NETWORK_SHARE.md](BACKUP_TO_NETWORK_SHARE.md)) |
| Database Restore | `db-restore.yml` | Restore a named cluster from a backup |
| Release | `release.yml` | Creates a release pull request via `changesets/action` |
