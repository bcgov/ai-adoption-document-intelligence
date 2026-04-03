# Backup Database

Create a pg_dump backup of an instance's PostgreSQL database. Only the database is backed up — Azure Blob Storage content is not included.

## Arguments

- `--instance <name>` (optional) — Instance to back up (default: derived from git branch)

## Steps

1. **Run backup**:
   ```bash
   ./scripts/oc-backup-db.sh [--instance <name>]
   ```

2. **Report results**: Show the backup file path (`./backups/<instance>-<timestamp>.sql`).

## Examples

```bash
# Backup current branch's instance
./scripts/oc-backup-db.sh

# Backup specific instance
./scripts/oc-backup-db.sh --instance feature-my-thing
```

## Common Pitfalls

- **pods/exec permission**: Service account must have exec permissions (granted during setup).
- **No running pod**: The Crunchy PostgreSQL pod must be running.
- **Blob storage not included**: Only PostgreSQL data is backed up. Azure Blob Storage must be backed up separately.
