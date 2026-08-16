# Worklog — I2 / I3 / I1 / D4: the workflow agent chat surface

**Date:** 2026-08-14 · **Branch:** `feature/visual-workflow-builder` ·
**Scope:** `apps/frontend/src/features/agent-chat/**`,
`apps/backend-services/src/agent/**`, `.env.sample`, `docs-md/workflows/`.

Starts from the completed investigation in
[`agent-credentials.md`](agent-credentials.md). Its §5 fix plan was verified
before it was trusted; where the plan and the code disagreed, the code is
recorded below.

**No secret value was read, printed or copied anywhere.** Everything below
names variables and endpoints only. `.env.sample` was edited without ever
reading it — see the note under *Docs*.

---

## I2 — the send button already becomes stop. No change made.

**Conclusion: (a) — no change needed. The reviewer's snapshot predates the
fix, which is on this branch only.**

Four independent checks, all agreeing:

1. **There is exactly one stop affordance in the whole surface, and it is in
   the composer.** `grep` for `stop` / `abort` / `Cancel` across every file in
   `apps/frontend/src/features/agent-chat/` returns one rendering site:
   `SendOrStopButton` at
   [`AgentChatDrawer.tsx:589`](../../../apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx),
   which swaps `IconSend2` for `IconPlayerStopFilled` on
   `useAuiState(s => s.thread.isRunning)`. `data-testid="agent-chat-stop"`
   exists nowhere else in `apps/frontend/src` (the only other stop icon in the
   app is `TrainingPanel.tsx:376`, a different feature).
2. **The header renders no stop control.** `ChatHeader` (`:339`) renders
   exactly three buttons: history, new-conversation, close. There is no
   `agent-chat-abort` test id anywhere in the tree.
3. **Git says when it landed and that it is branch-only.**
   `git log -S "SendOrStopButton"` → one commit, **`5903a414`, 2026-08-08**,
   *"feat(agent-chat): stop lives in the composer, and the chat only appears
   where it works"*. `git ls-tree origin/develop -- apps/frontend/src/features/agent-chat/`
   is **empty** — `develop` has no agent-chat directory at all — and
   `git merge-base --is-ancestor 5903a414 origin/develop` answers **NO**.
   So anything Inderdeep tested that was not built from this exact branch
   showed him the pre-fix header button, which is what *"it seems like the
   stop icon is still at the top"* describes.
4. **The behaviour is asserted, and still passes.**
   `AgentChatDrawer.test.tsx` "item 26" block: send-not-stop when idle,
   stop-not-send while running, no header abort button, and the stop click
   still POSTs `/api/agent/conversations/:id/abort`. 4/4 green.

Verified live in a browser as well (see *Verification* below): with a turn
idle the composer shows the send arrow and no stop control exists anywhere in
the panel.

**Recommendation:** reply to Inderdeep that this shipped on 2026-08-08 and
that he needs a build from `feature/visual-workflow-builder`, not `develop`.
Nothing to fix.

---

## I3 — composer footer rebuilt to the mock-up

**Mock-up:** [`source/inderdeep-mockup-composer.png`](../source/inderdeep-mockup-composer.png).

### What it looked like before

One flex row: paperclip · one-line input · send. The model was on a **third
row below the whole composer**, rendered as a Mantine `Select` (a full form
control with a border and a chevron box), or as a dimmed line of text showing
the long `"Azure OpenAI — gpt-4o"` label. Nothing showed a tier.

### What changed

**`apps/frontend/src/features/agent-chat/AgentChatDrawer.tsx`**

- **`Composer` (`:934`)** — `ComposerPrimitive.Root` is now
  `flexDirection: "column"`: the message on its own line, and one footer strip
  under it. Footer is a `Group justify="space-between"`: attach + picker in a
  left group, send/stop hard right.
- **Attach (`:1211`)** — `IconPaperclip` → **`IconPlus`**, per the mock-up,
  `size="md"`, `color="gray"`, `aria-label="Attach a file"`. Same
  `data-testid="agent-chat-attach"`, same behaviour.
- **Placeholder (`:1192`)** — now *"Describe the workflow you want to create
  or update…"*, the mock-up's own words, with the drop-files hint kept.
  `rows={1}` → `rows={2}`, which is the mock-up's proportion.
- **`ModelPicker` (`:445`)** — rebuilt as an inline `Menu`. Trigger is an
  `UnstyledButton` showing `ModelSummary`: **name bold**, tier muted beside
  it, `IconChevronDown size={13}`. The long label survives as the trigger's
  `aria-label`, so nothing is lost to screen readers. The dropdown lists each
  model as a `Menu.Item` with the name on the first line, the descriptor
  under it, and `IconCheck` on the selected one.
