# Production Secrets Rotation

Rotate critical production secrets from a single external file into both GitHub
Actions (env `prod`) and the OpenShift `fd34fb-prod` namespace (instance
`bcgov-di`) in one step. The script never prints secret values and never reads
`deployments/openshift/config/prod.env`.

## How it works

1. You populate `~/.config/bcgov-di/prod-secrets.env` with only the keys you
   want to rotate — any subset of the supported list below.
2. You run [scripts/rotate-prod-secrets.sh](../scripts/rotate-prod-secrets.sh).
3. The script routes each key to the correct destinations:
   - GitHub Actions environment secret (`gh secret set ... --body -`).
   - Merges into the appropriate OpenShift `Secret` via `oc patch --type=merge`.
4. Affected deployments (`backend-services`, `temporal-worker`) get a rollout
   restart so pods pick up the new values.

Values flow through stdin and `jq --arg`; nothing ever goes through command
arguments or shell logs. The summary at the end reports counts only, no key
names or values.

## Supported keys

| Key                                   | GitHub env `prod`                     | OpenShift `bcgov-di-backend-services-secrets` | OpenShift `bcgov-di-temporal-worker-secrets` | Local file                          |
| ------------------------------------- | ------------------------------------- | --------------------------------------------- | -------------------------------------------- | ----------------------------------- |
| `SSO_CLIENT_SECRET`                   | ✓                                     | ✓                                             |                                              |                                     |
| `AZURE_DOCUMENT_INTELLIGENCE_API_KEY` | ✓                                     | ✓                                             | ✓                                            |                                     |
| `AZURE_STORAGE_CONNECTION_STRING`     | ✓                                     | ✓                                             | ✓                                            |                                     |
| `AZURE_STORAGE_ACCOUNT_NAME`          | ✓                                     | ✓                                             | ✓                                            |                                     |
| `AZURE_STORAGE_ACCOUNT_KEY`           | ✓                                     | ✓                                             | ✓                                            |                                     |
| `AZURE_OPENAI_API_KEY`                | ✓                                     |                                               | ✓                                            |                                     |
| `ARTIFACTORY_SA_USERNAME`             | ✓                                     |                                               |                                              | `artifacts-pull-default-*` in prod  |
| `ARTIFACTORY_SA_PASSWORD`             | ✓                                     |                                               |                                              | `artifacts-pull-default-*` in prod  |
| `OPENSHIFT_TOKEN`                     | ✓ (also sets `OPENSHIFT_API_TOKEN`)   |                                               |                                              | `.oc-deploy/token-fd34fb-prod`      |

Unrecognized keys in the file are skipped with a warning. Empty values are
skipped.

## Prerequisites

- `gh` CLI authenticated (`gh auth status`) with access to
  `bcgov/ai-adoption-document-intelligence`.
- `oc` and `jq` installed.
- `.oc-deploy/token-fd34fb-prod` exists (run `./scripts/oc-setup-sa.sh
  --namespace fd34fb-prod` once if missing).

## Setup

```bash
mkdir -p ~/.config/bcgov-di
chmod 700 ~/.config/bcgov-di

# Create the file (use your editor; do NOT pipe values via shell history)
$EDITOR ~/.config/bcgov-di/prod-secrets.env
chmod 600 ~/.config/bcgov-di/prod-secrets.env
```

