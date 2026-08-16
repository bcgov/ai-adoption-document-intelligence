# Worklog — I1 / D4: why the workflow chat agent doesn't answer

**Date:** 2026-08-14 · **Branch:** `feature/visual-workflow-builder` ·
**Scope:** investigation only, no code changed.

Covers checklist items
[I1](../CHECKLIST.md) (Inderdeep: *"The agent is not working for me, as was the
case earlier"*) and D4 (Dylan: *"I don't think I have the credentials for this.
Which subscription is it meant to be using?"*).

**No secret value was read, printed or copied anywhere in this investigation.**
Everything below names variables and endpoints only.

---

## 1. The short answer

The workflow chat agent calls **Azure OpenAI through the BC Gov API Management
(APIM) proxy** — the same Azure OpenAI *subscription key* the OCR-enrichment
code already uses, read from four shared environment variables. Anthropic is
fully implemented as a second provider but is **not configured anywhere in this
repo**, so in practice there is exactly one path and it needs a key nobody but
Alex currently holds.

A developer on a fresh checkout **cannot make the agent answer**. There is no
free/local fallback provider, `.env.sample` ships no working values, and the
variables are not even documented as belonging to the agent. Dylan's question is
not a gap in his setup — it is a gap in the repo.

---

## 2. Exact configuration

### Provider selection

`apps/backend-services/src/agent/agent.env.ts` reads every setting once at
module construction:

| Variable | Read at | Default when absent | What it is |
|---|---|---|---|
| `AGENT_DEFAULT_PROVIDER` | `agent.env.ts:80-83` | `anthropic` | `anthropic` \| `azure` |
| `ANTHROPIC_API_KEY` | `agent.env.ts:71` | — (provider unavailable) | Anthropic API key |
| `AGENT_ANTHROPIC_MODEL` | `agent.env.ts:72-73` | `claude-haiku-4-5-20251001` | Anthropic model id |
| `AZURE_OPENAI_API_KEY` | `agent.env.ts:75` | — (provider unavailable) | APIM **subscription key** |
| `AZURE_OPENAI_ENDPOINT` | `agent.env.ts:76` | — (provider unavailable) | APIM / Azure OpenAI base URL |
| `AZURE_OPENAI_DEPLOYMENT` | `agent.env.ts:77` | `gpt-4o` | Azure **deployment name** (used verbatim as the model id) |
| `AZURE_OPENAI_API_VERSION` | `agent.env.ts:78` | `2024-10-21` | Azure API version |

Tuning knobs, none of them load-bearing here: `AGENT_MAX_STEPS` (50),
`AGENT_MAX_OUTPUT_TOKENS` (4096), `AGENT_MAX_CONVERSATION_TOKENS` (500000),
`AGENT_MAX_TOOL_RESULT_CHARS` (20000), `AGENT_MAX_RUNS_PER_CONVERSATION` (5)
— `agent.env.ts:88-98`.

**A blank variable counts as absent.** `readSetting` trims and returns `null`
for an empty string (`agent.env.ts:19-24`) — added because the repo-root `.env`
holds `ANTHROPIC_API_KEY=` with no value, which used to be handed to the SDK as
an empty key and produced a mid-stream HTTP 401 instead of a clean refusal.

### Which subscription, concretely

`docs-md/workflows/PHASE7_HANDOFF.md:126` is the only place the actual endpoint
is named:

> *"Azure GPT-4o tool-use **WORKING** as of `apim-idmrncl4iiyvo.azure-api.net`
> endpoint. The previous APIM at `test.aihub.gov.bc.ca/sdpr-invoice-automation`
> was stripping `tool_calls` from assistant messages in transit, blocking the
> agent loop. Switching to the new APIM subscription resolved it."*

So: a **BC Gov AI Hub APIM subscription in front of Azure OpenAI**, deployment
`gpt-4o`-class, reached over the legacy `chat/completions` route (the Responses
API is deliberately avoided because APIM proxies don't forward it —
`provider-resolver.ts:89-91`). `provider-resolver.ts:74-88` normalises the
endpoint to end in `/openai`, sets `useDeploymentBasedUrls`, and wraps `fetch`
to rewrite `content: null` → `""` on assistant tool-call messages, because the
APIM in front of it rejects the standard OpenAI null-content shape.

**`AZURE_OPENAI_*` is shared, not agent-specific.** The same four variables are
consumed by `enrich-results`, `format-suggestion.service.ts` and
`ai-recommendation.service.ts`. Repointing the endpoint moves all four features
at once (noted at `docs-md/workflows/AI_AGENT_DESIGN.md:509`).

### Who can grant access

Nothing in the repo says. The evidence trail is:

- `docs-md/operations/prod-secrets-rotation.md:32` — `AZURE_OPENAI_API_KEY` is a
  rotated production secret, sourced from a file **outside the repo**
  (`~/.config/bcgov-di/prod-secrets.env`) and pushed into GitHub Actions env
  `prod` plus the OpenShift `*-temporal-worker-secrets` Secret.
- Locally, `apps/backend-services/src/env-loader.ts:20-30` supports the same
  out-of-band pattern: an override file at
  `$DI_SECRETS_DIR/backend-services.env` (default `~/.config/bcgov-di/`) loaded
  **before** the repo `.env`. On this machine that file exists and is where the
  Azure key comes from — which is precisely why the agent works here and
  nowhere else.

**Practical answer: Alex is the holder.** The key is distributed by hand, out of
band, into `~/.config/bcgov-di/backend-services.env`. There is no self-serve
path, no documented request process, and no team-shared dev key.

### The request path, end to end

1. `AgentChatDrawer.tsx:255-280` — `DefaultChatTransport` POSTs
   `/api/agent/chat`, body carries `conversationId`, `workflowId`, `groupId`,
   and `provider`/`model` **only if the user picked one** (otherwise omitted so
   the backend uses its own default).
2. `agent.controller.ts:91-125` — resolves caller + group, calls
   `agentService.startChat`, then pipes a Vercel AI SDK UI message stream with
   `onError: describeAgentStreamError`.
3. `agent.service.ts:67` — `providerResolver.resolve({provider, model})`
   (throws `AgentProviderNotConfiguredException` if that provider has no config)
   and `:71` `providerResolver.buildModel(selection)`. **Both run before any
   response header is written**, so a config refusal is a clean 503 with a JSON
   body, not a half-written stream.
4. `provider-resolver.ts:62-92` — constructs the Azure client and calls out.
5. The model picker is served, not hardcoded: `GET /api/agent/models` →
   `configured-models.ts:36-50` returns one entry per provider that
   `hasProvider()` says is configured. The drawer renders exactly that
   (`useAgentModels.ts:21-35`), so it can never offer a model the backend can't
   call.

---

## 3. What happens today when it is unset — with evidence

Three distinct failures, in descending order of severity. Only the third is the
one the reviewers *think* they hit.

### 3a. With **no** provider configured, the whole backend refuses to boot

`agent.env.ts:114-122`:

```ts
private resolveDefaultProvider(requested: AgentProvider): AgentProvider {
  if (this.hasProvider(requested)) return requested;
  if (this.hasProvider("anthropic")) return "anthropic";
  if (this.hasProvider("azure")) return "azure";
  throw new Error(
    "AgentModule requires at least one provider configured. " +
      "Set ANTHROPIC_API_KEY or AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT.",
  );
}
```

`AgentEnv` is a plain Nest provider (`agent.module.ts:44`) inside `AgentModule`,
which `app.module.ts:86` imports unconditionally. A throw in the constructor is
a **DI failure at startup** — not a disabled feature. The behaviour is
deliberate and unit-asserted at `agent.env.spec.ts:132-143`.

Consequence: a developer who copies `.env.sample`, sees he has no Azure key and
blanks the placeholder values, gets a backend that will not start at all. The
error he sees names the agent module, so it reads like the agent broke the
build.

### 3b. The credentials are not wired into **any** deployment target

The agent runs in `backend-services`. `AZURE_OPENAI_*` is delivered **only to
the temporal worker**, in every deployment path:

| Path | Where the vars go | backend-services gets them? |
|---|---|---|
| `docker-compose.yml:220-223` | inside the `temporal-worker` service (starts `:200`); `backend-services` is `:144-199` | **No** |
| `deployments/openshift/kustomize/base/temporal/temporal-worker-deployment.yml:132-151` | temporal-worker container env | — |
| `deployments/openshift/kustomize/base/backend-services/deployment.yml` | 40+ vars enumerated explicitly; **no** `AZURE_OPENAI_*`, **no** `ANTHROPIC_*`, **no** `AGENT_*`; no `envFrom` anywhere in the kustomize tree | **No** |
| `.github/workflows/deploy-instance.yml:368` | `--from-literal=AZURE_OPENAI_API_KEY=…` into `<instance>-temporal-worker-secrets` | **No** |
| `docs-md/operations/prod-secrets-rotation.md:32` | GitHub env `prod` + `*-temporal-worker-secrets` | **No** |

Combined with 3a this means: **this branch cannot be deployed as-is.** Any
OpenShift instance or docker-compose stack built from it will crash-loop
`backend-services` on startup. That has not bitten yet only because the branch
is unmerged (`origin/develop` has no `apps/frontend/src/features/agent-chat/`
at all — verified with `git ls-tree`).

### 3c. With a **wrong** provider configured, the user does get told — on this branch

The refusal path is real and tested:

- `agent-errors.ts:38-50` — `AgentProviderNotConfiguredException`, HTTP 503,
  body `{statusCode, code: "provider-not-configured", provider, missingConfig,
  message}`. `missingConfig` carries variable **names** only.
- `agent-errors.ts:92-116` — `describeAgentStreamError` converts a mid-stream
  provider rejection into a sentence, replacing the AI SDK's default literal
  string `"An error occurred."`. It special-cases 401/403 ("the configured
  credential is not valid for this deployment"), 404 ("the deployment or model
  name does not exist on that endpoint") and 429.
- `AgentChatDrawer.tsx:290-294` — `useChatRuntime({ onError })` catches both
  halves (pre-stream non-2xx, where the AI SDK throws with the response body as
  the message, and an error chunk in an already-streaming response) and sets
  `turnError`.
- `AgentChatDrawer.tsx:621-651` — `TurnErrorAlert` renders a red Mantine
  `Alert` at the end of the thread with the headline, the backend's own
  sentence, and the machine cause. `data-testid="agent-chat-error"`.
- Covered by `agent-error.test.ts:15-26` and
  `AgentChatDrawer.test.tsx:342-354`.

**So on `feature/visual-workflow-builder`, a mis-set credential is NOT silent.**

---

## 4. Is the failure silent? — the honest answer

**Yes for Inderdeep, no for the code as it stands.** Three separate reasons, and
they are what makes I1 a real defect rather than a setup note:

**(i) The fix he is waiting for is on a branch he is not testing.** Everything
in §3c landed on 2026-08-08 in two commits — `c83884ce` *"fix(agent-chat): the
agent says why it failed"* and `ad14c24e` *"the model picker offers what the
backend can actually serve"* — both responses to **his own** 2026-08-06 item 22
(*"I ran the prompt. Nothing. Why is it not working?"*). `origin/develop` does
not contain the `agent-chat` feature directory at all. If he tested a deployed
instance or anything not built from this exact branch, he got the **pre-fix**
behaviour: the AI SDK's masked `"An error occurred."` or literally nothing.
That is exactly what *"as was the case earlier"* describes — the same silence,
a second time.

**(ii) There is a genuine silent state still in the code: the empty model
list.** `AgentChatDrawer.tsx:445-454` collapses two very different situations
into one reassuring label:

```tsx
if (isError || options.length === 0) {
  return (
    <StaticModelLabel
      text="Server default model"
      tooltip="The model list could not be loaded — your message will be answered by whichever model this server is configured for."
    />
  );
}
```

`options.length === 0` means the backend told us, successfully, that it has
**no model at all**. The UI answers that with "Server default model" and a
tooltip promising an answer, leaves the composer fully live, and lets the user
type and send into a wall. The comment above it (`:420-424`) even argues the
composer must stay live so "a failed list request costs the user a label, not
the ability to send" — correct for a *failed* request, wrong for an *empty*
list. Nothing anywhere in the drawer ever says **"the assistant is not
configured on this server."**

**(iii) A stale Prisma client turns every send into an unactionable 500.**
Observed live in `logs/backend-services.log` (lines 821-826, 868-871, 930-933),
timestamps 05:48–05:49Z today:

```
POST /api/agent/chat  statusCode 201  durationMs 4
[Nest] ERROR [ExceptionsHandler] TypeError: Cannot read properties of undefined (reading 'create')
    at ChatRepository.createConversation (src/agent/chat.repository.ts:44:48)
    at AgentService.startChat (src/agent/agent.service.ts:105:48)
    at AgentController.chat (src/agent/agent.controller.ts:101:44)
```

`this.prisma.prisma.chatConversation` was `undefined` — the running process held
a generated Prisma client predating the `20260526041213_add_chat_conversation_and_message`
migration. It cleared only when `apps/backend-services/src/generated/` was
regenerated at 22:50 and the server restarted (mtimes + `ps` confirm; no
`POST /api/agent/chat` appears after the restart, so this is unverified-good
rather than proven-fixed). **Every** agent send failed for those minutes, and
what the user saw was the generic fallback: *"The agent could not complete this
request — Internal server error."* True, and useless. A fresh checkout that
runs `npm run db:generate` before pulling the chat migration lands in the same
state. Worth noting the request logger recorded these as **201**, which is why
nobody spotted them: the log line says success, the exception is on the line
below it.

Two other documentation-level silences that produced D4 verbatim:

- **`.env.sample` never mentions the agent.** Lines 85-90 carry
  `AZURE_OPENAI_*` under the heading *"── Temporal worker ──"* with the comment
  *"Azure OpenAI (optional — for LLM enrichment when enableLlmEnrichment is
  true)"*, and placeholder values (`https://your-openai-resource.openai.azure.com`,
  `your-openai-api-key`). No `ANTHROPIC_API_KEY`, no `AGENT_*`. A developer
  copying it has no way to learn these are the chat agent's credentials — and
  because the placeholders are *non-empty strings*, `hasProvider("azure")`
  returns **true**, the picker cheerfully offers "Azure OpenAI — gpt-4o", and
  the turn fails on a DNS lookup instead of refusing cleanly.