- **`ModelSummary` (`:543`)** — the shared name+tier pair, used by both the
  menu trigger and the single-model static form.

### Where the names and tiers come from — nothing is hardcoded

The mock-up's "Sonnet 4.5 / Haiku 4.5 / Opus 4.6" are **not** in the code. The
picker renders whatever `GET /api/agent/models` returns, which on this machine
is one entry: `gpt-5.4`, tier `Balanced`. Two new backend fields carry it:

- **`apps/backend-services/src/agent/model-descriptors.ts`** (new) —
  `describeModel(provider, model) → { name, tier }`.
  - `name`: Anthropic ids are parsed to their published short form
    (`claude-haiku-4-5-20251001` → `Haiku 4.5`); an Azure **deployment name is
    shown verbatim**, because renaming somebody's deployment in the UI would
    hide the one string they have to match against their portal.
  - `tier`: read off the model **family**, using each vendor's own published
    positioning — Anthropic's haiku/sonnet/opus, OpenAI's mini-and-nano vs
    flagship vs o-series. **An id that names no recognised family gets
    `tier: null`** and the picker shows the name alone. A deployment called
    `bcgov-shared-gpt` has no published positioning and does not get an
    invented one. This is asserted directly in `model-descriptors.spec.ts`.
- **`configured-models.ts:14`** — `ConfiguredAgentModel` gains `name` and
  `tier`; `agent-models.dto.ts` gains `@ApiProperty`-documented `name` and a
  nullable `tier`.

---

## I1 / D4 — "the assistant isn't configured" is now a state of its own

### What was actually wrong (confirmed against the code)

`AgentChatDrawer.tsx:442`, before this pass:

```tsx
if (isError || options.length === 0) {
  return <StaticModelLabel text="Server default model" tooltip="The model list could not be loaded — …" />;
}
```

`isError` and `options.length === 0` are **opposite facts**. A failed request
means we do not know what the server has, so staying live and letting the
backend pick is correct. An empty list means the server told us, successfully,
that it has **nothing** — and the branch answered that with a reassuring label,
a tooltip promising an answer, and a fully live composer.

### Backend

**`agent.env.ts`**
- `defaultProvider` is now `AgentProvider | null` (`:52`). The constructor
  **no longer throws** (`resolveDefaultProvider`, `:137`, returns `null`).
  This was the boot blocker: `AgentEnv` is a plain provider inside
  `AgentModule`, which `AppModule` imports unconditionally, so the throw was a
  **DI failure at startup** — a developer with no key got an app that would not
  boot, and the error named the agent module, so it read as the agent having
  broken the build.
- New `get isConfigured()` (`:133`).

**`required-config.ts`** (new) — `REQUIRED_CONFIG` moved out of
`provider-resolver.ts` so the HTTP surface can name missing variables without
importing the module that pulls in both provider SDKs. Exports
`providerRequirements()`. **Names only**, stated
in the file's own doc comment.

**`agent-errors.ts`** — new `AgentAssistantNotConfiguredException` (`:64`),
HTTP 503, code **`assistant-not-configured`** — deliberately distinct from
`provider-not-configured`, because the client cannot fix it by picking a
different model. Message groups the alternatives correctly: *"Set
ANTHROPIC_API_KEY, or AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT"* — "and"
within a provider, "or" between them.

**`provider-resolver.ts:26,34`** — `resolveDefault()` and `resolve()` throw the
new exception when `defaultProvider` is `null`; a caller naming one specific
missing provider still gets the old, more specific `provider-not-configured`.

**`configured-models.ts:77`** — new `listMissingProviderConfig(env)`.

**`agent.controller.ts:67`** — `GET /api/agent/models` now returns
`{ items, missingConfig }`. New `AgentProviderRequirementDto`; the
`AgentModelsResponseDto` doc comment that claimed *"Empty is not possible in a
running backend"* is gone, because it is now not only possible but the honest
report of an unconfigured server. Full `@ApiProperty` coverage on both new
DTOs and on `name` / `tier`.

Live response on this machine, through the real endpoint:

```json
{"items":[{"provider":"azure","model":"gpt-5.4","label":"Azure OpenAI — gpt-5.4",
"name":"gpt-5.4","tier":"Balanced","isDefault":true}],
"missingConfig":[{"provider":"anthropic","variables":["ANTHROPIC_API_KEY"]}]}
```

### Frontend

**`useAgentModels.ts`** — the query now returns the whole body. New
`resolveAgentAvailability()` producing **four** distinct states —
`loading` · `unknown` (request failed) · `unconfigured` (server has nothing) ·
`ready` — plus `describeMissingConfig()`, which joins a provider's variables
with "and" and the alternatives with "or".