Example contents (put only the keys you're rotating):

```ini
# Rotate Azure storage after regenerating in the portal.
# Both account-key and connection-string must change together.
AZURE_STORAGE_ACCOUNT_KEY=<new-key-from-azure>
AZURE_STORAGE_CONNECTION_STRING=<new-connection-string>

# Rotate SSO client secret after regenerating in CSS.
SSO_CLIENT_SECRET=<new-secret>
```

## Running

```bash
# Preview (no changes applied)
./scripts/rotate-prod-secrets.sh --dry-run

# Apply everything in the file
./scripts/rotate-prod-secrets.sh

# Rotate only a specific key
./scripts/rotate-prod-secrets.sh --only SSO_CLIENT_SECRET

# Apply but skip rolling restart (do it yourself later)
./scripts/rotate-prod-secrets.sh --no-restart
```

### Output

The script logs only progress markers and key names when applying or when a
failure occurs. The final summary is counts only — no key names, no values:

```
--- Summary ---
Keys processed:               3
Unknown keys (skipped):       0
Empty values (skipped):       0
GitHub secrets updated:       3
GitHub secrets failed:        0
OpenShift secrets patched:    1
OpenShift secrets failed:     0
Deployments restarted:        1
```

## Per-secret rotation notes

### SSO_CLIENT_SECRET

Regenerate in Keycloak/CSS (bcgov-sso realm, client
`ai-adoption-document-intelligence-6162`) **before** updating the file. Any
running pods still holding the old secret will fail `/token` calls until the
restart completes.

### Azure keys (storage, Document Intelligence, OpenAI)

Azure supports two keys per resource. Rotate key2 first, swap in the value,
verify the app is healthy, then rotate key1. For
`AZURE_STORAGE_CONNECTION_STRING`, Azure emits a new string when you regenerate
the account key — put them both in the file together so they stay consistent.

### ARTIFACTORY_SA_USERNAME / ARTIFACTORY_SA_PASSWORD

The BC Gov platform uses the Archeobot operator (not the Artifactory UI) to
manage these. There's no "change password" action — you rotate by destroying
and recreating the `ArtifactoryServiceAccount` CR in your `-tools` namespace.
The username changes each time (random suffix is regenerated).

**Gotcha:** Archeobot maintains the canonical credential secret in `-tools`
only. The `artifacts-pull-default-*` dockerconfigjson in `fd34fb-prod` is a
manually-seeded copy (done once when the direct-pull flow was set up) — it
does **not** auto-propagate on rotation. This script patches that prod copy
for you whenever both `ARTIFACTORY_SA_*` keys are present.

```bash
# As your own IDIR user (NOT the deploy SA)
oc login --web --server=https://api.silver.devops.gov.bc.ca:6443

# List the ASA(s) — find the one you want to rotate
oc get artsvcacct -n fd34fb-tools

# Delete it; Archeobot auto-recreates the "default" ASA within a few minutes
oc delete artsvcacct default -n fd34fb-tools

# Get the new plate (suffix) from the ASA status once it comes back
oc get artsvcacct default -n fd34fb-tools -o jsonpath='{.spec.current_plate}'

# Pipe the values directly into the rotation file (stdout never carries them):
NEW_PLATE="<from above>"
oc get secret "artifacts-default-${NEW_PLATE}" -n fd34fb-tools -o json \
  | jq -r '.data | "ARTIFACTORY_SA_USERNAME=" + (.username | @base64d) +
                  "\nARTIFACTORY_SA_PASSWORD=" + (.password | @base64d)' \
  >> ~/.config/bcgov-di/prod-secrets.env
# Remove any stale ARTIFACTORY_SA_* lines that were above this append, if needed.
```

Then run `./scripts/rotate-prod-secrets.sh`. The script will:
1. Push both keys to GH `prod` env.
2. Find `artifacts-pull-default-*` in `fd34fb-prod` and patch its
   `.dockerconfigjson` with the new creds.
3. Roll restart **all five** Artifactory-pulling deployments (backend-services,
   frontend, temporal, temporal-ui, temporal-worker) so future pod creations
   pick up the new pull secret cleanly.

**⚠️ Manual step still required — Artifactory UI Project Member:**
Because the SA **username** changes on every rotation, the new account must be
added as a **Member** to the Artifactory Project that owns the
`kfd3-fd34fb-local` repo, with the same roles the old account had (typically
`reader` + `deployer`). Without this, pod pulls fail with *"The client does
not have permission for manifest"* even though auth succeeds.

1. Log in to `artifacts.developer.gov.bc.ca` with your IDIR.
2. Find the project (gear → Identity and Access → Projects, or via Projects
   direct navigation).
3. Members → Add Member → Users → search for the new SA name
   (`default-fd34fb-<new-suffix>`) → grant the required roles.
4. Optionally remove the previous SA name from Members.

If you rotated but forgot this step, the script's patch + restart leaves pods
in `ErrImagePull` with the manifest-permission error — add the member, then
`oc delete pod -n fd34fb-prod <failing-pod>` to reset the backoff.

### OPENSHIFT_TOKEN

Generate a new long-duration token first, then put it in the file:

```bash
# As your own user (after: oc login --server=https://api.silver.devops.gov.bc.ca:6443)
oc create token deploy-sa -n fd34fb-prod --duration=87600h
# Paste the output as OPENSHIFT_TOKEN=<token> in prod-secrets.env
```

The script will:
- Push the value to GH secrets `OPENSHIFT_TOKEN` and `OPENSHIFT_API_TOKEN`
  (both point at the same SA; the restore workflow reads the latter).
- Rewrite `.oc-deploy/token-fd34fb-prod` and `.oc-deploy/token` with the new
  value, preserving the `NAMESPACE` and `SERVER` lines.

### Grafana admin password

Out of scope for this script — rotate via `helm upgrade` on the PLG release.

### Database password

Out of scope — the Crunchy operator manages the `*-pguser-admin` secret.
Rotating requires editing the `PostgresCluster` `users` field.

## Safety & privacy

- `set -euo pipefail` and stdin-based plumbing throughout.
- `jq -n --arg K "$V"` constructs patch JSON without shell quoting pitfalls.
- `gh secret set --body -` reads from stdin (no value in argv).
- The project already denies Claude's read access to `~/.config/bcgov-di/**` in
  [.claude/settings.json](../.claude/settings.json).
- Keep `~/.config/bcgov-di/prod-secrets.env` at mode `600`. Delete (or at least
  truncate) the file after rotation if you don't want values lingering on disk.

## Related

- [docs-md/local-dev-secrets.md](local-dev-secrets.md) — local dev override layer
  (same `~/.config/bcgov-di` directory, different files for app runtime).
- [scripts/oc-deploy.sh](../scripts/oc-deploy.sh) — full deploy that seeds
  both secrets from `prod.env`.
- [scripts/gh-load-secrets.sh](../scripts/gh-load-secrets.sh) — bulk push of
  non-sensitive config from `prod.env` to GH (separate purpose).
