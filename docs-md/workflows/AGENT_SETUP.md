# Workflow agent — setup and access

The **workflow agent** is the chat assistant in the workflow builder (the
speech-bubble icon in the header on any `/workflows` route). It calls a large
language model to design and edit workflows on your behalf.

This page answers the two questions a developer actually has on a fresh
checkout: *which service does it talk to*, and *what do I do when it doesn't
answer*. Design and internals are in
[AI_AGENT_DESIGN.md](AI_AGENT_DESIGN.md).

> **Nothing on this page is a secret.** Every variable below is named, never
> valued. Do not paste a key into a doc, a commit message, a ticket or a chat.

---

## Which service it uses

**Azure OpenAI, reached through the BC Gov AI Hub APIM proxy** — the *same*
subscription the OCR enrichment step already uses, not a separate one. There is
one deployment behind it, and the deployment name is used verbatim as the model
id.

Anthropic is implemented as a second provider and works, but **nothing in this
repo is configured for it**, so Azure is the only working path today.

`AZURE_OPENAI_*` is **shared configuration**, not agent-specific: the same four
variables are read by the OCR enrichment step (`enrich-results`), field-format
suggestions (`format-suggestion.service.ts`), benchmark recommendations
(`ai-recommendation.service.ts`) and the two vision-model OCR providers
(`vlm-direct-extract.ts` and `vlm-hybrid-extract.ts`). Repointing the endpoint
moves all six features at once.

The agent runs inside **backend-services**, so the variables must be present
for that process — not only for the Temporal worker.

## Which variables gate it

Read once at startup by
[`apps/backend-services/src/agent/agent.env.ts`](../../apps/backend-services/src/agent/agent.env.ts).
A variable that is **present but blank counts as absent**, deliberately: handed
to the SDK, a blank key produces a mid-stream HTTP 401 instead of a clean
refusal.

| Variable | Required? | What it is |
|---|---|---|
| `AZURE_OPENAI_API_KEY` | **yes**, for Azure | The APIM subscription key |
| `AZURE_OPENAI_ENDPOINT` | **yes**, for Azure | The APIM / Azure OpenAI base URL |
| `AZURE_OPENAI_DEPLOYMENT` | no (defaults to `gpt-4o`) | Deployment name, used verbatim as the model id |
| `AZURE_OPENAI_API_VERSION` | no; the default depends on where the code runs, see below | Azure API version |
| `ANTHROPIC_API_KEY` | **yes**, for Anthropic | Alternative provider; not configured anywhere in this repo |
| `AGENT_ANTHROPIC_MODEL` | no | Anthropic model id |
| `AGENT_DEFAULT_PROVIDER` | no | `azure` or `anthropic`; falls back to whichever is configured |

**`AZURE_OPENAI_API_VERSION` when it isn't set.** Each environment supplies its
own value. `docker-compose.yml` passes `2024-12-01-preview` to backend-services
and to the Temporal worker. On OpenShift the `backend-services-config` and
`temporal-worker-config` ConfigMaps set `2024-02-15-preview`, which is also what
the deploy workflow and `scripts/oc-deploy-instance.sh` fall back to. Running
locally from the root `.env` without it, each feature uses its own code default:
`2024-10-21` for the agent, and `2024-12-01-preview` for the other five.

Cost and loop bounds, none of them load-bearing for setup: `AGENT_MAX_STEPS`,
`AGENT_MAX_OUTPUT_TOKENS`, `AGENT_MAX_CONVERSATION_TOKENS`,
`AGENT_MAX_TOOL_RESULT_CHARS`, `AGENT_MAX_RUNS_PER_CONVERSATION`.

### Where to put them locally

In the **root `.env`**, the one file the backend reads
([`env-loader.ts`](../../apps/backend-services/src/env-loader.ts)). It is
gitignored, so the key stays out of commits. Restart backend-services after
changing it; the variables are read once, at startup.

`.env.sample` ships these four variables with **empty** values on purpose: a
placeholder value would make a copied sample report the assistant as
configured, and the first question would then fail on a DNS lookup of a host
that does not exist.

### Where they come from on a deployed instance

Every target passes the four variables to backend-services, as well as to the
Temporal worker:

| Target | Endpoint / deployment / api-version | API key |
|---|---|---|
| `docker-compose.yml` | `backend-services` service env, from the repo-root `.env` | same |
| OpenShift | `backend-services-config` ConfigMap | `backend-services-secrets` Secret, key `AZURE_OPENAI_API_KEY` |

All four `env` entries on the backend-services container are `optional: true`.
That is deliberate: a missing key **disables the assistant**, it does not put
the pod in `CreateContainerConfigError`. An instance whose Secret has no
`AZURE_OPENAI_API_KEY` entry keeps serving everything else.

The worker keeps its own copy in `temporal-worker-secrets` /
`temporal-worker-config`. The two Secrets are per-deployment by convention here
(`AZURE_DOCUMENT_INTELLIGENCE_API_KEY` and the `AZURE_STORAGE_*` keys are
duplicated the same way), and every writer — the deploy workflow, the deploy
script and the rotation script — fills both from a single source value. One key
to rotate, two places it lands.

To wire an already-deployed instance, see
[../operations/prod-secrets-rotation.md](../operations/prod-secrets-rotation.md)
§ *Adding `AZURE_OPENAI_API_KEY` to an existing instance*.

## What you see when it is unconfigured

**The app runs normally and the assistant is disabled.** It does not crash, and
the backend does not refuse to boot. Concretely:

- `GET /api/agent/models` answers `200` with `items: []` and a `missingConfig`
  array naming the variables each provider needs — **names only**.
- The chat drawer shows a notice reading *"The assistant isn't configured on
  this server"*, names the missing variables, and points here.
- The model picker reads **"No model configured"**.
- The composer **sends nothing**. Its send button is disabled, and hovering it,
  or moving keyboard focus to it, shows the reason; pressing Enter in the
  message box sends nothing either, and keeps what you typed.
- If a turn is posted anyway (a script, a stale tab), the backend refuses with
  HTTP **503** and `code: "assistant-not-configured"`.

Two neighbouring states that are *not* this one, and say so differently:

| What you see | What it means |
|---|---|
| "Server default model" | The model *list request* failed. The server's configuration is unknown, so the composer stays live and the turn goes out with no model override. |
| "That model is not configured on this server" (in the thread) | You asked for a provider this backend has no credentials for. Pick another model. |
| A red error in the thread naming HTTP 401 / 404 / 429 | The credential reached the provider and the *provider* rejected it — wrong key, wrong deployment name, or rate limited. |

## How to request access

**There is no self-serve path.** The key is a shared team subscription and is
handed out directly — **ask Alex Struk** (AI Technical Solutions Team,
CITZ/OCIO/TDAC) and put what he gives you in the root `.env`, then restart
backend-services.

For deployed instances the same key is delivered as the `AZURE_OPENAI_API_KEY`
entry of the `<instance>-backend-services-secrets` Kubernetes Secret; see
[../operations/prod-secrets-rotation.md](../operations/prod-secrets-rotation.md)
and the deployed-instance table above.

## Related

- [AI_AGENT_DESIGN.md](AI_AGENT_DESIGN.md) — what the agent does and its tools
- [MANUAL_TEST_PLAN.md](MANUAL_TEST_PLAN.md) — Part 15 exercises the agent
- [../operations/ENVIRONMENT_CONFIGURATION.md](../operations/ENVIRONMENT_CONFIGURATION.md) — every environment variable in the platform
