# Kustomize Instance Template

## Overview

The instance template is a parameterized Kustomize overlay at `deployments/openshift/kustomize/overlays/instance-template/` that generates fully isolated, instance-specific Kubernetes manifests. It enables multiple independent deployments of the full application stack within a single OpenShift namespace.

## How It Works

The template uses placeholder tokens that the deploy script replaces with actual values before running `kustomize build`. This generates a complete set of Kubernetes resources where every resource is prefixed, labeled, and configured for a specific instance.

### Placeholder Tokens

| Token | Description | Example Value |
|-------|-------------|---------------|
| `__INSTANCE_NAME__` | Sanitized instance name | `feature-my-thing` |
| `__ROUTE_HOST_SUFFIX__` | Cluster wildcard DNS suffix | `apps.silver.devops.gov.bc.ca` |
| `__BACKEND_IMAGE__` | Backend container image (without tag) | `ghcr.io/org/repo/backend-services` |
| `__FRONTEND_IMAGE__` | Frontend container image (without tag) | `ghcr.io/org/repo/frontend` |
| `__WORKER_IMAGE__` | Temporal worker container image (without tag) | `ghcr.io/org/repo/temporal` |
| `__IMAGE_TAG__` | Image tag for all services | `feature-my-thing` |

### Kustomize Features Used

- **`namePrefix`**: Prefixes all resource names with `<instance-name>-`. Kustomize automatically updates cross-references (Service selectors, ConfigMap/Secret refs, PVC claims).
- **`commonLabels`**: Adds `app.kubernetes.io/instance: <instance-name>` to all resources, including pod template labels and selector matchLabels.
- **`images`**: Overrides base image references to point to ghcr.io images for the current branch.
- **`patches`**: Updates hardcoded in-cluster service references and sets route hostnames.

### What Gets Patched

Kustomize's `namePrefix` handles most cross-references automatically, but hardcoded string values inside env vars and ConfigMap data fields require explicit patches:

- **Temporal server deployment**: `POSTGRES_SEEDS` env var updated to reference the prefixed PostgreSQL service
- **Temporal UI deployment**: `TEMPORAL_ADDRESS` env var updated to reference the prefixed Temporal service
- **Backend services ConfigMap**: `TEMPORAL_ADDRESS` updated to reference the prefixed Temporal service
- **Temporal worker ConfigMap**: `TEMPORAL_ADDRESS` updated to reference the prefixed Temporal service
- **Route hostnames**: Set to `<instance>-<service>.<route-suffix>` for external access
- **NetworkPolicies**: Scoped to only allow ingress from pods with the same instance label and from the OpenShift ingress router

## Instance Isolation

Each instance gets its own complete, independent stack:

- Crunchy PostgreSQL cluster (app database)
- Crunchy PostgreSQL cluster (Temporal database)
- Temporal server, worker, and UI
- Backend services deployment
- Frontend deployment
- Routes (with instance-specific hostnames)
- ConfigMaps and Secrets
- PVCs
- NetworkPolicies (scoped to instance label, preventing cross-instance traffic)

## Overlay Generation Library

The `scripts/lib/generate-overlay.sh` library provides functions to generate and clean up instance-specific overlays:

```bash
source scripts/lib/generate-overlay.sh

# Generate an overlay
OVERLAY_DIR=$(generate_instance_overlay \
  --instance "feature-my-thing" \
  --route-suffix "apps.silver.devops.gov.bc.ca" \
  --backend-image "ghcr.io/org/repo/backend-services" \
  --frontend-image "ghcr.io/org/repo/frontend" \
  --worker-image "ghcr.io/org/repo/temporal" \
  --image-tag "feature-my-thing")

# Use the overlay
oc apply -k "${OVERLAY_DIR}"

# Clean up
cleanup_generated_overlay "${OVERLAY_DIR}"
```

The function copies the template to a temporary directory, replaces all placeholder tokens, and returns the path. The caller is responsible for cleanup via `cleanup_generated_overlay`.

### Testing

```bash
bash scripts/lib/generate-overlay.test.sh
```

## Existing Overlays

The instance template is additive. Existing overlays at `deployments/openshift/kustomize/overlays/` (`dev/`, `test/`, `prod/`) are not modified.
