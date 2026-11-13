# CI Workflows Overview

Map of the GitHub Actions workflows in `.github/workflows/`. Deployment mechanics are detailed in [AUTO_DEPLOY.md](AUTO_DEPLOY.md); this page is the index.

## Quality assurance (per PR to `main`/`develop`)

| Workflow | File | What it runs |
| --- | --- | --- |
| Backend Quality Assurance | `backend-qa.yml` | Lint, type-check, and tests for `apps/backend-services` |
| Frontend Quality Assurance | `frontend-qa.yml` | Lint, type-check, and tests for `apps/frontend` |
| Temporal Quality Assurance | `temporal-qa.yml` | Lint, type-check, and tests for `apps/temporal` |
| Wiki Check | `wiki-check.yml` | `npm run docs:wiki:check` — only when `docs-md/wiki/**` or the validator changes |
| Pull request title | `pr-title.yml` | The title is a conventional commit (`feat`, `fix`, `docs`, and the other types in the workflow). A scope is optional |

The app QA workflows and Wiki Check also support `workflow_dispatch`. The title check runs when a pull request is opened or its title changes. Local equivalents of the app checks run as lefthook pre-commit hooks (`lefthook.yml`): per-app biome lint + `tsc --noEmit`, scoped to matching staged files.

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
| Deploy Instance | `deploy-instance.yml` | Push to `develop`, or manual dispatch from any branch (`prod` only from `main`) | Builds images and deploys to OpenShift: `develop` pushes to the test instance, a manual `prod` run from `main` to production — see [AUTO_DEPLOY.md](AUTO_DEPLOY.md) |
| Deploy GitHub Pages | `pages.yml` | Pull requests, and pushes to `main`, touching `docs/**`, `docs-md/wiki/**`, or `scripts/sync-docs-wiki.mjs` | Builds the VitePress site in `docs/` with the repo wiki copied in from `docs-md/wiki/`; pull requests only build it, pushes to `main` publish it to GitHub Pages |
| Release | `release.yml` | Push to `main` | Opens one release pull request for the whole product, or tags the release when that pull request merges |

A release is one version for the whole product, `vMAJOR.MINOR.PATCH`. `feat` raises the second number. `fix` raises the third. Before `1.0.0`, a breaking change raises the second number too, so the releaser does not tag `1.0.0` on its own. `docs`, `chore`, `ci`, `test`, `refactor`, `build`, and `style` do not open a release. Commits before `dfd5e3e3` are left out of the changelog. The first release pull request sets the root `package.json` version. It is `1.0.0` today, and that number is not a release.

## Manual operations (`workflow_dispatch` only)

| Workflow | File | What it does |
| --- | --- | --- |
| pgBackRest List Backups | `pgbackrest-list-backups.yml` | Prints the backup labels available for a cluster. Read-only, and the way to find the label the restore workflow needs |
| pgBackRest Database Restore | `pgbackrest-restore.yml` | Restores a cluster from an automated pgBackRest backup, scaling the application down and back up around it — see [PGBACKREST_RESTORE.md](PGBACKREST_RESTORE.md) |
