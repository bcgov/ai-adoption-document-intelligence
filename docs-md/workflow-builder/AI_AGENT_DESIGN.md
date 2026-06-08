# AI Workflow Builder — Design

**Status:** Decided. Phase 7 of the post-1A plan. Analog of [DYNAMIC_NODES_DESIGN.md](DYNAMIC_NODES_DESIGN.md) (Phase 6), [DOCUMENT_SOURCES_DESIGN.md](DOCUMENT_SOURCES_DESIGN.md) (Phase 8), and [TRY_IN_PLACE_DESIGN.md](TRY_IN_PLACE_DESIGN.md) (Phase 4).
**Last updated:** 2026-05-25.
**Why now:** Phases 2 (library workflows), 3 (typed I/O), 4 (try-in-place + cache + previews), 6 (dynamic nodes), and 8 (sources) are all closed. The substrate the agent needs to compose, run, observe, and revise workflows is fully shipped. Phase 7 layers the orchestration that drives those primitives from natural language.

This document commits to concrete decisions for the agent orchestrator, the in-process tool registry, the chat UI, the file-drop flow (which reuses Phase 8's `source.upload`), the iteration loop including dynamic-node escape hatch (Phase 6), persistence, the auto-mode safety controls, and the failure-feedback paths the agent reads to revise its own work.

**Engine semantics are unchanged** from [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) (Model A — single in / single out + blackboard ctx). **No new workflow capabilities** are introduced by Phase 7 — only the agent layer that drives the existing Phase 1–8 surfaces.

---

## 0. Phase 7.0 scope (locked)

- **Phase 7.0 (this milestone):**
  - **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) as the orchestrator — Anthropic-only in 7.0. The agentic loop is built into the SDK; we register tools and a system prompt and the SDK runs the loop.
  - Default model `claude-opus-4-7[1m]` (1M context). Env-configurable via `AGENT_MODEL`.
  - **In-process MCP server** via `createSdkMcpServer` exposes the tool registry. No separate process; tools resolve through a small NestJS service registry singleton.
  - **assistant-ui** (`@assistant-ui/react`) for the chat surface, wired with a custom runtime adapter that decodes the SDK's event stream.
  - **Auto mode** — `permissionMode: 'bypassPermissions'`. No Accept/Reject cards on write tools. Tool-call cards still render live so the user sees everything that fires.
  - **Right-rail drawer** mounted from a global app-header icon — available on every route, agent navigates the user to `/workflows/create-v2?id=<id>` when it creates a workflow.
  - **In-situ file drop on the composer** — file goes into the workflow's `source.upload` node via the existing Phase 8 `POST /api/sources/:sourceNodeId/upload` endpoint. **No new test-fixture persistence.** The workflow itself is the test environment.
  - **`ChatConversation` + `ChatMessage`** Prisma models keyed by `workflowId` (nullable for pre-creation chat). Stores Claude SDK session ID for `resume:` continuation across drawer reopens.
  - **Streaming via SSE** through a NestJS `@Sse` endpoint at `POST /api/agent/chat`.
  - **Tool registry** maps 1:1 to existing Phase 1–8 service calls — read tools (catalog, library, workflows, run-spec, statuses, preview-cache, history) and write tools (workflow CRUD, dynamic-node CRUD, runs). One new agent-facing tool: `listSourceUploadAttachments`. All other tools wrap existing services.
  - **Iteration loop includes dynamic-node escape hatch** — when no static activity fits, agent drafts TypeScript, calls `publishDynamicNode`, reads structured `ParseError[]` on 400, revises, re-publishes, then uses the new `dyn.<slug>` in the workflow.
  - **Per-request `maxOutputTokens` + per-session `maxTurns`** safety caps, env-configurable.
  - **Abort button** in the chat header cancels the in-flight stream via `AbortController`.
  - **System prompt** lives at `apps/backend-services/src/agent/prompts/workflow-builder.md`. One-line pointer at `.claude/agents/workflow-builder.md` so external Claude Code clients can locate the canonical version.
  - **Context-overflow compaction** turned on via env: `AGENT_CONTEXT_COMPRESSION_THRESHOLD=0.75`. Rarely hit with 1M context.

