# Restore Database

Restore a PostgreSQL database from a local SQL dump file. Supports cross-instance restore (backup from instance A, restore into instance B).

## Arguments

- `--instance <name>` (required) — Target instance to restore into
- `--from <file>` (required) — Path to the SQL dump file

## Steps

1. **CRITICAL: Confirm with user** — This replaces existing database contents. Show the target instance and source file, and ask for confirmation.

2. **Run restore**:
   ```bash
   ./scripts/oc-restore-db.sh --instance <name> --from <backup-file>
   ```

3. **Report results**: Confirm restoration completed.

## Examples

```bash
# Restore from backup into specific instance
./scripts/oc-restore-db.sh --instance feature-other-work --from ./backups/feature-my-thing-2026-03-13.sql
```

## Common Pitfalls

- **Destructive**: Existing data in the target database is replaced.
- **Instance must be deployed**: The target must have a running PostgreSQL pod.
- **Blob storage not restored**: Only PostgreSQL data. Azure Blob Storage is not included.
