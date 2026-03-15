# PLG Deployment Integration

## Overview

The PLG (Prometheus, Loki, Grafana) monitoring stack is deployed as a separate Helm release alongside the application. It does not modify or interfere with the existing Kustomize-based application deployment. PLG deployment is integrated into both the GitHub Actions CI/CD pipeline and the local deployment scripts.

## Deployment Methods

### GitHub Actions (CI/CD)

The `build-apps.yml` workflow includes a `deploy-plg` job that runs after application images are built. This job:

1. Checks out the repository to access the Helm chart at `deployments/openshift/helm/plg/`
2. Installs the Helm and `oc` CLIs
3. Authenticates to OpenShift using environment secrets
4. Runs `helm upgrade --install` with the OpenShift values file

The job runs regardless of whether application images were built (it depends on `build-apps` succeeding or being skipped), ensuring the PLG stack stays up to date even when no application code changed.

#### Required GitHub Environment Secrets

| Secret | Description |
|--------|-------------|
| `OPENSHIFT_SERVER` | OpenShift API server URL |
| `OPENSHIFT_TOKEN` | Service account token for the target namespace |
| `OPENSHIFT_NAMESPACE` | Target namespace (e.g., `fd34fb-dev`) |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password (falls back to `admin` if unset) |

### Local Deployment (`oc-deploy.sh`)

The `scripts/oc-deploy.sh` script deploys the PLG stack as **Step 7**, between applying the Kustomize overlay (Step 6) and creating instance secrets (Step 8). This step:

1. Reads PLG-specific configuration from the environment profile (`dev.env` or `prod.env`)
2. Derives instance-specific Prometheus scrape targets from the Kustomize instance name
3. Runs `helm upgrade --install` with environment-specific values passed via `--set` flags

If the `helm` CLI is not installed, the PLG step is skipped with a warning. The application deployment continues normally.

#### Instance-Specific Helm Release

Each application instance gets its own PLG Helm release named `<instance>-plg`. Prometheus scrape targets are configured to point at the instance-specific Kubernetes service names (e.g., `my-instance-backend-services`, `my-instance-temporal`).

### Teardown (`oc-teardown.sh`)

The `scripts/oc-teardown.sh` script includes a step (3b) that uninstalls the PLG Helm release for the instance being torn down. If Helm is not installed or no PLG release exists, the step is skipped gracefully.

## Environment Configuration

PLG-specific variables are configured in the same environment profile files used by the application (`deployments/openshift/config/<env>.env`). They follow the existing config merge pattern: profile defaults can be overridden by instance-specific files.

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Grafana admin login password |
| `LOKI_RETENTION_DAYS` | `30` | Log retention period in days |
| `LOKI_PVC_SIZE` | `10Gi` | Persistent volume size for Loki data |
| `PROMETHEUS_PVC_SIZE` | `10Gi` | Persistent volume size for Prometheus TSDB |
| `METRICS_SCRAPE_INTERVAL` | `15s` | How often Prometheus scrapes targets |

These variables are read by `oc-deploy.sh` via the `config-loader.sh` library and passed to Helm as `--set` overrides on top of the `values-openshift.yaml` base.

## Separation from Kustomize

The PLG deployment is completely independent of the Kustomize-based application deployment:

- PLG resources are managed by Helm, not Kustomize
- PLG uses its own labels (`app.kubernetes.io/managed-by: Helm`, `app.kubernetes.io/part-of: plg`)
- No Kustomize base or overlay files are modified for PLG
- If PLG deployment fails, the application deployment is unaffected

## Accessing Grafana

Grafana is not exposed via an OpenShift Route. Access it via port-forwarding:

```bash
# For instance-specific deployments (via oc-deploy.sh)
oc port-forward svc/<instance>-plg-grafana 3001:3001 -n <namespace>

# For CI-deployed PLG (single release per namespace)
oc port-forward svc/plg-grafana 3001:3001 -n <namespace>
```

Then open `http://localhost:3001` and log in with `admin` / `<GRAFANA_ADMIN_PASSWORD>`.

## Files

| File | Purpose |
|------|---------|
| `deployments/openshift/helm/plg/` | PLG Helm chart (templates, values) |
| `deployments/openshift/helm/plg/values-openshift.yaml` | OpenShift-specific value overrides |
| `deployments/openshift/config/dev.env.example` | Dev environment config template (includes PLG variables) |
| `deployments/openshift/config/prod.env.example` | Prod environment config template (includes PLG variables) |
| `.github/workflows/build-apps.yml` | CI workflow with `deploy-plg` job |
| `scripts/oc-deploy.sh` | Local deployment script (Step 7: PLG) |
| `scripts/oc-teardown.sh` | Teardown script (Step 3b: PLG uninstall) |