- **Phase 7.x (deferred):**
  - **Multi-provider support** — Azure OpenAI / OpenAI / Bedrock / Vertex via a parallel Vercel AI SDK path. 7.0 ships Claude Agent SDK only.
  - **Per-session model dropdown** in the chat header. Deferred until there is more than one provider.
  - **Standalone MCP server export** of the tool registry for external Claude Code clients. The in-process MCP design means tools are already MCP-shaped; export is packaging work.
  - **Per-group default provider / model.** 7.0 reads from env vars; per-group settings deferred.
  - **Approval-required write tools.** 7.0 is auto-mode only. A future "review-first" mode would surface Accept/Reject cards for write tools.
  - **Cost telemetry per conversation.** Token usage stored on each `ChatMessage` row, but no aggregation UI in 7.0.
  - **Agent-initiated source-API authoring** for non-upload sources (`source.api`, `source.cron`, etc.). Agent can add `source.api` nodes via `addNode` in 7.0; the file-drop UI handles only `source.upload` in 7.0. Other source-type intake (URL, OAuth, etc.) is 7.x.
  - **Multi-workflow conversations.** A single chat conversation is scoped to at most one workflow in 7.0.
  - **Sub-agent decomposition.** Single-agent in 7.0; the Claude Agent SDK supports sub-agents but 7.0 doesn't use them.

Hooks for 7.x land in 7.0 only when they have no dead-code cost.

---

## 1. The orchestration model

```
User opens chat drawer → types message (optionally drags a file)
            ↓
Frontend POST /api/agent/chat (SSE)
            ↓
AgentController.chat() resolves conversation:
  - existing? → load { claudeSessionId, model, workflowId }
  - new?      → create ChatConversation row
            ↓
AgentService.run({
  prompt: userMessage,
  sessionId?: existing claudeSessionId,
  workflowId?: bound workflow,
  signal: req.signal,
})
            ↓
SDK.query({
  prompt,
  options: {
    model: 'claude-opus-4-7[1m]',
    systemPrompt: load('workflow-builder.md'),
    mcpServers: { workflow: workflowMcpServer },
    allowedTools: ['mcp__workflow__*'],
    resume: sessionId,
    permissionMode: 'bypassPermissions',
    maxTurns: env.AGENT_MAX_TURNS ?? 50,
    maxOutputTokens: env.AGENT_MAX_OUTPUT_TOKENS,
  }
})
            ↓
SDK runs the loop internally:
  • Anthropic API call (streamed)
  • If tool calls in response → dispatch to workflowMcpServer
  • MCP handler resolves the tool name → calls the matching NestJS service
  • Result returned to SDK → loops until LLM done or maxTurns
            ↓
SDK emits stream events → controller translates to assistant-ui-compatible SSE
            ↓
Frontend assistant-ui Thread renders text + tool cards live
```

**Why Claude Agent SDK, not a custom loop.** The SDK owns the conversation/tool-call/result/replay-message protocol. The alternative is writing a streaming controller that calls the Anthropic Messages API, parses tool_use blocks, dispatches them, builds tool_result blocks, recurses — every implementation is a partial reimplementation of what the SDK already ships. With the SDK, the loop is one `query()` call and the only code we write is tools + system prompt + a stream translator.

**Why in-process MCP, not network MCP.** `createSdkMcpServer` lets the SDK call our tool handlers directly inside the NestJS process. No HTTP hop, no auth round-trip, no separate process to deploy. The same tool definitions can later be re-exported as a network MCP server (Phase 7.x) without changing handler code.

**Why one chat conversation per workflow.** Iterating on one workflow shouldn't pollute another's context. A user who builds workflow A, then opens workflow B's chat, gets a fresh session — the agent doesn't see A's history. If they return to A, the previous session resumes via `resume: claudeSessionId`.

**Why SSE, not WebSocket.** Unidirectional server-push fits the agent loop exactly — the client sends one request and receives a stream of events until done. NestJS `@Sse` is native. Aborts via standard `AbortController.abort()`. No WebSocket lifecycle / reconnect logic to design.

---

## 2. Backend orchestrator

### 2.1 Module layout

```
apps/backend-services/src/agent/
├── agent.module.ts             // wires controller + service + registry
├── agent.controller.ts         // POST /api/agent/chat (SSE), GET /api/agent/conversations
├── agent.service.ts            // wraps SDK.query(); SSE event translator
├── tool-registry.ts            // resolves tool name → NestJS service method
├── mcp-server.ts               // createSdkMcpServer() factory; registers all tools
├── prompts/
│   └── workflow-builder.md     // canonical system prompt
└── tools/                      // one file per tool group
    ├── catalog.tools.ts
    ├── workflow.tools.ts
    ├── dynamic-node.tools.ts
    ├── source.tools.ts
    ├── run.tools.ts
    └── README.md
```

