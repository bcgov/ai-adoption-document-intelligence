# Worklog — I1 / D4: wiring the agent's credentials into backend-services

**Date:** 2026-08-15 · **Branch:** `feature/visual-workflow-builder` ·
**Scope:** configuration and documentation only. **No application code changed.**

Follows [`agent-credentials.md`](agent-credentials.md) §3b, which found that
`AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` and
`AZURE_OPENAI_API_VERSION` reached the **temporal worker only**. The workflow
chat agent runs in `backend-services`, so on every deployed instance the
assistant was permanently "not configured"; it worked on a developer machine
only because `~/.config/bcgov-di/backend-services.env` is loaded ahead of the
repo `.env`.

**No secret value was read, printed or copied.** Every line below names a
variable or a Secret key. All placeholder files keep their placeholders.

---

## 1. The decision: separate keys, not a shared Secret

**Chosen: `backend-services` gets its own `AZURE_OPENAI_API_KEY` entry in the
existing `backend-services-secrets`, alongside the worker's copy in
`temporal-worker-secrets`.** The alternative — renaming
`temporal-worker-secrets` to something namespace-neutral and having both
deployments read it — was rejected.

Four reasons, in the order they mattered:

**(i) Duplication is already the established pattern here, and it is not
drift-prone in practice.** Four credentials are *already* written into both
Secrets: `AZURE_DOCUMENT_INTELLIGENCE_API_KEY`,
`AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME`,
`AZURE_STORAGE_ACCOUNT_KEY`. Adding a fifth follows the file's own convention
rather than inventing a mechanism. The theoretical cost of duplication is *two
copies to rotate* — but there are not two sources. Every writer fans one value
out to both Secrets in a single run:

| Writer | Single source | Writes to |
|---|---|---|
| `.github/workflows/deploy-instance.yml` | GitHub env secret `AZURE_OPENAI_API_KEY` | both, one step |
| `scripts/oc-deploy-instance.sh` | `AZURE_OPENAI_API_KEY` in the `config/*.env` file | both, one run |
| `scripts/rotate-prod-secrets.sh` | one line in `~/.config/bcgov-di/prod-secrets.env` | both, one run, both deployments restarted |

There is still exactly one value to change. Drift would require someone to
hand-patch one Secret and not the other, which is not a path any script takes.

**(ii) The rename has a real migration cost and a worse failure mode.**
`namePrefix` in the instance-template overlay means the Secret name is
*per-instance* (`<instance>-temporal-worker-secrets`), so a rename must be
coordinated across **every instance in the namespace**, not just prod. And
`oc apply` of a renamed Secret does not delete the old one: the rename would
leave an orphaned Secret in the namespace **still holding a live Azure
subscription key**, with nothing in the deploy path to clean it up. A migration
that leaves the credential behind is worse than a second managed copy.

**(iii) The worker Secret holds something backend-services should not mount.**
`temporal-worker-secrets` carries `PLATFORM_API_KEY` — the platform API key the
`dyn.run` activity injects into dynamic-node scripts, deliberately sourced
server-side. Sharing the Secret would hand that to `backend-services` for no
reason. Kubernetes Secrets are namespace-scoped, but a container's blast radius
is what it mounts, and per-deployment Secrets are what keeps it small here.

**(iv) Cost of being wrong is asymmetric.** If duplication later proves
annoying, consolidating is a scheduled change. If a rename lands half-applied,
instances break on the next apply and a live key is orphaned.

### A second choice inside the chosen option: `optional: true`

All four backend-services env entries are declared `optional: true`. This is
deliberate and is what makes the migration a non-event:

- An instance whose Secret/ConfigMap predates this change **still starts**. A
  required `secretKeyRef` against a missing key leaves the pod in
  `CreateContainerConfigError` — a wiring change that bricks running instances
  until an operator intervenes.
- The degraded state is already correct in code: `agent.env.ts`'s
  `resolveDefaultProvider` returns `null` rather than throwing (the boot-time
  throw described in `agent-credentials.md` §3a has since been removed on this
  branch), `listConfiguredModels` returns `[]`, and the drawer says the
  assistant is not configured. A missing key **disables the assistant**; it does
  not take the API down.

---

## 2. Every file changed, with the exact key names

### Local / docker-compose

**`docker-compose.yml`** — four env entries added to the `backend-services`
service (it previously had none of them; the `temporal-worker` service keeps
its own block unchanged):

