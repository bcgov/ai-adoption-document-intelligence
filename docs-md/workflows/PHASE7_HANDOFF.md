# Phase 7 — AI Workflow Builder Agent — Handoff

**Branch:** `feature/visual-workflow-builder`
**Completed:** 2026-05-25 / 26 overnight session
**Design:** [AI_AGENT_DESIGN.md](AI_AGENT_DESIGN.md)
**Requirements:** [feature-docs/20260606-workflow-builder-phase7-ai-agent/REQUIREMENTS.md](../../feature-docs/20260606-workflow-builder-phase7-ai-agent/REQUIREMENTS.md)
**User stories:** [feature-docs/20260606-workflow-builder-phase7-ai-agent/user_stories/](../../feature-docs/20260606-workflow-builder-phase7-ai-agent/user_stories/) — 38 stories US-187 → US-224 across milestones A → G.
**Walkthrough:** [feature-docs/20260606-workflow-builder-phase7-ai-agent/walkthrough.mjs](../../feature-docs/20260606-workflow-builder-phase7-ai-agent/walkthrough.mjs) — 8 scenarios, **8/8 PASS**, **0 pageerrors**, screenshots in `/tmp/wb-phase7-verify/`.

---

## What works right now

1. **Open the chat drawer** from the bubble icon in the global app header (top right of every authenticated route).
2. **Pick a model** from the dropdown: Claude Haiku 4.5 (default, cheapest), Sonnet 4.6, Opus 4.7 1M, Azure GPT-4.1.
3. **Type a prompt** + Enter. Agent calls tools through the in-process MCP server.
4. **Drop a PDF** on the composer (or click the paperclip). File uploads to the workflow's `source.upload` node via the existing Phase 8 endpoint.
5. **The canvas live-updates** as the agent calls `addNode`, `connectNodes`, etc. via TanStack invalidation.
6. **Conversation switcher** — open the collapsible panel below the drawer header to switch between past conversations on the current workflow (or globally when no workflow is open).
7. **Abort** the in-flight stream with the red stop icon in the drawer header.
8. **Resume** by closing the drawer + reopening — full history reloads + the agent has context across reopens (DB-backed history hydration, not the SDK's session store).

## Demo prompts to show coworkers

Copy these directly into the chat:

### 1. Discovery
```
List the activity catalog and show me the 5 most-used categories.
```

### 2. Greenfield workflow build
```
Create a new workflow named "Invoice intake demo". Add a file.prepare node (id fp), an azureOcr.submit node (id ocr), and an azureOcr.poll node (id poll). Connect upload1 -> fp -> ocr -> poll. Set up the right ctx bindings.
```

### 3. Run + observe
```
Try running this workflow with the file I just uploaded. Poll until done and show me the per-node outputs.
```
*Note: requires a PDF/image upload in the composer first — drop a sample into the workflow's source.upload node.*

### 4. Dynamic-node escape hatch
```
The catalog doesn't have an activity that strips trailing whitespace from OCR text. Write a dynamic node that does that and add it to the current workflow between ocr.cleanup and ocr.normalizeFields.
```
*The agent will draft TypeScript, publish via `POST /api/dynamic-nodes`, and read structured `ParseError[]` if it fails so it can revise at the exact line/column.*

### 5. Library workflow reuse
```
What library workflows are available in this group? Pick one and add it as a childWorkflow node in my current workflow.
```

### 6. Diagnostic
```
The classify node keeps producing low-confidence results. Tell me what input I should give it and what its output looks like for my last run.
```

### 7. Workflow edits + canvas reactivity
```
Add a humanGate node after document.classify so a reviewer can approve before the workflow continues. Make the gate optional with a 30-minute timeout.
```

### 8. Source switching (future-proofing)
```
Add a source.api node so this workflow can be triggered via webhook with documentUrl + invoiceId fields.
```

## Architecture summary

**Backend** — `apps/backend-services/src/agent/`
- `agent.env.ts` — env var resolver (ANTHROPIC_API_KEY, AZURE_OPENAI_*, AGENT_MAX_STEPS, etc.)
- `provider-resolver.ts` — Anthropic + Azure OpenAI factories using Vercel AI SDK
- `chat.repository.ts` — Prisma ChatConversation + ChatMessage CRUD
- `abort-flag-map.ts` — in-memory AbortController registry keyed by conversationId
- `tools.ts` — 19 typed tools mapped to existing Phase 1–8 services (catalog, workflow CRUD, dynamic-node CRUD, run + status + preview-cache)
- `agent.service.ts` — `streamText` orchestration with auto-mode (`stopWhen: stepCountIs`), session resume via history hydration, side title-gen call
- `agent.controller.ts` — `POST /api/agent/chat` (SSE) + `GET/DELETE /api/agent/conversations*` + `POST /api/agent/conversations/:id/abort`
- `system-prompt.ts` — canonical workflow-builder system prompt
- 19 unit tests covering chat repo, abort flag map, and provider resolver

**Frontend** — `apps/frontend/src/features/agent-chat/`
- `AgentChatDrawer.tsx` — Mantine Drawer + assistant-ui's `Thread` + custom Composer with file-drop + tool-call cards
- `AgentChatIcon.tsx` — global header bubble icon, toggleable
- `ConversationSwitcher.tsx` — collapsible panel + per-conversation list + delete
- `error-renderers.tsx` — structured `ParseError[]` + binding-walk error UI
- `useAgentConversations.ts` — TanStack hooks for the conversation list + detail
- `store.ts` — Zustand store (drawer open/close, conversationId, selected model)
- `agent-chat.css` — composer input styling

**Prisma** — `apps/shared/prisma/schema.prisma`
- `ChatConversation` — `id, workflowId, groupId, createdBy, provider, model, title, createdAt, lastMessageAt`
- `ChatMessage` — `id, conversationId, role, content (Json), inputTokens, outputTokens, createdAt`
- Migration: `20260526041213_add_chat_conversation_and_message`

## Test counts after Phase 7 close

| Suite | Before Phase 7 | After Phase 7 | Delta |
|-------|----------------|---------------|-------|
| `apps/backend-services` agent module | 0 | **19** | +19 |
| All-suite type-check (backend + frontend) | clean | **clean** | — |

## Environment variables used

Required for Anthropic provider:
- `ANTHROPIC_API_KEY` — Anthropic API key

Optional / Azure provider:
- `AZURE_OPENAI_ENDPOINT` — base URL of the Azure OpenAI resource or APIM proxy
- `AZURE_OPENAI_API_KEY` — subscription key
- `AZURE_OPENAI_DEPLOYMENT` — deployment id (e.g. `gpt-4.1`)
- `AZURE_OPENAI_API_VERSION` — defaults to `2024-10-21`

Optional tuning:
- `AGENT_DEFAULT_PROVIDER` — `anthropic` (default) or `azure`
- `AGENT_ANTHROPIC_MODEL` — defaults to `claude-haiku-4-5-20251001`
- `AGENT_MAX_STEPS` — defaults to `30`
- `AGENT_MAX_OUTPUT_TOKENS` — defaults to `4096`

## Known issues / follow-ups

1. **Azure GPT-4o tool-use WORKING** as of `apim-idmrncl4iiyvo.azure-api.net` endpoint. The previous APIM at `test.aihub.gov.bc.ca/sdpr-invoice-automation` was stripping `tool_calls` from assistant messages in transit, blocking the agent loop. Switching to the new APIM subscription resolved it — full agent loop verified end-to-end (catalog read, tool-call streaming, final summarization). The null-content `fetch` middleware in `provider-resolver.ts` rewrites `content: null` → `""` on outgoing requests so any APIM that's strict about the standard OpenAI shape (where assistant messages with tool_calls can carry null content) accepts the body. Switching between Anthropic Haiku/Sonnet/Opus and Azure GPT-4o is now one dropdown click in the chat header.
2. **Azure-walkthrough not yet automated.** Walkthrough script tests Anthropic only since Azure deployment is currently 400-ing on tool-use. Switch the model in the dropdown to verify by hand once the APIM is fixed.
3. **assistant-ui v0.14** — using the headless primitives but not assistant-ui's auto-streaming markdown renderer (we have plain `pre-wrap` text). For richer UX, swap in `MessagePartPrimitive.Text` with markdown rendering later.
4. **Concurrent-edit safety** is "last write wins" per the design lock L51 — the agent's tool calls do full read-modify-write on the workflow `config`, so if a human is also editing the canvas the agent's write may clobber edits. Not load-bearing for the demo but worth being aware of.
5. **Per-user-private conversations** enforced at the repository level (every `findById` filters by `createdBy`). Cross-user access returns 404.

## Verification screenshots

Walkthrough captured screenshots in `/tmp/wb-phase7-verify/`:
- `01-home.png` — landing page with chat icon visible in header
- `02-drawer-open.png` — drawer mounted with empty Thread + model picker + composer
- `03-after-build.png` — agent's createWorkflow + addNode tool-call cards rendered, URL navigated to `/workflows/create-v2?id=<new>`
- `04-after-file-drop.png` — PDF uploaded to `source.upload`, attachment badge visible
- `05-switcher-open.png` — conversation switcher panel expanded with prior conversations
- `06-after-list.png` — listActivityCatalog tool-call response showing 41 activities
- `07-model-picker.png` — model dropdown showing Haiku / Sonnet / Opus / Azure options
- `08-reopened-history.png` — drawer closed + reopened, conversation list restored

Summary written to `/tmp/wb-phase7-verify/summary.json`.

## Files changed this session

Backend:
- `apps/shared/prisma/schema.prisma` — added ChatConversation, ChatMessage models
- `apps/shared/prisma/migrations/20260526041213_add_chat_conversation_and_message/` — new
- `apps/backend-services/package.json` — added `ai`, `@ai-sdk/anthropic`, `@ai-sdk/azure`
- `apps/backend-services/src/agent/*` — entire new module (10 source files + 3 spec files)
- `apps/backend-services/src/app.module.ts` — imports AgentModule

Frontend:
- `apps/frontend/package.json` — added `@assistant-ui/react`, `@assistant-ui/react-ai-sdk`
- `apps/frontend/src/features/agent-chat/*` — entire new feature (8 source files + 1 css)
- `apps/frontend/src/layouts/RootLayout.tsx` — mounts AgentChatDrawer + AgentChatIcon

Docs:
- `docs-md/workflow-builder/AI_AGENT_DESIGN.md` — committed earlier this session
- `docs-md/workflow-builder/PHASE7_HANDOFF.md` — this file
- `feature-docs/20260606-workflow-builder-phase7-ai-agent/REQUIREMENTS.md` — committed earlier
- `feature-docs/20260606-workflow-builder-phase7-ai-agent/user_stories/US-187 → US-224 + README.md` — committed earlier; all scenarios checked off this session
- `feature-docs/20260606-workflow-builder-phase7-ai-agent/walkthrough.mjs` — Playwright script + 8 scenarios
- `.claude/agents/workflow-builder.md` — pointer file
