# Temporal UI Access

## Overview

The Temporal UI is deployed as part of each instance but is **not publicly exposed** via an OpenShift Route. This prevents unauthorized access to workflow management and visibility data. Developers access the UI locally via `oc port-forward`.

## Accessing the Temporal UI

### Prerequisites

- `oc` CLI installed and authenticated
- Deployment token exists (`.oc-deploy/token`, created by `oc-setup-sa.sh`)

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

### Using the Service Account

If you're using the deployment service account instead of your personal account:

```bash
# Read credentials from token file
source <(grep -E '^(SERVER|TOKEN|NAMESPACE)=' .oc-deploy/token)
oc login "${SERVER}" --token="${TOKEN}" --insecure-skip-tls-verify=true
oc port-forward deployment/<instance-name>-temporal-ui 8080:8080 -n "${NAMESPACE}"
```

## Why No Public Route?

The Temporal UI provides direct access to:
- Workflow execution history and details
- Namespace and task queue management
- Workflow termination and signal capabilities

Exposing this publicly without authentication would allow anyone to view and manipulate workflows. Since the Temporal UI image does not support authentication natively, the safest approach is to keep it cluster-internal and use `oc port-forward` for developer access.
