# OpenShift Deployment Scripts

CLI scripts for deploying, managing, backing up, and tearing down fully isolated instances of the application stack on OpenShift.

Each "instance" is a complete, independent deployment of all services (frontend, backend, Temporal server + worker + UI, PostgreSQL) within a shared namespace, identified by the current git branch name.

## Quick Start

```bash
# 1. Create your config files from the examples (one-time)
cp deployments/openshift/config/dev.env.example deployments/openshift/config/dev.env
cp deployments/openshift/config/prod.env.example deployments/openshift/config/prod.env
# Edit dev.env / prod.env with your SSO, Azure, API keys, and other project-specific values

# 2. Log into OpenShift with your personal credentials (one-time)
oc login --server=https://api.silver.devops.gov.bc.ca:6443

# 3. Create the service account (one-time per namespace)
./scripts/oc-setup-sa.sh --namespace <your-namespace>

# 4. Push your branch to GitHub (images are built from remote)
git push origin feature/my-thing

# 5. Deploy your instance
./scripts/oc-deploy.sh --env dev

# 6. Check what's running
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

### oc-deploy.sh — Deploy Instance

Deploys the full application stack as an isolated instance.

```bash
# Deploy from current branch with dev config
./scripts/oc-deploy.sh --env dev

# Deploy with a custom instance name
./scripts/oc-deploy.sh --env dev --instance my-custom-name

# Deploy with prod config
./scripts/oc-deploy.sh --env prod

# Build images locally instead of via GitHub Actions
./scripts/oc-deploy.sh --env prod --build-local
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--env` | `-e` | Yes | Environment profile: `dev` or `prod` |
| `--instance` | `-i` | No | Instance name override (default: from git branch) |
| `--build-local` | | No | Build and push images locally with Docker instead of via GitHub Actions |
| `--help` | `-h` | No | Show help |

The deploy flow:
1. Validates the service account token
2. Derives the instance name from the git branch (or `--instance`)
3. Loads environment config (`dev.env` or `prod.env`) with optional instance overrides
4. Checks for existing images on Artifactory; if missing, builds them via GitHub Actions (default) or locally with Docker (`--build-local`)
5. Generates a Kustomize overlay and applies it with `oc apply -k`
6. Creates per-instance OpenShift Secrets from config values (API keys, client secrets)
7. Waits for all deployments to roll out (5-minute timeout each)
8. Prints access URLs

**`--build-local`**: Builds images with `docker build` and pushes to Artifactory directly from your machine. Requires Docker installed and Artifactory credentials in your env config file. Useful when the GitHub Actions workflow isn't on the default branch or you want faster iteration without pushing to GitHub first.

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

### oc-build-push.sh — Build & Push Images

Builds and pushes container images locally to Artifactory. Use this when iterating on a feature branch where the GitHub Actions workflow isn't available, or when you want faster rebuilds without pushing code first.

```bash
# Build and push just the frontend
./scripts/oc-build-push.sh --env dev frontend

# Build and push multiple services
./scripts/oc-build-push.sh --env dev frontend backend-services

# Build and push all services
./scripts/oc-build-push.sh --env dev --all

# Build, push, and restart OpenShift deployments to pick up the new image
./scripts/oc-build-push.sh --env dev frontend --restart

# Use a custom image tag
./scripts/oc-build-push.sh --env dev frontend --tag my-custom-tag
```

| Option | Short | Required | Description |
|--------|-------|----------|-------------|
| `--env` | `-e` | Yes | Environment profile: `dev` or `prod` (for Artifactory credentials) |
| `--all` | | No | Build all services (`backend-services`, `frontend`, `temporal`) |
| `--restart` | | No | Restart OpenShift deployments after push so pods pull the updated image |
| `--namespace` | `-n` | No | OpenShift namespace for `--restart` (default: auto-detect from `oc`) |
| `--tag` | `-t` | No | Image tag override (default: sanitized git branch name) |
| `--help` | `-h` | No | Show help |

Notes:
- Image tag defaults to the sanitized git branch name (same convention as the GHA workflow and deploy script)
- Since the tag doesn't change between rebuilds, OpenShift pods won't pull the new image automatically — use `--restart` or manually run `oc rollout restart`
- Requires Docker installed and Artifactory credentials in your env config file

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

### Rebuild and redeploy a service

```bash
# Make code changes, then rebuild and restart just the frontend
./scripts/oc-build-push.sh --env dev frontend --restart
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

The deploy script automatically computes namespace-specific values (`FRONTEND_URL`, `BACKEND_URL`, `SSO_REDIRECT_URI`, `TEMPORAL_ADDRESS`) from the namespace in `.oc-deploy-token` and the `CLUSTER_DOMAIN` setting. Route hostnames use the pattern `<instance>-<service>-<namespace>.<CLUSTER_DOMAIN>` to stay under the wildcard cert. No manual URL configuration is needed.

Secret values from the env file (API keys, client secrets, connection strings) are created as per-instance OpenShift Secrets during deployment. Each instance gets its own copy, so instances can be independently configured.

See [docs-md/openshift-deployment/](../docs-md/openshift-deployment/) for the full variable reference and technical details.
