# OpenShift Deployment Scripts

CLI scripts for managing, backing up, and tearing down instances of the application stack on OpenShift.

**Deployment itself is done by the `Deploy Instance` GitHub Actions workflow** — see [../docs-md/openshift-deployment/AUTO_DEPLOY.md](../docs-md/openshift-deployment/AUTO_DEPLOY.md). Pushes to `develop` deploy to `bcgov-di-test` (namespace `fd34fb-test`); pushes to `main` deploy to `bcgov-di` (namespace `fd34fb-prod`). The scripts in this directory are for ad-hoc maintenance tasks — listing, backing up, restoring, tearing down — not for deploying.

## Quick Start (maintenance tasks)

```bash
# 1. Create your config files from the examples (one-time)
cp deployments/openshift/config/dev.env.example deployments/openshift/config/dev.env
cp deployments/openshift/config/prod.env.example deployments/openshift/config/prod.env

# 2. Log into OpenShift with your personal credentials (one-time)
oc login --server=https://api.silver.devops.gov.bc.ca:6443

# 3. Create the service account (one-time per namespace)
./scripts/oc-setup-sa.sh --namespace <your-namespace>

# 4. List instances in the namespace
./scripts/oc-list-instances.sh
```

After deployment, the script prints access URLs for the frontend, backend, and Temporal UI.

## Prerequisites

