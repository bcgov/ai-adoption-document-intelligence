# Phase 7 — AI Workflow Builder Agent — Requirements

**Status:** Refined. Ready for user-story generation.
**Owner:** Alex
**Branch:** `feature/visual-workflow-builder`
**Feature-docs slug:** `20260606-workflow-builder-phase7-ai-agent`
**Predecessor:** Phase 6 (`feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/`) — closed (30 stories US-157 → US-186, deno-runner + publish endpoints + dyn.run + activity-catalog merge + Monaco editor + canvas pills shipped end-to-end with US-185 walkthrough; commit `4460942f`).
**Authoritative design:** [docs-md/workflow-builder/AI_AGENT_DESIGN.md](../../docs-md/workflow-builder/AI_AGENT_DESIGN.md) (commit `9b3c8b7d`; locked scope in §0).
**Plan reference:** [docs-md/workflow-builder/IMPLEMENTATION_PLAN.md §5 Phase 7](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md).

---

## 1. Why this phase

Phases 1–6 + 8 deliver every primitive an agent needs to drive workflow authoring: the static activity catalog (Phase 1), library workflows (Phase 2), typed I/O for compositional safety (Phase 3), try-in-place + cache + node-statuses + preview-cache for run feedback (Phase 4), dynamic nodes as the user-authored escape hatch (Phase 6), and source nodes for intake (Phase 8). What the editor lacks is **the orchestrator that drives those primitives from natural language**.

