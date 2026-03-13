# Instance Teardown Script

## Overview

The `oc-teardown.sh` script completely destroys all OpenShift resources for a named instance. It deletes resources by label selector (`app.kubernetes.io/instance=<name>`) to ensure complete cleanup, including deployments, services, routes, secrets, configmaps, PVCs, and Crunchy PostgreSQL clusters.

## Prerequisites

- `oc` CLI installed
- `.oc-deploy-token` file exists (created by `oc-setup-sa.sh`)

## Usage

```bash
# Tear down the instance matching the current git branch
./scripts/oc-teardown.sh

# Tear down a specific instance by name
./scripts/oc-teardown.sh --instance feature-other-work
```

### Options

| Option | Description |
|--------|-------------|
| `--instance`, `-i` | Instance name to tear down. Defaults to the sanitized current git branch name. |
| `--help`, `-h` | Show help message. |

## How It Works

1. **Token validation** — Reads `.oc-deploy-token` and authenticates with OpenShift using the service account token.
2. **Instance name resolution** — Determines the instance name from `--instance` flag or derives it from the current git branch (e.g., `feature/my-thing` becomes `feature-my-thing`).
3. **Resource deletion** — Deletes all Kubernetes resources matching the label `app.kubernetes.io/instance=<name>`. Resource types deleted:
   - Deployments
   - Services
   - Routes
   - ConfigMaps
   - Secrets
   - PersistentVolumeClaims
   - PostgresClusters (Crunchy Operator CRD)
4. **Verification** — Confirms all resources have been deleted (or are in the process of terminating).
5. **Last instance cleanup** — If no other instances remain in the namespace, the script also removes the service account (`deploy-sa`), its role, role binding, and deletes the local `.oc-deploy-token` file.

## Behavior Notes

- **No interactive prompts** — The script runs to completion without requiring any user confirmation.
- **No automatic backup** — Database backup is a separate operation. Use `oc-backup-db.sh` before teardown if you need to preserve data.
- **Deletion by label** — Resources are deleted by label selector, not by name. This ensures all resources belonging to the instance are cleaned up, even if they were created outside of Kustomize.
- **Idempotent** — Running teardown on an already-deleted instance completes without error (uses `--ignore-not-found`).

## Examples

```bash
# On branch feature/my-thing, tear down that instance
git checkout feature/my-thing
./scripts/oc-teardown.sh

# Tear down a different instance regardless of current branch
./scripts/oc-teardown.sh --instance feature-old-work

# Workflow: backup then teardown
./scripts/oc-backup-db.sh --instance feature-my-thing
./scripts/oc-teardown.sh --instance feature-my-thing
```
