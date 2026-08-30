# 23 — The agent must work with the LLMs BC Gov actually has

**The question:** which language model should the workflow agent chat call by
default, so that somebody other than Alex — the reviewer, or any teammate — can use
it, given that today it defaults to Azure GPT-5.4 on Alex's personal account?

**The recommendation:** make the model list come from backend configuration
instead of a hardcoded frontend array (about a day of work, and the only code
needed), and separately ask **Shabari Kunnumel** — the AI Services Hub's product
owner of record — which model deployments this project may call and how we get a
key; do not wait on the second to do the first.

**Known:** the backend already speaks to Azure OpenAI through an APIM proxy
correctly, so pointing it at a BC Gov endpoint is a three-environment-variable
change, and the store is clear that GPT is effectively the only model family lit
up in BC Gov's AI Services Hub, with Claude blocked on Canadian data residency.
**Not known:** the store does not record *which* GPT deployment names, versions
or quota our project can call through the Hub's gateway as of 2026-08-08, nor
whether this project has a gateway subscription at all — that is the one fact
that has to come from a person.

*Terms used below.* **Provider** = the vendor SDK the backend talks to (`azure`
or `anthropic`). **Deployment** = in Azure, a named instance of a model created
in your own subscription; you call the *deployment name*, not the model name, so
`gpt-4o` in our config is a name somebody chose, not a global identifier.
**APIM** = Azure API Management, the gateway BC Gov puts in front of its shared
AI services so every team's call is metered, policy-checked and routed. **PTU**
= provisioned throughput unit, pre-purchased capacity rather than pay-as-you-go.

---

## What the code supports today

**The picker is six hardcoded strings in the frontend.**
[`apps/frontend/src/features/agent-chat/store.ts`](../../../apps/frontend/src/features/agent-chat/store.ts)
defines `AGENT_MODEL_OPTIONS` (L11–41): three `azure` entries — `gpt-5.4`
(labelled "recommended — strongest for tool use + dynamic nodes"), `gpt-5.2`,
`gpt-4o` — and three `anthropic` entries — `claude-haiku-4-5-20251001`,
`claude-sonnet-4-6`, `claude-opus-4-7`. **The default is set at L63**:
`selectedModel: AGENT_MODEL_OPTIONS[0]`, i.e. Azure GPT-5.4, purely because it
is first in the array. **The frontend sends its choice on every request**, so
the picker overrides any backend default:
[`AgentChatDrawer.tsx`](../../../apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx)
L233–234 puts `provider` and `model` in the POST body to `/api/agent/chat`.

