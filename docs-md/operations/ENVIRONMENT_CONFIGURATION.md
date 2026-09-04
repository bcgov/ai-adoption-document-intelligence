# Environment Configuration

## Overview

Environment configuration for OpenShift deployments is managed via `.env` files in `deployments/openshift/config/`. Two environment profiles are provided: `dev` and `prod`. All settings — including secrets — live in a single file per profile. Instance-specific overrides can be layered on top.

**CI deployments** (`deploy-instance.yml`) read configuration from GitHub environment secrets (`secrets.*`) for sensitive values. Non-secret PLG monitoring sizing (`loki.pvcSize`, `prometheus.pvcSize`, `loki.retentionDays`, `prometheus.scrapeInterval`) is committed in per-environment Helm values files at `deployments/openshift/helm/plg/values-<env>.yaml`. To change a sizing value, edit the matching values file — no GitHub UI configuration is needed or used for these.

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
| `SSO_REDIRECT_URI` | `<FRONTEND_URL>/api/auth/callback` |
| `TEMPORAL_ADDRESS` | `<instance>-temporal:7233` |

### Artifactory (Image Registry)

| Variable | Secret | Description |
|----------|--------|-------------|
| `ARTIFACTORY_URL` | No | Registry host (e.g., `artifacts.developer.gov.bc.ca`). Image references are computed as `<ARTIFACTORY_URL>/kfd3-fd34fb-local/...` |
| `ARTIFACTORY_SA_USERNAME` | Yes | Artifactory service account username (matches the `ARTIFACTORY_*` GitHub environment secrets used in CI) |
| `ARTIFACTORY_SA_PASSWORD` | Yes | Artifactory service account password |

The deploy script uses these to create the `<instance>-artifactory-pull` docker-registry Secret and patches it into every deployment's `imagePullSecrets`.

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
| `DOCUMENT_INTELLIGENCE_MODE` | No | `live` (default) or `mock`; mock avoids live Azure for classification polling and labeling OCR and returns **503** for template/classifier training — use only on disposable environments |

See [LOAD_TESTING.md](../benchmarking/LOAD_TESTING.md) for load-test usage of `mock`.

### Blob Storage

| Variable | Secret | Description |
|----------|--------|-------------|
| `BLOB_STORAGE_PROVIDER` | No | Storage backend (`azure` for cloud, `minio` for in-cluster MinIO mock — load-test only) |
| `AZURE_STORAGE_CONTAINER_NAME` | No | Azure blob container name |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes | Azure storage connection string |
| `AZURE_STORAGE_ACCOUNT_NAME` | Yes | Azure storage account name |
| `AZURE_STORAGE_ACCOUNT_KEY` | Yes | Azure storage account key |
| `MINIO_DOCUMENT_BUCKET` | No | Bucket created on the per-instance MinIO when `BLOB_STORAGE_PROVIDER=minio` (default `document-blobs`) |
| `MINIO_PVC_SIZE` | No | PVC size for the per-instance MinIO data volume (default `5Gi`); CLI override: `scripts/oc-deploy-instance.sh --minio-pvc-size` |

`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` are not configured through `dev.env`/`prod.env`. The deploy script renders `MINIO_ENDPOINT` from the per-instance Service name and seeds a random `<instance>-minio-credentials` Secret when `--blob-storage-provider minio` is used. See [MANUAL_LOAD_TEST_INSTANCE.md](./MANUAL_LOAD_TEST_INSTANCE.md) for the full opt-in flow.

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
| `MOCK_AZURE_OCR` | Worker OCR stub (`true` / `false`). Use `true` only on disposable stacks (see [LOAD_TESTING.md](../benchmarking/LOAD_TESTING.md)); substituted into the worker ConfigMap by [`scripts/lib/generate-overlay.sh`](../../scripts/lib/generate-overlay.sh). CLI override: `scripts/oc-deploy-instance.sh --mock-azure-ocr`. |

### Database Storage

Prod backup PVC sizes are hardcoded in `deployments/openshift/kustomize/components/prod-resources/kustomization.yml`. Test instances use the base manifest values (10Gi for both). These values are not environment variables and cannot be overridden without editing the kustomize component.

pgBackRest retention differs between the two PostgresClusters (set in the base manifests, not via env overlay):

| Cluster | Retention | Full backup | Incremental |
|---------|-----------|-------------|-------------|
| `app-pg` | **2 most recent fulls** (`repo1-retention-full: '2'` / `repo1-retention-full-type: count`) | Weekly, Sunday 02:00 | Every 4 hours |
| `temporal-pg` | **14 days** (`repo1-retention-full: '14'` / `repo1-retention-full-type: time`) | Daily 02:00 | Hourly |

