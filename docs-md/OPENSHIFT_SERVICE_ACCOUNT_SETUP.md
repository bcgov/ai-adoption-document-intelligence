# OpenShift Service Account Setup

## Overview

The `oc-setup-sa.sh` script creates an OpenShift service account with scoped permissions for deployment operations. This is a one-time setup per developer per namespace. After running this script, all other deployment scripts (`oc-deploy.sh`, `oc-teardown.sh`, etc.) use the stored service account token instead of the developer's personal credentials.

## Prerequisites

- `oc` CLI installed and available on PATH
- Developer logged into OpenShift with personal credentials (`oc login`)
- Access to the target namespace

## Usage

```bash
./scripts/oc-setup-sa.sh --namespace <namespace>
```

### Options

| Option | Description |
|--------|-------------|
| `--namespace`, `-n` | Target OpenShift namespace (required) |
| `--help`, `-h` | Show help message |

### Example

```bash
# Log in with personal credentials (one-time)
oc login --server=https://api.silver.devops.gov.bc.ca:6443

# Run the setup script
./scripts/oc-setup-sa.sh --namespace fd34fb-dev
```

## What the Script Does

1. Verifies the developer is logged into OpenShift (`oc whoami`)
2. Verifies the target namespace exists and is accessible
3. Creates a service account named `deploy-sa` in the namespace (or reuses if it already exists)
4. Creates a Role with permissions scoped to the minimum required for deployment:
   - `apps` API group: deployments
   - Core API group: services, configmaps, secrets, persistentvolumeclaims, pods
   - Core API group: pods/exec (create only)
   - `route.openshift.io` API group: routes
5. Creates a RoleBinding linking the service account to the role
6. Generates a long-lived token for the service account
7. Saves the token, namespace, and server URL to `.oc-deploy-token` in the project root

## Token File

The token is saved to `.oc-deploy-token` in the project root. This file:

- Is listed in `.gitignore` and must never be committed
- Has file permissions set to `600` (owner read/write only)
- Contains the namespace, server URL, and token for use by other scripts

## Idempotency

The script is safe to re-run. If the service account, role, or role binding already exist, the script updates them without errors and generates a fresh token.

## Service Account Permissions

The service account is granted the minimum permissions required for deployment operations:

| API Group | Resources | Verbs |
|-----------|-----------|-------|
| `apps` | deployments | get, list, watch, create, update, patch, delete |
| (core) | services, configmaps, secrets, persistentvolumeclaims, pods | get, list, watch, create, update, patch, delete |
| (core) | pods/exec | create |
| `route.openshift.io` | routes | get, list, watch, create, update, patch, delete |
