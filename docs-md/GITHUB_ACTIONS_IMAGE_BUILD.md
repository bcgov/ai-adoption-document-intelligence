# GitHub Actions Image Build Workflow

## Overview

The `build-instance-images.yml` workflow builds container images for all application services and pushes them to GitHub Container Registry (ghcr.io). This enables OpenShift to pull pre-built images when deploying developer instances.

## Workflow Location

`.github/workflows/build-instance-images.yml`

## Trigger

The workflow is triggered manually via `workflow_dispatch`. It can be invoked from the GitHub Actions UI or programmatically via the GitHub CLI / API (e.g., from a deploy script).

### Inputs

| Input | Required | Description |
|-------|----------|-------------|
| `branch` | No | Branch to build images from. Defaults to the branch the workflow is triggered on. |

### Example: Trigger via GitHub CLI

```bash
gh workflow run build-instance-images.yml --ref feature/my-thing
```

### Example: Trigger via GitHub API

```bash
curl -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/<org>/ai-adoption-document-intelligence/actions/workflows/build-instance-images.yml/dispatches" \
  -d '{"ref":"feature/my-thing"}'
```

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

1. **Sanitized branch name** -- the git branch name converted to a valid OCI tag (lowercase, special characters replaced with hyphens, truncated to 128 characters).
2. **Full commit SHA** -- for exact traceability to source code.

### Tag Examples

For branch `feature/my-thing` at commit `abc1234...`:

```
ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:feature-my-thing
ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:abc1234...
ghcr.io/<org>/ai-adoption-document-intelligence/frontend:feature-my-thing
ghcr.io/<org>/ai-adoption-document-intelligence/frontend:abc1234...
ghcr.io/<org>/ai-adoption-document-intelligence/temporal:feature-my-thing
ghcr.io/<org>/ai-adoption-document-intelligence/temporal:abc1234...
```

## Authentication

### Pushing (GitHub Actions)

The workflow uses the built-in `GITHUB_TOKEN` with `permissions: packages: write`. No Personal Access Token (PAT) is required.

### Pulling (OpenShift)

No pull secret or authentication is required. The repository and its ghcr.io packages are public, so OpenShift can pull images directly.

## Relationship to Existing CI/CD

This workflow is **additive** and does not modify any existing workflows:

- `build-apps.yml` -- existing Artifactory-based CI/CD, untouched
- `migrate-db.yml` -- existing database migration workflow, untouched
- `db-backup-manual.yml` -- existing backup workflow, untouched
- `db-restore.yml` -- existing restore workflow, untouched

The existing pipelines continue to use Artifactory. This new workflow uses ghcr.io exclusively for developer instance deployments on OpenShift Silver.

## Caching

The workflow uses Docker Buildx layer caching via `actions/cache` to speed up subsequent builds for the same service.
