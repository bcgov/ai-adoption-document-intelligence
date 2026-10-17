# US-214: Drain queue on agent `addNode({ type: 'source.upload' })`

**As a** frontend engineer covering the "agent creates the source node first" case,
**I want** a runtime-event listener that watches for `tool-call-complete` events naming `addNode` with `source.upload` and drains the queued-files into that new node,
**So that** when a user drops a file into chat on a workflow without an upload source, the agent's first move (`addNode`) automatically triggers the upload + the user doesn't have to retry.

## Acceptance Criteria

- [x] **Scenario 1**: `useDrainQueueOnAddNode` listens to runtime events
    - **Given** `agent-chat/composer/useDrainQueueOnAddNode.ts`
    - **When** read after the change
    - **Then** it subscribes to the runtime's stream of `tool-call-complete` events
    - **And** on each event, if `name === 'addNode' && output.node.type === 'source.upload' && queue.length > 0`, the hook iterates the queue and uploads each file to the newly-added `source.upload` node id

- [x] **Scenario 2**: After upload completes, queue is drained
    - **Given** a successful drain
    - **When** all queued files upload
    - **Then** `useQueuedFiles.drain()` is called + the queue empties
    - **And** for each file, the synthetic system message from US-213 fires ("User attached X to source node 'Y'")
    - **And** the next outbound message's `attachments` metadata includes the now-uploaded file refs

- [x] **Scenario 3**: Upload failure leaves the file in the queue
    - **Given** an upload that fails (e.g. MIME mismatch — Phase 8 validation)
    - **When** the drain attempts that file
    - **Then** the file stays in the queue + its pill renders red with the error message tooltip
    - **And** the user can re-trigger the drain via a "Retry" affordance OR the next `addNode` event re-attempts

- [x] **Scenario 4**: Hook mounted in the drawer
    - **Given** `AgentChatDrawer.tsx`
    - **When** read after the change
    - **Then** the drawer invokes `useDrainQueueOnAddNode()` once at mount
    - **And** the listener is torn down on unmount (cleanup)

- [x] **Scenario 5**: Tests cover the drain flow
    - **Given** `useDrainQueueOnAddNode.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: addNode complete event with source.upload + queued file → upload fires, addNode complete event with non-source-upload type → no upload, multiple queued files all upload, upload error keeps file in queue, drain runs only once per addNode event (not on every re-render)

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/composer/useDrainQueueOnAddNode.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/useDrainQueueOnAddNode.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/AgentChatDrawer.tsx` — invoke the hook

## Technical notes

- Per L47.c + L47.d in REQUIREMENTS.md.
- Depends on US-213 (resolver + upload mutation).
- The runtime needs to expose a tool-call-complete subscription — extend `ClaudeAgentSDKRuntime` from US-206 with a small EventEmitter-style subscribe API if it doesn't already have one.
- This is the load-bearing piece for the "drop a file with no workflow + ask the agent to do something" UX.
