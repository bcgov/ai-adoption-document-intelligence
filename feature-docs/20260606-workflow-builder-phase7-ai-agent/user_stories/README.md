NOTE: The requirements document for this feature is available here: `../REQUIREMENTS.md`.

All user story files are located in `./` (this folder).

Read both the requirements document and individual user story files for implementation details.

After implementing the user story check it off at the bottom of this file.

**Numbering note:** Phase 6 closed at US-186 (Dynamic Nodes — Windmill-style). Phase 7 numbering continues from US-187. Phase 7 introduces no new workflow primitives — it adds the AI orchestration layer over the Phase 1–8 substrate.

## Milestone A — Backend module shell + Prisma + system prompt + SDK install (US-187 to US-191) -- HIGH priority

| File | Title |
|---|---|
| [US-187-sdk-install-and-agent-module-shell.md](./US-187-sdk-install-and-agent-module-shell.md) | Claude Agent SDK install + `AgentModule` shell + env-var validation |
| [US-188-chat-conversation-prisma-models.md](./US-188-chat-conversation-prisma-models.md) | `ChatConversation` + `ChatMessage` Prisma models + migration |
| [US-189-chat-repositories.md](./US-189-chat-repositories.md) | `ChatConversationRepository` + `ChatMessageRepository` with real-DB tests |
| [US-190-tool-registry-singleton.md](./US-190-tool-registry-singleton.md) | `ToolRegistry` singleton + `ToolDefinition` shape |
| [US-191-system-prompt-and-pointer.md](./US-191-system-prompt-and-pointer.md) | System prompt at `prompts/workflow-builder.md` + `.claude/agents/` pointer |

## Milestone B — Backend tools + in-process MCP server + read-only chat endpoint (US-192 to US-197) -- HIGH priority

| File | Title |
|---|---|
| [US-192-catalog-read-tools.md](./US-192-catalog-read-tools.md) | Catalog read tools — `listActivityCatalog` + `listSourceCatalog` + `listLibraryWorkflows` |
| [US-193-workflow-and-dynamic-node-and-source-read-tools.md](./US-193-workflow-and-dynamic-node-and-source-read-tools.md) | Workflow + dynamic-node + source-attachment read tools |
| [US-194-run-read-tools.md](./US-194-run-read-tools.md) | Run read tools — `getRunSpec` + `getNodeStatuses` + `getPreviewCache` + `listRunHistory` |
| [US-195-mcp-server-factory-and-event-translator.md](./US-195-mcp-server-factory-and-event-translator.md) | `WorkflowMcpServer` factory + minimal event translator (text + done + error) |
| [US-196-agent-service-and-sse-chat-endpoint.md](./US-196-agent-service-and-sse-chat-endpoint.md) | `AgentService` orchestrator + `POST /api/agent/chat` SSE endpoint (read-only) |
| [US-197-conversation-list-and-detail-endpoints.md](./US-197-conversation-list-and-detail-endpoints.md) | `GET /api/agent/conversations` + `GET /api/agent/conversations/:id` endpoints |

## Milestone C — Backend write tools + abort + auto-mode wiring (US-198 to US-204) -- HIGH priority

| File | Title |
|---|---|
| [US-198-workflow-crud-write-tools.md](./US-198-workflow-crud-write-tools.md) | Workflow CRUD write tools — `createWorkflow` + `updateWorkflowMetadata` |
| [US-199-graph-editing-write-tools.md](./US-199-graph-editing-write-tools.md) | Graph-editing write tools — `addNode` + `setNodeParameters` + `connectNodes` + `deleteNode` + `setEntryNode` |
| [US-200-ctx-write-tools.md](./US-200-ctx-write-tools.md) | Ctx write tools — `declareCtx` + `setCtxKind` |
| [US-201-dynamic-node-write-tools.md](./US-201-dynamic-node-write-tools.md) | Dynamic-node write tools — `publishDynamicNode` + `updateDynamicNode` + `deleteDynamicNode` |
| [US-202-run-write-tool.md](./US-202-run-write-tool.md) | Run write tool — `startRun` |
| [US-203-auto-mode-and-full-tool-call-events.md](./US-203-auto-mode-and-full-tool-call-events.md) | Auto-mode wiring + full tool-call event translation |
| [US-204-abort-and-delete-endpoints.md](./US-204-abort-and-delete-endpoints.md) | Abort endpoint + DELETE conversation endpoint + cancellation flag map |

## Milestone D — Frontend chat drawer + assistant-ui runtime adapter + global header icon (US-205 to US-211) -- HIGH priority

