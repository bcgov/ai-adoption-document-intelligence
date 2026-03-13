# Database Restore Script

## Overview

The `oc-restore-db.sh` script restores a PostgreSQL database from a local SQL dump file into any instance's database. The restore uses direct `psql` execution inside the Crunchy PostgreSQL pod (not Crunchy Operator's pgBackRest).

The script supports cross-instance restore (backup from instance A, restore into instance B) and destroy-and-rebuild workflows (backup, teardown, redeploy, restore).

Only the PostgreSQL database is restored. Azure Blob Storage content is not included, as it persists independently in Azure.

## Prerequisites

- `oc` CLI installed
- `.oc-deploy-token` file exists (created by `oc-setup-sa.sh`)
- The service account has `pods/exec` permission (granted during `oc-setup-sa.sh`)
- The target instance is deployed and its PostgreSQL pod is running
- A valid SQL dump file created by `oc-backup-db.sh`

## Usage

```bash
# Restore a backup into a specific instance
./scripts/oc-restore-db.sh --instance feature-other-work --from ./backups/feature-my-thing-20260313-143022.sql
```

### Options

| Option | Description |
|--------|-------------|
| `--instance`, `-i` | Target instance name to restore into (required). |
| `--from`, `-f` | Path to the local SQL dump file to restore from (required). |
| `--help`, `-h` | Show help message. |

## How It Works

1. **Backup file validation** -- Verifies the specified backup file exists on the local filesystem. If the file is not found, the script exits with a clear error message.
2. **Token validation** -- Reads `.oc-deploy-token` and authenticates with OpenShift using the service account token.
3. **Pod discovery** -- Finds the Crunchy PostgreSQL primary pod for the target instance using label selectors (`postgres-operator.crunchydata.com/role=master` and `app.kubernetes.io/instance=<name>`).
4. **Credential lookup** -- Reads database name and user from the Crunchy-managed secret (`<instance>-pguser-<instance>`), falling back to defaults if the secret is not found.
5. **psql execution** -- Pipes the local SQL dump file into `psql` running inside the PostgreSQL pod's `database` container via `oc exec -i`. The dump includes `DROP`/`CREATE` statements (from `pg_dump --clean --if-exists`) that replace existing data.

## Behavior Notes

- **Direct psql execution** -- The script pipes the SQL dump into `psql` via `oc exec` into the pod. Since the backup is created by `pg_dump` in plain SQL format, `psql` is used (not `pg_restore`, which is for custom/directory/tar formats).
- **Cross-instance restore** -- The backup file from one instance can be restored into a different instance. The `--instance` flag specifies the target, while `--from` specifies the source backup file.
- **Clean restore** -- The SQL dump includes `DROP ... IF EXISTS` and `CREATE` statements, so restoring into an existing database replaces the current data.
- **No blob storage** -- Azure Blob Storage content is not part of the restore. Blob storage persists independently in Azure.
- **Error handling** -- If the backup file is missing, the script exits immediately with a clear error. If `psql` encounters an error during restore, the script stops (`ON_ERROR_STOP=1`).
- **Backups are gitignored** -- The `backups/` directory is listed in `.gitignore` so backup files are never accidentally committed.

## Examples

```bash
# Restore a backup into a specific instance
./scripts/oc-restore-db.sh --instance feature-other-work \
  --from ./backups/feature-my-thing-20260313-143022.sql

# Cross-instance restore: backup from instance A, restore into instance B
./scripts/oc-backup-db.sh --instance feature-my-thing
./scripts/oc-restore-db.sh --instance feature-other-work \
  --from ./backups/feature-my-thing-20260313-143022.sql

# Destroy-and-rebuild workflow
./scripts/oc-backup-db.sh --instance feature-my-thing
./scripts/oc-teardown.sh --instance feature-my-thing
./scripts/oc-deploy.sh --env dev --instance feature-my-thing
./scripts/oc-restore-db.sh --instance feature-my-thing \
  --from ./backups/feature-my-thing-20260313-143022.sql
```