```
AZURE_OPENAI_ENDPOINT: ${AZURE_OPENAI_ENDPOINT}
AZURE_OPENAI_API_KEY: ${AZURE_OPENAI_API_KEY}
AZURE_OPENAI_DEPLOYMENT: ${AZURE_OPENAI_DEPLOYMENT:-gpt-4o}
AZURE_OPENAI_API_VERSION: ${AZURE_OPENAI_API_VERSION:-2024-12-01-preview}
```

The defaults are copied verbatim from the worker block on purpose — one
repo-root `.env` drives both services, and divergent defaults in one file would
be the drift this decision is trying to avoid.

### OpenShift kustomize base

**`deployments/openshift/kustomize/base/backend-services/configmap.yml`** — three
data keys added to `backend-services-config`, matching `temporal-worker-config`:

- `AZURE_OPENAI_ENDPOINT` (empty default)
- `AZURE_OPENAI_DEPLOYMENT` (empty default)
- `AZURE_OPENAI_API_VERSION` (`2024-02-15-preview`)

**`deployments/openshift/kustomize/base/backend-services/secret.yml`** — one
`stringData` key added to `backend-services-secrets`:

- `AZURE_OPENAI_API_KEY` (placeholder value unchanged in kind from its
  neighbours; this file has never held a real value)

**`deployments/openshift/kustomize/base/backend-services/deployment.yml`** — four
`env` entries on the `backend-services` container, all `optional: true`:

| Env var | Source |
|---|---|
| `AZURE_OPENAI_ENDPOINT` | `configMapKeyRef` → `backend-services-config` |
| `AZURE_OPENAI_API_KEY` | `secretKeyRef` → `backend-services-secrets` |
| `AZURE_OPENAI_DEPLOYMENT` | `configMapKeyRef` → `backend-services-config` |
| `AZURE_OPENAI_API_VERSION` | `configMapKeyRef` → `backend-services-config` |

### OpenShift instance overlay

**`deployments/openshift/kustomize/overlays/instance-template/kustomization.yml`**
— three placeholders added to the `backend-services-config` ConfigMap patch:
`__AZURE_OPENAI_ENDPOINT__`, `__AZURE_OPENAI_DEPLOYMENT__`,
`__AZURE_OPENAI_API_VERSION__`.

**No change was needed to `scripts/lib/generate-overlay.sh`.** It already
accepts `--azure-openai-endpoint` / `--azure-openai-deployment` /
`--azure-openai-api-version` and substitutes those three tokens **file-wide**
(`sed … /g`, lines 378-380), so the new occurrences in the backend patch are
filled by the flags the deploy paths already pass. Verified by building a real
generated overlay — see §4.

### Deploy paths

**`.github/workflows/deploy-instance.yml`** — one `--from-literal` added to the
`${INSTANCE_NAME}-backend-services-secrets` creation:
`AZURE_OPENAI_API_KEY`. The step already had `AZURE_OPENAI_API_KEY` in its
`env:` block for the worker Secret, so no new GitHub secret is required.

**`scripts/oc-deploy-instance.sh`** — the same `--from-literal` added to the
`BACKEND_SECRET` creation. The variable is already read (`require_cfg
AZURE_OPENAI_API_KEY`, line ~204) and already passed to the overlay generator,
so no new config key is required.

**`scripts/rotate-prod-secrets.sh`** — `AZURE_OPENAI_API_KEY` added to
`ROUTE_BACKEND` (it was already in `ROUTE_WORKER`), and the `usage()` line
changed from `→ GH + OpenShift worker` to `→ GH + OpenShift backend + worker`.
The rollout-restart block needed no change: it keys off `BACKEND_TOUCHED` /
`WORKER_TOUCHED`, so one key in both routing tables now restarts both
deployments automatically.

### Config env files

**`deployments/openshift/config/{dev,prod}.env.example`** (tracked) and the
gitignored local **`dev.env`, `prod.env`, `prod-test.env`** — comment header
only. All four variables were **already present** in every one of these files,
so no key was added; the header read *"Azure OpenAI (LLM enrichment in Temporal
worker)"*, which is the sentence that made this a worker-only concern in the
first place. It now names both consumers and says the deploy scripts write the
key into both Secrets. Only the comment line was rewritten (via `sed` on that
exact line) — no value in any of those files was read or touched.

