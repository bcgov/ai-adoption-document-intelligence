# Deploy Instance

Deploy a fully isolated application stack (frontend, backend, Temporal server/worker/UI, Crunchy PostgreSQL) to OpenShift.

## Arguments (`oc-deploy-instance.sh`)

- `--env <dev|prod>` (required) — Environment profile (`deployments/openshift/config/<env>.env`)
- `--namespace <openshift-project>` (required) — Target namespace (e.g. `fd34fb-test`)
- `--image-tag <tag>` (required) — The **staged** tag for all three Artifactory images, i.e. `<tag>-<sha12>` as printed by `oc-build-push.sh` (see [Build.md](Build.md)) — not the bare `--tag` value passed to the build
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
   Note the **staged tag** it prints (`<tag>-<sha12>`) — that is what step 5 deploys.

5. **Run deployment** (manual OpenShift apply — mirrors GitHub `deploy-instance` job):
   ```bash
   ./scripts/oc-login-sa.sh --namespace <openshift-namespace>
   ./scripts/oc-deploy-instance.sh --env <env> --namespace <openshift-namespace> \
     --image-tag <tag>-<sha12> [--instance <name>] [--confirm]
   ```
   The script exits non-zero if a rollout does not complete, printing pod status, `FailedScheduling`
   events and namespace quotas. Do not report a deploy as successful on a non-zero exit.

6. **Report results**: Show frontend/backend URLs and teardown command (`./scripts/oc-teardown.sh --namespace <ns> --instance <name>`).

See [docs-md/operations/MANUAL_LOAD_TEST_INSTANCE.md](../../../docs-md/operations/MANUAL_LOAD_TEST_INSTANCE.md).

## Examples

```bash
# Images from current branch, deploy dedicated load-test stack in fd34fb-test
./scripts/oc-build-push.sh --env dev --all --tag my-loadtest-tag   # pushes my-loadtest-tag-<sha12>
./scripts/oc-login-sa.sh --namespace fd34fb-test
./scripts/oc-deploy-instance.sh --env dev --namespace fd34fb-test \
  --image-tag my-loadtest-tag-<sha12> --instance loadtest-1 --confirm
```

## Common Pitfalls

- **Token expired**: If deployment fails with auth errors, re-run `./scripts/oc-setup-sa.sh --namespace <ns>` then `./scripts/oc-login-sa.sh --namespace <ns>`
- **Images not found**: Most often `--image-tag` was given the bare build tag instead of the staged `<tag>-<sha12>`. Otherwise build and push with `./scripts/oc-build-push.sh --env <env> --all --tag <tag>` so Artifactory has all three images before deploy.
- **Instance name too long**: Instance names truncate to 20 chars (Crunchy / label limits).
- **Config missing**: Ensure `deployments/openshift/config/<env>.env` exists (copy from `.env.example` and fill in values).