| File | Title |
|---|---|
| [US-205-assistant-ui-install-and-feature-dir.md](./US-205-assistant-ui-install-and-feature-dir.md) | `@assistant-ui/react` install + feature directory shell |
| [US-206-claude-agent-sdk-runtime-adapter.md](./US-206-claude-agent-sdk-runtime-adapter.md) | `ClaudeAgentSDKRuntime` adapter + SSE stream parser |
| [US-207-agent-chat-drawer-and-header.md](./US-207-agent-chat-drawer-and-header.md) | `AgentChatDrawer` + `AgentChatHeader` + drawer-at-layout-root mount |
| [US-208-agent-chat-icon-in-global-header.md](./US-208-agent-chat-icon-in-global-header.md) | `AgentChatIcon` in global app header |
| [US-209-agent-chat-thread-and-message-components.md](./US-209-agent-chat-thread-and-message-components.md) | `AgentChatThread` + text + tool-call + error message components |
| [US-210-agent-composer-and-chat-send-mutation.md](./US-210-agent-composer-and-chat-send-mutation.md) | `AgentComposer` (text-only) + `useAgentChatSend` SSE mutation hook |
| [US-211-abort-button-and-conversation-hooks.md](./US-211-abort-button-and-conversation-hooks.md) | `AgentAbortButton` + conversation list/history TanStack hooks |

## Milestone E — File drop in composer + source.upload integration + canvas reactivity (US-212 to US-217) -- HIGH priority

| File | Title |
|---|---|
| [US-212-file-drop-zone-and-queued-files.md](./US-212-file-drop-zone-and-queued-files.md) | `FileDropZone` composer overlay + `useQueuedFiles` queue |
| [US-213-source-upload-for-chat-and-target-resolution.md](./US-213-source-upload-for-chat-and-target-resolution.md) | `useSourceUploadForChat` + file-drop target resolution |
| [US-214-drain-queue-on-add-node.md](./US-214-drain-queue-on-add-node.md) | Drain queue on agent `addNode({ type: 'source.upload' })` |
| [US-215-tanstack-invalidator-for-canvas-reactivity.md](./US-215-tanstack-invalidator-for-canvas-reactivity.md) | TanStack invalidator table + wire to runtime adapter for canvas live reactivity |
| [US-216-mid-stream-navigation-on-create-workflow.md](./US-216-mid-stream-navigation-on-create-workflow.md) | Mid-stream navigation on agent `createWorkflow` |
| [US-217-milestone-e-end-to-end-smoke.md](./US-217-milestone-e-end-to-end-smoke.md) | Milestone E end-to-end manual smoke |

## Milestone F — Iteration-loop polish + dynamic-node escape hatch + structured error rendering (US-218 to US-223) -- HIGH priority

| File | Title |
|---|---|
| [US-218-conversation-title-generation.md](./US-218-conversation-title-generation.md) | Conversation title generation via side `query()` call |
| [US-219-claude-session-id-lifecycle.md](./US-219-claude-session-id-lifecycle.md) | `claudeSessionId` lifecycle — capture + resume + replay-fallback |
| [US-220-token-usage-capture.md](./US-220-token-usage-capture.md) | Token-usage capture per assistant turn |
| [US-221-parse-error-rendering-in-tool-call-card.md](./US-221-parse-error-rendering-in-tool-call-card.md) | `ParseError[]` rendering in `AgentToolCallCard` for dynamic-node publish failures |
| [US-222-binding-walk-error-rendering.md](./US-222-binding-walk-error-rendering.md) | Binding-walk error rendering in `AgentToolCallCard` |
| [US-223-conversation-switcher-panel.md](./US-223-conversation-switcher-panel.md) | Conversation switcher panel in drawer header |

## Milestone G — End-to-end verification (US-224) -- HIGH priority

| File | Title |
|---|---|
| [US-224-end-to-end-playwright-verification.md](./US-224-end-to-end-playwright-verification.md) | End-to-end Playwright walkthrough — Phase 7 AI workflow builder |

## Suggested Implementation Order (by dependency chain)

Phase 7 has a clear front-to-back backbone: backend module shell (Milestone A) → backend tools + read-only SSE chat (Milestone B) → backend write tools + auto-mode + abort (Milestone C) → frontend chat drawer + runtime adapter (Milestone D) → file drop + canvas reactivity + mid-stream nav (Milestone E) → iteration-loop polish + structured error rendering + conversation switcher (Milestone F) → end-to-end verification (Milestone G). Within each milestone, several stories can land in parallel after their shared foundation lands.

**Vite-restart points (per the workflow-builder cadence):**
- After US-205 (`@assistant-ui/react` install): Vite needs `optimizeDeps` refresh — ask Alex to restart.
- No other Vite restarts needed across Milestones A–G (everything else builds on existing exports).

