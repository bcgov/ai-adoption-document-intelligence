# Deploy Instance

Deploy a fully isolated application stack (frontend, backend, Temporal server/worker/UI, Crunchy PostgreSQL) to OpenShift.

## Arguments

- `--env <dev|prod>` (required) — Environment profile
- `--instance <name>` (optional) — Instance name override (default: derived from git branch)
- `--build-local` (optional) — Build images locally with Docker instead of GitHub Actions
- `--rebuild` (optional) — Force rebuild even if images exist in registry

## Steps

1. **Pre-flight gate**: Run the pre-flight checks from SKILL.md (token, login, config file).

2. **Confirm with user**: Show the resolved instance name, environment, and ask for confirmation before proceeding.

3. **Check additional prerequisites**:
   ```bash
   # Verify gh CLI (needed for remote image builds, not needed with --build-local)
   which gh && echo "gh OK" || echo "gh CLI not found (needed for remote builds, use --build-local to skip)"
   ```

4. **Run deployment**:
   ```bash
   ./scripts/oc-deploy.sh --env <env> [--instance <name>] [--build-local] [--rebuild]
   ```

4. **Report results**: Show the deployment output including access URLs for frontend, backend, and Temporal UI.

## Examples

```bash
# Deploy from current branch to dev
./scripts/oc-deploy.sh --env dev

# Deploy with custom instance name
./scripts/oc-deploy.sh --env dev --instance my-feature

# Deploy with locally built images
./scripts/oc-deploy.sh --env dev --build-local

# Force rebuild and deploy
./scripts/oc-deploy.sh --env dev --rebuild
```

## Common Pitfalls

- **Token expired**: If deployment fails with auth errors, re-run `./scripts/oc-setup-sa.sh --namespace <ns>` then `./scripts/oc-login-sa.sh`
- **Images not found**: Code must be pushed to GitHub for remote builds. Use `--build-local` for unpushed changes.
- **Instance name too long**: OpenShift has naming constraints. The script auto-truncates to 20 chars but custom names must also respect this.
- **Config missing**: Ensure `deployments/openshift/config/<env>.env` exists (copy from `.env.example` and fill in values).
