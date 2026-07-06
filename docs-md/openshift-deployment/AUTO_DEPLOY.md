# Auto-Deploy on push to `develop` and `main`

## Overview

The `Deploy Instance` workflow automatically builds images and deploys them to the appropriate OpenShift instance whenever a commit lands on `develop` or `main`:

| Branch | Instance | Namespace | GH environment | Floating tag (live) | Staged tag (build/deploy) |
|---|---|---|---|---|---|
| `develop` | `bcgov-di-test` | `fd34fb-test` | `test` | `bcgov-di-test` | `bcgov-di-test-<sha12>` |
| `main` | `bcgov-di` | `fd34fb-prod` | `prod` | `bcgov-di` | `bcgov-di-<sha12>` |

This replaces the prior manual flow (local `scripts/oc-deploy.sh` + ad-hoc tag pushes via the now-retired `build-apps.yml`) for test and production deployments.

## What happens on a push

1. **Trigger**: `push` to `develop` or `main`.
2. **Metadata job** resolves instance name, floating tag, SHA tag, namespace, and GH environment.
3. **Build job** (parallel matrix): `backend-services`, `frontend`, `temporal`, `ches-adapter`. Each image is pushed **only** to the immutable SHA tag (`<floating>-<sha12>`). The floating tag is not updated during build.
4. **Deploy job**:
   - Verifies all four staged images exist in Artifactory at the SHA tag.
   - Generates a Kustomize overlay using the **SHA tag** (not the floating tag).
   - `oc apply`s the rendered manifests.
   - Creates/updates instance secrets and the Artifactory pull secret.
   - Deletes immutable PLG StatefulSets (Loki, Prometheus, Alertmanager) with `--cascade=orphan` when needed, then Helm-installs the PLG stack.
   - `oc rollout restart` on all app deployments and **fails the job** if any rollout times out or namespace quota is exhausted.
   - **Promotes** staged SHA tags to the floating tag via `docker buildx imagetools create` (only after rollouts succeed).
   - Runs `scripts/artifactory-cleanup.sh --delete` to rotate old SHA tags and reclaim orphan manifests (non-blocking).
5. **Cleanup on failure**: If build or deploy fails, a follow-up job deletes the run's SHA tags and reclaims orphans via `scripts/artifactory-delete-run-tags.sh`.

## Staging model

```mermaid
flowchart LR
  Build[Build matrix] -->|"push SHA tag only"| Artifactory
  Artifactory --> Deploy[Deploy from SHA tag]
  Deploy --> Rollout[Rollout must succeed]
  Rollout --> Promote[Promote SHA to floating tag]
  Build -.->|failure| Cleanup[Delete SHA tags]
  Deploy -.->|failure| Cleanup
```

**Why**: Pushing to the floating tag during build meant an OpenShift pod restart (or partial matrix success) could pull a mix of new and old images. Staging by SHA keeps the floating tag unchanged until deploy and rollout complete.

## Concurrency

The workflow uses a per-ref concurrency group with `cancel-in-progress: true`. If two commits land on the same branch in rapid succession, the older run is cancelled and the newer commit is deployed. Pushes to `develop` and `main` run independently.

## Image tagging strategy

| Target | Staged tag | Floating tag | Rollback | Rotation |
|---|---|---|---|---|
| Test (`develop`) | `bcgov-di-test-<sha12>` | `bcgov-di-test` | Re-deploy a previous commit | Keep 10 most recent SHA tags per image |
| Prod (`main`) | `bcgov-di-<sha12>` | `bcgov-di` | `oc set image .../<svc>=<registry>/<svc>:bcgov-di-<old-sha12>` | Keep 3 most recent SHA tags per image |
| Manual (`workflow_dispatch`) | `<branch-tag>-<sha12>` | `<branch-tag>` | Rebuild and redeploy | Keep 10 most recent SHA tags |

## Artifactory login retries

The build and promote steps retry `docker login` up to three times with a 15-second backoff (`scripts/lib/artifactory-login.sh`) to handle intermittent `Client.Timeout exceeded` errors against the registry.

## Rollout failure handling

The deploy job uses `scripts/lib/wait-for-rollouts.sh`, which:

- Checks namespace resource quotas before restarting deployments (fails at ≥95% utilization).
- Fails the workflow (not just a warning) when `oc rollout status` times out.
- Emits pod status, `FailedScheduling` events, and quota details on failure.

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

The workflow supports manual dispatch from any branch with explicit inputs:

- `environment` (`dev|test`, default `dev`)
- `namespace` (optional OpenShift namespace override)
- `instance_name` (optional instance name override)

Manual-dispatch behavior:

- By default, instance and floating image tag are branch-derived (same as before).
- SHA tag is `<floating-tag>-<sha12>`.
- If `instance_name` is provided, it overrides the branch-derived instance name.
- The selected `environment` is used as the GitHub environment for both build and deploy jobs, so environment-specific secrets (including `test`) are honored.
- If `namespace` is not provided, deploy uses `OPENSHIFT_NAMESPACE` from the selected GitHub environment secrets.

## Local deploy parity

```bash
# Build staged images (pushes to <tag>-<sha12>, not floating tag)
./scripts/oc-build-push.sh --env dev --all --tag my-loadtest

# Deploy using the staged SHA tag
./scripts/oc-deploy-instance.sh --env dev --namespace fd34fb-test \
  --image-tag my-loadtest-<sha12> --instance loadtest-1 --confirm

# After successful deploy, promote to floating tag
./scripts/oc-build-push.sh --env dev --tag my-loadtest --promote
```
