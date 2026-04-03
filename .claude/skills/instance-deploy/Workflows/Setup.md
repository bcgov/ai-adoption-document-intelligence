# Setup Service Account

Create an OpenShift service account with scoped deployment permissions and store its token locally. This is a prerequisite for all other deployment operations.

## Arguments

- `--namespace <namespace>` (required) — Target OpenShift namespace

## Prerequisites

- `oc` CLI installed
- Developer logged into OpenShift via `oc login` (interactive login, not SA)

## Steps

1. **Confirm namespace** with the user.

2. **Run setup**:
   ```bash
   ./scripts/oc-setup-sa.sh --namespace <namespace>
   ```

3. **Report results**: Confirm service account created and token saved to `.oc-deploy/token`.

## What It Creates

- Service account: `deploy-sa`
- Role: `deploy-sa-role` with scoped permissions (deployments, services, routes, configmaps, secrets, PVCs, PostgresClusters, NetworkPolicies)
- RoleBinding: `deploy-sa-rolebinding`
- Token file: `.oc-deploy/token` (mode 600, gitignored)

## Common Pitfalls

- **Must be logged in interactively first**: `oc login` with your personal credentials before running setup.
- **Namespace must exist**: The target namespace must already be created in OpenShift.
- **Idempotent**: Safe to re-run — updates existing resources.