The user vision: an AI agent that builds these workflows on the fly, working in a feedback loop where it sets up the pipeline and tests it ([NOTES.md §1.7](../../docs-md/workflow-builder/NOTES.md#17-ai-built-workflows--feedback-loop)). The designer confirmed this is the long-term primary creation path ([NOTES.md §2](../../docs-md/workflow-builder/NOTES.md#2-designer-conversation-outcomes)). Phase 6's structured `ParseError[]` (signature/line/column anchored) and Phase 4's preview-cache surfacing were specifically designed so that an LLM agent could read failures + outputs and revise — Phase 7 is the consumer that realises that design.

Phase 7 reframes "AI workflow builder" around an **embedded chat panel in the editor**:

- The chat is **first-class UI surface** mounted from a global app-header icon and the right-rail drawer, not a separate page.
- The agent **reuses every Phase 1–8 surface** through an in-process MCP tool registry — no new workflow capabilities are introduced, only the orchestration layer.
- File intake **reuses Phase 8 `source.upload`** — drag-drop in the chat composer goes into the workflow's existing upload source node. No new test-fixture persistence table.
- The agent runs in **auto mode** (`permissionMode: 'bypassPermissions'`) — write tools execute without per-call approval, with safety governed by `maxTurns`, `maxOutputTokens`, an abort button, and the user watching every tool-call card render live.
- The **dynamic-node escape hatch is explicit** in the iteration loop — when the static catalog runs out, the agent drafts TS, calls `publishDynamicNode`, reads structured `ParseError[]` on failure, and revises at exact line/column.

Continuing to defer this leaves Phase 1–8 a power-user surface only. The Phase 7 chat is what unlocks the "build me a workflow that does X" experience the design brief targets.

---

## 2. Mental model — non-negotiable

The engine is **Model A** ([WORKFLOW_NODE_IO_MODEL_DECISION.md](../../docs-md/workflow-builder/WORKFLOW_NODE_IO_MODEL_DECISION.md)). **Phase 7 adds NO new runtime concept inside the workflow definition.** The agent calls the same `POST /api/workflows`, `PUT /api/workflows/:id`, `POST /api/workflows/:id/runs`, etc. that a human user would call. The workflow JSON shape is unchanged.

**Orchestration model:** the agentic loop is owned by the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`). The SDK runs the loop internally: it calls Anthropic API, dispatches tool calls into our **in-process MCP server** (`createSdkMcpServer`), receives results, recurses until the LLM stops or `maxTurns` is hit. The backend writes ZERO orchestration code — it writes tools + a system prompt + a stream translator.

**Persistence model:** per-workflow `ChatConversation` + `ChatMessage` Prisma rows. Each conversation stores a Claude SDK `sessionId` for `resume:` continuation across drawer reopens. **No `WorkflowTestFixture` table.** File uploads from chat reuse Phase 8's `source.upload` storage via the existing `POST /api/sources/:sourceNodeId/upload` endpoint.

**Streaming model:** SSE on `POST /api/agent/chat` via NestJS `@Sse`. Backend translates SDK events to a stable wire shape (`text-delta`, `tool-call-start`, `tool-call-complete`, `tool-call-error`, `agent-done`, `agent-error`) that assistant-ui's custom-runtime adapter consumes.

**Failure-feedback contracts the agent reads:**

- Phase 1 graph validator → human-readable `{ message }`.
- Phase 3 binding-walk → `Input port \`<port>\` (<consumerKind>) on node \`<id>\` reads from ctx key \`<ctx>\`, written by node \`<producer>\` (<producerKind>) — <producerKind> not assignable to <consumerKind>`.
- Phase 4 node status → `{ status, errorMessage }` (2 KB stderr tail) per node.
- Phase 6 dynamic-node publish → `{ errors: [{ stage, line, column, message, tag?, unknownKind?, rejectedHost? }] }`.
- Phase 6 dynamic-node runtime → 7 typed error classes → `NodeRunStatus.errorMessage`.
- Phase 8 source.upload → `{ error: 'mime-mismatch' | 'too-large' | ... }`.

The system prompt instructs the agent to **read the structured body first**, not the human-readable message, when both are present.

---

## 3. Locked decisions

### 3.1 Pre-resolved scope locks (from design doc §0)

- **L1. Orchestrator = `@anthropic-ai/claude-agent-sdk`.** The SDK owns the conversation/tool-call/result/replay loop. No custom orchestration code. Vercel AI SDK, Mastra, LangChain JS rejected for 7.0 — see §10.
- **L2. Provider = Anthropic only in 7.0.** Multi-provider (Azure OpenAI / OpenAI / Bedrock / Vertex) deferred to 7.x. The SDK supports Bedrock + Vertex through env config but the wiring is not built in 7.0.
- **L3. Default model = `claude-opus-4-7[1m]`.** 1M context. Env-configurable via `AGENT_MODEL`.
- **L4. Tool registry = in-process MCP via `createSdkMcpServer`.** Runs inside the NestJS process, no separate process. Tool definitions are pure `{ name, description, inputSchema (Zod), handler }`. Handlers resolve services through a registry singleton populated at module init.
- **L5. Chat UI = `@assistant-ui/react` with a custom runtime adapter.** assistant-ui's headless `Thread` / `Composer` / `Message` primitives consume a `ClaudeAgentSDKRuntime` adapter that decodes the SSE event stream. Mantine-compatible (assistant-ui is unstyled headless).
- **L6. UI placement = right-rail Mantine `Drawer` toggled from a global app-header icon.** Available on every route. Drawer width 480 px. Mounts once at the layout root and persists across route changes.
- **L7. File intake = Phase 8 `source.upload` reuse.** Drag-drop on the chat composer uploads via existing `POST /api/sources/:sourceNodeId/upload`. **No new test-fixture table.** If the workflow lacks a `source.upload` node, the file is queued in frontend state and uploaded after the agent's next `addNode` succeeds. If no workflow exists, the agent creates one (and gets navigated to it) before the upload runs.
- **L8. Auto mode = `permissionMode: 'bypassPermissions'`.** Write tools execute without per-tool approval cards. Tool-call cards still render live so the user sees everything. Approval-required mode deferred to 7.x.
- **L9. Per-conversation safety = `maxTurns` + `maxOutputTokens` + context compression threshold.** Env-configurable; defaults: `AGENT_MAX_TURNS=50`, `AGENT_MAX_OUTPUT_TOKENS=8192`, `AGENT_CONTEXT_COMPRESSION_THRESHOLD=0.75`. Abort button on the drawer header cancels in-flight via `AbortController` + backend signal.
- **L10. Persistence = `ChatConversation` + `ChatMessage` Prisma models keyed by `workflowId` (nullable).** Stores Claude SDK `sessionId` for `resume:`. Per-user-private (visible only to creator; group members cannot see each other's chats). Soft-delete deferred — DELETE cascades to messages.
- **L11. Streaming = SSE via NestJS `@Sse`** on `POST /api/agent/chat`. Stable event shape (§2). One conversation per HTTP stream. Aborts via standard `AbortController.abort()` plus a backend cancellation flag.
- **L12. System prompt location = backend-resident at `apps/backend-services/src/agent/prompts/workflow-builder.md`.** One-line pointer at `.claude/agents/workflow-builder.md` so external Claude Code clients can locate the canonical version. Loaded at module init; backend restart picks up edits.
- **L13. Higher-level tool granularity.** `addNode`, `connectNodes`, `setNodeParameters`, `deleteNode`, `setEntryNode`, `declareCtx`, `setCtxKind` — NOT one monolithic `updateWorkflow`. Each handler reads the current workflow, applies the partial change, validates, persists via existing PUT. Structured edit history surfaces in chat as discrete tool cards.
- **L14. Tool-call display = collapsed Mantine `Card` per call.** Header: tool icon + name + status pill. Collapsed body: one-line summary. Expanded body: Monaco read-only JSON of input + output. Errors: red border + structured `body` (e.g., `ParseError[]`) expanded by default.
- **L15. Canvas live reactivity.** Every write-tool success on the backend invalidates the relevant TanStack query keys (`['workflow', id]`, `['workflow', id, 'run-spec']`, `['activity-catalog']`). The canvas re-renders within one tick of each tool call landing.

### 3.2 Brainstorm-round locks (raised during the design conversation)

- **L16. Chat available globally, NOT just on the v2 editor.** A new `AgentChatIcon` in the global app header opens the drawer on any route. If a workflow is open at `/workflows/create-v2?id=<id>` the conversation is bound to that workflow; otherwise the conversation is unbound until the agent's first `createWorkflow` tool call (the frontend then navigates to the new workflow).
- **L17. No new test-fixture persistence.** File drop in chat → existing Phase 8 `source.upload`. Same file persists across iterations on the same workflow without re-upload. Future API/cron sources reuse the same mental model via `addNode({ type: 'source.api' })` — no special-cases.
- **L18. Dynamic-node escape hatch explicit in the agent loop.** When the catalog runs out, the agent (per system prompt) drafts TypeScript in chat, calls `publishDynamicNode`, reads `ParseError[]` on 400, revises at line/column, re-publishes, then calls `addNode({ type: 'dyn.<slug>' })` + `connectNodes` + `deleteNode` on the failing node. Phase 6's structured error pipe is the contract.
- **L19. One new agent-facing tool: `listSourceUploadAttachments`.** Reads what files the user has actually uploaded to a given `source.upload` node before the agent calls `startRun`. Lets the agent say "no file attached yet — please drop one in chat" rather than running with empty input. Every other tool maps 1:1 to existing Phase 1–8 endpoints.
- **L20. Multi-provider deferred to 7.x via a parallel orchestrator path.** 7.0 has no provider dropdown in the chat header (single provider, no choice). 7.x adds `VercelOrchestrator` next to `ClaudeOrchestrator`; `AgentService` dispatches on `conversation.provider`. Tool registry + chat UI stay unchanged across the split.

### 3.3 New locks (this requirements pass)

- **L21. `@anthropic-ai/claude-agent-sdk` npm install.** Adds dependency to `apps/backend-services/package.json`. No new top-level package; the SDK is a backend-only concern. Default model resolved from `AGENT_MODEL` env var falling back to `claude-opus-4-7[1m]`.
- **L22. `@assistant-ui/react` npm install.** Adds dependency to `apps/frontend/package.json`. License: MIT. Unstyled headless primitives — no Mantine style collision. We do NOT install `@assistant-ui/styles` or any pre-themed pack; styling stays Mantine.
- **L23. `ChatConversation` Prisma model.** Columns: `id (cuid)`, `workflowId (string?)`, `groupId (string)`, `createdBy (string)`, `claudeSessionId (string?)`, `model (string)`, `title (string?)` — short LLM-derived summary, generated on first user message, used in conversation list, `createdAt (DateTime @default(now))`, `lastMessageAt (DateTime @default(now))`. Relations: `workflow Workflow? @relation(fields: [workflowId], references: [id], onDelete: SetNull)`, `group Group @relation(fields: [groupId], references: [id])`. Indexes: `@@index([workflowId])`, `@@index([groupId, createdBy])`. Maps to `chat_conversation` table.
- **L24. `ChatMessage` Prisma model.** Columns: `id (cuid)`, `conversationId (string)`, `role (string)` — `'user' | 'assistant' | 'system'`, `content (Json)` — hydrated event log (text deltas merged into one string per assistant turn; tool-call entries kept as structured `{ id, name, input, output, error? }` objects), `inputTokens (Int?)`, `outputTokens (Int?)`, `createdAt (DateTime @default(now))`. Relation: `conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)`. Index: `@@index([conversationId, createdAt])`. Maps to `chat_message` table.
- **L25. `AgentModule` at `apps/backend-services/src/agent/`.** Wires `AgentController` + `AgentService` + `ToolRegistry` + `WorkflowMcpServer` (the in-process MCP server factory) + Prisma `ChatConversation` / `ChatMessage` repository. Imported by `AppModule`. Reads env vars at startup: `ANTHROPIC_API_KEY` (required), `AGENT_MODEL`, `AGENT_MAX_TURNS`, `AGENT_MAX_OUTPUT_TOKENS`, `AGENT_CONTEXT_COMPRESSION_THRESHOLD`.
- **L26. `POST /api/agent/chat` (SSE).** Body `AgentChatRequestDto { conversationId?: string, workflowId?: string, message: string, attachments?: { sourceNodeId: string, filename: string }[] }`. Response: `Content-Type: text/event-stream` with the L11 event shape. Each event is `event: <type>\ndata: <json>\n\n`. On controller-side error (auth, validation): non-SSE 4xx. On in-stream error: emits `agent-error` event then closes. Conversation row created if `conversationId` omitted.
- **L27. `GET /api/agent/conversations`.** Query params `workflowId?: string`. Returns 200 `AgentConversationListResponseDto { items: AgentConversationListItemDto[] }` sorted by `lastMessageAt` descending. Each item: `{ id, workflowId?, model, title?, messageCount, lastMessageAt, createdAt }`. Filtered to the caller's `createdBy` — per-user-private per L10.
- **L28. `GET /api/agent/conversations/:id`.** Returns 200 `AgentConversationDetailResponseDto { conversation, messages: AgentMessageDto[] }`. 404 if not found OR if `createdBy != caller`. Messages sorted by `createdAt` ascending. Used by drawer reopen to replay history into the Thread.
- **L29. `POST /api/agent/conversations/:id/abort`.** Returns 200 `{ ok: true }`. Sets a backend-side `Map<conversationId, AbortController>` flag that the in-flight SSE handler checks between SDK turns. If no stream in flight, returns `{ ok: true }` anyway (idempotent).
- **L30. `DELETE /api/agent/conversations/:id`.** 204 on success. Hard delete with cascade to messages. 404 if not found OR if `createdBy != caller`. No soft-delete in 7.0.
- **L31. `AgentController` Swagger.** Full Swagger decorators per CLAUDE.md. All four endpoints get dedicated DTOs (`AgentChatRequestDto`, `AgentChatRequestAttachmentDto`, `AgentConversationListResponseDto`, `AgentConversationListItemDto`, `AgentConversationDetailResponseDto`, `AgentConversationDto`, `AgentMessageDto`, `AgentToolCallDto`, `AgentToolErrorDto`). SSE endpoint documented with the event-shape table in the controller-level `@ApiOperation` description.
- **L32. `WorkflowMcpServer` factory.** Single file at `apps/backend-services/src/agent/mcp-server.ts`. Exports `createWorkflowMcpServer(registry: ToolRegistry, ctx: McpContext): SdkMcpServer`. Called once per request to bind the per-request `ctx` (auth principal, group id, services). The SDK's `query()` consumes the returned server through `options.mcpServers.workflow`.
- **L33. `ToolRegistry` singleton.** `apps/backend-services/src/agent/tool-registry.ts`. Exposes `register(def: ToolDefinition)` + `getAll(): ToolDefinition[]`. Tools self-register from `tools/*.tools.ts` files at module init (called from `AgentModule.onModuleInit`). Each `ToolDefinition` carries `{ name, description, inputSchema: ZodObject, handler: (input, ctx) => Promise<ToolResult> }` where `ToolResult = { ok: true, data } | { ok: false, error: { code, message, body? } }`.
- **L34. Tool naming convention.** SDK-exposed name is `mcp__workflow__<toolName>`. Registry entries store the bare `<toolName>`; the MCP factory prefixes. `allowedTools: ['mcp__workflow__*']` permits all registered tools and nothing else (no built-in SDK tools like Bash / Read / Glob).
- **L35. Read tools** (auto-execute, no side effects). Each wraps a single existing service or controller method. Names + bindings:
  - `listActivityCatalog` → `ActivityCatalogService.listForGroup`
  - `listSourceCatalog` → static `SOURCE_CATALOG` array from `@ai-di/graph-workflow`
  - `listLibraryWorkflows` → `WorkflowsService.listForGroup({ isLibrary: true })`
  - `getWorkflow` → `WorkflowsService.findById`
  - `listDynamicNodes` → `DynamicNodesService.listForGroup`
  - `getDynamicNode` → `DynamicNodesService.findBySlug`
  - `getRunSpec` → `RunSpecService.deriveForWorkflow`
  - `getNodeStatuses` → `RunStatusService.getNodeStatuses`
  - `getPreviewCache` → `PreviewCacheService.getForNode`
  - `listRunHistory` → `RunsService.listForWorkflow`
  - `listSourceUploadAttachments` → **NEW** `SourceUploadService.listAttachmentsForSourceNode(workflowId, sourceNodeId)`. Returns `{ filename, mimeType, sizeBytes, uploadedAt }[]`. Reads from the blob-storage key prefix the existing upload endpoint writes to.
- **L36. Write tools** (auto-execute in 7.0). Each handler does read-modify-write on the workflow JSON via existing repository methods:
  - `createWorkflow({ name, description?, groupId })` → `WorkflowsService.create`. On success, conversation row updates `workflowId` to the new id.
  - `updateWorkflowMetadata({ id, name?, description?, ctx?, inputs?, outputs?, entryNodeId? })` → `WorkflowsService.updateMetadata` (no graph touch).
  - `addNode({ workflowId, node: { id, type, name?, parameters?, ... } })` → reads workflow, merges node into `config.nodes`, writes back. Validates via Phase 1 validator. Handler errors translate validator errors into `{ ok: false, error: { code: 'validation', message, body: errors } }`.
  - `setNodeParameters({ workflowId, nodeId, parameters })` → read-modify-write `node.parameters`.
  - `connectNodes({ workflowId, sourceNodeId, targetNodeId, port?, binding? })` → adds edge to `config.edges` + optionally the consumer's `inputBindings`. Phase 3 binding-walk validates on write; binding-walk errors propagate verbatim into the tool result.
  - `deleteNode({ workflowId, nodeId })` → removes from `config.nodes`, cascades to edges with that node as endpoint, cascades to any `inputBindings` that referenced ctx keys produced by it.
  - `setEntryNode({ workflowId, nodeId })` → sets `config.entryNodeId`.
  - `declareCtx({ workflowId, key, kind?, isInput?, isOutput? })` → adds to `config.ctx`.
  - `setCtxKind({ workflowId, key, kind })` → updates `config.ctx[key].kind`.
  - `publishDynamicNode({ script })` → `DynamicNodesService.create`. Backend returns 400 with `errors[]` if invalid; handler maps to `{ ok: false, error: { code: 'dynamic-node-publish', message, body: errors } }`.
  - `updateDynamicNode({ slug, script })` → `DynamicNodesService.publishNewVersion`.
  - `deleteDynamicNode({ slug })` → `DynamicNodesService.softDelete`.
  - `startRun({ workflowId, initialCtx? })` → `RunsService.start`. Returns `{ runId }` immediately; agent polls via `getNodeStatuses`.
- **L37. Tool error shape.** Every handler returns `{ ok, error?, data? }`. Errors carry `{ code: string, message: string, body?: unknown }`. The SDK forwards `error.body` into the tool result JSON the LLM sees. Errors thrown from handlers are caught by the MCP server bridge and converted to `{ ok: false, error: { code: 'handler-error', message: err.message } }`.
- **L38. SDK event → SSE translator.** Lives in `apps/backend-services/src/agent/event-translator.ts`. Maps SDK message shapes to the L11 event types. Buffers `text-delta` events per assistant turn for the `ChatMessage.content` write (so DB stores merged text per turn, not per token). Buffers `tool-call-start` + `tool-call-complete` pairs into one DB record per call. Emits to SSE in real time regardless of buffering.
- **L39. `claudeSessionId` lifecycle.** On first `query({ prompt, options: { ... } })` call, SDK returns a `sessionId`. Translator captures it and writes `ChatConversation.claudeSessionId` (one-time set; conversation row already exists). Subsequent calls pass `options.resume: claudeSessionId`. If SDK reports session-not-found on resume, backend starts a fresh session, replays stored messages into a single priming `system` message, and updates `claudeSessionId`.
- **L40. System prompt content.** Lives at `apps/backend-services/src/agent/prompts/workflow-builder.md`. Rules (the prompt enforces all of these in plain language):
  - **Catalog-first.** Always call `listActivityCatalog` + `listSourceCatalog` before composing.
  - **Library-first.** Before authoring a dynamic node, call `listLibraryWorkflows` to look for existing reusable workflows.
  - **Explain before write.** One-sentence plan in chat before any write-tool call. Read tools don't need narration.
  - **Iterate via Try.** After write changes, run with the user's uploaded file (`source.upload`) and read `getNodeStatuses` + `getPreviewCache`. Don't ask the user to test it themselves.
  - **Dynamic-node last resort.** Only write a dynamic node when nothing in the merged catalog fits. Pitch the script briefly to the user, then `publishDynamicNode`.
  - **Failure handling.** Read structured `body` first, not the human-readable message. For dynamic-node `ParseError[]`, revise at the exact line/column. For binding-walk errors, the message names the offending ctx key and node.
  - **Stopping condition.** Stop and ask when results match the goal. Don't keep iterating once the user hasn't said it's wrong.
- **L41. `AgentChatDrawer` Mantine component.** Lives in `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx`. Mounted at the app layout root (not per page), persists across route changes. Width 480 px. Opens on `AgentChatIcon` click. Renders `AgentChatHeader` + `AgentChatThread` + `AgentComposer`.
- **L42. `AgentChatIcon` in global app header.** New icon (Mantine `<ActionIcon>` with chat-bubble glyph) added to the existing top-bar nav (next to whatever notification / user-menu chrome is already there). Click toggles drawer. Optional unread / streaming badge: a small dot when a stream is in flight in another route.
- **L43. `AgentChatThread`** is `<Thread>` from assistant-ui with the `ClaudeAgentSDKRuntime` adapter (L44). Renders user + assistant turns + tool-call cards. Inline message components: `AgentTextMessage`, `AgentToolCallCard`, `AgentErrorMessage`.
- **L44. `ClaudeAgentSDKRuntime` adapter.** Custom runtime for assistant-ui at `apps/frontend/src/features/workflow-builder/agent-chat/runtime/ClaudeAgentSDKRuntime.ts`. Decodes the L11 SSE stream into assistant-ui's `ThreadMessage[]` shape. Translates `text-delta` → streamed text content, `tool-call-*` → custom `ToolCall` parts rendered by `AgentToolCallCard`. Maintains a `useReducer`-backed state machine for message-in-flight tracking.
- **L45. `AgentToolCallCard` UX.** Mantine `<Card>` per tool call. Header: tool icon (one per tool group) + tool name + status pill (running / ok / error) + chevron toggle. Collapsed body (default): one-line summary derived from the tool name + key input fields (e.g., "Added document.classify connected to upload1"). Expanded body: two Monaco read-only blocks side-by-side — input JSON / output JSON. Error state: red border + structured `error.body` expanded by default + error code highlighted.
- **L46. `AgentComposer` + `FileDropZone`.** assistant-ui `<Composer>` mounted with a `FileDropZone` overlay component. Drop a file → derives target source node via L47, performs upload via existing `POST /api/sources/:sourceNodeId/upload`, attaches an attachment ref to the user message. Composer enabled while no stream in flight; disabled while streaming (Abort button takes over).
- **L47. File-drop target resolution.** Three cases:
  - **(a)** Workflow has exactly one `source.upload` node → upload to it.
  - **(b)** Workflow has multiple `source.upload` nodes → upload to the FIRST one in `config.nodes` order (Phase 8 already locks at-most-one in 8.0 per `D5`; this case is forward-compat for 8.x).
  - **(c)** Workflow has zero `source.upload` nodes → queue file in component state (`useState<QueuedFile[]>`), append `attachedFiles` metadata to the user message, agent's first `addNode({ type: 'source.upload' })` triggers a frontend listener that drains the queue + uploads to the new node + appends a `system`-style message "User attached <filename> to source node <name>".
  - **(d)** No workflow at all → identical to (c) but the agent's `createWorkflow` runs first, frontend navigates to `/workflows/create-v2?id=<new>`, then queue drains into the source.upload `addNode`.
- **L48. Mid-stream navigation.** When the agent's `createWorkflow` lands while no workflow is open, frontend calls `useNavigate()('/workflows/create-v2?id=<new>')` mid-stream. Drawer state persists through navigation (drawer is mounted at layout root). SSE stream survives the navigation because the underlying `fetch` lives in the runtime adapter, not in the route component.
- **L49. Canvas reactivity via TanStack invalidation.** Each write tool's handler accepts an optional `onSuccess` invalidation callback (passed through the registry context). Invalidation hits the relevant query keys: `['workflow', id]` on `addNode` / `setNodeParameters` / `connectNodes` / `deleteNode` / `setEntryNode` / `declareCtx` / `setCtxKind` / `updateWorkflowMetadata`; `['activity-catalog']` on `publishDynamicNode` / `updateDynamicNode` / `deleteDynamicNode`; `['workflow', id, 'run-spec']` after `setEntryNode` or source-node changes. Frontend canvas re-renders within one tick of each SSE `tool-call-complete` event because the runtime adapter explicitly invalidates from the matching query key list.
- **L50. `AgentAbortButton`.** Visible in `AgentChatHeader` while a stream is in flight. Clicking: (1) calls `AbortController.abort()` on the frontend `fetch`, (2) POSTs to `/api/agent/conversations/:id/abort` so the backend sets the cancellation flag for the next SDK turn boundary, (3) emits a synthetic `agent-error` event with `{ code: 'aborted-by-user' }` into the runtime so the chat shows an "Aborted" pill.
- **L51. Concurrent-edit policy.** If a user is manually editing the canvas while the agent is mid-stream and both try to PUT the same workflow, **last write wins**. No locking, no merge, no warning in 7.0. Real-time collaborative editing is out of scope for the entire workflow-builder track; this is consistent.
- **L52. Conversation title generation.** On first user message of a conversation, backend asks the SDK (in a side `query()` call with no tools) for a short 3–6-word title and stores it on `ChatConversation.title`. Used in the conversation list. If side-call fails, title stays null and frontend shows "Untitled conversation".
- **L53. Token-usage capture.** Each `agent-done` SDK event carries `usage: { inputTokens, outputTokens }`. Translator writes these onto the assistant `ChatMessage` row's `inputTokens` + `outputTokens` columns. No aggregation UI in 7.0; per-conversation totals are computable via SQL.
- **L54. Milestone slicing — A through G.** Seven feature milestones each landing as one commit matching Phase 4 / Phase 6 / Phase 8 cadence. **Story numbering starts at US-187** (Phase 6 closed at US-186).

### 3.4 Operational locks

- **L55. Env vars at backend startup.** Required: `ANTHROPIC_API_KEY` (SDK refuses to start without it). Optional with defaults: `AGENT_MODEL=claude-opus-4-7[1m]`, `AGENT_MAX_TURNS=50`, `AGENT_MAX_OUTPUT_TOKENS=8192`, `AGENT_CONTEXT_COMPRESSION_THRESHOLD=0.75`. Reserved for 7.x (recognized but not wired): `AGENT_BEDROCK_ENABLED`, `AGENT_VERTEX_ENABLED`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_VERSION`, `OPENAI_API_KEY`. Secrets never enter logs per `feedback_secret_handling.md`.
- **L56. `.claude/agents/workflow-builder.md` pointer file.** Single line + canonical path. Committed alongside the backend prompt.
- **L57. No new auth surface.** All `/api/agent/*` endpoints inherit the existing `x-api-key` middleware + group scoping. Per-user-private visibility is enforced by `createdBy` filtering inside the controller.

---

## 4. Scope — what we will build

### 4.1 Shared package (`packages/graph-workflow`)

**No changes.** All Phase 7 work lives in `apps/backend-services` + `apps/frontend`. The shared package's tool inputs are consumed via Zod schemas defined in the backend tool files; they don't need to be re-exported from the shared package.

### 4.2 Backend (`apps/backend-services`)

**Prisma migration:**

- New `ChatConversation` + `ChatMessage` models per L23, L24.
- Run `npm run db:generate` (writes to both `apps/backend-services` and `apps/temporal` per CLAUDE.md).

**New `src/agent/` directory:**

- `agent.module.ts` — module wiring (L25).
- `agent.controller.ts` — four endpoints per L26 → L30 with full Swagger DTOs per CLAUDE.md.
- `agent.controller.spec.ts`.
- `agent.service.ts` — wraps `SDK.query()`; coordinates conversation row, event-translator, abort flag, persistence writes.
- `agent.service.spec.ts`.
- `chat-conversation.repository.ts` + spec.
- `chat-message.repository.ts` + spec.
- `tool-registry.ts` — singleton + `register()` / `getAll()` (L33).
- `mcp-server.ts` — `createWorkflowMcpServer(registry, ctx)` factory (L32).
- `event-translator.ts` — SDK event → SSE event mapping + DB persistence buffering (L38).
- `prompts/workflow-builder.md` — system prompt content (L40).
- `tools/catalog.tools.ts` — `listActivityCatalog`, `listSourceCatalog`, `listLibraryWorkflows`.
- `tools/workflow.tools.ts` — `getWorkflow`, `createWorkflow`, `updateWorkflowMetadata`, `addNode`, `setNodeParameters`, `connectNodes`, `deleteNode`, `setEntryNode`, `declareCtx`, `setCtxKind`.
- `tools/dynamic-node.tools.ts` — `listDynamicNodes`, `getDynamicNode`, `publishDynamicNode`, `updateDynamicNode`, `deleteDynamicNode`.
- `tools/source.tools.ts` — `listSourceUploadAttachments`.
- `tools/run.tools.ts` — `getRunSpec`, `startRun`, `getNodeStatuses`, `getPreviewCache`, `listRunHistory`.
- DTOs: `AgentChatRequestDto`, `AgentChatRequestAttachmentDto`, `AgentConversationListResponseDto`, `AgentConversationListItemDto`, `AgentConversationDetailResponseDto`, `AgentConversationDto`, `AgentMessageDto`, `AgentToolCallDto`, `AgentToolErrorDto`.

**New `src/source-upload/` extension** (or wherever the Phase 8 upload endpoint lives):

- New service method `listAttachmentsForSourceNode(workflowId, sourceNodeId): Promise<{ filename, mimeType, sizeBytes, uploadedAt }[]` per L19 + L35. Backed by the existing blob-storage prefix listing the upload endpoint writes to. Service method only (no new HTTP endpoint required — the tool registry calls it in-process).
- Companion spec.

**Existing module changes:**

- `app.module.ts` — import `AgentModule`.

**Env var wiring:**

- New env vars per L55. `ANTHROPIC_API_KEY` validated at module startup (throw on missing). Others optional with defaults.

**No new auth surface** per L57.

### 4.3 Frontend (`apps/frontend`)

**New `src/features/workflow-builder/agent-chat/` directory:**

- `AgentChatDrawer.tsx` — drawer shell + child layout (L41).
- `AgentChatThread.tsx` — assistant-ui `<Thread>` mount (L43).
- `AgentChatHeader.tsx` — title + new-conversation + `AgentAbortButton` (L50).
- `AgentAbortButton.tsx`.
- `composer/AgentComposer.tsx` — assistant-ui `<Composer>` + file-drop overlay (L46).
- `composer/FileDropZone.tsx` — handles drop event + queued-file state + target resolution per L47.
- `composer/useQueuedFiles.ts` — `useState<QueuedFile[]>` + drain-on-addNode listener.
- `messages/AgentTextMessage.tsx`.
- `messages/AgentToolCallCard.tsx` — collapsed/expanded card per L45.
- `messages/AgentErrorMessage.tsx`.
- `runtime/ClaudeAgentSDKRuntime.ts` — custom runtime adapter per L44.
- `runtime/sse-stream-parser.ts` — decodes the SSE event stream into typed events.
- `runtime/tanstack-invalidator.ts` — query-key invalidation table keyed by tool name per L49.
- `useAgentChat.ts` — orchestrates runtime + `useChat`-style API for the Thread.
- `useAgentConversations.ts` — TanStack query for the conversation list.
- `useAgentConversation.ts` — TanStack query for a single conversation's history.
- `useAgentChatSend.ts` — TanStack mutation; opens SSE stream; threads events into runtime.
- `useSourceUploadForChat.ts` — wraps the Phase 8 upload mutation for chat-side uploads.

**New `src/components/nav/AgentChatIcon.tsx`** per L42. Renders in the existing top-bar nav. Adds the streaming badge indicator.

**Mount in app layout:**

- `apps/frontend/src/App.tsx` (or layout-root file) — render `<AgentChatDrawer>` at the root so drawer state persists across route changes.

**No changes to existing canvas / palette / settings panel components.** Phase 7 is additive — the agent is a separate UI surface that drives the existing pages via TanStack invalidation.

### 4.4 Coexistence with prior phases

- **Phase 1B (catalog adoption + JSON editor).** Agent reads `GET /api/activity-catalog`; no changes to existing palette / canvas / settings panel. JSON editor coexists unchanged.
- **Phase 2 (library workflows + workflow-as-API + versioning).** Agent reads `listLibraryWorkflows` to prefer reuse over fresh authoring. Versioned library workflows continue to work; the agent operates on heads by default (per Phase 2 Track 3).
- **Phase 3 (typed I/O).** Agent's `connectNodes` tool surfaces binding-walk errors verbatim into the tool result. Agent revises ctx-key plumbing in response.
- **Phase 4 (try-in-place + cache + previews).** Agent's `startRun` + `getNodeStatuses` + `getPreviewCache` IS the iteration loop. Cache invalidation on workflow PUT is unchanged; the agent's edits invalidate naturally.
- **Phase 6 (dynamic nodes).** Agent's `publishDynamicNode` / `updateDynamicNode` consumes Phase 6's full publish pipeline. Structured `ParseError[]` enables line/column-anchored revision. Phase 6's editor at `/dynamic-nodes` continues to work unchanged for human authors.
- **Phase 8 (sources).** Agent uses `addNode({ type: 'source.upload' | 'source.api' })` for intake. File drop in chat composer feeds `POST /api/sources/:sourceNodeId/upload`. `listSourceUploadAttachments` is the new agent-facing read tool sitting on Phase 8's storage layer.

---

## 5. Out of scope (explicitly deferred)

- **Multi-provider (Azure OpenAI / OpenAI / Bedrock / Vertex)** — 7.x. 7.0 ships Claude Agent SDK + Anthropic API only. Multi-provider lands via a parallel `VercelOrchestrator` path; tool registry + chat UI unchanged.
- **Per-session model dropdown in the chat header** — 7.x. Single provider in 7.0, no choice to surface.
- **Standalone MCP server export** of the tool registry for external Claude Code clients — 7.x. Tools are MCP-shaped already.
- **Per-group default provider / model** — 7.x. 7.0 reads from env vars.
- **Approval-required write tools (Accept/Reject cards)** — 7.x. 7.0 is auto-mode only.
- **Cost telemetry per conversation** — 7.x. Token usage stored on each `ChatMessage` row but no aggregation UI in 7.0.
- **Agent-initiated source-API authoring with rich field-list editor in chat** — 7.x. Agent can add `source.api` nodes via `addNode` in 7.0; field-list editor is a Phase 8 UI surface, not a chat-side helper.
- **Multi-workflow conversations** — 7.x. A single chat conversation is scoped to at most one workflow in 7.0.
- **Sub-agent decomposition** — 7.x. Single-agent in 7.0.
- **Conversation soft-delete** — 7.x. 7.0 hard-deletes with cascade.
- **Per-role permissions on the chat surface** — 7.x. Any group member can chat in 7.0; conversations are per-user-private (L10).
- **Real-time multi-user collaboration / locking** — out of scope for the entire workflow-builder track. Concurrent edits resolve last-write-wins per L51.
- **MIME-type / size validation per-conversation** — 7.x. File-drop reuses Phase 8's source.upload validation, which lives on the source node's parameters (existing).
- **Per-conversation MCP-tool allowlists / per-group tool filtering** — 7.x. 7.0 exposes all registered tools to every chat in the group.
- **US-053 (`borderColor` console warning)** — still open from Phase 1B; not bundled into Phase 7.
- **Pre-existing commit `b86741c7` (native-binary pin)** — lands as its own PR against develop; not bundled.
- **Pre-existing backend `graph-schema-validator` template-validation failure** — predates Phase 7; not blocking.

---

## 6. Milestone breakdown — A through G

Per L54. One commit per milestone, matching Phase 4 / Phase 6 / Phase 8 cadence. The user-stories writer should produce one umbrella `README.md` plus one `US-NNN-*.md` file per scenario, dependency-ordered. **Numbering starts at US-187** (Phase 6 closed at US-186).

### Milestone A — Backend module shell + Prisma + system prompt + SDK install (US-187 → US-191)

- `npm install @anthropic-ai/claude-agent-sdk` in `apps/backend-services` per L21.
- New Prisma migration adding `ChatConversation` + `ChatMessage` models per L23 / L24. Run `npm run db:generate`.
- New `apps/backend-services/src/agent/` directory with `agent.module.ts`, `chat-conversation.repository.ts` (+ spec), `chat-message.repository.ts` (+ spec), `tool-registry.ts` (+ spec), `prompts/workflow-builder.md` (full system-prompt content per L40).
- `.claude/agents/workflow-builder.md` pointer file per L56.
- Env-var loading + validation at module startup per L55. Throw if `ANTHROPIC_API_KEY` missing.
- `AppModule` imports `AgentModule`.
- Backend test-suite green.
- **Verification surface for Alex:** none — pure backend infra. Repository unit tests (real DB) cover insert / list-by-workflowId / find-by-id-with-createdBy / cascade-delete-messages. Module loads cleanly with `ANTHROPIC_API_KEY` set; throws expected error without it.

### Milestone B — Backend tools + in-process MCP server + read-only chat endpoint (US-192 → US-197)

- `apps/backend-services/src/agent/tools/catalog.tools.ts` — `listActivityCatalog`, `listSourceCatalog`, `listLibraryWorkflows` per L35.
- `apps/backend-services/src/agent/tools/workflow.tools.ts` — `getWorkflow` per L35.
- `apps/backend-services/src/agent/tools/dynamic-node.tools.ts` — `listDynamicNodes`, `getDynamicNode` per L35.
- `apps/backend-services/src/agent/tools/source.tools.ts` — `listSourceUploadAttachments` per L35 (new service method on Phase 8's source-upload module).
- `apps/backend-services/src/agent/tools/run.tools.ts` — `getRunSpec`, `getNodeStatuses`, `getPreviewCache`, `listRunHistory` per L35.
- `mcp-server.ts` — `createWorkflowMcpServer(registry, ctx)` per L32.
- `event-translator.ts` — minimal version handling `text-delta` + `agent-done` + `agent-error` events per L38.
- `agent.service.ts` — runs `SDK.query()` with read tools only (no write tools allowed yet); writes assistant `ChatMessage` rows.
- `agent.controller.ts` — `POST /api/agent/chat` (SSE) per L26 + `GET /api/agent/conversations` per L27 + `GET /api/agent/conversations/:id` per L28 + full Swagger DTOs.
- Backend test-suite green; tests cover read-only conversation flow end-to-end with a mock SDK.
- **Verification surface for Alex:** curl-driven smoke. `curl -N -H "x-api-key: <key>" -X POST localhost:3002/api/agent/chat -d '{"message": "list workflows for my group"}'`. Observe SSE events: `text-delta` chunks streaming a response, `tool-call-complete` event for `listLibraryWorkflows`, `agent-done` with token-usage. No frontend yet.

### Milestone C — Backend write tools + abort + auto-mode wiring (US-198 → US-204)

- Extend `workflow.tools.ts` with all 9 write tools per L36: `createWorkflow`, `updateWorkflowMetadata`, `addNode`, `setNodeParameters`, `connectNodes`, `deleteNode`, `setEntryNode`, `declareCtx`, `setCtxKind`.
- Extend `dynamic-node.tools.ts` with `publishDynamicNode`, `updateDynamicNode`, `deleteDynamicNode` per L36.
- Extend `run.tools.ts` with `startRun` per L36.
- `agent.service.ts` — wire `permissionMode: 'bypassPermissions'` + `maxTurns` + `maxOutputTokens` + `AGENT_CONTEXT_COMPRESSION_THRESHOLD` per L8 / L9.
- `agent.service.ts` — abort flag map per L29 + L50. Check flag between SDK turns.
- `agent.controller.ts` — `POST /api/agent/conversations/:id/abort` per L29 + `DELETE /api/agent/conversations/:id` per L30 + full Swagger.
- `event-translator.ts` — handle `tool-call-start` + `tool-call-complete` + `tool-call-error` events per L38. Buffer + persist `tool-call-complete` records to `ChatMessage.content`.
- Backend test-suite green; tests cover: write tool happy paths, binding-walk error propagation (Phase 3), dynamic-node `ParseError` propagation (Phase 6), abort flag interruption, maxTurns short-circuit.
- **Verification surface for Alex:** curl-driven smoke. POST a goal that requires `createWorkflow` + `addNode`; observe SSE stream emits tool-call events for each write; verify the workflow exists in the DB after the stream closes. POST `/abort` mid-stream → next SDK turn returns early.

### Milestone D — Frontend chat drawer + assistant-ui runtime adapter + global header icon (US-205 → US-211)

- `npm install @assistant-ui/react` in `apps/frontend` per L22.
- New `apps/frontend/src/features/workflow-builder/agent-chat/` directory.
- `runtime/ClaudeAgentSDKRuntime.ts` per L44 + `runtime/sse-stream-parser.ts`.
- `AgentChatDrawer.tsx` per L41 + `AgentChatHeader.tsx` per L50 + `AgentAbortButton.tsx`.
- `AgentChatThread.tsx` per L43.
- `messages/AgentTextMessage.tsx` + `messages/AgentToolCallCard.tsx` per L45 + `messages/AgentErrorMessage.tsx`.
- `composer/AgentComposer.tsx` (text only — file drop ships in E).
- `useAgentConversations.ts` + `useAgentConversation.ts` + `useAgentChatSend.ts`.
- `src/components/nav/AgentChatIcon.tsx` per L42; mount in existing top-bar nav.
- `App.tsx` mounts `<AgentChatDrawer>` at the layout root per L48.
- Frontend test-suite green; tests cover: drawer mount, opening/closing, SSE stream decoding (mock fetch), text message rendering, tool-call card collapse/expand, abort button calling abort endpoint.
- **Verification surface for Alex:** click-and-play. Click the global header icon → drawer opens → type "list my workflows" → assistant turn streams in → tool-call card renders for `listLibraryWorkflows` → click expand reveals JSON. Click Abort mid-stream → "Aborted" pill appears. Close drawer + reopen → conversation history reloads.

### Milestone E — File drop in composer + source.upload integration + canvas reactivity (US-212 → US-217)

- `composer/FileDropZone.tsx` per L46 + `composer/useQueuedFiles.ts` per L47.
- `useSourceUploadForChat.ts` — wraps Phase 8's source-upload mutation.
- `runtime/tanstack-invalidator.ts` — query-key invalidation table per L49.
- Wire `ClaudeAgentSDKRuntime` to invoke the invalidator on every `tool-call-complete` SSE event.
- `AgentComposer` grows file-drop affordance.
- Mid-stream navigation logic per L48 — on `tool-call-complete` for `createWorkflow`, frontend calls `useNavigate()` to `/workflows/create-v2?id=<new>`.
- Frontend test-suite green; tests cover: file drop with existing `source.upload`, file drop with no source node (queue + drain after `addNode`), file drop with no workflow (createWorkflow → navigate → addNode → drain), canvas invalidation observable after each write tool.
- **Verification surface for Alex:** click-and-play. Open chat on `/workflows`, type "build me a workflow that extracts text from PDFs", drop a sample PDF in the composer. Watch: agent creates workflow → app navigates to `/workflows/create-v2?id=<new>` → agent adds `source.upload` + downstream nodes → file uploads to the new source node → canvas renders all this live as each tool fires.

### Milestone F — Iteration-loop polish + dynamic-node escape hatch + structured error rendering (US-218 → US-223)

- System-prompt update at `prompts/workflow-builder.md` adding the explicit dynamic-node-escape-hatch wording from L40 (already in the prompt; this milestone is a verification that the agent actually follows it).
- `messages/AgentToolCallCard.tsx` — render structured `error.body` for dynamic-node `ParseError[]` (line + column + stage + message in a styled list).
- `messages/AgentToolCallCard.tsx` — render structured binding-walk errors with the ctx-key / node-id highlighted.
- `agent.service.ts` — title generation per L52 (side `query()` call on first user message, store on `ChatConversation.title`).
- `agent.service.ts` — `claudeSessionId` lifecycle per L39 (capture on first turn, resume on subsequent, replay fallback on session-not-found).
- `event-translator.ts` — token-usage capture per L53.
- Conversation list in `AgentChatDrawer` header — collapsible panel showing recent conversations per workflow, click to switch.
- Frontend + backend test-suites green; tests cover: title backfill, resume flow, replay-fallback flow, ParseError card rendering with line markers, binding-walk error card highlighting.
- **Verification surface for Alex:** click-and-play. Drive an iteration that forces the dynamic-node path (e.g. "transform this OCR result with a function the catalog doesn't have"). Observe agent drafts TS in chat → publishDynamicNode card shows red on first attempt with line-anchored errors → agent revises → second publishDynamicNode succeeds → agent swaps in the new `dyn.<slug>` node → re-runs → preview-cache surfaces the new result.

### Milestone G — End-to-end Playwright walkthrough + verification artefacts (US-224)

- New Playwright script at `/tmp/wb-phase7-verify/walkthrough.mjs` driving the eight verification scenarios from AI_AGENT_DESIGN.md §11:
  1. Greenfield workflow build.
  2. File drop populates source.upload.
  3. Run + iterate via getNodeStatuses + getPreviewCache.
  4. Dynamic-node escape hatch fires + revises after ParseError.
  5. Canvas reflects every write within one tick.
  6. Abort interrupts the stream cleanly + leaves conversation resumable.
  7. Resume across drawer reopens preserves history + continues the SDK session.
  8. Zero `pageerror` events.
- Screenshots at `/tmp/wb-phase7-verify/01-*.png` → `08-*.png`.
- `SESSION_HANDOFF.md` updated with Phase 7 close-out summary.
- README + per-story checkbox sweep.
- No new implementation code expected in this milestone unless the walkthrough surfaces a bug.
- **Verification surface for Alex:** the walkthrough is the verification surface. Pass = all 8 scenarios pass, 0 pageerrors, screenshots in place.

---

## 7. Open questions left to kickoff (none blocking)

None. All design questions resolved during the brainstorming round + this requirements pass. The locked decisions above cover the full Phase 7.0 surface. Any kickoff-time questions surface naturally as the agent prompts the user for missing inputs (e.g., "no file attached yet — please drop one in chat") and are not pre-decisions for this doc.

---

## 8. Verification — Milestone G acceptance

Per AI_AGENT_DESIGN.md §11. The Phase 7 close criterion is:

- **All 8 scenarios pass** in the walkthrough script.
- **Zero `pageerror` events** during the run.
- **Screenshots preserved** at `/tmp/wb-phase7-verify/01-*.png` → `08-*.png`.
- **Walkthrough script preserved** at `/tmp/wb-phase7-verify/walkthrough.mjs` plus `summary.json`.
- **SESSION_HANDOFF.md** updated with the phase-close one-liner per the established cadence (Phase 4 / 6 / 8 closing format).
- **No regressions** in pre-Phase-7 test counts: `packages/graph-workflow` ≥ 765; `apps/backend-services` ≥ 2388 (the 13 pre-existing failures stay unchanged); `apps/temporal` ≥ 1052; `apps/frontend` ≥ 1205. New tests landing across Milestones A → F push these counts up.

---

## 9. Companion documents

- [AI_AGENT_DESIGN.md](../../docs-md/workflow-builder/AI_AGENT_DESIGN.md) — authoritative design; this requirements doc is its structured locked-decisions counterpart.
- [DYNAMIC_NODES_DESIGN.md](../../docs-md/workflow-builder/DYNAMIC_NODES_DESIGN.md) — Phase 6; the dynamic-node escape-hatch contract the agent reads.
- [DOCUMENT_SOURCES_DESIGN.md](../../docs-md/workflow-builder/DOCUMENT_SOURCES_DESIGN.md) — Phase 8; the source.upload primitive reused for chat file-drop.
- [TRY_IN_PLACE_DESIGN.md](../../docs-md/workflow-builder/TRY_IN_PLACE_DESIGN.md) — Phase 4; the run + status + preview-cache substrate the agent iteration loop reads.
- [TYPED_IO_DESIGN.md](../../docs-md/workflow-builder/TYPED_IO_DESIGN.md) — Phase 3; the binding-walk error format the agent revises against.
- [IMPLEMENTATION_PLAN.md](../../docs-md/workflow-builder/IMPLEMENTATION_PLAN.md) §5 Phase 7 — the original plan entry.
- [SESSION_HANDOFF.md](../../docs-md/workflow-builder/SESSION_HANDOFF.md) — current branch state at the start of Phase 7.
- [feature-docs/20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md](../20260601-workflow-builder-phase6-dynamic-nodes/REQUIREMENTS.md) — predecessor; structural model for this doc.
