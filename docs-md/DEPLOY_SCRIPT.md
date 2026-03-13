# Deploy Script (oc-deploy.sh)

## Overview

`oc-deploy.sh` is a single-command deployment script that deploys the full application stack (frontend, backend, Temporal server + worker + UI, and Crunchy PostgreSQL database) as a fully isolated instance on OpenShift.

## Prerequisites

- **Service account token**: Run `./scripts/oc-setup-sa.sh --namespace <namespace>` first (creates `.oc-deploy-token`)
- **Code pushed to GitHub**: Images are built from the remote branch via GitHub Actions
- **gh CLI**: Installed and authenticated (for triggering image builds)
- **oc CLI**: Installed (for applying resources to OpenShift)

## Usage

```bash
# Deploy using current git branch as instance name
./scripts/oc-deploy.sh --env dev

# Deploy with a custom instance name
./scripts/oc-deploy.sh --env dev --instance my-custom-name

# Deploy to production profile
./scripts/oc-deploy.sh --env prod
```

### Options

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--env` | `-e` | Yes | Environment profile: `dev` or `prod` |
| `--instance` | `-i` | No | Instance name override (default: derived from git branch) |
| `--help` | `-h` | No | Show help message |

## Deploy Flow

The script executes the following steps in order:

1. **Token validation** -- Reads `.oc-deploy-token` and authenticates with OpenShift using the service account token. Exits with a clear error if the file is missing or incomplete.

2. **Instance name resolution** -- Derives the instance name from the current git branch (sanitized for Kubernetes naming) or uses the `--instance` override.

3. **Configuration loading** -- Loads `deployments/openshift/config/<env>.env` as base defaults, then merges any instance-specific overrides from `deployments/openshift/config/<instance-name>.env` if the file exists.

4. **Image build/verification** -- Checks whether container images exist on `ghcr.io` for the current branch. If images are missing, triggers the `build-instance-images.yml` GitHub Actions workflow and waits for completion.

5. **Overlay generation** -- Generates an instance-specific Kustomize overlay from the `instance-template`, replacing placeholders with actual image references, instance name, and route hostnames.

6. **Resource application** -- Applies the generated overlay to OpenShift via `oc apply -k`.

7. **Rollout monitoring** -- Waits for all deployments (backend, frontend, temporal, temporal-ui, temporal-worker) to roll out successfully, with a 5-minute timeout per deployment.

8. **URL output** -- Prints the access URLs for the frontend, backend, and Temporal UI.

## Configuration

Environment configuration files are located at `deployments/openshift/config/`:

- `dev.env` -- Default configuration for development deployments
- `prod.env` -- Default configuration for production deployments
- `<instance-name>.env` -- Optional per-instance overrides

### Required Configuration Keys

| Key | Description | Example |
|-----|-------------|---------|
| `ROUTE_HOST_SUFFIX` | Route hostname suffix for OpenShift routes | `fd34fb-dev.apps.silver.devops.gov.bc.ca` |

All other keys are application-specific settings (SSO, Azure, Temporal, etc.) that are passed through to the deployed resources.

## Image Registry

Images are stored on GitHub Container Registry at:
- `ghcr.io/bcgov/ai-adoption-document-intelligence/backend-services:<tag>`
- `ghcr.io/bcgov/ai-adoption-document-intelligence/frontend:<tag>`
- `ghcr.io/bcgov/ai-adoption-document-intelligence/temporal:<tag>`

The image tag matches the sanitized git branch name.

## Error Handling

The script exits with a non-zero status and clear error message for:

- Missing `.oc-deploy-token` file (directs user to run `oc-setup-sa.sh`)
- Incomplete or expired token
- Failed image builds
- Failed resource application
- Deployment rollout timeouts (5-minute limit per deployment)

## Deployed Resources

Each instance gets its own isolated set of:

- Frontend deployment + service + route
- Backend services deployment + service + route
- Temporal server deployment + service
- Temporal UI deployment + service + route
- Temporal worker deployment
- Crunchy PostgreSQL cluster
- ConfigMaps, Secrets, PVCs, NetworkPolicies

All resources are labeled with `app.kubernetes.io/instance=<instance-name>` and prefixed with `<instance-name>-`.
