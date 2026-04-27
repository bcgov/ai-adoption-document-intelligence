# Auto-Deploy on push to `develop` and `main`

## Overview

The `Deploy Instance` workflow automatically builds images and deploys them to the appropriate OpenShift instance whenever a commit lands on `develop` or `main`:

| Branch | Instance | Namespace | GH environment | Image tags |
|---|---|---|---|---|
| `develop` | `bcgov-di-test` | `fd34fb-test` | `test` | `bcgov-di-test` (floating) |
| `main` | `bcgov-di` | `fd34fb-prod` | `prod` | `bcgov-di` (floating) + `bcgov-di-<sha12>` (immutable, for rollback) |

This replaces the prior manual flow (local `scripts/oc-deploy.sh` + ad-hoc tag pushes via the now-retired `build-apps.yml`) for test and production deployments.

## What happens on a push

1. **Trigger**: `push` to `develop` or `main`.
2. **Metadata job** resolves instance name, namespace, image tag(s), and GH environment based on which branch was pushed (see table above).
3. **Build job** (parallel matrix): `backend-services`, `frontend`, `temporal`. Each image is pushed to `<artifactory>/kfd3-fd34fb-local/<service>:<tag>` for every tag resolved by metadata — so prod builds push to both the floating tag and the SHA tag in one buildx invocation.
4. **Deploy job**:
   - Generates a Kustomize overlay from `deployments/openshift/kustomize/overlays/instance-template`, substituting instance/namespace/cluster-domain/image tags.
   - `oc apply`s the rendered manifests.
   - Creates/updates the `bcgov-di-test-artifactory-pull` image-pull secret, the `bcgov-di-test-backend-services-secrets`, and `bcgov-di-test-temporal-worker-secrets` from GitHub env secrets.
   - Helm-installs the per-instance PLG monitoring stack (Grafana/Loki/Prometheus).
   - `oc rollout restart` on all app deployments; the backend's `migrate-db` init container runs `prisma migrate deploy` on fresh-pod start. No separate migrate step.
   - Runs `scripts/artifactory-cleanup.sh --delete` to reclaim storage from orphan `sha256__*` manifests left behind by the tag overwrite (non-blocking).

## Concurrency

The workflow uses a per-ref concurrency group with `cancel-in-progress: true`. If two commits land on the same branch in rapid succession, the older run is cancelled and the newer commit is deployed. Pushes to `develop` and `main` run independently.

## Image tagging strategy

| Target | Tag pattern | Rollback | Rotation |
|---|---|---|---|
| Test (push to `develop`) | `bcgov-di-test` (floating, single tag) | Re-deploy a previous commit by rebuilding it | Overwritten on every push; orphan manifests garbage-collected post-deploy |
| Prod (push to `main`) | `bcgov-di` (floating) + `bcgov-di-<sha12>` (immutable) | `oc set image .../<svc>=<registry>/<svc>:bcgov-di-<old-sha12>` | Scheduled cleanup keeps the N most recent `bcgov-di-*` SHA tags and deletes the rest |

## Pre-requisites

### GitHub environments

- `test` — populated by `scripts/gh-setup-test-env.sh` (see below). All shared secrets mirror `dev`, with `OPENSHIFT_*` overridden for `fd34fb-test`.
- `prod` — already configured with production OpenShift and Azure/SSO secrets. Secrets sourced from `deployments/openshift/config/prod.env` + the `fd34fb-prod` SA token.

Both environments should have:
- `OPENSHIFT_TOKEN` — service-account token for the matching namespace
- `OPENSHIFT_NAMESPACE` — literal namespace name (`fd34fb-test` or `fd34fb-prod`)
- `OPENSHIFT_SERVER` — cluster API URL (`https://api.silver.devops.gov.bc.ca:6443`)
- `ARTIFACTORY_URL`, `ARTIFACTORY_SA_USERNAME`, `ARTIFACTORY_SA_PASSWORD`
- Azure, SSO, and app-config secrets as referenced in the workflow

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