- **`docs-md/operations/ENVIRONMENT_CONFIGURATION.md:135-141`** files the same
  four variables under *"Azure OpenAI (LLM Enrichment)"*. The only place they
  are connected to the agent is `PHASE7_HANDOFF.md:106-123` and
  `AI_AGENT_DESIGN.md:509`, neither of which is linked from any setup page.
  `GALLERY.md:98` points step 16 at `MANUAL_TEST_PLAN.md` Part 1.4, whose entire
  entry (`:71`) reads: *"AI agent (Part 15) | ☁️ `ANTHROPIC_API_KEY` and/or
  Azure OpenAI creds"*. That is the whole answer a reviewer is given.

---

## 5. Proposed fix

### 5a. UI — the state that is missing (this is the I1 code change)

**One new explicit state: the assistant is not configured.** Driven off
`GET /api/agent/models` returning an empty `items` array, which today is
indistinguishable from a failed request.

1. `AgentChatDrawer.tsx:445-454` — split the branch. `isError` keeps today's
   "Server default model" label. `options.length === 0` becomes a distinct
   unconfigured state.
2. In the unconfigured state: **disable the composer's send button** and render
   a persistent (not error-red — use a neutral/info `Alert`, consistent with the
   I5 inline-alert decision) notice in the thread body where the welcome message
   sits today:
   > **The assistant isn't configured on this server.**
   > No model provider has credentials here, so the assistant can't answer.
   > Ask whoever runs this environment to set `AZURE_OPENAI_API_KEY` +
   > `AZURE_OPENAI_ENDPOINT`, or `ANTHROPIC_API_KEY`. See *(link to the new
   > setup page from 5c)*.
   Variable names only — matching the discipline already in `agent-errors.ts`.
