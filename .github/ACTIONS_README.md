# GitHub Actions

This directory contains the repository workflows and custom actions used for quality checks, image builds, database operations, releases, and security scanning.

## Overview

The current workflow set covers:

- Application quality checks for backend, frontend, and temporal services
- Docker image builds and Artifactory pushes
- Database migration, backup, and restore tasks
- Release automation
- Pull request and branch security scanning

Workflow files live in `.github/workflows`, and reusable repository actions live in `.github/actions`.

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

These workflows intentionally avoid top-level `paths` filters so they always publish a check result for protected-branch pull requests.

### Build and release workflows

- `build-apps.yml`
  - Runs on pushes to `main` and `develop`
  - Detects changed applications, including shared Prisma inputs for backend and temporal
  - Builds and pushes Docker images to Artifactory
  - Scans built image digests with Grype
- `build-instance-images.yml`
  - Manual workflow for building per-branch images
  - Scans built image digests with Grype
- `migrate-db.yml`
  - Applies database migrations and coordinates downstream deployment work
- `release.yml`
  - Release automation workflow

### Database operations

- `db-backup-manual.yml`
  - Manual PostgreSQL backup workflow
- `db-restore.yml`
  - Manual PostgreSQL restore workflow

## Security workflows

The repository security baseline now includes:

- `codeql.yml`
  - CodeQL analysis for TypeScript, Python, and GitHub Actions content
- `dependency-review.yml`
  - Pull request dependency review for supported dependency changes
- `python-dependency-audit.yml`
  - `uv` plus `pip-audit` coverage for `apps/image-service`
- `hadolint.yml`
  - Dockerfile lint and security checks
- `checkov.yml`
  - Blocking Dockerfile checks and advisory deployment/workflow scans

See `docs-md/security-scanning.md` for the operating model, blocking rules, and GitHub settings that must be enabled outside the repository.

## Custom actions

### `get-environment`

Determines the deployment environment name from the branch context.

### `migrate-db`

Runs the repository database migration logic.

### `trigger-deploy`

Triggers deployment work in the target OpenShift environment.

## Environment configuration

The repository currently uses environment-specific secrets and deployment configuration. The reusable `get-environment` action maps:

- `main` -> `prod`
- `stage` -> `test`
- other branches -> `dev`

Even though `build-apps.yml` now targets `main` and `develop`, the environment mapping still exists for workflows that may resolve other refs.

## Required secrets

Common workflow secrets include:

- `OPENSHIFT_SERVER`
- `OPENSHIFT_API_TOKEN`
- `ARTIFACTORY_URL`
- `ARTIFACTORY_SA_USERNAME`
- `ARTIFACTORY_SA_PASSWORD`
- Application-specific configuration values such as `VITE_*`, `REACT_APP_URL`, `DATABASE_URL`, and similar runtime/build inputs

## Pipeline relationship

At a high level:

1. Pull requests run QA and security workflows.
2. Protected-branch pushes build and scan images.
3. Database and deployment workflows consume those build outputs as needed.