**Backend-restart points:**
- After US-191 (system prompt file): prompt is cached at first read — restart to pick up edits to `workflow-builder.md` AFTER initial commit.
- After US-187 (env-var loading): restart so `ANTHROPIC_API_KEY` is picked up.

### Phase 1 — Backend module shell (Milestone A — Backend-restart point after US-187 + US-191)
- [x] **US-187** (SDK install + AgentModule shell + env-var validation) — foundation; everything in Milestone A depends on it
- [x] **US-188** (Prisma models + migration) — independent of US-187; can land in parallel
- [x] **US-189** (chat repositories) — depends on US-188
- [x] **US-190** (ToolRegistry singleton) — depends on US-187
- [x] **US-191** (system prompt + pointer) — depends on US-187; closes Milestone A

### Phase 2 — Backend tools + read-only chat (Milestone B — depends on Phase 1)
- [x] **US-192** (catalog read tools) — depends on US-190
- [x] **US-193** (workflow + dynamic-node + source read tools + new `listAttachments` service method) — depends on US-190
- [x] **US-194** (run read tools) — depends on US-190
- [x] **US-195** (MCP server factory + minimal translator) — depends on US-187, US-190, US-192/193/194
- [x] **US-196** (AgentService + POST /api/agent/chat SSE) — depends on US-189, US-191, US-195
- [x] **US-197** (list + detail endpoints) — depends on US-189; closes Milestone B

### Phase 3 — Backend write tools + auto-mode + abort (Milestone C — depends on Phase 2)
- [x] **US-198** (workflow CRUD write tools) — depends on Milestone B
- [x] **US-199** (graph-editing write tools) — depends on US-198
- [x] **US-200** (ctx write tools) — depends on US-199
- [x] **US-201** (dynamic-node write tools) — depends on Milestone B; can land in parallel with US-199/200
- [x] **US-202** (run write tool — startRun) — depends on Milestone B
- [x] **US-203** (auto-mode wiring + full tool-call events) — depends on US-198 → US-202
- [x] **US-204** (abort + DELETE endpoints + flag map) — depends on US-196 + US-203; closes Milestone C

### Phase 4 — Frontend chat drawer + runtime adapter (Milestone D — Vite-restart point after US-205 — depends on Phase 3)
- [x] **US-205** (assistant-ui install + feature dir) — foundation; Vite restart after this
- [x] **US-206** (runtime adapter + SSE parser) — depends on US-205
- [x] **US-207** (drawer + header shell + drawer-at-layout-root mount) — depends on US-205
- [x] **US-208** (AgentChatIcon in global header) — depends on US-207
- [x] **US-209** (Thread + text / tool-call / error message components) — depends on US-206 + US-207
- [x] **US-210** (composer + useAgentChatSend SSE mutation) — depends on US-206 + US-207 + US-209
- [x] **US-211** (abort button + conversation hooks + history reload) — depends on US-210; closes Milestone D

### Phase 5 — File drop + canvas reactivity + mid-stream nav (Milestone E — depends on Phase 4)
- [x] **US-212** (FileDropZone + useQueuedFiles queue) — depends on Milestone D
- [x] **US-213** (useSourceUploadForChat + target resolution) — depends on US-212
- [x] **US-214** (drain queue on agent addNode) — depends on US-213
- [x] **US-215** (TanStack invalidator table + runtime subscription) — depends on US-206
- [x] **US-216** (mid-stream navigation on createWorkflow) — depends on US-215
- [x] **US-217** (Milestone E end-to-end smoke) — depends on US-212 → US-216; closes Milestone E

### Phase 6 — Iteration-loop polish + structured errors + switcher (Milestone F — depends on Phase 5)
- [x] **US-218** (conversation title generation) — depends on Milestone C
- [x] **US-219** (claudeSessionId lifecycle — capture + resume + replay-fallback) — depends on Milestone C
- [x] **US-220** (token-usage capture) — depends on Milestone C
- [x] **US-221** (ParseError[] rendering in tool-call card) — depends on US-209 + US-201
- [x] **US-222** (binding-walk error rendering) — depends on US-209 + US-199/US-200
- [x] **US-223** (conversation switcher panel) — depends on US-211; closes Milestone F

### Phase 7 — End-to-end Playwright verification (Milestone G — depends on Phase 6)
- [x] **US-224** (Playwright walkthrough — 8 scenarios + SESSION_HANDOFF closeout) — depends on all prior phases

> Stories are ordered by dependency chain for automated implementation.
> Each story should be implementable after all stories in previous phases are complete.
> Do not start a phase until all stories in prior phases are checked off.
