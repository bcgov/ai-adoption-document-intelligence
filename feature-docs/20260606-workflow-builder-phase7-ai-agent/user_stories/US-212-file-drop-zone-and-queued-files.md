# US-212: `FileDropZone` composer overlay + `useQueuedFiles` queue

**As a** frontend engineer wiring chat-side file intake,
**I want** a drop-zone overlay on the composer plus a queue hook holding files that haven't been uploaded yet,
**So that** the user can drag a PDF into the chat and the file is captured in frontend state until the right `source.upload` node exists to receive it.

## Acceptance Criteria

- [x] **Scenario 1**: `FileDropZone` overlays the composer on dragenter
    - **Given** `agent-chat/composer/FileDropZone.tsx`
    - **When** a user drags a file over the composer
    - **Then** an overlay (Mantine `<Paper>` with a dashed border) appears with "Drop files to attach"
    - **And** the overlay disappears on dragleave or drop
    - **And** the overlay does NOT trigger on dragenter over child elements (use `dragcounter` pattern to avoid flicker)

- [x] **Scenario 2**: `useQueuedFiles` exposes queue state
    - **Given** `agent-chat/composer/useQueuedFiles.ts`
    - **When** read after the change
    - **Then** it exports `useQueuedFiles()` returning `{ queue: QueuedFile[], enqueue(file: File), drain(): QueuedFile[], clear() }`
    - **And** `QueuedFile = { id: string, filename: string, mimeType: string, sizeBytes: number, blob: File }`
    - **And** the queue is conversation-scoped (cleared when conversation changes) — stored in the Zustand store from US-207

- [x] **Scenario 3**: Drop event enqueues files
    - **Given** the FileDropZone mounted in the composer
    - **When** the user drops one or more files
    - **Then** each file is enqueued via `useQueuedFiles().enqueue(file)`
    - **And** a file-pill (small Mantine `<Badge>`) appears in the composer showing filename + size for each queued file
    - **And** clicking the pill's X removes that single file from the queue

- [x] **Scenario 4**: Send-with-attachments includes queue metadata in the request
    - **Given** the user types a message + has queued files + clicks send
    - **When** `useAgentChatSend.send(message)` fires
    - **Then** the request body's `attachments` array carries `[{ filename, mimeType, size }]` for each queued file (NOT the bytes — bytes upload separately per US-213/214)
    - **And** the queue is NOT drained yet — drain happens only after upload succeeds

- [x] **Scenario 5**: Component + hook tests
    - **Given** `FileDropZone.spec.tsx` + `useQueuedFiles.spec.ts`
    - **When** run via `npm test`
    - **Then** tests cover: drag over shows overlay, drop enqueues, multiple files enqueue independently, pill click removes single file, send-time `attachments` metadata included, drain returns + leaves empty queue, clear empties

## Priority
- [ ] High (Must Have)

## Files modified / created

- `apps/frontend/src/features/workflow-builder/agent-chat/composer/FileDropZone.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/FileDropZone.spec.tsx` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/useQueuedFiles.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/useQueuedFiles.spec.ts` — new
- `apps/frontend/src/features/workflow-builder/agent-chat/composer/AgentComposer.tsx` — mount `<FileDropZone>` overlay
- `apps/frontend/src/features/workflow-builder/agent-chat/useAgentChatSend.ts` — include `attachments` metadata in request body
- `apps/frontend/src/features/workflow-builder/agent-chat/state/agentChatStore.ts` — add `queuedFiles` slice

## Technical notes

- Per L46 + L47 in REQUIREMENTS.md.
- Files are NOT uploaded in this story — they just sit in the queue + the request body carries metadata about them. Upload (which depends on having a target source-node id) lands in US-213/214.
- The drop overlay's visual style should match Mantine's existing dropzone patterns where possible (re-use `<Dropzone>` if it slots cleanly).