### 2.2 Controller surface

| Verb | Path | Body / params | Response |
|------|------|---------------|----------|
| POST | `/api/agent/chat` | `{ conversationId?, workflowId?, message }` | SSE stream of agent events |
| GET  | `/api/agent/conversations?workflowId=<id>` | — | `ChatConversation[]` |
| GET  | `/api/agent/conversations/:id` | — | `{ conversation, messages: ChatMessage[] }` |
| POST | `/api/agent/conversations/:id/abort` | — | `{ ok: true }` (sets a backend-side cancellation flag for in-flight stream) |
| DELETE | `/api/agent/conversations/:id` | — | 204 |

All endpoints carry full Swagger decorators per CLAUDE.md.

### 2.3 SSE event protocol

Backend translates SDK events into the data-stream format assistant-ui's custom-runtime adapter consumes. Event types (one per SSE event):

- `text-delta` — `{ delta: string }`
- `tool-call-start` — `{ id, name, input }` (input is partial; full once `tool-call-complete` fires)
- `tool-call-complete` — `{ id, input, output? }`
- `tool-call-error` — `{ id, error: { code, message, body? } }`
- `agent-done` — `{ usage: { inputTokens, outputTokens, totalTokens }, finishReason }`
- `agent-error` — `{ code, message }` (translation of any SDK-emitted error)

Each `ChatMessage` row in the DB stores a hydrated JSON of these events for replay on drawer reopen.

### 2.4 Provider + model resolution

7.0 reads from env vars:

- `ANTHROPIC_API_KEY` — required (SDK refuses to start without it)
- `AGENT_MODEL` — defaults to `claude-opus-4-7[1m]`
- `AGENT_MAX_TURNS` — defaults to `50`
- `AGENT_MAX_OUTPUT_TOKENS` — defaults to `8192`
- `AGENT_CONTEXT_COMPRESSION_THRESHOLD` — defaults to `0.75`
- `AGENT_BEDROCK_ENABLED` / `AGENT_VERTEX_ENABLED` — recognized but 7.0 doesn't ship the wiring

No values are read at request time except the model name (which the agent will accept as a per-conversation override later in 7.x). Secrets never enter logs.

---

## 3. Tool registry

### 3.1 Resolution pattern

`tool-registry.ts` exposes a singleton `ToolRegistry` populated at module init. Each tool file calls:

```ts
registry.register({
  name: 'createWorkflow',
  description: '...',
  inputSchema: z.object({ name: z.string(), groupId: z.string() }),
  handler: async (args, ctx) => ctx.workflowsService.create({ ... })
})
```

`mcp-server.ts` reads the registry and feeds it into `createSdkMcpServer({ name: 'workflow', tools })`. The `ctx` argument carries the resolved per-request context — auth principal, group ID, services injected via Nest DI.

### 3.2 Read tools (auto-execute, no side effects)

| Tool | Backs | Phase |
|------|-------|-------|
| `listActivityCatalog` | `GET /api/activity-catalog` (merged static + dynamic) | 6 |
| `listSourceCatalog` | `SOURCE_CATALOG` (in-package) | 8 |
| `listLibraryWorkflows` | `GET /api/workflows?isLibrary=true` | 2 |
| `getWorkflow` | `GET /api/workflows/:id` | 1 |
| `listDynamicNodes` | `GET /api/dynamic-nodes` | 6 |
| `getDynamicNode` | `GET /api/dynamic-nodes/:slug` | 6 |
| `getRunSpec` | `GET /api/workflows/:id/run-spec` | 8 |
| `getNodeStatuses` | `GET /api/workflows/:id/runs/:runId/node-statuses` | 4 |
| `getPreviewCache` | `GET /api/workflows/:id/runs/:runId/preview-cache/:nodeId` | 4 |
| `listRunHistory` | `GET /api/workflows/:id/runs` | 4 |
| `listSourceUploadAttachments` | **NEW** — wraps existing blob-store list keyed by `sourceNodeId` | 8 |

### 3.3 Write tools (auto-execute in 7.0; tool-card renders live)

