# Auto-Deploy on push to `develop`

## Overview

When a commit lands on `develop` (typically via PR merge), the `Deploy Instance` workflow automatically builds images and deploys them to the shared `bcgov-di-test` instance in the `fd34fb-test` OpenShift namespace.

This replaces the prior manual flow (local `scripts/oc-deploy.sh` + ad-hoc tag pushes via `build-apps.yml`) for test-namespace deployments.

## What happens on a push to `develop`

1. **Trigger**: `push` to `develop`.
2. **Metadata job** fixes the deployment target:
   - Instance: `bcgov-di-test`
   - Namespace: `fd34fb-test`
   - Image tag: `bcgov-di-test` (single floating tag — no SHA accumulation)
   - GitHub environment: `test`
   - Checkout ref: the merge commit SHA on `develop`
3. **Build job** (parallel matrix): `backend-services`, `frontend`, `temporal`. Each image is pushed to `<artifactory>/kfd3-fd34fb-local/<service>:bcgov-di-test`, overwriting the prior manifest.
4. **Deploy job**:
   - Generates a Kustomize overlay from `deployments/openshift/kustomize/overlays/instance-template`, substituting instance/namespace/cluster-domain/image tags.
   - `oc apply`s the rendered manifests.
   - Creates/updates the `bcgov-di-test-artifactory-pull` image-pull secret, the `bcgov-di-test-backend-services-secrets`, and `bcgov-di-test-temporal-worker-secrets` from GitHub env secrets.
   - Helm-installs the per-instance PLG monitoring stack (Grafana/Loki/Prometheus).
   - `oc rollout restart` on all app deployments; the backend's `migrate-db` init container runs `prisma migrate deploy` on fresh-pod start. No separate migrate step.
   - Runs `scripts/artifactory-cleanup.sh --delete` to reclaim storage from orphan `sha256__*` manifests left behind by the tag overwrite (non-blocking).

## Concurrency

The workflow uses a per-ref concurrency group with `cancel-in-progress: true`. If two commits land on `develop` in rapid succession, the older run is cancelled and the newer commit is deployed. This prevents races on the shared `bcgov-di-test` instance.

## Image tagging strategy

| Target | Tag pattern | Rotation |
|---|---|---|
| Test (push to `develop`) | `bcgov-di-test` (floating, single tag) | Overwritten on every push; orphan manifests garbage-collected by cleanup step |
| Production (future, on push to `main`) | `bcgov-di` (floating) + `bcgov-di-<sha>` (immutable) | Rollback via the SHA-pinned tag; rotation of old SHA tags handled by scheduled cleanup |

## Pre-requisites

### GitHub `test` environment

Must exist with the following secrets (populate with `scripts/gh-setup-test-env.sh` — see below):

- All keys from `deployments/openshift/config/dev.env` (bulk-loaded): Artifactory, Azure, SSO, throttles, etc.
- `OPENSHIFT_TOKEN` — service-account token for `fd34fb-test` (extracted from `.oc-deploy/token-fd34fb-test`)
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
- `gh secret set -f deployments/openshift/config/dev.env --env test` to bulk-load the shared secrets without printing values.
- Extracts the `TOKEN=` value from `.oc-deploy/token-fd34fb-test` and pipes it into `gh secret set OPENSHIFT_TOKEN --env test`.
- Sets `OPENSHIFT_NAMESPACE` and `OPENSHIFT_SERVER` to their test values.

Secret values never touch stdout.

## `workflow_dispatch` path

The workflow still accepts manual dispatch from any branch. In that case it falls back to the branch-derived behavior: instance and image tag derived from the branch name, deployed to the `dev` GitHub environment (namespace `fd34fb-dev`).
