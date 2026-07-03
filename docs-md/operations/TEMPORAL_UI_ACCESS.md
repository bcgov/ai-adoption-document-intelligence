# Temporal UI Access

## Overview

The Temporal UI is deployed as part of each instance but is **not publicly exposed** via an OpenShift Route. This prevents unauthorized access to workflow management and visibility data. Developers access the UI locally via `oc port-forward`.

## Accessing the Temporal UI

### Prerequisites

- `oc` CLI installed and authenticated
- Deployment token exists (`.oc-deploy/token-<namespace>`, plus a default copy at `.oc-deploy/token`, created by `./scripts/oc-setup-sa.sh --namespace <namespace>`)

### Port-Forward Command

```bash
# Replace <instance-name> and <namespace> with your values
oc port-forward deployment/<instance-name>-temporal-ui 8080:8080 -n <namespace>
```

Then open [http://localhost:8080](http://localhost:8080) in your browser.

### Example

```bash
# For the feature-deployment-f instance in fd34fb-prod
oc port-forward deployment/feature-deployment-f-temporal-ui 8080:8080 -n fd34fb-prod
```

If port 8080 is already in use locally, map to a different local port:

```bash
oc port-forward deployment/feature-deployment-f-temporal-ui 9090:8080 -n fd34fb-prod
# Then open http://localhost:9090
```

### Production helper script

For the `bcgov-di` instance in `fd34fb-prod`, `scripts/oc-port-forward-prod.sh` wraps the above and forwards both internal-only services in one command — Temporal UI on `localhost:47080` and Grafana on `localhost:47030`:

```bash
./scripts/oc-port-forward-prod.sh                  # both services
./scripts/oc-port-forward-prod.sh --only temporal  # Temporal UI only
./scripts/oc-port-forward-prod.sh --temporal-port 18080
```

### Using the Service Account

If you're using the deployment service account instead of your personal account, log in with the stored token via the helper script, then port-forward:

```bash
./scripts/oc-login-sa.sh --namespace <namespace>   # reads .oc-deploy/token-<namespace>
# or ./scripts/oc-login-sa.sh                      # uses the default .oc-deploy/token
oc port-forward deployment/<instance-name>-temporal-ui 8080:8080 -n <namespace>
```

## Why No Public Route?

The Temporal UI provides direct access to:
- Workflow execution history and details
- Namespace and task queue management
- Workflow termination and signal capabilities

Exposing this publicly without authentication would allow anyone to view and manipulate workflows. Since the Temporal UI image does not support authentication natively, the safest approach is to keep it cluster-internal and use `oc port-forward` for developer access.
