# Teardown Instance

Completely destroy all resources for a named instance in OpenShift, including deployments, services, routes, secrets, configmaps, PVCs, Crunchy PostgreSQL clusters, and PLG monitoring stack.

## Arguments

- `--instance <name>` (optional) — Instance to tear down (default: derived from git branch)

## Steps

1. **CRITICAL: Confirm with user** — This is destructive and irreversible. Show the instance name and ask for explicit confirmation before proceeding. Suggest backing up the database first if appropriate.

2. **Optionally backup first**:
   ```bash
   # Suggest to user:
   ./scripts/oc-backup-db.sh --instance <name>
   ```

3. **Run teardown**:
   ```bash
   ./scripts/oc-teardown.sh --instance <name>
   ```

4. **Report results**: Confirm all resources were deleted.

## Examples

```bash
# Teardown instance derived from current branch
./scripts/oc-teardown.sh

# Teardown specific instance
./scripts/oc-teardown.sh --instance feature-old-work
```

## Common Pitfalls

- **Wrong instance**: Always double-check the instance name. There is no undo.
- **Database not backed up**: Data is permanently lost. Always offer to backup first.
- **PLG release left behind**: The script handles Helm uninstall, but verify with `helm list` if issues arise.
