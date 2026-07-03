# Deploy Instance

Deploy a fully isolated application stack (frontend, backend, Temporal server/worker/UI, Crunchy PostgreSQL) to OpenShift.

## Arguments (`oc-deploy-instance.sh`)

- `--env <dev|prod>` (required) — Environment profile (`deployments/openshift/config/<env>.env`)
- `--namespace <openshift-project>` (required) — Target namespace (e.g. `fd34fb-test`)
- `--image-tag <tag>` (required) — Tag for all three Artifactory images
- `--instance <name>` (optional) — Instance name override (default: sanitized git branch, max 20 chars)
- `--confirm` (required) — Acknowledgement flag before `oc apply`
- `--skip-plg`, `--skip-oc-login`, `--document-intelligence-mode`, `--mock-azure-ocr` — See script `--help`

Pair with **`oc-build-push.sh`** when images need to come from the developer machine / current branch.

## Steps

1. **Pre-flight gate**: Run the pre-flight checks from SKILL.md (token file for target namespace, config file).

2. **Confirm with user**: Show instance name, namespace, image tag; user passes `--confirm` to the deploy script.

3. **Check prerequisites**:
   ```bash
   command -v oc kustomize docker helm   # helm optional if --skip-plg
   ```

4. **Build images** (when not using existing CI tags): `./scripts/oc-build-push.sh --env <env> --all [--tag <tag>]`.

5. **Run deployment** (manual OpenShift apply — mirrors GitHub `deploy-instance` job):
   ```bash
   ./scripts/oc-login-sa.sh --namespace <openshift-namespace>
   ./scripts/oc-deploy-instance.sh --env <env> --namespace <openshift-namespace> \
     --image-tag <tag> [--instance <name>] [--confirm]
   ```

6. **Report results**: Show frontend/backend URLs and teardown command (`./scripts/oc-teardown.sh --namespace <ns> --instance <name>`).

See [docs-md/openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md](../../../docs-md/openshift-deployment/MANUAL_LOAD_TEST_INSTANCE.md).

## Examples

```bash
# Images from current branch, deploy dedicated load-test stack in fd34fb-test
./scripts/oc-build-push.sh --env dev --all --tag my-loadtest-tag
./scripts/oc-login-sa.sh --namespace fd34fb-test
./scripts/oc-deploy-instance.sh --env dev --namespace fd34fb-test \
  --image-tag my-loadtest-tag --instance loadtest-1 --confirm
```

## Common Pitfalls

- **Token expired**: If deployment fails with auth errors, re-run `./scripts/oc-setup-sa.sh --namespace <ns>` then `./scripts/oc-login-sa.sh --namespace <ns>`
- **Images not found**: Build and push with `./scripts/oc-build-push.sh --env <env> --all --tag <tag>` so Artifactory has all three images before deploy.
- **Instance name too long**: Instance names truncate to 20 chars (Crunchy / label limits).
- **Config missing**: Ensure `deployments/openshift/config/<env>.env` exists (copy from `.env.example` and fill in values).
