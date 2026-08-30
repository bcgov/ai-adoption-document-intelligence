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
variables are read by `enrich-results`, `format-suggestion.service.ts` and
`ai-recommendation.service.ts`. Repointing the endpoint moves all four features
at once.

The agent runs inside **backend-services**, so the variables must be present
for that process — not only for the Temporal worker.

## Which variables gate it

Read once at startup by
[`apps/backend-services/src/agent/agent.env.ts`](../../apps/backend-services/src/agent/agent.env.ts).
A variable that is **present but blank counts as absent**, deliberately: a blank
key used to be handed to the SDK and produced a mid-stream HTTP 401 instead of a
clean refusal.

| Variable | Required? | What it is |
|---|---|---|
| `AZURE_OPENAI_API_KEY` | **yes**, for Azure | The APIM subscription key |
| `AZURE_OPENAI_ENDPOINT` | **yes**, for Azure | The APIM / Azure OpenAI base URL |
| `AZURE_OPENAI_DEPLOYMENT` | no (defaults to `gpt-4o`) | Deployment name, used verbatim as the model id |
| `AZURE_OPENAI_API_VERSION` | no (defaults to `2024-10-21`) | Azure API version |
| `ANTHROPIC_API_KEY` | **yes**, for Anthropic | Alternative provider; not configured anywhere in this repo |
| `AGENT_ANTHROPIC_MODEL` | no | Anthropic model id |
| `AGENT_DEFAULT_PROVIDER` | no | `azure` or `anthropic`; falls back to whichever is configured |

Cost and loop bounds, none of them load-bearing for setup: `AGENT_MAX_STEPS`,
`AGENT_MAX_OUTPUT_TOKENS`, `AGENT_MAX_CONVERSATION_TOKENS`,
`AGENT_MAX_TOOL_RESULT_CHARS`, `AGENT_MAX_RUNS_PER_CONVERSATION`.

### Where to put them locally

**`~/.config/bcgov-di/backend-services.env`**, not the repo `.env`.
[`env-loader.ts`](../../apps/backend-services/src/env-loader.ts) loads that file
**before** the repo `.env`, so it wins — and the key never enters the checkout,
which is the point. Override the directory with `DI_SECRETS_DIR`.

`.env.sample` ships these four variables with **empty** values on purpose. A
non-empty placeholder made a copied sample report itself as configured: the
model picker offered "Azure OpenAI — gpt-4o" and the turn then died on a DNS
lookup of a hostname that does not exist.

### Where they come from on a deployed instance

Wired into `backend-services` in every target as of 2026-08-15. Before that the
four variables reached the **temporal worker only**, so the assistant was
permanently "not configured" on anything deployed — it worked on a developer
machine purely because `~/.config/bcgov-di/backend-services.env` is loaded
first.

| Target | Endpoint / deployment / api-version | API key |
|---|---|---|
| `docker-compose.yml` | `backend-services` service env, from the repo-root `.env` | same |
| OpenShift | `backend-services-config` ConfigMap | `backend-services-secrets` Secret, key `AZURE_OPENAI_API_KEY` |

All four `env` entries on the backend-services container are `optional: true`.
That is deliberate: a missing key **disables the assistant**, it does not put
the pod in `CreateContainerConfigError`. An instance whose Secret predates this
change keeps serving everything else.

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
- The composer's **send button is disabled**, with the same reason on hover and
  on keyboard focus. You are not able to type a question into a wall.
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
CITZ/OCIO/TDAC) and put what he gives you in
`~/.config/bcgov-di/backend-services.env`, then restart backend-services.

For deployed instances the same key is delivered as the `AZURE_OPENAI_API_KEY`
entry of the `<instance>-backend-services-secrets` Kubernetes Secret; see
[../operations/prod-secrets-rotation.md](../operations/prod-secrets-rotation.md)
and the deployed-instance table above.

## Related

- [AI_AGENT_DESIGN.md](AI_AGENT_DESIGN.md) — what the agent does and its tools
- [MANUAL_TEST_PLAN.md](MANUAL_TEST_PLAN.md) — Part 15 exercises the agent
- [../operations/ENVIRONMENT_CONFIGURATION.md](../operations/ENVIRONMENT_CONFIGURATION.md) — every environment variable in the platform
