# Build and Push Images

Build container images locally with Docker and push to Artifactory (same registry paths as CI).

## Arguments

- `--env <dev|prod>` (required) — Environment profile (for registry credentials)
- `<service ...>` — Services to build: `backend-services`, `frontend`, `temporal`
- `--all` (optional) — Build all services
- `--tag, -t` (optional) — Floating tag override (default: sanitized git branch name)
- `--push-floating` (optional) — Push straight to `<tag>` instead of staging it
- `--promote` (optional) — Repoint `<tag>` at the staged manifest, after a successful deploy

## Staged tags

Images are pushed to **`<tag>-<sha12>`**, not to `<tag>`. The floating `<tag>` is only moved by a later
`--promote`, so a failed build never becomes the tag that running pods pull. The staged tag is what
`Deploy.md` must be given as `--image-tag`; the script prints it as `Push tag:`.

## Steps

1. **Confirm services to build** with the user.

2. **Run build**:
   ```bash
   ./scripts/oc-build-push.sh --env <env> (--all | <service ...>) [--tag <tag>]
   ```

3. **Report results**: Show which images were built and the **staged tag** they were pushed to — the
   next step needs that exact string.

## Examples

```bash
# Build and push frontend only
./scripts/oc-build-push.sh --env dev frontend

# Build and push multiple services
./scripts/oc-build-push.sh --env dev frontend backend-services

# Build all services
./scripts/oc-build-push.sh --env dev --all

# Build with custom tag — lands on my-custom-tag-<sha12>
./scripts/oc-build-push.sh --env dev frontend --tag my-custom-tag

# Promote the staged manifest to the floating tag, once the deploy has succeeded
./scripts/oc-build-push.sh --env dev --tag my-custom-tag --promote
```

## Common Pitfalls

- **Docker not running**: Ensure Docker daemon is started.
- **Artifactory credentials**: Must be configured in `deployments/openshift/config/<env>.env`.
- **Build context**: Backend and temporal use repo root as build context; frontend uses `apps/frontend/`.