| Tool | Backs | Phase |
|------|-------|-------|
| `createWorkflow` | `POST /api/workflows` | 1 |
| `updateWorkflowMetadata` | `PUT /api/workflows/:id` (metadata only — name, description, ctx, inputs, outputs) | 1, 2 |
| `addNode` | partial-graph update via `PUT /api/workflows/:id` | 1, 6, 8 |
| `setNodeParameters` | partial-graph update | 1 |
| `connectNodes` | partial-graph update (edges + binding) | 1, 3 |
| `deleteNode` | partial-graph update | 1 |
| `setEntryNode` | partial-graph update (`entryNodeId`) | 1, 8 |
| `declareCtx` | partial-graph update (`ctx` declarations + kinds) | 2, 3 |
| `setCtxKind` | partial-graph update (`ctx.<key>.kind`) | 3 |
| `publishDynamicNode` | `POST /api/dynamic-nodes` | 6 |
| `updateDynamicNode` | `PUT /api/dynamic-nodes/:slug` (new version) | 6 |
| `deleteDynamicNode` | `DELETE /api/dynamic-nodes/:slug` (soft-delete) | 6 |
| `startRun` | `POST /api/workflows/:id/runs` | 1, 4, 8 |

### 3.4 Why higher-level tools, not one `updateWorkflow`

A single big `updateWorkflow` tool requires the LLM to send the full graph JSON every revision. That's slow, error-prone (typos in unchanged regions), and produces opaque diffs in the chat history. The higher-level tools (`addNode`, `connectNodes`, etc.) produce **structured edit history** in the chat — the user reads "Agent added document.classify, connected to upload1, set parameters to {…}" as discrete cards. Each tool's handler validates the partial change against the full workflow before persisting, so binding-walk / typed-I/O errors surface per-tool-call rather than as a wall of validation errors on one giant write.

### 3.5 Tool error handling

Every handler returns `{ ok: true, data }` or `{ ok: false, error: { code, message, body? } }`. The SDK forwards `error.body` into the tool result the LLM sees, so the agent reads structured errors (e.g., dynamic-node `ParseError[]`, binding-walk error strings) and revises. Tool-call cards in the chat render the error in red and the agent's next action explains the fix.

---

## 4. Persistence

### 4.1 Schema

```prisma
model ChatConversation {
  id               String         @id @default(cuid())
  workflowId       String?        // nullable — chat opened before a workflow exists
  workflow         Workflow?      @relation(fields: [workflowId], references: [id])
  groupId          String
  group            Group          @relation(fields: [groupId], references: [id])
  createdBy        String         // user ID
  claudeSessionId  String?        // Claude Agent SDK session ID; null until first turn
  model            String         // e.g. "claude-opus-4-7[1m]"
  createdAt        DateTime       @default(now())
  lastMessageAt    DateTime       @default(now())
  messages         ChatMessage[]

  @@index([workflowId])
  @@index([groupId, createdBy])
}

model ChatMessage {
  id              String   @id @default(cuid())
  conversationId  String
  conversation    ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role            String   // 'user' | 'assistant' | 'system'
  content         Json     // hydrated event log (text-delta merged, tool-call-complete entries kept)
  inputTokens     Int?
  outputTokens    Int?
  createdAt       DateTime @default(now())

  @@index([conversationId, createdAt])
}
```

### 4.2 Session resume

Claude Agent SDK persists session state to its own store (`~/.claude/projects/` by default). Our `claudeSessionId` column is the foreign key into that store. On drawer reopen:

1. Frontend GETs `/api/agent/conversations?workflowId=<id>` → returns the latest conversation for that workflow.
2. Frontend GETs `/api/agent/conversations/:id` → returns hydrated messages for replay in the Thread.
3. Next user message POSTs to `/api/agent/chat` with the conversation ID; backend calls `SDK.query({ ..., resume: claudeSessionId })`.

If the session has expired (SDK returns "session not found"), backend starts a fresh session, replays the stored messages into a `system` priming message, and updates `claudeSessionId`.

### 4.3 No test-fixture table

File uploads from chat-composer drag-drop reuse Phase 8's `source.upload` storage. The file is part of the workflow's source node — it persists for the life of that node and rebuilds naturally when the user reverts to an earlier workflow version. No `WorkflowTestFixture` table is added.

---

## 5. Frontend chat UI

### 5.1 Component layout

