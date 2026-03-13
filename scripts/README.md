# OpenShift Deployment Scripts

CLI scripts for deploying, managing, backing up, and tearing down fully isolated instances of the application stack on OpenShift.

Each "instance" is a complete, independent deployment of all services (frontend, backend, Temporal server + worker + UI, PostgreSQL) within a shared namespace, identified by the current git branch name.

## Quick Start

```bash
# 1. Log into OpenShift with your personal credentials (one-time)
oc login --server=https://api.silver.devops.gov.bc.ca:6443

# 2. Create the service account (one-time per namespace)
./scripts/oc-setup-sa.sh --namespace fd34fb-dev

# 3. Push your branch to GitHub (images are built from remote)
git push origin feature/my-thing

# 4. Deploy your instance
./scripts/oc-deploy.sh --env dev

# 5. Check what's running
./scripts/oc-list-instances.sh
```

After deployment, the script prints access URLs for the frontend, backend, and Temporal UI.

## Prerequisites

- `oc` CLI installed
- `gh` CLI installed and authenticated (for triggering image builds)
- Code pushed to GitHub (images are built from the remote branch via GitHub Actions)

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
- Creates a service account `deploy-sa` with permissions scoped to deployments, services, routes, configmaps, secrets, PVCs, pods, and pods/exec
- Saves the token to `.oc-deploy-token` (gitignored, permissions `600`)
- Is idempotent — safe to re-run

---

### oc-deploy.sh — Deploy Instance

Deploys the full application stack as an isolated instance.

```bash
# Deploy from current branch with dev config
./scripts/oc-deploy.sh --env dev

# Deploy with a custom instance name
./scripts/oc-deploy.sh --env dev --instance my-custom-name

# Deploy with prod config
./scripts/oc-deploy.sh --env prod
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--env` | `-e` | Yes | Environment profile: `dev` or `prod` |
| `--instance` | `-i` | No | Instance name override (default: from git branch) |
| `--help` | `-h` | No | Show help |

The deploy flow:
1. Validates the service account token
2. Derives the instance name from the git branch (or `--instance`)
3. Loads environment config (`dev.env` or `prod.env`) with optional instance overrides
4. Checks for existing images on ghcr.io, triggers a build if missing
5. Generates a Kustomize overlay and applies it with `oc apply -k`
6. Waits for all deployments to roll out (5-minute timeout each)
7. Prints access URLs

Each instance gets: frontend, backend, Temporal server + worker + UI, Crunchy PostgreSQL, routes, ConfigMaps, Secrets, PVCs, and NetworkPolicies. Prisma migrations run automatically via an init container during deployment.

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
- If this is the last instance in the namespace, also removes the service account and `.oc-deploy-token`
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

### Deploy, work, tear down

```bash
./scripts/oc-deploy.sh --env dev
# ... work with the instance ...
./scripts/oc-teardown.sh
```

### Backup, tear down, redeploy, restore

```bash
./scripts/oc-backup-db.sh
./scripts/oc-teardown.sh
./scripts/oc-deploy.sh --env dev
./scripts/oc-restore-db.sh --instance feature-my-thing \
  --from ./backups/feature-my-thing-20260313-143022.sql
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

Config files live in `deployments/openshift/config/`:

- `dev.env` — development defaults
- `prod.env` — production defaults
- `<instance-name>.env` — optional per-instance overrides (merged on top of the profile)

See [docs-md/openshift-deployment/](../docs-md/openshift-deployment/) for the full variable reference and technical details.
