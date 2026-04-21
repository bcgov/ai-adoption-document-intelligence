# Auto-Deploy on PR to `develop`

## Overview

When a pull request is opened against the `develop` branch (or an existing PR is updated), the `Deploy Instance` workflow automatically builds images and deploys them to the shared `bcgov-di-test` instance in the `fd34fb-test` OpenShift namespace.

This replaces the prior manual flow (local `scripts/oc-deploy.sh` + ad-hoc tag pushes via `build-apps.yml`) for test-namespace deployments.

## What happens on a PR

1. **Trigger**: `pull_request` events with action `opened`, `synchronize`, `reopened`, or `ready_for_review` on PRs targeting `develop`. Drafts and PRs from forks are skipped.
2. **Metadata job** fixes the deployment target:
   - Instance: `bcgov-di-test`
   - Namespace: `fd34fb-test`
   - Image tag: `bcgov-di-test` (single floating tag — no SHA accumulation)
   - GitHub environment: `test`
   - Checkout ref: the PR's HEAD commit SHA
3. **Build job** (parallel matrix): `backend-services`, `frontend`, `temporal`. Each image is pushed to `<artifactory>/kfd3-fd34fb-local/<service>:bcgov-di-test`, overwriting the prior manifest.
4. **Deploy job**:
   - Generates a Kustomize overlay from `deployments/openshift/kustomize/overlays/instance-template`, substituting instance/namespace/cluster-domain/image tags.
   - `oc apply`s the rendered manifests.
   - Creates/updates the `bcgov-di-test-backend-services-secrets` and `bcgov-di-test-temporal-worker-secrets` secrets from GitHub env secrets.
   - Helm-installs the per-instance PLG monitoring stack (Grafana/Loki/Prometheus).
   - `oc rollout restart` on all app deployments; the backend's `migrate-db` init container runs `prisma migrate deploy` on fresh-pod start. No separate migrate step.
   - Runs `scripts/artifactory-cleanup.sh --delete` to reclaim storage from orphan `sha256__*` manifests left behind by the tag overwrite (non-blocking).
   - Comments on the PR with the frontend/backend URLs.

## Concurrency

The workflow uses a `pr-to-develop` concurrency group with `cancel-in-progress: true`. If a new push lands on a PR while a deploy is running, the older run is cancelled and the newer commit is deployed. This prevents races on the shared `bcgov-di-test` instance.

## Image tagging strategy

| Target | Tag pattern | Rotation |
|---|---|---|
| Test (PR-to-develop) | `bcgov-di-test` (floating, single tag) | Overwritten on every push; orphan manifests garbage-collected by cleanup step |
| Production (future, on merge to `main`) | `bcgov-di` (floating) + `bcgov-di-<sha>` (immutable) | Rollback via the SHA-pinned tag; rotation of old SHA tags handled by scheduled cleanup |

## Pre-requisites

### GitHub `test` environment

Must exist with the following secrets (populate with `scripts/gh-setup-test-env.sh` — see below):

- All keys from `deployments/openshift/config/dev.env` (bulk-loaded): Artifactory, Azure, SSO, throttles, etc.
- `OPENSHIFT_TOKEN` — service-account token for `fd34fb-test` (from `.oc-deploy/token-fd34fb-test`)
- `OPENSHIFT_NAMESPACE` — literal `fd34fb-test`
- `OPENSHIFT_SERVER` — `https://api.silver.devops.gov.bc.ca:6443`

### OpenShift service account in `fd34fb-test`

One-time manual step: create a deploy SA in the `fd34fb-test` namespace with the same permissions as in `fd34fb-prod`. The existing `scripts/oc-setup-sa.sh` supports `--env dev|prod` today; for test it must be done manually until that script is extended (or we'll extract this into a workflow later).

Minimum: `oc create serviceaccount deploy` + `oc policy add-role-to-user admin -z deploy` + `oc create token deploy --duration=8760h > .oc-deploy/token-fd34fb-test`.

## Bootstrapping the test environment

Run once, locally, after minting the test SA token:

```bash
./scripts/gh-setup-test-env.sh
```

The script:

- Creates the GitHub `test` environment (no protection rules).
- `gh secret set -f deployments/openshift/config/dev.env --env test` to bulk-load ~48 shared secrets without printing values.
- Pipes `.oc-deploy/token-fd34fb-test` into `gh secret set OPENSHIFT_TOKEN --env test`.
- Sets `OPENSHIFT_NAMESPACE` and `OPENSHIFT_SERVER` to their test values.

Secret values never touch stdout.

## `workflow_dispatch` path (unchanged)

The workflow still accepts manual dispatch from any branch. In that case it falls back to the previous behavior: instance and image tag derived from the branch name, deployed to the `dev` GitHub environment (namespace `fd34fb-dev`).

## Relationship to other workflows (transition state)

`build-apps.yml` and `build-instance-images.yml` are **still present** and triggered as before. They are now redundant with the new auto-deploy path and can be removed after we confirm the PR-trigger flow works end-to-end in production.

| Workflow | Purpose | Retire after verification? |
|---|---|---|
| `deploy-instance.yml` | Full build + deploy on PR to develop (this doc) | Keep |
| `build-apps.yml` | Legacy: pushes `{branch}-latest` on push to `main`/`develop` | Retire |
| `build-instance-images.yml` | Legacy: build-only; invoked by `scripts/oc-deploy.sh` | Retire (along with `oc-deploy.sh`) |
| `migrate-db.yml` | Legacy: manual `workflow_dispatch` migrate; never auto-triggered | Retire (init container handles migrations) |

## Future: merge-to-develop and merge-to-main

Once PR-trigger is verified, add:

```yaml
push:
  branches: [develop, main]
```

and extend the metadata job to map `develop` → `bcgov-di-test`@test (same as today's PR path) and `main` → `bcgov-di`@prod with dual-tag (`bcgov-di` floating + `bcgov-di-<sha>` immutable).