```
apps/frontend/src/features/workflow-builder/agent-chat/
├── AgentChatDrawer.tsx          // Mantine Drawer wrapper, right-rail, 480px wide
├── AgentChatThread.tsx          // assistant-ui <Thread> mount
├── runtime/
│   ├── ClaudeAgentSDKRuntime.ts // custom runtime adapter for assistant-ui
│   └── sse-stream-parser.ts     // decodes SSE events from /api/agent/chat
├── messages/
│   ├── AgentTextMessage.tsx     // user / assistant text
│   ├── AgentToolCallCard.tsx    // collapsed-by-default tool call card
│   └── AgentErrorMessage.tsx    // red error card
├── composer/
│   ├── AgentComposer.tsx        // assistant-ui <Composer> mount
│   └── FileDropZone.tsx         // dropzone overlay
├── header/
│   ├── AgentChatHeader.tsx      // title + abort + new-conversation
│   └── AgentAbortButton.tsx
├── useAgentChat.ts              // wraps assistant-ui's useRuntime + our runtime adapter
├── useAgentConversations.ts     // TanStack query — list / load conversations
└── index.ts
```

### 5.2 Drawer mount + global trigger

A new `AgentChatIcon` lives in the global app header (next to whatever notification / user-menu chrome the app already has). Clicking it opens `AgentChatDrawer`. The drawer reads route state to determine whether a workflow is currently open:

- If on `/workflows/create-v2?id=<id>` → conversation scoped to that workflow.
- If elsewhere → conversation scoped to "no workflow yet"; first `createWorkflow` tool call binds the conversation to the new workflow ID and navigates the user to `/workflows/create-v2?id=<new>`.

The drawer persists across route changes (Mantine `Drawer` rendered at the layout root, not per page).

### 5.3 Tool-call card UX

Each tool call renders as a Mantine `Card`:

- **Header:** tool icon + name + status pill (running / ok / error) + optional time.
- **Collapsed body (default):** one-line summary, e.g., "Added document.classify connected to upload1".
- **Expanded body (click chevron):** full JSON input and output, formatted with Monaco read-only.
- **Error state:** red border, error code + message highlighted, expand reveals structured `body` (e.g., dynamic-node `ParseError[]` with line/column).

### 5.4 Composer file drop

`FileDropZone` overlays the composer when a user drags a file over the drawer. On drop:

1. Frontend reads the current workflow's graph from cache.
2. If the workflow has a `source.upload` node → POST to `/api/sources/:sourceNodeId/upload` (existing Phase 8 endpoint). On success, append a system-style message to the conversation: `"User attached <filename> to source node '<sourceNodeName>'"`.
3. If the workflow has no `source.upload` → queue the file in component state; send the user message along with a metadata flag `attachedFiles: [{ filename, mimeType, size }]`. The agent's next turn sees the queued attachment in the system-prompt's runtime state and calls `addNode({ type: 'source.upload' })`. Frontend listens for the `addNode` tool result, then performs the upload to the new node and emits the system-style attachment-notification message.
4. If no workflow at all → queue the file; agent calls `createWorkflow` then `addNode` then frontend uploads as in (3).

`source.api` and other source types are **out of scope for 7.0 file drop** — the dropzone only handles binary files. Agent-authored `addNode({ type: 'source.api', parameters: { fields } })` workflows are reachable through chat instructions, just without the drag-drop fast path.

### 5.5 Live canvas reactivity

Every write-tool success on the backend invalidates the relevant TanStack query keys (`['workflow', id]`, `['workflow', id, 'run-spec']`, `['activity-catalog']`, etc.). The canvas re-renders within one tick of each tool call landing. The user sees the agent's edits propagate live without needing to switch tabs or refresh.

### 5.6 Abort button

The drawer header shows an Abort button while a stream is in flight. Clicking it:

1. Cancels the frontend's fetch via `AbortController.abort()`.
2. POSTs to `/api/agent/conversations/:id/abort` so the backend can stop the SDK loop on the next iteration boundary.
3. Renders an "Aborted by user" pill in the message stream.

---

## 6. The iteration loop (with dynamic-node escape hatch)

