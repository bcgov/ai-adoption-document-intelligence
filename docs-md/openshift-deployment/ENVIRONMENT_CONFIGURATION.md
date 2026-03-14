# Environment Configuration

## Overview

Environment configuration for OpenShift deployments is managed via `.env` files in `deployments/openshift/config/`. Two environment profiles are provided: `dev` and `prod`. All settings — including secrets — live in a single file per profile. Instance-specific overrides can be layered on top.

## Configuration Files

| File | Purpose |
|------|---------|
| `deployments/openshift/config/dev.env` | All configuration for dev deployments (gitignored) |
| `deployments/openshift/config/prod.env` | All configuration for prod deployments (gitignored) |
| `deployments/openshift/config/dev.env.example` | Source-controlled template with placeholder values |
| `deployments/openshift/config/prod.env.example` | Source-controlled template with placeholder values |
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
| `CLUSTER_DOMAIN` | Cluster wildcard domain (e.g., `apps.silver.devops.gov.bc.ca`). Route hostnames are computed as `<instance>-<service>-<namespace>.<CLUSTER_DOMAIN>` to stay under the wildcard cert. |

### Computed at Deploy Time (not in .env files)

These values are derived automatically by the deploy script — do not set them in config files:

| Variable | Computed As |
|----------|-------------|
| `FRONTEND_URL` | `https://<instance>-frontend-<namespace>.<CLUSTER_DOMAIN>` |
| `BACKEND_URL` | `https://<instance>-backend-<namespace>.<CLUSTER_DOMAIN>` |
| `SSO_REDIRECT_URI` | `<BACKEND_URL>/api/auth/callback` |
| `TEMPORAL_ADDRESS` | `<instance>-temporal:7233` |

### Application Settings

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Node.js environment (`production` for all OpenShift deployments) |
| `PORT` | Backend service port |
| `BODY_LIMIT` | Request body size limit |

### SSO / Keycloak

| Variable | Secret | Description |
|----------|--------|-------------|
| `SSO_AUTH_SERVER_URL` | No | Keycloak/SSO authentication server URL |
| `SSO_REALM` | No | SSO realm name |
| `SSO_CLIENT_ID` | No | SSO client identifier |
| `SSO_CLIENT_SECRET` | Yes | SSO client secret |
| `VITE_SSO_AUTH_SERVER_URL` | No | Frontend SSO auth server URL (build arg) |
| `VITE_SSO_REALM` | No | Frontend SSO realm (build arg) |
| `VITE_SSO_CLIENT_ID` | No | Frontend SSO client ID (build arg) |

### Azure Document Intelligence

| Variable | Secret | Description |
|----------|--------|-------------|
| `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` | No | Azure Document Intelligence API endpoint |
| `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` | Yes | Azure Document Intelligence API key |
| `AZURE_DOC_INTELLIGENCE_MODELS` | No | Comma-separated allowed model IDs |

### Azure Blob Storage

| Variable | Secret | Description |
|----------|--------|-------------|
| `BLOB_STORAGE_PROVIDER` | No | Storage backend (`azure` for cloud) |
| `AZURE_STORAGE_CONTAINER_NAME` | No | Azure blob container name |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes | Azure storage connection string |
| `AZURE_STORAGE_ACCOUNT_NAME` | Yes | Azure storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | Yes | Azure storage account key |

### Azure OpenAI (LLM Enrichment)

| Variable | Secret | Description |
|----------|--------|-------------|
| `AZURE_OPENAI_ENDPOINT` | No | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_API_KEY` | Yes | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | No | OpenAI deployment/model name |
| `AZURE_OPENAI_API_VERSION` | No | OpenAI API version (e.g., `2024-02-15-preview`) |
| `ENRICHMENT_REDACT_PII` | No | Redact PII in LLM enrichment (`true`/`false`) |

### Temporal

| Variable | Description |
|----------|-------------|
| `TEMPORAL_NAMESPACE` | Temporal namespace |
| `TEMPORAL_TASK_QUEUE` | Temporal task queue name |
| `BENCHMARK_TASK_QUEUE` | Benchmark processing task queue |
| `ENABLE_BENCHMARK_QUEUE` | Enable separate benchmark worker |

### Database SSL

| Variable | Description |
|----------|-------------|
| `PGSSLMODE` | PostgreSQL SSL mode |
| `PGSSLREJECTUNAUTHORIZED` | Whether to reject unauthorized SSL certs |

### Frontend Build Args

| Variable | Description |
|----------|-------------|
| `VITE_APP_NAME` | Application display name |
| `VITE_APP_VERSION` | Application version |
| `VITE_ENV` | Environment identifier |

### Bootstrap (First-Time Setup)

| Variable | Description |
|----------|-------------|
| `BOOTSTRAP_ADMIN_EMAIL` | Email of the user who should be promoted to system admin on first launch. The Setup page only appears when zero admins exist in the database. Once bootstrap is complete this variable has no effect. |

### Rate Limiting

| Variable | Description |
|----------|-------------|
| `THROTTLE_GLOBAL_TTL_MS` | Global rate limit window in milliseconds |
| `THROTTLE_GLOBAL_LIMIT` | Max requests per IP globally |
| `THROTTLE_AUTH_TTL_MS` | Auth endpoint rate limit window |
| `THROTTLE_AUTH_LIMIT` | Max auth requests per IP (stricter in prod) |
| `THROTTLE_AUTH_REFRESH_TTL_MS` | Token refresh rate limit window |
| `THROTTLE_AUTH_REFRESH_LIMIT` | Max refresh requests per IP (stricter in prod) |

## How Secrets Reach the Pods

The deploy script creates per-instance OpenShift Secrets from values in the env file. Each instance gets its own copy.

### backend-services-secrets

Created by the deploy script with keys:
- `SSO_CLIENT_SECRET`
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_ACCOUNT_KEY`

Referenced by the backend-services deployment via `secretKeyRef`.

### temporal-worker-secrets

Created by the deploy script with keys:
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_ACCOUNT_KEY`

Referenced by the temporal-worker deployment via `secretKeyRef`.

### Auto-Managed Secrets (not in env files)

| Secret | Managed By | Description |
|--------|-----------|-------------|
| `<instance>-app-pg-pguser-admin` | Crunchy Operator | PostgreSQL connection credentials (`DATABASE_URL`) |
| `<instance>-temporal-pg-pguser-temporal` | Crunchy Operator | Temporal database credentials |
