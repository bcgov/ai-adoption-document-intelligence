Here's the full picture for BCGov Artifactory service accounts:

---

## Viewing your existing SA credentials

Each project set gets a default service account. Credentials are stored as an OpenShift secret. Pull them with:

```bash
# List secrets to find the right one
oc get secrets -n <tools-namespace> | grep artifacts

# Get username
oc get secret/artifacts-default-[random] -o json | jq '.data.username' | tr -d '"' | base64 -d

# Get password
oc get secret/artifacts-default-[random] -o json | jq '.data.password' | tr -d '"' | base64 -d
```

---

## Creating additional service accounts

You can create as many SAs as you need across namespaces. Use this to create one:

```bash
oc process -f https://raw.githubusercontent.com/bcgov/platform-services-archeobot/master/archeobot/config/samples/tmpl-artifactoryserviceaccount.yaml \
  -p NAME="[ASAname]" \
  -p DESCRIPTOR="[Description]" | oc create -f -
```

Shorthand aliases for the resource type are `ArtSvcAcct` and `ArtSA`.

**Rotating a password:** just delete the secret — Archeobot detects the deletion, rotates the password, and recreates the secret.

**Deleting an SA:**
```bash
oc delete artsvcacct [ASAname]
```

---

## CLI access to Artifactory

Yes — two main options:

### 1. JFrog CLI (`jfrog`)
Configure it with your SA credentials:

```bash
jfrog rt config \
  --url https://artifacts.developer.gov.bc.ca/artifactory/ \
  --user <sa-username>
# Enter password interactively (avoids it ending up in shell history)
```

Then use it:
```bash
jfrog rt ping
jfrog rt upload ./myfile.jar "my-repo/path/"
jfrog rt download "my-repo/path/myfile.jar"
```

### 2. `curl` / REST API
```bash
curl -u "<username>:<password>" \
  https://artifacts.developer.gov.bc.ca/artifactory/api/system/ping
```

### 3. `docker login` (for container repos)
```bash
docker login artifacts.developer.gov.bc.ca \
  -u <sa-username> \
  -p <sa-password>
```

---

## Key things to know

- SA accounts should be given the **Contributor** role in your Artifactory project; human users get **Developer** or **Admin**.
- For support, use the `#devops-artifactory` channel on Rocket.Chat. For urgent issues, use `#devops-sos`.
- The BCGov Artifactory URL is `artifacts.developer.gov.bc.ca`

---

## Container image cleanup scripts

This project maintains scripts for the `kfd3-fd34fb-local` Docker repository:

| Script | Purpose |
|--------|---------|
| `scripts/artifactory-usage.sh` | Report storage usage per image/tag |
| `scripts/artifactory-cleanup.sh` | Rotate old tags, delete orphan `sha256__*` manifests, clean stale `_uploads/` blobs |
| `scripts/artifactory-delete-run-tags.sh` | Delete a specific run's staged SHA tag from all images (used on CI failure) |

### Staged tags and promotion

CI builds push images to immutable SHA tags (`<floating>-<sha12>`) and only promote to the floating tag after a successful deploy. Locally:

```bash
# Push staged images
./scripts/oc-build-push.sh --env dev --all --tag my-branch

# Deploy with the SHA tag printed by the build script
./scripts/oc-deploy-instance.sh --env dev --namespace fd34fb-test \
  --image-tag my-branch-<sha12> --confirm

# Promote to floating tag after deploy succeeds (no rebuild)
./scripts/oc-build-push.sh --env dev --tag my-branch --promote
```

### Failure cleanup

When a CI build or deploy fails, the `cleanup-on-failure` workflow job runs:

```bash
./scripts/artifactory-delete-run-tags.sh --tag bcgov-di-test-<sha12> --delete
```

This deletes the named tag from all four images (`backend-services`, `frontend`, `temporal`, `ches-adapter`) and then runs orphan/uploads cleanup.

### Routine cleanup

After successful prod deploys, CI keeps the 3 most recent `bcgov-di-????????????` SHA tags per image. Test/dev keeps 10. Manual cleanup:

```bash
./scripts/artifactory-cleanup.sh --env dev --delete --keep 10 --match 'bcgov-di-test-????????????'
./scripts/artifactory-cleanup.sh --env prod --delete --keep 3 --match 'bcgov-di-????????????'
```

All Artifactory API calls use `--connect-timeout 30 --max-time 120`. Docker login retries up to 3 times via `scripts/lib/artifactory-login.sh`, and the CI staged-image existence check and `imagetools create` tag promotion retry via `scripts/lib/retry.sh` (`with_retries`).