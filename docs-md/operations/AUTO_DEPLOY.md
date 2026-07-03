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
3. **Build job** (parallel matrix): `backend-services`, `frontend`, `temporal`, `ches-adapter`. Each image is pushed to `<artifactory>/kfd3-fd34fb-local/<service>:<tag>` for every tag resolved by metadata — so prod builds push to both the floating tag and the SHA tag in one buildx invocation.
4. **Deploy job**:
   - Generates a Kustomize overlay from `deployments/openshift/kustomize/overlays/instance-template`, substituting instance/namespace/cluster-domain/image tags plus SSO and app-config values.
   - `oc apply`s the rendered manifests.
   - Creates/updates the `<instance>-artifactory-pull` image-pull secret (and patches each deployment to use it), plus `<instance>-backend-services-secrets` and `<instance>-temporal-worker-secrets` from GitHub env secrets. For `develop` pushes the instance is `bcgov-di-test`, so e.g. `bcgov-di-test-artifactory-pull`.
   - Generates Prometheus alert rules (`npm run generate:alert-rules`), creates the `<instance>-ches-adapter-secrets` and `<instance>-plg-alertmanager-adapter-secret` secrets, then Helm-installs the per-instance PLG monitoring stack (Grafana/Loki/Prometheus/Alertmanager + CHES adapter). Gated by the workflow-level `DEPLOY_PLG` env (currently `"true"`); immutable Loki/Prometheus StatefulSets are deleted (`--cascade=orphan`, PVCs preserved) before the Helm upgrade.
   - `oc rollout restart` on all app deployments; the backend's `migrate-db` init container runs `prisma migrate deploy` on fresh-pod start. No separate migrate step.
   - Runs `scripts/artifactory-cleanup.sh --delete` to reclaim storage from orphan `sha256__*` manifests left behind by the tag overwrite (non-blocking). For prod it also rotates rollback tags: `--keep 3 --match "<instance>-????????????"` keeps the 3 most recent SHA-suffixed tags per image and deletes the rest.

## Concurrency

The workflow uses a per-ref concurrency group with `cancel-in-progress: true`. If two commits land on the same branch in rapid succession, the older run is cancelled and the newer commit is deployed. Pushes to `develop` and `main` run independently.

## Image tagging strategy

| Target | Tag pattern | Rollback | Rotation |
|---|---|---|---|
| Test (push to `develop`) | `bcgov-di-test` (floating, single tag) | Re-deploy a previous commit by rebuilding it | Overwritten on every push; orphan manifests garbage-collected post-deploy |
| Prod (push to `main`) | `bcgov-di` (floating) + `bcgov-di-<sha12>` (immutable) | `oc set image .../<svc>=<registry>/<svc>:bcgov-di-<old-sha12>` | Post-deploy cleanup step in the same workflow keeps the 3 most recent `bcgov-di-<sha12>` tags per image and deletes the rest (the 12-char glob never matches the floating `bcgov-di` / `bcgov-di-test` tags) |

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

One-time step: while logged in to the cluster with a personal account, run

```bash
./scripts/oc-setup-sa.sh --namespace fd34fb-test
```

The script creates a `deploy-sa` service account with a scoped Role/RoleBinding (`deploy-sa-role` / `deploy-sa-rolebinding`), mints a long-lived token (`oc create token --duration=87600h`), and writes it to `.oc-deploy/token-fd34fb-test` (also copied to the default `.oc-deploy/token`).

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

The workflow supports manual dispatch from any branch with explicit inputs:

- `environment` (`dev|test`, default `dev`)
- `namespace` (optional OpenShift namespace override)
- `instance_name` (optional instance name override)

Manual-dispatch behavior:

- By default, instance and image tag are branch-derived (same as before).
- If `instance_name` is provided, it overrides the branch-derived instance name.
- The selected `environment` is used as the GitHub environment for both build and deploy jobs, so environment-specific secrets (including `test`) are honored.
- If `namespace` is not provided, deploy uses `OPENSHIFT_NAMESPACE` from the selected GitHub environment secrets.
