# Database Backup Script

## Overview

The `oc-backup-db.sh` script creates a `pg_dump` backup of any instance's PostgreSQL database and saves it to the local filesystem. The backup uses direct `pg_dump` execution inside the Crunchy PostgreSQL pod (not Crunchy Operator's pgBackRest).

Only the PostgreSQL database is backed up. Azure Blob Storage content is not included, as it persists independently in Azure.

## Prerequisites

- `oc` CLI installed
- `.oc-deploy-token` file exists (created by `oc-setup-sa.sh`)
- The service account has `pods/exec` permission (granted during `oc-setup-sa.sh`)
- The target instance is deployed and its PostgreSQL pod is running

## Usage

```bash
# Back up the instance matching the current git branch
./scripts/oc-backup-db.sh

# Back up a specific instance by name
./scripts/oc-backup-db.sh --instance feature-my-thing
```

### Options

| Option | Description |
|--------|-------------|
| `--instance`, `-i` | Instance name to back up. Defaults to the sanitized current git branch name. |
| `--help`, `-h` | Show help message. |

### Output

Backup files are saved to the `./backups/` directory with the naming convention:

```
./backups/<instance-name>-<timestamp>.sql
```

For example: `./backups/feature-my-thing-20260313-143022.sql`

The `backups/` directory is listed in `.gitignore` and will not be committed to the repository.

## How It Works

1. **Token validation** -- Reads `.oc-deploy-token` and authenticates with OpenShift using the service account token.
2. **Instance name resolution** -- Determines the instance name from `--instance` flag or derives it from the current git branch (e.g., `feature/my-thing` becomes `feature-my-thing`).
3. **Pod discovery** -- Finds the Crunchy PostgreSQL primary pod for the instance using label selectors (`postgres-operator.crunchydata.com/role=master` and `app.kubernetes.io/instance=<name>`).
4. **Credential lookup** -- Reads database name and user from the Crunchy-managed secret (`<instance>-pguser-<instance>`), falling back to defaults if the secret is not found.
5. **pg_dump execution** -- Runs `pg_dump` inside the PostgreSQL pod's `database` container via `oc exec`, streaming the SQL output directly to the local backup file.
6. **Validation** -- Verifies the backup file is non-empty after the dump completes.

## Behavior Notes

- **Direct pg_dump** -- The script uses `pg_dump` via `oc exec` into the pod, not Crunchy Operator's pgBackRest. This produces a plain SQL dump that can be restored with `pg_restore` or `psql`.
- **No blob storage** -- Azure Blob Storage content is not part of the backup. Blob storage persists independently in Azure and does not need to be backed up with this script.
- **Partial dump cleanup** -- If `pg_dump` fails, any partial dump file is removed automatically.
- **Backups are gitignored** -- The `backups/` directory is listed in `.gitignore` so backup files are never accidentally committed.

## Examples

```bash
# On branch feature/my-thing, back up that instance's database
git checkout feature/my-thing
./scripts/oc-backup-db.sh

# Back up a specific instance regardless of current branch
./scripts/oc-backup-db.sh --instance feature-other-work

# Workflow: backup then teardown
./scripts/oc-backup-db.sh --instance feature-my-thing
./scripts/oc-teardown.sh --instance feature-my-thing

# Workflow: backup, teardown, redeploy, restore
./scripts/oc-backup-db.sh --instance feature-my-thing
./scripts/oc-teardown.sh --instance feature-my-thing
./scripts/oc-deploy.sh --env dev --instance feature-my-thing
./scripts/oc-restore-db.sh --instance feature-my-thing --from ./backups/feature-my-thing-20260313-143022.sql
```