```
1. User: opens chat → types goal → optionally drops file
2. Frontend: ensures workflow + source.upload exist (creates via agent tool calls as needed)
3. Frontend: uploads file to source.upload via existing /api/sources/:id/upload
4. Agent: listActivityCatalog + listSourceCatalog + (if asked) listLibraryWorkflows
5. Agent: composes plan in chat ("I'll use document.split → document.classify → tables.lookup")
6. Agent: addNode × N + connectNodes × M + setNodeParameters × K + setEntryNode
7. Agent: startRun → returns { runId }
8. Agent: getNodeStatuses (loops, polling SDK-side until terminal)
9. Agent: getPreviewCache for each node — surfaces results as cards in chat
10. Agent: evaluates against user goal
    ↓
    GOOD?  → surfaces final result → asks user "does this look right?" → done
    ↓
    BAD?   → diagnoses which node misbehaved
            ↓
            (a) Better existing activity? → addNode + connectNodes to swap → loop to 7
            (b) Wrong parameters?         → setNodeParameters → loop to 7
            (c) Catalog has nothing fit?  → DYNAMIC NODE ESCAPE HATCH:
                  • Agent drafts TS in chat (user sees the script)
                  • Agent: publishDynamicNode({ slug, code })
                  • Backend returns 400 { errors: ParseError[] } if invalid
                  • Agent reads { stage, line, column, message } from the structured body
                  • Agent revises script (often just one targeted line/column edit)
                  • Agent: publishDynamicNode again → succeeds (returns versionId)
                  • Agent: addNode({ type: 'dyn.<slug>' }) + connectNodes
                  • Agent: deleteNode on the failing static node
                  • Loop to 7
11. Stops when: target state reached, user aborts, OR maxTurns hit
```

**The same file in `source.upload` stays across iterations.** Re-running with the same upload is a single tool call; no re-upload, no fixture-table lookup. The workflow IS the test environment.

**Phase 6 dynamic-node feedback path is reused exactly.** The `ParseError[]` structure was designed in Phase 6 specifically so an AI agent could read line/column anchors and revise. Phase 7 is the consumer that justifies that design.

---

## 7. Auto-mode + safety

| Control | Mechanism | Default | Configurable |
|---------|-----------|---------|--------------|
| Per-conversation turn cap | `maxTurns` (SDK) | 50 | env `AGENT_MAX_TURNS` |
| Per-request token cap | `maxOutputTokens` (SDK) | 8192 | env `AGENT_MAX_OUTPUT_TOKENS` |
| Context compression | SDK middleware | 0.75 (compress when 75% full) | env `AGENT_CONTEXT_COMPRESSION_THRESHOLD` |
| Abort | `AbortController` + backend signal | — | always available |
| Tool allowlist | `allowedTools: ['mcp__workflow__*']` | All registered tools, nothing else | (registry-driven) |
| No filesystem / shell tools | Built-in SDK tools NOT included in allowlist | — | — |

Approval gates on write tools are **deferred to 7.x**. 7.0 is auto-mode only. The user's "I want it as autonomous as possible" decision is the load-bearing constraint here.

---

## 8. System prompt

Lives at `apps/backend-services/src/agent/prompts/workflow-builder.md`. Loaded at module init; not hot-reloaded (backend restart picks up edits).

**Key sections the prompt enforces:**

- **Catalog-first rule.** Always call `listActivityCatalog` + `listSourceCatalog` before composing. Don't guess activity names.
- **Library-first rule.** Before authoring a dynamic node, check `listLibraryWorkflows` for an existing reusable workflow that already does the job.
- **Explain before write.** Before write-tool calls, give a one-sentence plan in chat. Read-tool calls don't need narration.
- **Iterate via Try.** After write changes, run with the user's uploaded file (`source.upload`) — don't ask the user to "test it" themselves. Read `getNodeStatuses` + `getPreviewCache` and report findings.
- **Dynamic-node last resort.** Only write a dynamic node when nothing in the merged catalog fits, and only after the user agrees (one-sentence pitch, then `publishDynamicNode`).
- **Failure handling.** On any tool error, read the structured `body`. For dynamic-node `ParseError[]`, revise at the exact line/column. For binding-walk errors, the message names the offending ctx key and node — fix it.
- **Stopping condition.** Stop and ask when results match the goal. Don't keep iterating if the user hasn't said it's wrong.

A one-line pointer file exists at `.claude/agents/workflow-builder.md`:

```markdown
# Workflow Builder Agent
Canonical system prompt: see apps/backend-services/src/agent/prompts/workflow-builder.md
```

so external Claude Code clients (when Phase 7.x exposes the MCP server) can locate the up-to-date version.

---

## 9. Multi-provider deferred to 7.x

