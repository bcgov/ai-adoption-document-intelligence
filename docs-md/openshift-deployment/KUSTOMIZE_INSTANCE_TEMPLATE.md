# Kustomize Instance Template

## Overview

The instance template is a parameterized Kustomize overlay at `deployments/openshift/kustomize/overlays/instance-template/` that generates fully isolated, instance-specific Kubernetes manifests. It enables multiple independent deployments of the full application stack within a single OpenShift namespace.

## How It Works

The template uses placeholder tokens that the deploy script replaces with actual values before running `kustomize build`. This generates a complete set of Kubernetes resources where every resource is prefixed, labeled, and configured for a specific instance.

### Placeholder Tokens

| Token | Description | Example Value |
|-------|-------------|---------------|
| `__INSTANCE_NAME__` | Sanitized instance name (max 20 chars) | `feature-deployment-f` |
| `__NAMESPACE__` | OpenShift namespace | `fd34fb-prod` |
| `__CLUSTER_DOMAIN__` | Cluster wildcard domain | `apps.silver.devops.gov.bc.ca` |
| `__BACKEND_IMAGE__` | Backend container image (without tag) | `ghcr.io/org/repo/backend-services` |
| `__FRONTEND_IMAGE__` | Frontend container image (without tag) | `ghcr.io/org/repo/frontend` |
| `__WORKER_IMAGE__` | Temporal worker container image (without tag) | `ghcr.io/org/repo/temporal` |
| `__IMAGE_TAG__` | Image tag for all services (max 128 chars, decoupled from instance name) | `feature-deployment-features` |
| `__SSO_AUTH_SERVER_URL__` | Keycloak/SSO authentication server URL | `https://sso.example.com/auth` |
| `__SSO_REALM__` | SSO realm name | `my-realm` |
| `__SSO_CLIENT_ID__` | SSO client identifier | `my-client` |

### Kustomize Features Used

- **`namePrefix`**: Prefixes all resource names with `<instance-name>-`. Kustomize automatically updates cross-references (Service selectors, ConfigMap/Secret refs, PVC claims).
- **`commonLabels`**: Adds `app.kubernetes.io/instance: <instance-name>` to all resources, including pod template labels and selector matchLabels.
- **`images`**: Overrides base image references to point to ghcr.io images for the current branch.
- **`patches`**: Updates hardcoded in-cluster service references, sets route hostnames, fixes operator-managed secret references, and configures SSO settings.
- **`configurations`**: References `kustomize-config.yml` which defines `nameReference` rules so Kustomize auto-updates Route `spec.to.name` when `namePrefix` is applied.

### What Gets Patched

Kustomize's `namePrefix` handles most cross-references automatically, but several categories of references require explicit patches:

#### Hardcoded string values (env vars / ConfigMap data)
- **Temporal server deployment**: `POSTGRES_SEEDS` env var updated to reference the prefixed PostgreSQL service (`temporal-pg-primary`)
- **Temporal UI deployment**: `TEMPORAL_ADDRESS` env var updated to reference the prefixed Temporal service
- **Backend services ConfigMap**: `TEMPORAL_ADDRESS`, `FRONTEND_URL`, `BACKEND_URL`, `SSO_REDIRECT_URI`, and SSO settings (`SSO_AUTH_SERVER_URL`, `SSO_REALM`, `SSO_CLIENT_ID`)
- **Temporal worker ConfigMap**: `TEMPORAL_ADDRESS` updated to reference the prefixed Temporal service
- **Route hostnames**: Set to `<instance>-<service>-<namespace>.<cluster-domain>` (single level under wildcard cert to avoid `ERR_CERT_COMMON_NAME_INVALID`)
- **NetworkPolicies**: Scoped to only allow ingress from pods with the same instance label and from the OpenShift ingress router

#### Operator-managed secret references (not auto-prefixed by Kustomize)
Crunchy PostgreSQL operator creates secrets with names derived from the PostgresCluster resource name. Since Kustomize doesn't manage these secrets (they're created by the operator at runtime), `secretKeyRef` names in deployments must be patched explicitly:
- **Backend services**: `migrate-db` init container and `backend-services` container both reference `<instance>-app-pg-pguser-admin`
- **Temporal server**: `config-init` and `schema-setup` init containers plus `temporal` container reference `<instance>-temporal-pg-pguser-temporal` (6 total secretKeyRef entries)
- **Temporal worker**: References `<instance>-app-pg-pguser-admin`

#### PostgresCluster databaseInitSQL
- **Temporal PostgresCluster**: `databaseInitSQL.name` patched to `<instance>-temporal-postgres-init-sql` (Kustomize doesn't auto-update this CRD field)

## Instance Isolation

Each instance gets its own complete, independent stack:

- Crunchy PostgreSQL cluster (app database)
- Crunchy PostgreSQL cluster (Temporal database)
- Temporal server, worker, and UI (UI is not publicly exposed — use `oc port-forward` for local access)
- Backend services deployment
- Frontend deployment
- Routes for frontend and backend (with instance-specific hostnames)
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
  --namespace "fd34fb-prod" \
  --cluster-domain "apps.silver.devops.gov.bc.ca" \
  --backend-image "ghcr.io/org/repo/backend-services" \
  --frontend-image "ghcr.io/org/repo/frontend" \
  --worker-image "ghcr.io/org/repo/temporal" \
  --image-tag "feature-my-thing")

# Use the overlay
oc apply -k "${OVERLAY_DIR}"

# Clean up
cleanup_generated_overlay "${OVERLAY_DIR}"
```

The function copies the template to a nested temporary directory structure (`tmpdir/overlays/instance/`) with a symlink (`tmpdir/base` -> real base dir) so the relative path `../../base` in the kustomization resolves correctly. It replaces all placeholder tokens and returns the path. The caller is responsible for cleanup via `cleanup_generated_overlay`.

### Testing

```bash
bash scripts/lib/generate-overlay.test.sh
```

## Existing Overlays

The instance template is additive. Existing overlays at `deployments/openshift/kustomize/overlays/` (`dev/`, `test/`, `prod/`) are not modified.
