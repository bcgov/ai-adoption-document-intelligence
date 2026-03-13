# Environment Configuration

## Overview

Environment configuration for OpenShift deployments is managed via `.env` files in `deployments/openshift/config/`. Two environment profiles are provided: `dev` and `prod`. Instance-specific overrides can be layered on top.

## Configuration Files

| File | Purpose |
|------|---------|
| `deployments/openshift/config/dev.env` | Default configuration for development deployments |
| `deployments/openshift/config/prod.env` | Default configuration for production deployments |
| `deployments/openshift/config/<instance-name>.env` | Optional instance-specific overrides |

## Configuration Merge Order

1. Profile defaults (`dev.env` or `prod.env`) are loaded first
2. Instance overrides (`<instance-name>.env`) are merged on top, if the file exists
3. Instance values take precedence over profile defaults

## Config Loader Library

The `scripts/lib/config-loader.sh` library provides functions for loading and merging configuration:

```bash
source scripts/lib/config-loader.sh

# Load config with profile and optional instance override
load_config --env dev --instance my-instance

# Access individual values
get_config SSO_CLIENT_ID

# Export all values as environment variables
export_config

# Print all loaded config
print_config
```

### Functions

| Function | Description |
|----------|-------------|
| `load_config --env <profile> [--instance <name>]` | Load profile config with optional instance overrides |
| `get_config <key>` | Get a single config value by key |
| `export_config` | Export all loaded values as environment variables |
| `print_config` | Print all loaded key=value pairs (sorted) |
| `get_config_dir` | Return the path to the config directory |

### Testing

```bash
bash scripts/lib/config-loader.test.sh
```

## Configuration Variables

### OpenShift Cluster / Routing

| Variable | Description |
|----------|-------------|
| `CLUSTER_DOMAIN` | Cluster wildcard domain (e.g., `apps.silver.devops.gov.bc.ca`). The deploy script computes `ROUTE_HOST_SUFFIX` as `<namespace>.<CLUSTER_DOMAIN>` automatically from the namespace in `.oc-deploy-token`. |

### Computed at Deploy Time (not in .env files)

These values are derived automatically by the deploy script — do not set them in config files:

| Variable | Computed As |
|----------|-------------|
| `ROUTE_HOST_SUFFIX` | `<namespace>.<CLUSTER_DOMAIN>` |
| `FRONTEND_URL` | `https://<instance>-frontend.<ROUTE_HOST_SUFFIX>` |
| `BACKEND_URL` | `https://<instance>-backend.<ROUTE_HOST_SUFFIX>` |
| `SSO_REDIRECT_URI` | `<BACKEND_URL>/api/auth/callback` |
| `TEMPORAL_ADDRESS` | `<instance>-temporal:7233` |

### Per-Environment Profile (not per-instance)

These variables differ between `dev` and `prod` profiles:

| Variable | Description |
|----------|-------------|
| `SSO_AUTH_SERVER_URL` | Keycloak/SSO authentication server URL |
| `SSO_REALM` | SSO realm name |
| `SSO_CLIENT_ID` | SSO client identifier |
| `VITE_SSO_AUTH_SERVER_URL` | Frontend SSO auth server URL (build arg) |
| `VITE_SSO_REALM` | Frontend SSO realm (build arg) |
| `VITE_SSO_CLIENT_ID` | Frontend SSO client ID (build arg) |
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | Azure Document Intelligence API endpoint |
| `VITE_ENV` | Environment identifier for frontend |
| `THROTTLE_AUTH_LIMIT` | Auth endpoint rate limit (stricter in prod) |
| `THROTTLE_AUTH_REFRESH_LIMIT` | Token refresh rate limit (stricter in prod) |

### Common Settings (same across profiles)

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Node.js environment (`production` for all OpenShift deployments) |
| `PORT` | Backend service port |
| `BODY_LIMIT` | Request body size limit |
| `BLOB_STORAGE_PROVIDER` | Blob storage backend (`azure` for cloud) |
| `AZURE_STORAGE_CONTAINER_NAME` | Azure blob container name |
| `TEMPORAL_NAMESPACE` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | Temporal task queue name |
| `PGSSLMODE` | PostgreSQL SSL mode |
| `PGSSLREJECTUNAUTHORIZED` | Whether to reject unauthorized SSL certs |

## Secrets

Secrets (API keys, client secrets, connection strings) are **not** stored in config files. They are managed via OpenShift Secrets:

- `SSO_CLIENT_SECRET` - SSO client secret
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` - Azure Document Intelligence API key
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Blob Storage connection string
- `DATABASE_URL` - PostgreSQL connection string (from Crunchy Operator)