The original Phase 7 brainstorm raised multi-provider (Anthropic + Azure OpenAI + OpenAI) as a hard requirement. **In 7.0, this is deferred.** Reasons:

- Claude Agent SDK ships the agentic loop natively. Replicating that on Vercel AI SDK adds custom orchestration code we'd rather avoid in 7.0.
- The user's testing target is Opus 4.7 with 1M context — Anthropic-exclusive.
- Tool quality for our specific surfaces (typed I/O, dynamic-node ParseError revision) is best-in-class on Claude Sonnet/Opus.

In 7.x, multi-provider lands via a **parallel orchestrator path** using Vercel AI SDK. The tool registry stays the same — the registry's MCP-shape is provider-agnostic. The chat UI stays the same — assistant-ui's runtime adapter abstracts the wire protocol. Only the backend orchestrator splits: `AgentService` dispatches to `ClaudeOrchestrator` or `VercelOrchestrator` based on `conversation.provider`. The per-session provider dropdown in the chat header ships with 7.x.

---

## 10. Failure-feedback paths the agent reads

Every Phase 1–8 surface that returns a structured error feeds the agent's revision loop:

| Source | Shape | Agent reads |
|--------|-------|-------------|
| Phase 1 graph validator | `{ message: string }` per validation rule | message text |
| Phase 3 binding-walk | `Input port \`<port>\` (<consumerKind>) on node \`<id>\` reads from ctx key \`<ctx>\`, written by node \`<producer>\` (<producerKind>) — <producerKind> not assignable to <consumerKind>` | port + ctx key + producer node ID |
| Phase 4 node status | `{ status, errorMessage }` per node, errorMessage 2KB stderr | which node failed + why |
| Phase 6 dynamic-node publish | `{ errors: [{ stage, line, column, message }] }` | line/column to revise |
| Phase 6 dynamic-node runtime | `DynamicNode*Error` (typed) → `errorMessage` | error class + stderr tail |
| Phase 8 source-API field | per-field validation errors | which field is wrong |
| Phase 8 source-upload | `{ error: 'mime-mismatch' \| 'too-large' \| ... }` | which constraint failed |

The system prompt instructs the agent to **read the structured `body` first, not the human-readable message**, when both are present.

---

## 11. Verification (Milestone G — end-to-end Playwright walkthrough)

The Phase 7 close milestone drives a real conversation against the live stack. Acceptance criteria mirror Phases 3, 4, 6, 8:

1. **Greenfield workflow build.** User opens chat from app header → types "extract line items from invoices". Agent creates workflow + composes graph using catalog activities → reports plan in chat.
2. **File drop populates source.upload.** User drops a test invoice into chat → frontend uploads to the source.upload node created by the agent → next agent turn sees the attachment and starts a run.
3. **Run + iterate.** Agent calls startRun, polls statuses, reads preview-cache, surfaces results as cards.
4. **Dynamic-node escape hatch fires.** Test forces a "need custom transform" scenario. Agent drafts TS, publishes dynamic node, hits a deliberate ts-check error, reads ParseError, revises, re-publishes successfully.
5. **Live canvas reactivity.** Canvas reflects each addNode/connectNodes within one tick (no manual refresh).
6. **Abort works.** Mid-stream user clicks Abort → backend stops the SDK loop → frontend shows "Aborted" pill → conversation remains resumable.
7. **Resume across reopens.** Close drawer → reopen → chat history reloaded → next message continues the SDK session via `resume`.
8. **Zero pageerror events.**

Pass = all 8 scenarios pass, 0 pageerrors, screenshots at `/tmp/wb-phase7-verify/`, walkthrough script + summary preserved.

---

## 12. Cadence and milestones (preliminary)

This document fixes design only. Story-level decomposition into milestones lives in the to-be-written `feature-docs/20260606-workflow-builder-phase7-ai-agent/` directory (REQUIREMENTS.md + user_stories/ + README.md), produced via `requirements-refiner` → `write-user-stories`. Expected milestone shape, matching Phases 4/6/8 cadence:

