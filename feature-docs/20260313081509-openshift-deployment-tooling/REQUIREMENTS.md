# OpenShift Deployment Tooling — Requirements

## Overview

A set of CLI scripts that allow developers to deploy, manage, backup, and teardown fully isolated instances of the application stack on OpenShift — from their local machines with minimal friction.

Each "instance" is a complete, independent deployment of all services (frontend, backend, Temporal server + worker + UI, PostgreSQL via Crunchy Operator) within a shared OpenShift namespace, identified by a label/prefix scheme derived from the current git branch name.

---

## Personas

| Role | Description |
|------|-------------|
| **Developer** | Primary operator. Runs scripts from local machine to deploy/manage personal dev instances on OpenShift. |

---

## Existing Infrastructure (to leverage)

The following already exist and must be reused or extended — not replaced:

- **Dockerfiles**: Multi-stage builds for `backend-services`, `frontend`, `temporal` (all OpenShift-compatible, non-root users)
- **Kustomize manifests**: `deployments/openshift/kustomize/` with `base/` + `overlays/` (dev/test/prod)
- **Crunchy Postgres Operator**: Already deployed in the namespace; used for PostgreSQL HA. Continues to be the database runtime — only backup/restore scripts bypass it (using `pg_dump`/`pg_restore` directly)
- **CI/CD (GitHub Actions)**: `build-apps.yml`, `migrate-db.yml`, `db-backup-manual.yml`, `db-restore.yml` — these remain untouched
- **Container Registry**: GitHub Container Registry (ghcr.io) for instance deployments (BCGov recommended pattern for Silver cluster). Note: existing CI/CD uses Artifactory — that remains untouched and is not used by this tooling
- **Network Policies, Routes, ConfigMaps, Secrets**: Defined in kustomize manifests
- **Blob storage**: Azure Blob Storage in cloud (`BLOB_STORAGE_PROVIDER=azure`). Content lives in Azure, not in Kubernetes — not part of backup/restore

---

## Requirements

### REQ-1: One-Command Full Stack Deploy

**Description**: A single script deploys the entire application stack (frontend, backend, Temporal server + worker + UI, Crunchy PostgreSQL database) into an OpenShift namespace.

**Details**:
- The instance name defaults to the current git branch name, sanitized for Kubernetes naming (e.g., `feature/my-thing` → `feature-my-thing`)
- All resources for an instance are labeled with a common identifier (e.g., `app.kubernetes.io/instance=feature-my-thing`)
- All resource names are prefixed with the instance name (e.g., `feature-my-thing-backend`, `feature-my-thing-frontend`)
- The script uses a service account token (see REQ-4) for all `oc` commands — not the developer's personal login
- Runs Prisma migrations as part of deployment (existing init container pattern)
- Existing `dev/test/prod` overlays remain untouched; this tooling is additive

**Invocation example**:
```bash
./scripts/oc-deploy.sh
# Uses current git branch as instance name, reads config from file
```

### REQ-1a: One-Command Teardown

**Description**: A single script completely destroys all resources for a named instance.

**Details**:
- Deletes all Kubernetes resources matching the instance label
- Complete destruction — database, PVCs, routes, secrets, configmaps, deployments, services — everything
- Database backup/restore are separate operations (REQ-3) — teardown does not auto-backup
- If this is the last instance in the namespace, also removes the service account and deletes the local `.oc-deploy-token` file (full cleanup)
- No interactive prompts required

**Invocation example**:
```bash
./scripts/oc-teardown.sh
# Tears down instance matching current branch, or specify --instance <name>
```

### REQ-1b: Multi-Instance Support (Same Namespace)

**Description**: Multiple developers can each deploy their own fully isolated instance within the same OpenShift namespace.

**Details**:
- Instances are completely separate — no shared resources (each gets its own database, Temporal server, frontend, backend)
- Isolation is achieved via label/prefix scheme on all resources
- Each instance gets its own OpenShift Routes, with the instance name (sanitized git branch) as part of the route hostname
- A listing script shows all deployed instances in the namespace
- Designed for a small number of concurrent instances (2-5 typical)
- Edge case: two devs deploying from the same branch is a documented limitation, not handled programmatically