3. Add `missingConfig` to the `GET /api/agent/models` response so the message
   can name the variables from the backend's own `REQUIRED_CONFIG` table
   (`provider-resolver.ts:12-15`) rather than duplicating it in the frontend.
4. Test in Playwright, not jsdom — a disabled button and an overlay notice are
   exactly the class of thing that passes in vitest while being invisible or
   unclickable in a browser.

### 5b. Backend — stop the boot-time throw, and wire the deployments

5. **`agent.env.ts:114-122` must not throw.** Replace the throw with a
   `defaultProvider: null` state and let `AgentEnv` report "no provider
   configured". `listConfiguredModels` already returns `[]` correctly in that
   case, and `ProviderResolver.resolve` already throws the typed 503. The
   result: an unconfigured environment gets a **working app with a disabled
   assistant**, which is the honest outcome, instead of a backend that will not
   start. This is the single highest-value change on the list — it is currently
   a hard deployment blocker (§3b) as well as a developer-onboarding cliff.
6. Add `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` /
   `AZURE_OPENAI_DEPLOYMENT` / `AZURE_OPENAI_API_VERSION` to the
   **backend-services** container in `docker-compose.yml` (§144-199) and to
   `deployments/openshift/kustomize/base/backend-services/deployment.yml`,
   sourced from `backend-services-config` / `backend-services-secrets`; extend
   `.github/workflows/deploy-instance.yml:368` and
   `scripts/rotate-prod-secrets.sh` to write the key into
   `<instance>-backend-services-secrets` as well as the worker's.
