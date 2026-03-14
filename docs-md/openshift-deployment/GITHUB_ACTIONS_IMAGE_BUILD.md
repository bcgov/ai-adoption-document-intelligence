# GitHub Actions Image Build Workflow

## Overview

The `build-instance-images.yml` workflow builds container images for all application services and pushes them to GitHub Container Registry (ghcr.io). OpenShift pulls these images when deploying developer instances.

## Workflow Location

`.github/workflows/build-instance-images.yml`

## Trigger

The workflow is triggered manually via `workflow_dispatch`. It can be invoked from the GitHub Actions UI or programmatically via the GitHub CLI (the deploy script does this automatically).

### Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `branch` | No | Branch to build from. Defaults to the triggering branch. |

## Services Built

The workflow builds images for all three application services in parallel:

| Service | Dockerfile | Build Context |
|---------|-----------|---------------|
| `backend-services` | `apps/backend-services/Dockerfile` | Repository root (`.`) |
| `frontend` | `apps/frontend/Dockerfile` | `apps/frontend` |
| `temporal` | `apps/temporal/Dockerfile` | Repository root (`.`) |

Build contexts match the existing Dockerfiles' expectations (`backend-services` and `temporal` require the repo root for access to `apps/shared`).

## Image Tags

Each image is tagged with two values:

1. **Sanitized branch name** -- lowercase, special characters replaced with hyphens, truncated to 128 characters
2. **Full commit SHA** -- for exact traceability

Example for branch `feature/my-thing` at commit `abc1234...`:

```
ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:feature-my-thing
ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:abc1234...
```

## Authentication

### Pushing (GitHub Actions)

Uses the built-in `GITHUB_TOKEN` with `permissions: packages: write`. No PAT required.

### Pulling (OpenShift)

No pull secret or authentication required. The repository and its ghcr.io packages are public.

## Relationship to Existing CI/CD

This workflow is additive. Existing workflows (`build-apps.yml`, `migrate-db.yml`, `db-backup-manual.yml`, `db-restore.yml`) and their Artifactory-based pipelines remain untouched.

## Caching

The workflow uses Docker Buildx layer caching via `actions/cache` to speed up subsequent builds.

## Service Account Permissions

The service account created by `oc-setup-sa.sh` has broad permissions for deployment operations:

| API Group | Resources | Verbs |
|-----------|-----------|-------|
| (core) | services, configmaps, secrets, persistentvolumeclaims, pods, events | get, list, watch, create, update, patch, delete |
| (core) | pods/exec | create |
| (core) | pods/log | get |
| `apps` | deployments, deployments/scale, replicasets, replicasets/scale, statefulsets | get, list, watch, create, update, patch, delete |
| `batch` | jobs, cronjobs | get, list, watch, create, update, patch, delete |
| `route.openshift.io` | routes | get, list, watch, create, update, patch, delete |
| `route.openshift.io` | routes/custom-host | create |
| `postgres-operator.crunchydata.com` | postgresclusters | get, list, watch, create, update, patch, delete |
| `networking.k8s.io` | networkpolicies | get, list, watch, create, update, patch, delete |
| `autoscaling` | horizontalpodautoscalers | get, list, watch, create, update, patch, delete |