### Docs

**`docs-md/workflows/AGENT_SETUP.md`** — new *"Where they come from on a
deployed instance"* section: a table of where each of the four lives per target,
why all four refs are `optional: true`, and why the two Secrets are separate.
The old closing line under "How to request access" said only *"the same key is
delivered as a Kubernetes Secret"*; it now names
`<instance>-backend-services-secrets` / `AZURE_OPENAI_API_KEY` and links to the
migration section.

**`docs-md/operations/ENVIRONMENT_CONFIGURATION.md`** — the section heading
*"Azure OpenAI (LLM Enrichment)"* is now *"Azure OpenAI (shared: chat agent,
enrichment, format suggestion, recommendations)"*, with a per-deployment
consumer list and a note that blank values disable the assistant rather than
breaking the deploy. `AZURE_OPENAI_API_KEY` added to the
`<instance>-backend-services-secrets` key list, with the `optional: true` note.

**`docs-md/operations/prod-secrets-rotation.md`** — the supported-keys table now
ticks the backend column for `AZURE_OPENAI_API_KEY`; the "Azure keys" note
explains the two-Secret fan-out; and a new section **"Adding
`AZURE_OPENAI_API_KEY` to an existing instance"** carries the operator steps
below.

### Not changed, on purpose

- **`.env.sample`** — out of scope for this item, and the repo permission
  settings deny reading it from this session. `AGENT_SETUP.md` already documents
  its intended state (four variables, empty values).
- **`ANTHROPIC_API_KEY` / `AGENT_*`** — the brief named four variables and the
  repo rule forbids implementing beyond what was asked. Anthropic remains
  configurable only through the local override file. Worth a separate decision
  if a second provider is ever wanted on a deployed instance.
- **`scripts/lib/generate-overlay.sh`** — already sufficient (see above).
- **`docs-md/wiki/deployment-and-ops.md`** — checked; it names neither
  `AZURE_OPENAI_*` nor the Secret key lists, so there was nothing to keep in
  sync.

---

## 3. What an operator must do to an already-deployed instance

Short version: **redeploy, and nothing needs to exist first.** The
`optional: true` refs mean an instance left alone keeps working with the
assistant disabled — there is no window where it is broken.

### Option A — full redeploy (recommended, covers all four variables)

Re-run either deploy path with the instance's usual arguments:

```bash
# GitHub Actions
#   Actions → "Deploy Instance" → run for the branch/instance as usual

# or locally
./scripts/oc-deploy-instance.sh --config deployments/openshift/config/<env>.env ...
```

What happens, in order, with no manual pre-step:

1. `kustomize build | oc apply` writes `AZURE_OPENAI_ENDPOINT`,
   `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` into
   `<instance>-backend-services-config` and the four new `env` entries onto the
   Deployment. The Deployment change triggers a rollout on its own.
2. The "Create instance secrets" step re-applies
   `<instance>-backend-services-secrets` **with the full key set**, now
   including `AZURE_OPENAI_API_KEY`. `oc create secret … --dry-run=client -o
   yaml | oc apply -f -` replaces the whole Secret, so the key appears whether
   or not it existed before.
3. Confirm (names only, no values):

```bash
oc get secret <instance>-backend-services-secrets -n <ns> -o jsonpath='{.data}' | jq 'keys'
oc get cm <instance>-backend-services-config -n <ns> -o jsonpath='{.data.AZURE_OPENAI_ENDPOINT}'
oc rollout status deployment/<instance>-backend-services -n <ns>
```

Then open the workflow builder's chat drawer: the model picker should offer
"Azure OpenAI — <deployment name>" instead of reading "No model configured".

### Option B — credential only, no redeploy (prod)

Use when the ConfigMap is already current (i.e. the instance has been redeployed
from this branch) and only the key is missing or being rotated:

```bash
# put a single AZURE_OPENAI_API_KEY line in the file, mode 600
$EDITOR ~/.config/bcgov-di/prod-secrets.env
./scripts/rotate-prod-secrets.sh --dry-run --only AZURE_OPENAI_API_KEY
./scripts/rotate-prod-secrets.sh --only AZURE_OPENAI_API_KEY
```

`oc patch --type=merge` **creates** the key if it is absent, so this works on a
Secret that predates the change. Both `backend-services` and `temporal-worker`
are patched and both are rolled restarted.

