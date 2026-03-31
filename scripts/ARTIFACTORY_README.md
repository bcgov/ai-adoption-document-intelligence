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