**The backend supports exactly two providers, both configured by environment
variable.**
[`apps/backend-services/src/agent/agent.env.ts`](../../../apps/backend-services/src/agent/agent.env.ts)
reads (names only, no values): `AGENT_DEFAULT_PROVIDER`, `ANTHROPIC_API_KEY`,
`AGENT_ANTHROPIC_MODEL`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`,
`AZURE_OPENAI_DEPLOYMENT` (default `gpt-4o`), `AZURE_OPENAI_API_VERSION`.

**What happens when a provider is unconfigured** — three behaviours: *neither*
configured → `AgentEnv` throws at module init (L101–104) and the backend will
not start; one configured and the other requested → `ProviderResolver.resolve`
throws `` Provider 'azure' is not configured on this backend. ``
([`provider-resolver.ts`](../../../apps/backend-services/src/agent/provider-resolver.ts)
L28–32) — the message exists and is correct, item 22 is that it never reaches
the screen; and `AGENT_DEFAULT_PROVIDER` naming an unconfigured provider
silently falls back to whichever one does have credentials (L97–100).

**Is adding a second provider a config change or code?** For a BC Gov Azure
OpenAI deployment behind APIM: **config only, and the APIM-specific work is
already done.** `provider-resolver.ts` L51–73 normalises the base URL to end in
`/openai`, sets `useDeploymentBasedUrls: true`, deliberately uses the legacy
`chat/completions` endpoint "because APIM proxies often only forward the
former", and wraps `fetch` to coerce `content: null` to `""` because "APIM
proxies in front of Azure OpenAI sometimes reject `content: null`". Somebody has
already made this work against a gateway. **The code-shaped part is the frontend
list**: a BC Gov deployment name that is not one of those six strings cannot be
selected in the UI, even though the backend would accept it. A genuinely
different provider family (a non-Azure OpenAI-compatible gateway, or a
self-hosted vLLM endpoint) would need code in `provider-resolver.ts`.

**The test plan matches the code.**
[`docs-md/workflows/MANUAL_TEST_PLAN.md`](../../../docs-md/workflows/MANUAL_TEST_PLAN.md)
Part 15 (L690–706) lists the same env vars with the same defaults, and step
15.2 explicitly asserts the picker "defaults to **Azure GPT-5.4**". So the test
plan will need editing when the default changes.

## What the store says

**GPT is effectively the only model family available.** Work-store item *"Get
non-GPT models (Claude on Foundry) onboarded to the AI Services Hub"* (stream:
Azure AI Landing Zone & AI Services Hub, open, updated 2026-08-08) states it
directly. Sources: `!Justin/Azure AI Application Zone Deck/2026-06-25 ai landing
zone weekly.txt` — Shabari's estimate is ~2 weeks once a model is ready in
Foundry plus ~4 weeks to onboard it, with no proper testing channel; and
`.../2026-07-02 ai landing zone weekly.txt` — Venkat confirms Claude Opus and
Sonnet run natively on Azure only in East US 2 and European regions, not Canada
East, and BC Gov network policy restricts non-Canadian regions globally.
`!Justin/2026-07-06 Planning/2026-07-06 Quarterly Planning - Discussion Doc.md`
adds that Claude is politically charged and BC's position is to use it only when
served under Azure/MS product terms, pending legal review.

**The one concrete GPT deployment the corpus names is not ours.**
`.../2026-04-02 weekly ai services hub.txt` records a reserved PTU-based
**GPT-5.1** deployment at about $7,000/month, stood up for the WLRS water
assistant, with Leon explaining how those units get split across tenants via
APIM subscriptions and backends.

**Who owns the answer.** Work-store decision, 2026-08-06: **Shabari Kunnumel
(WLRS:EX) is the product owner of record of the AI Services Hub**, evidenced by
Om Mishra's email in `!Justin/Azure AI Application Zone Deck/!running azure app
landing zone.txt` (~L249, Nov 2025) — "you are tagged as the PO in the
registry"; the same email names **Alex Struk and Om Mishra as the TLs**.

**What the store does not answer.** No document records the GPT deployment
names, model versions, API version or quota callable through the Hub's APIM as
of 2026-08-08, nor whether this project holds an APIM subscription at all. The
93 materials in that stream are notes about *building* the hub, not a catalogue
of it.

## Recommendation

### Alex's to find out

One email or Teams message to **Shabari Kunnumel** (PO of record), copying **Om
Mishra** (co-TL with you in the registry), asking a single concrete question:

> *Which Azure OpenAI model deployments can the document-intelligence project
> call through the AI Services Hub's APIM gateway today? I need the deployment
> names, the API version, and how we obtain a subscription key. Is any of it
> pay-as-you-go, or is the only capacity the WLRS PTU pool?*

A second, smaller one, for planning rather than unblocking: confirm that the
Claude route is parked until Jeremy's group rules on the residency and
third-party-terms questions, so we stop offering it as a real option.

Also worth your ruling: the three Anthropic entries in the picker run on a key
that is not BC Gov's to grant. They should be labelled as local-development
only, or dropped.

### Engineering can do now, without the answer

1. **Serve the model list from the backend.** Add a read-only endpoint returning
   the (provider, model, label) triples the backend is *actually* configured
   for — derived from the existing env vars plus one new list variable for the
   Azure deployment names — and have the drawer render that instead of
   `AGENT_MODEL_OPTIONS`. After this, re-pointing the agent at a different
   deployment is an environment change with no rebuild, which is the durable
   form of what item 23 asks for and does not depend on knowing the answer.
2. **Stop hardcoding the default.** Select the first entry the backend reports,
   not `AGENT_MODEL_OPTIONS[0]`.
3. **Interim unblock, today, zero code:** set `AZURE_OPENAI_ENDPOINT`,
   `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_DEPLOYMENT` on the shared backend to
   any deployment a second person can call — the same lever the permanent fix
   pulls, so it is not throwaway work.
4. **Update `MANUAL_TEST_PLAN.md` Part 15** — the env table and step 15.2's
   "defaults to Azure GPT-5.4" both go stale the moment this lands.

### How this relates to item 22

Not duplicates, and the order matters. **Item 22 makes the failure visible** —
the error string already exists in `provider-resolver.ts`; item 22 is the work
of getting it onto the screen. **Item 23 makes the failure stop happening for a
second person.** Do 22 first: if 23 ships first and the BC Gov deployment name
turns out to be wrong, we are back to the reviewer's exact experience — "I ran the
prompt. Nothing." — with no way to tell why. Item 22 is also what confirms 23
worked, because a misconfigured deployment will then say so out loud.