### What is *not* required

- No Secret has to be created by hand before the next apply.
- No Secret is renamed, so nothing is orphaned and no other instance in the
  namespace is affected.
- No GitHub Actions secret and no `config/*.env` key is new — every deploy path
  already read `AZURE_OPENAI_API_KEY`; it was simply never written to the
  backend Secret.

### The one failure mode left

If `AZURE_OPENAI_ENDPOINT` or `AZURE_OPENAI_API_KEY` is blank in the instance's
config, the assistant reports itself unconfigured — correctly, and without
affecting anything else in the API. That is now a *configuration* question with
a visible answer in the UI, not an invisible one.

---

## 4. Validation output

**Kustomize base builds** (`kubectl kustomize deployments/openshift/kustomize/base`):
exit 0. The only warnings are the pre-existing `'commonLabels' is deprecated`
notices, six of them, unrelated to this change.

**Generated instance overlay builds** — the real path, via
`generate_instance_overlay` with a throwaway instance name and dummy endpoint,
then `kubectl kustomize`: exit 0, same pre-existing warnings only. Inspecting
the built manifest confirms `namePrefix` rewrote every new reference:

```
CM     validate-wiring-backend-services-config
       AZURE_OPENAI_API_VERSION=2024-02-15-preview
       AZURE_OPENAI_DEPLOYMENT=gpt-4o
       AZURE_OPENAI_ENDPOINT=https://apim.example.invalid/openai
SECRET validate-wiring-backend-services-secrets
       keys = [AZURE_DOCUMENT_INTELLIGENCE_API_KEY, AZURE_OPENAI_API_KEY,
               AZURE_STORAGE_ACCOUNT_KEY, AZURE_STORAGE_ACCOUNT_NAME,
               AZURE_STORAGE_CONNECTION_STRING, SSO_CLIENT_SECRET]
ENV    AZURE_OPENAI_ENDPOINT    → cm validate-wiring-backend-services-config (optional)
ENV    AZURE_OPENAI_API_KEY     → secret validate-wiring-backend-services-secrets (optional)
ENV    AZURE_OPENAI_DEPLOYMENT  → cm validate-wiring-backend-services-config (optional)
ENV    AZURE_OPENAI_API_VERSION → cm validate-wiring-backend-services-config (optional)
```

The dummy overlay was deleted afterwards. No cluster was contacted at any point.

**`docker compose config -q`**: exit 0.

**`bash -n`** on `scripts/oc-deploy-instance.sh` and
`scripts/rotate-prod-secrets.sh`: both clean. `shellcheck` is not installed on
this machine, so it was not run.

**YAML parse** of `docker-compose.yml`, `.github/workflows/deploy-instance.yml`
and the instance-template kustomization: all clean.

**`npm run docs:wiki:check`** — **fails, pre-existing and unrelated**:

```
error: docs-md/wiki/workflow-builder.md: canonical source does not exist:
       apps/frontend/src/pages/WorkflowEditorPage.tsx
```

Nothing under `docs-md/wiki/` was modified by this work (`git status` on that
directory is clean), and the missing file is a workflow-builder page that was
moved by other work on this branch. Flagging it rather than fixing it — it
belongs to whoever moved that component.

---

## 5. Summary of key names added

| File | Key(s) added |
|---|---|
| `docker-compose.yml` (backend-services) | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` |
| `base/backend-services/configmap.yml` | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` |
| `base/backend-services/secret.yml` | `AZURE_OPENAI_API_KEY` |
| `base/backend-services/deployment.yml` | the same four as `env` refs, all `optional: true` |
| `overlays/instance-template/kustomization.yml` | `__AZURE_OPENAI_ENDPOINT__`, `__AZURE_OPENAI_DEPLOYMENT__`, `__AZURE_OPENAI_API_VERSION__` in the backend ConfigMap patch |
| `.github/workflows/deploy-instance.yml` | `AZURE_OPENAI_API_KEY` into `<instance>-backend-services-secrets` |
| `scripts/oc-deploy-instance.sh` | `AZURE_OPENAI_API_KEY` into `<instance>-backend-services-secrets` |
| `scripts/rotate-prod-secrets.sh` | `AZURE_OPENAI_API_KEY` in `ROUTE_BACKEND` |
| `config/*.env*` | none — all four were already present; comment header corrected |