On `app-pg`, count-based retention bounds the repo size even if a scheduled full is missed; a time-based window would keep growing until the next full succeeded. Incrementals newer than the oldest retained full are kept, so the recoverable window is roughly two weeks. `app-pg` also compresses with zstd (`compress-type: zst`, `compress-level: '3'`) rather than the pgBackRest gz default.

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

### Retention

| Variable | Default | Description |
|----------|---------|-------------|
| `DOCUMENT_RETENTION_DAYS` | *(unset — disabled)* | Number of days after which terminal documents (`complete`, `failed`, `conversion_failed`) are permanently deleted along with their blob-storage files and `ocr_results` rows. A positive integer is required to enable it (e.g. `90`). |
| `AUDIT_EVENT_RETENTION_DAYS` | *(unset — disabled)* | Number of days after which `audit_events` rows are deleted. Confirm statutory retention requirements before setting this in a regulated environment. |
| `BENCHMARK_AUDIT_LOG_RETENTION_DAYS` | *(unset — disabled)* | Number of days after which `benchmark_audit_logs` rows are deleted. |
| `REVIEW_SESSION_RETENTION_DAYS` | *(unset — disabled)* | Number of days after which completed `review_sessions` (approved / escalated / skipped) and their cascading `field_corrections` are deleted. In-progress sessions are never deleted. |

All four janitors default to off. Deletion is permanent. Leave a variable unset or empty to keep that data class indefinitely.

For the document janitor: deletion cascades from the `documents` row to `ocr_results`, `review_sessions`, `field_corrections`, and `document_locks`. Documents in `pre_ocr`, `ongoing_ocr`, `awaiting_review`, or `extracted` are never deleted at any age.

All values are supplied by repository secrets and substituted by `generate_instance_overlay`. See [DOCUMENT_RETENTION.md](../architecture/DOCUMENT_RETENTION.md) for full details.

### Database Connection Pool

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_POOL_MAX` | `10` | Max concurrent PostgreSQL connections per **backend-services** pod. Wired to the Prisma/pg pool (`PrismaPg` `max`). Without an explicit value, Prisma defaults to `num_cpus * 2 + 1`, which is **3** in a 500m container and caps read throughput at ~7 req/s per pod regardless of VU count. Default **10** keeps `(backend_pods × DB_POOL_MAX) + (worker_pods × 3)` under Postgres `max_connections` (100) at HPA max scale. Override to **20** on single-replica load-test instances if needed. |

### Rate Limiting

| Variable | Description |
|----------|-------------|
| `THROTTLE_GLOBAL_TTL_MS` | Global rate limit window in milliseconds |
| `THROTTLE_GLOBAL_LIMIT` | Max requests per IP globally |
| `THROTTLE_AUTH_TTL_MS` | Auth endpoint rate limit window |
| `THROTTLE_AUTH_LIMIT` | Max auth requests per IP (stricter in prod) |
| `THROTTLE_AUTH_REFRESH_TTL_MS` | Token refresh rate limit window |
| `THROTTLE_AUTH_REFRESH_LIMIT` | Max refresh requests per IP (stricter in prod) |

### PLG Monitoring Stack

Sizing values (`loki.pvcSize`, `prometheus.pvcSize`, `loki.retentionDays`, `prometheus.scrapeInterval`) are committed in `deployments/openshift/helm/plg/values-test.yaml` and `values-prod.yaml`. Edit those files to change sizing; they are layered on top of `values-openshift.yaml` and `values.yaml` defaults by both the CI workflow and `oc-deploy-instance.sh`. `GRAFANA_ADMIN_PASSWORD` remains in the env file (it is a credential).

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Grafana admin login password |

## How Secrets Reach the Pods

The deploy script creates per-instance OpenShift Secrets from values in the env file. Each instance gets its own copy.

### `<instance>-backend-services-secrets`

Created by the deploy script with keys:
- `SSO_CLIENT_SECRET`
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_ACCOUNT_KEY`

Referenced by the backend-services deployment via `secretKeyRef`.

### `<instance>-temporal-worker-secrets`

Created by the deploy script with keys:
- `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_ACCOUNT_NAME`
- `AZURE_STORAGE_ACCOUNT_KEY`

Referenced by the temporal-worker deployment via `secretKeyRef`.

### Other Per-Instance Secrets

| Secret | Managed By | Description |
|--------|-----------|-------------|
| `<instance>-artifactory-pull` | Deploy script (from `ARTIFACTORY_*` config) | docker-registry pull secret patched into all deployments' `imagePullSecrets` |
| `<instance>-minio-credentials` | Deploy script (random) | MinIO access/secret keys, only when `--blob-storage-provider minio` |
| `<instance>-app-pg-pguser-admin` | Crunchy Operator | PostgreSQL connection credentials (`DATABASE_URL`) |
| `<instance>-temporal-pg-pguser-temporal` | Crunchy Operator | Temporal database credentials |