- `oc` CLI installed
- `gh` CLI installed and authenticated (for triggering image builds via GitHub Actions)
- Docker installed (for local builds with `--build-local`)
- Code pushed to GitHub (images are built from the remote branch via GitHub Actions)
- Config files created from examples (see [Environment Configuration](#environment-configuration))
- Artifactory credentials configured in your env file (see `ARTIFACTORY_URL`, `ARTIFACTORY_SA_USERNAME`, `ARTIFACTORY_SA_PASSWORD`)

---

## Script Reference

### oc-setup-sa.sh — Service Account Setup

One-time setup that creates an OpenShift service account with scoped permissions and stores a token locally. All other scripts use this token.

```bash
./scripts/oc-setup-sa.sh --namespace <namespace>
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--namespace` | `-n` | Yes | Target OpenShift namespace |
| `--help` | `-h` | No | Show help |

The script:
- Creates a service account `deploy-sa` with permissions scoped to deployments, services, routes, configmaps, secrets, PVCs, pods, pods/exec, PostgresClusters, and NetworkPolicies
- Saves the token to `.oc-deploy/token` (gitignored, directory permissions `700`, file permissions `600`)
- Is idempotent — safe to re-run

---

### oc-login-sa.sh — Service Account Login

Logs in to OpenShift using the stored service account token from `.oc-deploy/token`.

```bash
./scripts/oc-login-sa.sh
```

No options required. Use this to switch from your developer login to the deploy service account before running other scripts or `oc` commands.

---

### oc-teardown.sh — Tear Down Instance

Destroys all resources for an instance.

```bash
# Tear down instance matching current branch
./scripts/oc-teardown.sh

# Tear down a specific instance
./scripts/oc-teardown.sh --instance feature-other-work
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--instance` | `-i` | No | Instance to tear down (default: from git branch) |
| `--help` | `-h` | No | Show help |

Behavior:
- Deletes all resources by label selector (`app.kubernetes.io/instance=<name>`), including PVCs and Crunchy PostgreSQL clusters
- No interactive prompts — runs to completion silently
- No automatic backup — use `oc-backup-db.sh` first if you need to preserve data
- If this is the last instance in the namespace, also removes the service account and `.oc-deploy/` directory
- Idempotent — running on an already-deleted instance completes without error

---

### oc-list-instances.sh — List Instances

Shows all deployed instances in the namespace.

```bash
./scripts/oc-list-instances.sh
```

No options required. Output:

```
INSTANCE                                 STATUS       AGE
feature-my-thing                         Running      2d
feature-other-work                       Pending      5h
```

Status values:
- **Running** — all pods ready
- **Pending** — pods starting or not yet ready
- **Error** — pods in CrashLoopBackOff, ImagePullBackOff, or Failed state
- **Unknown** — no pods found

---

### oc-backup-db.sh — Database Backup

Creates a `pg_dump` of an instance's PostgreSQL database and saves it locally.

```bash
# Back up instance matching current branch
./scripts/oc-backup-db.sh

# Back up a specific instance
./scripts/oc-backup-db.sh --instance feature-my-thing
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--instance` | `-i` | No | Instance to back up (default: from git branch) |
| `--help` | `-h` | No | Show help |

Output: `./backups/<instance-name>-<timestamp>.sql` (gitignored)

Notes:
- Uses `pg_dump` via `oc exec` into the Crunchy PostgreSQL pod (not pgBackRest)
- Only backs up PostgreSQL — Azure Blob Storage content is not included (it persists independently)
- Cleans up partial dump files on failure

---

### oc-restore-db.sh — Database Restore

Restores a PostgreSQL database from a local SQL dump file into any instance.

```bash
./scripts/oc-restore-db.sh --instance feature-other-work \
  --from ./backups/feature-my-thing-20260313-143022.sql
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--instance` | `-i` | Yes | Target instance to restore into |
| `--from` | `-f` | Yes | Path to the SQL dump file |
| `--help` | `-h` | No | Show help |

Notes:
- Uses `psql` via `oc exec` (the backup is plain SQL format)
- Supports cross-instance restore (backup from instance A, restore into instance B)
- The dump includes `DROP`/`CREATE` statements, so it replaces existing data
- Azure Blob Storage content is not included
- Exits immediately with an error if the backup file doesn't exist

---

## Common Workflows

### First-time setup

```bash
oc login --server=https://api.silver.devops.gov.bc.ca:6443
./scripts/oc-setup-sa.sh --namespace fd34fb-dev
```

### Back up, tear down, re-deploy, restore

```bash
./scripts/oc-backup-db.sh
./scripts/oc-teardown.sh
# Re-deploy via GitHub: push to develop/main, or run the Deploy Instance
# workflow manually from GitHub Actions.
./scripts/oc-restore-db.sh --instance bcgov-di-test \
  --from ./backups/bcgov-di-test-20260313-143022.sql
```

### Migrate data between instances

```bash
./scripts/oc-backup-db.sh --instance feature-source
./scripts/oc-restore-db.sh --instance feature-target \
  --from ./backups/feature-source-20260313-143022.sql
```

---

## Instance Naming

Instance names are derived from the current git branch, sanitized for Kubernetes:

| Branch | Instance Name |
|--------|--------------|
| `feature/my-thing` | `feature-my-thing` |
| `Feature/MY_THING` | `feature-my-thing` |
| `release.1.0` | `release-1-0` |

Rules: lowercase, alphanumeric + hyphens only, max 63 characters. Override with `--instance <name>` on any script.

## Environment Configuration

Config files live in `deployments/openshift/config/` and are **gitignored** (they contain project-specific values and secrets). Example files are provided:

```bash
# One-time setup: copy examples and edit with your values
cp deployments/openshift/config/dev.env.example deployments/openshift/config/dev.env
cp deployments/openshift/config/prod.env.example deployments/openshift/config/prod.env
```

- `dev.env.example` / `prod.env.example` — source-controlled templates with placeholder values (including secrets)
- `dev.env` / `prod.env` — your actual config (gitignored) — all settings, API keys, and secrets in one file
- `<instance-name>.env` — optional per-instance overrides (merged on top of the profile)

The `Deploy Instance` GitHub workflow uses the same keys from these env files (via GitHub environment secrets populated by `gh-setup-test-env.sh`). Route hostnames use the pattern `<instance>-<service>-<namespace>.<CLUSTER_DOMAIN>` to stay under the wildcard cert — no manual URL configuration is needed.

Secret values are created as per-instance OpenShift Secrets during deployment. Each instance gets its own copy, so instances can be independently configured.

See [docs-md/openshift-deployment/](../docs-md/openshift-deployment/) for the full variable reference and technical details.