- **Milestone A** — `@anthropic-ai/claude-agent-sdk` install + `AgentModule` shell + Prisma migration for `ChatConversation` + `ChatMessage` + system-prompt file.
- **Milestone B** — Tool registry + in-process MCP server + all read tools (no write tools yet).
- **Milestone C** — Write tools + auto-mode wiring + `bypassPermissions` + maxTurns/maxOutputTokens caps.
- **Milestone D** — Chat UI: `AgentChatDrawer` + assistant-ui runtime adapter + global header icon + abort.
- **Milestone E** — File-drop in composer + source.upload integration + canvas reactivity invalidations.
- **Milestone F** — Iteration-loop polish + dynamic-node escape hatch system-prompt rules + structured error rendering in tool cards.
- **Milestone G** — End-to-end Playwright walkthrough (§11 above).

Story numbering continues from US-187.

---

## 12a. Hardening fixes (correctness + cost + safety)

The following fixes harden the agent module beyond the original Phase 7.0 scope. All live under `apps/backend-services/src/agent/**`.

1. **Server-side auto-wire on agent writes.** Agent write tools (`addNode`, `connectNodes`, `setNodeParameters`, `declareCtx`, `deleteNode`, `setEntryNode`) persist through `resolveConfigForPersist(config)` in `tools.ts`, which runs the SAME pass the V2 editor uses before save: `stripRedundantLocks(resolveBindings(normaliseLocks(config)))` (imported from `@ai-di/graph-workflow`). Previously agent writes persisted RAW config, so hand-authored non-`__auto.` keys read back as user-locked ports. Agent-built graphs now round-trip identically to editor-built graphs.

2. **`listSourceCatalog` tool.** Added in `tools.ts`, backed by `SOURCE_CATALOG`, mirroring `listActivityCatalog`. The system prompt already directed the model to call it; the tool now exists and agrees with the prompt.

3. **Tool-call history preserved on resume.** Assistant turns persist full UIMessage `parts` (text + `dynamic-tool` parts carrying tool call input/output) via `assistantPartsFromFinish(event)`, aggregated across all steps. `storedRowToUIMessage` rehydrates them, so resume no longer collapses tool history to a single text part. The legacy `{ text }` envelope is still accepted on read.

4. **Abort-registry race fixed.** `AbortFlagMap.register()` returns an `AbortRegistration` handle whose `clear()` is a compare-and-delete — it only evicts the conversation's controller if it is still the mapped one. A settled turn can no longer clear a resent turn's controller, so `abort()` on the live turn keeps working.

5. **Per-conversation cost ceiling.** `AgentEnv.maxConversationTokens` (`AGENT_MAX_CONVERSATION_TOKENS`, default 500000). Before each turn, `startChat` sums recorded spend via `ChatRepository.sumConversationTokens` and throws `ForbiddenException` once the ceiling is exceeded. Spend is the cumulative input+output tokens recorded by prior `onFinish` callbacks.

6. **Tool-result truncation.** `AgentEnv.maxToolResultChars` (`AGENT_MAX_TOOL_RESULT_CHARS`, default 20000). `getWorkflow` / `getPreviewCache` / `getNodeStatuses` route their payloads through `wrapToolData`, which size-caps with an explicit `[truncated …]` marker so large document/OCR text can't blow up context or cost.

7. **Prompt-injection isolation.** `wrapToolData` also wraps tool-result content in `<<<TOOL_RESULT_DATA … TOOL_RESULT_DATA>>>` fences, and the system prompt instructs the model to treat fenced content strictly as data, never as instructions — mitigating injection from user-controlled document text, workflow names, and node params while the agent holds write + publish + run capability.

## 13. Companion documents

- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) §5 Phase 7 — the original plan entry; this doc is its detailed decision record.
- [DYNAMIC_NODES_DESIGN.md](DYNAMIC_NODES_DESIGN.md) — Phase 6; the dynamic-node escape hatch this design depends on.
- [DOCUMENT_SOURCES_DESIGN.md](DOCUMENT_SOURCES_DESIGN.md) — Phase 8; the source.upload primitive this design reuses for file drop.
- [TRY_IN_PLACE_DESIGN.md](TRY_IN_PLACE_DESIGN.md) — Phase 4; the run + preview-cache substrate the iteration loop reads.
- [TYPED_IO_DESIGN.md](TYPED_IO_DESIGN.md) — Phase 3; the binding-walk error format the agent reads.
- [WORKFLOW_NODE_IO_MODEL_DECISION.md](WORKFLOW_NODE_IO_MODEL_DECISION.md) — Model A engine semantics (unchanged by Phase 7).
- [SESSION_HANDOFF.md](SESSION_HANDOFF.md) — current state of the branch and what just landed.