7. Consider logging one line at startup naming which providers are configured
   (names only). Today there is nothing in the log that says whether the agent
   can work — the first evidence is a failed turn.

### 5c. Docs — the one place D4 asks for

8. New `docs-md/workflows/AGENT_SETUP.md` (or a section in `GALLERY.md` "Before
   you start"), linked from `GALLERY.md:98` and `MANUAL_TEST_PLAN.md:71`,
   stating in plain words: which service and subscription, which four variables,
   where to put them (`~/.config/bcgov-di/backend-services.env`, not the repo
   `.env` — it is gitignore-proof and matches `env-loader.ts`), who to ask, and
   what the UI looks like when they are missing.
9. Fix `.env.sample`: move `AZURE_OPENAI_*` out from under "Temporal worker"
   into its own **"Azure OpenAI — shared: LLM enrichment, format suggestion,
   benchmark recommendation, AND the workflow chat agent"** block; add
   `ANTHROPIC_API_KEY=` and the `AGENT_*` knobs as commented lines; and **blank
   the placeholder values** so a copied sample reports "not configured" instead
   of pretending to be configured and 404-ing.
10. Re-file the `AZURE_OPENAI_*` table in
    `ENVIRONMENT_CONFIGURATION.md:135-141` away from "(LLM Enrichment)" to name
    all four consumers.

### 5d. The reply to send both reviewers (D4 + I1)

> The workflow assistant talks to **Azure OpenAI through the BC Gov AI Hub APIM
> proxy** — the same subscription the OCR enrichment step uses, not a separate
> one. It needs four environment variables on **backend-services**:
> `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` (the APIM subscription key),
> `AZURE_OPENAI_DEPLOYMENT` (a `gpt-4o`-class deployment name, used verbatim as
> the model id) and `AZURE_OPENAI_API_VERSION`. Anthropic is supported as an
> alternative via `ANTHROPIC_API_KEY`, but nothing in this repo is configured
> for it, so Azure is the only working path today. Put them in
> `~/.config/bcgov-di/backend-services.env` — the backend loads that file ahead
> of the repo `.env`, so the key never touches the checkout. **You cannot
> self-serve this**: the key is a shared team subscription and Alex hands it out
> directly, so ask him and it takes a minute. Two things that were genuinely our
> bug, not your setup: `.env.sample` files those four variables under "Temporal
> worker / LLM enrichment" and never says the assistant uses them, and when they
> are missing the chat panel shows a model name and a live send button instead
> of saying it isn't configured. Both are being fixed — the panel will state
> plainly that the assistant isn't configured and disable the composer, rather
> than swallowing your message.

---

## 6. Evidence index

| Claim | File:line |
|---|---|
| Env vars read, blank == absent | `apps/backend-services/src/agent/agent.env.ts:19-24,71-98` |
| Boot-time throw with no provider | `apps/backend-services/src/agent/agent.env.ts:114-122`; asserted `agent.env.spec.ts:132-143` |
| `AgentModule` imported unconditionally | `apps/backend-services/src/app.module.ts:86`; `agent/agent.module.ts:44` |
| Required-config table (names only) | `apps/backend-services/src/agent/provider-resolver.ts:12-15` |
| Azure client construction / APIM workarounds | `apps/backend-services/src/agent/provider-resolver.ts:62-92,104-128` |
| Typed 503 refusal body | `apps/backend-services/src/agent/agent-errors.ts:38-50` |
| Mid-stream error text (401/403/404/429) | `apps/backend-services/src/agent/agent-errors.ts:92-116` |
| Resolve + build happen before headers | `apps/backend-services/src/agent/agent.service.ts:67,71` |
| Stream piped with `onError` | `apps/backend-services/src/agent/agent.controller.ts:116-124` |
| Served model list, one entry per configured provider | `apps/backend-services/src/agent/configured-models.ts:36-50`; `agent.controller.ts:64-66` |
| Frontend transport omits provider/model when unpicked | `apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx:255-280` |
| Error → alert wiring | `AgentChatDrawer.tsx:290-294,621-651`; `agent-error.ts:38-66` |
| **Empty model list shown as "Server default model"** | `AgentChatDrawer.tsx:445-454` |
| Error-surfacing fix is branch-only | `git log` `c83884ce`, `ad14c24e` (2026-08-08); `agent-chat/` absent from `origin/develop` |
| Live 500s: stale Prisma client | `logs/backend-services.log:821-826,868-871,930-933`; `agent/chat.repository.ts:44` |
| compose: vars on temporal-worker only | `docker-compose.yml:200,220-223` vs `:144-199` |
| OpenShift: backend-services has no agent vars | `deployments/openshift/kustomize/base/backend-services/deployment.yml` (full env list; no `envFrom` in the tree) |
| Deploy writes key to worker secret only | `.github/workflows/deploy-instance.yml:368` |
| Rotation targets worker secret only | `docs-md/operations/prod-secrets-rotation.md:32` |
| Out-of-band local secrets file | `apps/backend-services/src/env-loader.ts:20-30` |
| `.env.sample` mislabels + non-empty placeholders | `.env.sample:85-90` |
| Docs file the vars under "LLM Enrichment" | `docs-md/operations/ENVIRONMENT_CONFIGURATION.md:135-141` |
| The only APIM host named anywhere | `docs-md/workflows/PHASE7_HANDOFF.md:126` |
| Agent env vars documented (unlinked) | `docs-md/workflows/PHASE7_HANDOFF.md:106-123`; `AI_AGENT_DESIGN.md:509-513` |
| Walkthrough's entire setup answer | `docs-md/workflows/GALLERY.md:98` → `MANUAL_TEST_PLAN.md:71` |
