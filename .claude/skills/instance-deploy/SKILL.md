---
name: instance-deploy
description: "Manage OpenShift instance deployments: deploy, teardown, list, build images, backup/restore databases, and setup service accounts. Trigger phrases: deploy instance, teardown instance, list instances, build images, backup database, restore database, setup service account, oc deploy, instance management. Do NOT invoke for: local development setup, docker-compose, writing application code, database migrations."
user_invocable: true
---

# Instance Deployment Manager

Manages the full lifecycle of OpenShift application instances — from initial service account setup through deployment, image builds, database backup/restore, and teardown.

## Quick Reference

When invoked without a specific action, display this menu:

```
Instance Deployment Manager — Available Commands:

  deploy          Deploy a full application stack to OpenShift
  teardown        Destroy all resources for an instance
  list            List all deployed instances with status
  build           Build and push container images
  backup          Create a PostgreSQL database backup
  restore         Restore a database from a backup file
  setup           Create OpenShift service account and token
  login           Log in to OpenShift using stored SA token
  status          Show deployment status for current instance

Usage: /instance-deploy <command>
Example: /instance-deploy deploy --env dev
```

## Workflows

- [Deploy](Workflows/Deploy.md) — Deploy a full instance to OpenShift
- [Teardown](Workflows/Teardown.md) — Destroy all resources for an instance
- [List](Workflows/List.md) — List deployed instances
- [Build](Workflows/Build.md) — Build and push container images
- [Backup](Workflows/Backup.md) — Backup a PostgreSQL database
- [Restore](Workflows/Restore.md) — Restore a database from backup
- [Setup](Workflows/Setup.md) — Setup service account
- [Login](Workflows/Login.md) — Login with service account
- [Status](Workflows/Status.md) — Check deployment status

## Pre-Flight Gate (run before EVERY command except `setup`)

Before executing any command (deploy, teardown, list, build, backup, restore, login, status), run these checks in order. Stop and guide the user if any check fails.

1. **Token file exists?**
   ```bash
   test -f .oc-deploy/token && echo "TOKEN_OK" || echo "TOKEN_MISSING"
   ```
   If `TOKEN_MISSING`: Stop. Tell the user they need first-time setup:
   ```
   First-time setup required:
     1. oc login --server=https://api.silver.devops.gov.bc.ca:6443
     2. ./scripts/oc-setup-sa.sh --namespace <your-namespace>
   ```

2. **Login with service account** — Always run this to ensure the session is active:
   ```bash
   ./scripts/oc-login-sa.sh
   ```
   If this fails (token expired), tell the user to re-run setup:
   ```
   Token expired. Re-run:
     1. oc login --server=https://api.silver.devops.gov.bc.ca:6443
     2. ./scripts/oc-setup-sa.sh --namespace <your-namespace>
   ```

3. **Config file exists?** (only for commands that need `--env`: deploy, build)
   ```bash
   test -f deployments/openshift/config/<env>.env && echo "CONFIG_OK" || echo "CONFIG_MISSING"
   ```
   If `CONFIG_MISSING`: Tell the user to create it from the example:
   ```
   cp deployments/openshift/config/<env>.env.example deployments/openshift/config/<env>.env
   # Then edit with your values
   ```

Only proceed to the workflow steps after all applicable checks pass.

## Always Follow

1. **Run the Pre-Flight Gate before every operation** — this ensures the user is authenticated and configured.
2. **Never run deployment scripts without confirming the target environment and instance name with the user first** — deployments affect shared infrastructure.
3. **Never run teardown without explicit user confirmation** — this is destructive and irreversible.
4. All scripts live in `scripts/` at the project root. Always run them from the project root.
5. Instance names default to the current git branch (sanitized). Always show the resolved name before proceeding.
6. Configuration files live in `deployments/openshift/config/`. The `.env` files are gitignored; `.env.example` files are templates.
7. When displaying results, format them clearly with instance name, environment, and relevant URLs.
8. For first-time setup flow, refer users to: `scripts/README.md` for the complete Quick Start guide.