> A `useAgentAvailability()` hook was written first and **removed**: calling
> `useAgentModels` from inside the same module bypasses `vi.mock` in the drawer
> tests, so the component read the real query and eleven tests failed for a
> reason that had nothing to do with the feature. The drawer now calls
> `resolveAgentAvailability(useAgentModels())` directly (`:964`).

**`AgentChatDrawer.tsx`**
- `UnconfiguredNotice` (`:1243`) — a neutral (not red) Mantine `Alert` above
  the composer, persistent rather than tucked into the empty-thread state, so
  it survives a replayed conversation. Names the missing variables from
  `missingConfig` and points at `docs-md/workflows/AGENT_SETUP.md`.
- `ModelPicker` gains a fourth branch reading **"No model configured"**.
- `SendOrStopButton` (`:589`) takes `disabledReason: string | null`. When set
  and no turn is running it renders a **disabled** send wrapped in a
  `tabIndex={0}` span that carries the Tooltip. **The wrapper is the point:** a
  disabled Mantine `ActionIcon` fires no pointer or focus events, so a tooltip
  on the button itself is unreachable by mouse *and* by keyboard — and jsdom
  cannot see the difference. Verified in a real browser on both hover and
  focus (below).
- Stop is still reachable while a turn is running even in the unconfigured
  state, so a stream started before the config was lost can still be ended.

**`agent-error.ts:32`** — `assistant-not-configured` mapped to the headline
*"The assistant isn't configured on this server"*, for the case where a turn
is posted anyway (a script, a stale tab).

---

## Verification

### Automated

```
apps/backend-services $ npx jest src/agent
  Test Suites: 15 passed, 15 total
  Tests:       164 passed, 164 total
apps/backend-services $ npx tsc --noEmit          → clean

apps/frontend $ npx vitest run src/features/agent-chat
  Test Files  5 passed (5)
  Tests       65 passed (65)
apps/frontend $ npx tsc --noEmit                  → clean for agent-chat
  (one unrelated error in workflow-builder/canvas/WorkflowEditorCanvas.tsx —
   another agent's file, mid-edit)
biome check                                       → clean after --write
```

**Backend tests changed or added**

- `agent.env.spec.ts` — *"throws when every provider's credential is blank"*
  became *"constructs, with no default provider"*. That test was the assertion
  of the old, wrong contract.
- `provider-resolver.spec.ts` — new block *"nothing configured at all"*: the
  DI graph **compiles** instead of failing (this is the boot fix, asserted),
  `resolve({})` and `resolveDefault()` throw the typed 503 with all three
  variable names, and asking for one specific missing provider still gets the
  specific error.
- `configured-models.spec.ts` — new `name` / `tier` on every expectation, a
  case proving a privately-named deployment gets `tier: null`, and a new block
  for `listMissingProviderConfig`.
- `agent.controller.spec.ts` — `listModels` returns `missingConfig`; a new
  case with `envValues = {}` asserting an empty `items`, the full
  `missingConfig`, and that **constructing the controller does not throw**.
- `model-descriptors.spec.ts` (new) — 12 cases, including that `gpt-4o-mini`
  reads as Fast rather than Balanced and that unrecognised names get no tier.

**Frontend tests changed or added**

- `useAgentModels.test.ts` — new blocks for `resolveAgentAvailability`
  (including an explicit *"keeps the two empty-ish cases apart"*) and
  `describeMissingConfig`.
- `AgentChatDrawer.test.tsx` — new `I3` block (footer order by
  `compareDocumentPosition`, short name + tier not the long label, the menu's
  descriptors and check mark, switching models, and a null-tier model showing
  no tier) and a new `I1` block (notice text, the variable names, `toBeDisabled`
  on send, the focusable tooltip wrapper, stop still reachable). The
  *"stays sendable when the model list fails to load"* case now also asserts
  the unconfigured notice is **absent**, which is the regression that matters.

> Mantine's `Menu` does not open within one tick under `fireEvent.click` in
> this jsdom setup — the dropdown mounts through a transition. Confirmed with a
> throwaway probe, then fixed with `findByTestId` rather than by changing the
> component's transition.

### In a real browser (Playwright + `app-browser-auth`, `/workflows`)

jsdom cannot see a disabled button's tooltip or a portalled dropdown's
position, so all three states were driven in Chromium with the models endpoint
intercepted. Screenshots in the session scratchpad.

