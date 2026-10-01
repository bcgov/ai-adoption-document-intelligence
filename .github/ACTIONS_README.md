# GitHub Actions

This directory contains the repository workflows and custom actions used for quality checks, deployments, database operations, releases, documentation publishing, and security scanning.

## Overview

The current workflow set covers:

- Application quality checks for backend, frontend, and temporal services
- Image builds and OpenShift deployments
- Database backup listing and restore
- Release automation
- Documentation site publishing and wiki checks
- Pull request and branch security scanning

Workflow files live in `.github/workflows`, and reusable repository actions live in `.github/actions`. The index of workflows with their triggers is [docs-md/operations/CI_WORKFLOWS.md](../docs-md/operations/CI_WORKFLOWS.md).

## Core workflows

### Quality assurance

- `backend-qa.yml`
  - Pull request quality gate for `apps/backend-services`
  - Runs lint, type-check, and test coverage commands
- `frontend-qa.yml`
  - Pull request quality gate for `apps/frontend`
  - Runs lint, type-check, and test commands
- `temporal-qa.yml`
  - Pull request quality gate for `apps/temporal`
  - Runs lint, type-check, and test commands

Each runs on pull requests to `main` or `develop` that touch its app, `packages/**`, or its own workflow file; the backend and temporal checks also watch `apps/shared/**`.

### Deployment and release

- `deploy-instance.yml`
  - Builds the application images and deploys them to OpenShift
  - A push to `develop` deploys the shared test instance; production is deployed by a manual run from `main` with the `prod` environment
  - See [AUTO_DEPLOY.md](../docs-md/operations/AUTO_DEPLOY.md)
- `release.yml`
  - Manual workflow that creates a release pull request via `changesets/action`

### Documentation

- `pages.yml`
  - Builds the `docs/` site with `docs/build.sh` and publishes it on pushes to `main` that touch `docs/**`, `docs-md/wiki/**`, the wiki builder, or `package.json`
- `wiki-check.yml`
  - Runs `npm run docs:wiki:check` on pull requests that change `docs-md/wiki/**` or the validator

### Database operations

- `pgbackrest-list-backups.yml`
  - Lists the pgBackRest backup labels available for a cluster (read-only)
- `pgbackrest-restore.yml`
  - Restores a cluster from an automated pgBackRest backup — see
    [PGBACKREST_RESTORE.md](../docs-md/operations/PGBACKREST_RESTORE.md)

## Security workflows

The repository security baseline now includes:

- `codeql.yml`
  - CodeQL analysis for TypeScript, Python, and GitHub Actions content
- `dependency-review.yml`
  - Pull request dependency review for supported dependency changes
- `hadolint.yml`
  - Dockerfile lint and security checks
- `checkov.yml`
  - Blocking Dockerfile checks and advisory deployment/workflow scans

See [CI_WORKFLOWS.md](../docs-md/operations/CI_WORKFLOWS.md) for when each scan runs.

## Custom actions

### `get-environment`

Maps the branch name to an environment name: `main` → `prod`, `stage` → `test`, any other branch → `dev`. Used by the quality assurance workflows.

## Environment configuration

Deployment secrets live in the GitHub environments `dev`, `test`, and `prod`, one set per target. `deploy-instance.yml` selects the environment for each run: `test` for a push to `develop`, otherwise the environment picked when the workflow is run manually. The `prod` environment's deployment branch rule allows only `main`.

## Required secrets

`deploy-instance.yml` reads its secrets from the selected GitHub environment; [AUTO_DEPLOY.md](../docs-md/operations/AUTO_DEPLOY.md#pre-requisites) lists what each environment needs. Common ones include:

- `OPENSHIFT_SERVER`, `OPENSHIFT_TOKEN`, `OPENSHIFT_NAMESPACE`
- `ARTIFACTORY_URL`, `ARTIFACTORY_SA_USERNAME`, `ARTIFACTORY_SA_PASSWORD`
- `VITE_*` build inputs for the frontend image, plus Azure, SSO, and app-config values

## Pipeline relationship

At a high level:

1. Pull requests run QA and security workflows.
2. A push to `develop` builds images and deploys the shared test instance.
3. A manual `Deploy Instance` run from `main` with the `prod` environment builds and deploys production.
