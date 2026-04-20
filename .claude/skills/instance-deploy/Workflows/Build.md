# Build and Push Images

Build container images locally with Docker and push to Artifactory. Optionally restart OpenShift deployments to pick up new images.

## Arguments

- `--env <dev|prod>` (required) — Environment profile (for registry credentials)
- `<service ...>` — Services to build: `backend-services`, `frontend`, `temporal`
- `--all` (optional) — Build all services
- `--restart` (optional) — Restart OpenShift deployments after push
- `--namespace, -n` (optional) — OpenShift namespace for restart
- `--tag, -t` (optional) — Image tag override (default: sanitized git branch name)

## Steps

1. **Confirm services to build** with the user.

2. **Run build**:
   ```bash
   ./scripts/oc-build-push.sh --env <env> [--all | <service ...>] [--restart] [--tag <tag>]
   ```

3. **Report results**: Show which images were built and pushed.

## Examples

```bash
# Build and push frontend only
./scripts/oc-build-push.sh --env dev frontend

# Build and push multiple services
./scripts/oc-build-push.sh --env dev frontend backend-services

# Build all services
./scripts/oc-build-push.sh --env dev --all

# Build, push, and restart deployment
./scripts/oc-build-push.sh --env dev frontend --restart

# Build with custom tag
./scripts/oc-build-push.sh --env dev frontend --tag my-custom-tag
```

## Common Pitfalls

- **Docker not running**: Ensure Docker daemon is started.
- **Artifactory credentials**: Must be configured in `deployments/openshift/config/<env>.env`.
- **Build context**: Backend and temporal use repo root as build context; frontend uses `apps/frontend/`.