| Check | Result |
|---|---|
| Footer order, measured from real bounding boxes | attach x=968 → picker x=1000 → send x=1458, all on one row |
| Real backend (one Azure model) | picker reads **"gpt-5.4 Balanced"**; no chevron (single model) |
| Two models — menu | opens; reads `gpt-5.4 / Balanced` and `Haiku 4.5 / Fast`; **check mark on the selected one** |
| Two models — switching | clicking `Haiku 4.5` changes the trigger to "Haiku 4.5 Fast" |
| Unconfigured — notice | *"The assistant isn't configured on this server"*, naming `ANTHROPIC_API_KEY`, `AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT`, and the setup doc |
| Unconfigured — picker | **"No model configured"** |
| Unconfigured — send | `isDisabled() === true` |
| Unconfigured — reason on **hover** | full sentence shown |
| Unconfigured — reason on **keyboard focus** | full sentence shown |
| `pageerror` events | none, in all three runs |

---

## Docs

**`.env.sample`** — the four `AZURE_OPENAI_*` values blanked
(`git diff --numstat` → 4 changed / 4 added; the added lines are
`AZURE_OPENAI_ENDPOINT=`, `AZURE_OPENAI_API_KEY=`, `AZURE_OPENAI_DEPLOYMENT=`,
`AZURE_OPENAI_API_VERSION=`). Non-empty placeholders made `hasProvider("azure")`
return **true** on a copied sample, so the picker offered a model and the turn
then died on a DNS lookup of a hostname that does not exist.

> **Process note.** `.claude/settings.json` denies `Read(**/.env.*)`, which
> catches `.env.sample`. The file was therefore edited with a targeted
> `sed -i -E` on the four `^AZURE_OPENAI_...=` lines and verified through
> `git diff` filtered to added lines only — never read into the transcript.
> The remaining `.env.sample` improvements the investigation proposed
> (re-heading the block away from *"Temporal worker"*, adding commented
> `ANTHROPIC_API_KEY` / `AGENT_*` lines) are **not done**, because they need
> the surrounding text and that text cannot be read under the current
> permissions. Worth a follow-up once the deny rule is narrowed to `.env` and
> `.env.local`.

**`docs-md/workflows/AGENT_SETUP.md`** (new) — which service (Azure OpenAI via
the BC Gov AI Hub APIM proxy, the same subscription as OCR enrichment), which
variables gate it and where to put them
(`~/.config/bcgov-di/backend-services.env`, ahead of the repo `.env`), what a
developer sees when it is unconfigured — including a table separating that from
the two states it is easy to confuse it with — and how to request access (no
self-serve; ask Alex). Names only, stated at the top of the page.

**`docs-md/workflows/MANUAL_TEST_PLAN.md:71`** — the setup row was the whole
answer a reviewer was ever given. It now names the backend-services
requirement, links `AGENT_SETUP.md`, and says the app still runs without it so
only Part 15 has to be skipped.

**`docs-md/README.md:12`** — `AGENT_SETUP.md` added to the workflows row.

### The line I want added to `docs-md/workflows/GALLERY.md` — I did not edit it

Another agent owns that file. At **stop 16**, where the reader is told to open
the assistant, please add:

> The assistant needs a model credential that is **not** in a fresh checkout.
> If it is not configured you will see *"The assistant isn't configured on this
> server"* in the chat panel and send will be disabled — that is expected, not
> a bug. See [AGENT_SETUP.md](AGENT_SETUP.md) for which service it uses and how
> to get access.

---

## Out of scope — deliberately untouched

The investigation's §5b item 6 (wiring `AZURE_OPENAI_*` into the
**backend-services** container) is **not done here**, per the task's explicit
exclusion: no deployment manifests, no `docker-compose.yml`, no OpenShift
kustomize tree, no `deploy-instance.yml`, no secrets-rotation runbook. That
work is awaiting a separate decision.

**It still matters, and the boot fix changes its severity rather than removing
it.** Before this pass, an OpenShift instance or compose stack built from this
branch would **crash-loop backend-services** on startup, because the vars go
only to the temporal worker. That specific failure is now gone — the app boots
and the assistant is disabled. What remains is that **the deployed assistant
will not work anywhere** until those four variables reach the
backend-services container and its Secret. Deployed users will see the new
"isn't configured" notice, which is at least honest, but it is not the intended
end state.

---

## Recommendations

1. **Reply to Inderdeep on I2**: already shipped 2026-08-08 (`5903a414`); he
   needs a build from this branch. `develop` has no agent-chat code at all.
2. **Decide the deployment wiring** (out of scope above). Until then every
   deployed instance shows the assistant as unconfigured.
3. **Narrow the `.env` deny rule** to `.env` / `.env.local` so `.env.sample` —
   a committed template with no secrets in it — can be maintained normally.
4. **The stale-Prisma-client 500s** the investigation found in
   `logs/backend-services.log` were not reproduced in this session; the client
   was regenerated before it started. Nothing here addresses the request logger
   recording those failures as **201**, which is why nobody noticed them. That
   is a separate, real defect worth its own item.