**Invocation example**:
```bash
./scripts/oc-list-instances.sh
# Output:
# INSTANCE              STATUS    AGE
# feature-my-thing      Running   2d
# feature-other-work    Running   5h
```

### REQ-2: Environment Configuration

**Description**: Configuration is managed via files with sensible defaults and override capability.

**Details**:
- Two environment profiles: `dev` and `prod`
- Operator selects which profile when deploying (e.g., `--env dev` or `--env prod`)
- Configuration stored in files (e.g., `deployments/openshift/config/dev.env`, `deployments/openshift/config/prod.env`)
- Sensible defaults for all values; operator only overrides what they need
- SSO/Keycloak: Configured per environment profile (dev vs prod) — each instance inherits the SSO settings (realm, client ID, auth server URL) from the selected `--env` profile
- Azure Document Intelligence, Azure Blob Storage: Configured per environment profile (dev vs prod), not per instance
- Blob storage flag: `BLOB_STORAGE_PROVIDER=azure` for cloud deployments
- Instance-specific overrides possible via optional `deployments/openshift/config/<instance-name>.env` file

### REQ-3: Database Backup & Restore

**Description**: Scripts to create a `pg_dump` backup of any instance's database and download it to the local filesystem, and to restore from a local backup file into any instance.

**Details**:
- Backup creates a SQL dump file on the local filesystem (e.g., `./backups/<instance>-<timestamp>.sql`)
- Restore reads from a local SQL dump file and applies it to a target instance's database
- Supports cross-instance restore (backup from instance A, restore into instance B) — enables data migration between instances
- Supports destroy-and-rebuild workflow: backup instance, teardown, redeploy, restore
- Uses `pg_dump`/`pg_restore` directly (not Crunchy Operator's pgBackRest)
- Crunchy Operator remains the database runtime — these scripts just exec into the pod for dump/restore
- Blob storage content (Azure) is not included in backup/restore — it persists independently in Azure

**Invocation examples**:
```bash
./scripts/oc-backup-db.sh --instance feature-my-thing
# → ./backups/feature-my-thing-2026-03-13.sql

./scripts/oc-restore-db.sh --instance feature-other-work --from ./backups/feature-my-thing-2026-03-13.sql
```

### REQ-4: Service Account Key Generation

**Description**: A script to create an OpenShift service account with scoped permissions, generate a token, and store it locally for use by all other scripts.

**Details**:
- Developer logs into OpenShift with their personal credentials (`oc login`) — this is the only time personal credentials are used
- Script creates a service account in the target namespace with permissions scoped to the resources the deployment scripts need (deployments, services, routes, configmaps, secrets, PVCs, pods, pods/exec)
- Token is saved to a local secret file (e.g., `.oc-deploy-token` — gitignored)
- All other scripts (`oc-deploy.sh`, `oc-teardown.sh`, `oc-backup-db.sh`, etc.) use this stored token instead of the developer's personal login
- No ghcr.io pull secret needed — the repository is public, so images are publicly accessible
- One-time setup per developer per namespace

**Invocation example**:
```bash
# One-time setup (uses personal oc login)
./scripts/oc-setup-sa.sh --namespace fd34fb-dev

# Saves token to .oc-deploy-token
# All subsequent scripts use this token automatically
```

### REQ-5: Image Building & Registry

**Description**: Images are built via GitHub Actions and pushed to GitHub Container Registry (ghcr.io). OpenShift pulls images from ghcr.io at deploy time.

**Details**:
- **Why ghcr.io**: OpenShift Silver's internal registry (`image-registry.openshift-image-registry.svc:5000`) is only accessible from within the cluster — not from a developer's local machine. BCGov's recommended pattern is GitHub Actions → ghcr.io → OpenShift pull.
- Images are built from the current git branch using the existing multi-stage Dockerfiles
- GitHub Actions workflow builds and pushes images to `ghcr.io/<org>/<repo>/<service>:<branch-sanitized>` (e.g., `ghcr.io/<org>/ai-adoption-document-intelligence/backend-services:feature-my-thing`)
- The deploy script (`oc-deploy.sh`) triggers the GitHub Actions build (or references already-built images from the current branch) and then deploys to OpenShift
- Images are tagged with the sanitized git branch name and commit SHA for traceability
- Existing Artifactory-based CI/CD pipelines remain untouched — this is additive

**Authentication**:
- **Pushing to ghcr.io (GitHub Actions)**: No PAT required. GitHub Actions uses the built-in `GITHUB_TOKEN` (automatically injected per workflow run). The workflow must declare `permissions: packages: write`.
- **Pulling from ghcr.io (OpenShift)**: No pull secret or PAT required. The repository is public, so ghcr.io packages are publicly accessible — OpenShift can pull images without authentication.

---

## Proposed Architecture

### Script Structure

```
scripts/
  oc-setup-sa.sh          # One-time: create service account, save token locally
  oc-deploy.sh             # Trigger image build (GitHub Actions → ghcr.io) + deploy full stack for an instance
  oc-teardown.sh           # Destroy all resources for an instance
  oc-backup-db.sh          # pg_dump an instance's DB to local file
  oc-restore-db.sh         # pg_restore from local file into an instance's DB
  oc-list-instances.sh     # List all deployed instances in namespace

deployments/openshift/
  config/
    dev.env                # Default config for dev profile
    prod.env               # Default config for prod profile
  kustomize/
    base/                  # (existing — reused)
    overlays/
      dev/                 # (existing — untouched)
      test/                # (existing — untouched)
      prod/                # (existing — untouched)
      instance-template/   # New: parameterized base for named instances

.oc-deploy-token           # Local-only (gitignored), stores SA token
backups/                   # Local-only (gitignored), stores DB dumps
```

### Deploy Flow

```
Developer runs: ./scripts/oc-deploy.sh --env dev

1. Read .oc-deploy-token (fail if missing — point to oc-setup-sa.sh)
2. Determine instance name from current git branch
3. Load config: dev.env defaults ← instance override if exists
4. Trigger GitHub Actions build (or verify images already exist on ghcr.io for current branch/commit)
5. OpenShift pulls images from ghcr.io (public — no pull secret needed)
6. Generate Kustomize overlay from instance-template (namePrefix, labels, config)
7. oc apply -k <generated overlay>
8. Wait for rollout completion
9. Print access URLs (frontend route, backend route, temporal UI route)
```

### Teardown Flow

```
Developer runs: ./scripts/oc-teardown.sh

1. Read .oc-deploy-token
2. Determine instance name from current git branch (or --instance flag)
3. oc delete all resources with label app.kubernetes.io/instance=<name>
4. oc delete PVCs, secrets, configmaps with same label
5. Confirm deletion complete
```

### Multi-Instance Isolation

- Every resource gets: `app.kubernetes.io/instance: <instance-name>` label
- Every resource name is prefixed: `<instance-name>-<service>`
- Each instance gets its own:
  - Crunchy PostgreSQL cluster
  - Temporal server + worker + UI
  - Backend deployment
  - Frontend deployment
  - Routes, ConfigMaps, Secrets, PVCs, NetworkPolicies
- No cross-instance communication (NetworkPolicies scope traffic to instance label)

---

## Out of Scope

- Automated edge case handling (e.g., duplicate branch deployments)
- Blob storage backup/restore (Azure content persists independently)
- Fully automated CI/CD-triggered deployments (scripts are initiated locally, but image builds use GitHub Actions)
- Auto-scaling or resource optimization
- Monitoring/alerting for dev instances
- Per-instance SSO client provisioning (instances use the environment profile's SSO config)

---

## Known Limitations (to document for users)

- Two developers deploying from the same git branch will conflict — coordinate via team communication
- Code must be pushed to GitHub before deploying (GitHub Actions builds images from the branch)
- Each instance consumes significant namespace resources (full Temporal + PostgreSQL stack) — practical limit of ~5 concurrent instances
- Route hostnames depend on cluster's wildcard DNS configuration

### Credentials Reference

| Credential | Used For | Type | How Obtained |
|---|---|---|---|
| `GITHUB_TOKEN` | Push images to ghcr.io (CI only) | Auto-injected by GitHub Actions | Automatic — no setup needed |
| OpenShift SA Token | All `oc` CLI commands from scripts | OC service account token | `oc-setup-sa.sh` (one-time) |

No PATs or image pull secrets are required — the repository and its ghcr.io packages are public.
