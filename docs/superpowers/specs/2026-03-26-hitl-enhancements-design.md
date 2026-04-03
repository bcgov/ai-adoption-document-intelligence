# HITL Interface Enhancements Design Spec

**Date:** 2026-03-26
**Branch:** hitl-enhancements
**Approach:** Incremental enhancement — each feature built as an independent layer on top of existing architecture using polling/REST (no WebSocket infrastructure).

---

## 1. Document Locking & Multi-User Queue

### Goal
Allow multiple reviewers to work through the same queue without conflicts. Documents are pessimistically locked when a session starts and hidden from other users' queues.

### Database

New `DocumentLock` model:

```prisma
model DocumentLock {
  id            String   @id @default(cuid())
  document_id   String   @unique
  document      Document @relation(fields: [document_id], references: [id])
  reviewer_id   String
  session_id    String
  session       ReviewSession @relation(fields: [session_id], references: [id])
  acquired_at   DateTime @default(now())
  last_heartbeat DateTime @default(now())
  expires_at    DateTime
  @@map("document_locks")
}
```

- Lock TTL: 10 minutes from last heartbeat.
- `document_id` is unique — only one lock per document at a time.

### Backend

- **Lock acquisition:** Automatic when a session is created via `POST /sessions`. Lock and session creation are atomic (single transaction).
- **Lock release:** Automatic on approve/skip/escalate/close.
- **Heartbeat endpoint:** `POST /sessions/:id/heartbeat` — extends `last_heartbeat` and `expires_at`. Called by frontend every 60 seconds.
- **Queue filtering:** `GET /queue` excludes documents where a non-expired lock exists (`expires_at > now()`). Lazy cleanup — no background cron needed.
- **Same user, same document:** If a reviewer already has an active session+lock on a document, return the existing session (idempotent).

### Frontend

- `useSessionHeartbeat` hook: sends heartbeat every 60 seconds while a session is open.
- Idle detection: tracks user interaction (keystroke, click, mouse move). After 8 minutes of inactivity, show warning toast: "Session will be released in 2 minutes due to inactivity." Any interaction resets the idle timer.
- On lock expiry (heartbeat returns 409 or lock-expired error): show modal "Session expired due to inactivity. Your corrections have been saved." Redirect to queue page.
- Browser tab close: lock expires naturally via TTL (heartbeat stops, lock times out).

---

## 2. Undo System

### Field-Level Undo (Corrections)

**Unsaved changes (in-memory):**
- Maintain an undo stack (array of `{field_key, previous_value}`) in the review session hook.
- Every field edit pushes the previous state onto the stack.
- `Ctrl+Z` pops the stack and restores the previous value.
- Redo stack (`Ctrl+Shift+Z`) holds popped items.

**Submitted corrections (persisted):**
- New endpoint: `DELETE /sessions/:id/corrections/:correctionId` — removes a persisted correction, reverting the field to its original OCR value.
- After corrections are submitted, their IDs are pushed onto the undo stack so `Ctrl+Z` can reach back to undo server-side corrections.
- Undo stack is per-session, cleared on navigation away.

### Session-Level Undo (Reopen Approved/Escalated Sessions)

New endpoint: `POST /sessions/:id/reopen`

**Mode detection:** The endpoint determines the mode by checking whether the session's document has any associated ground truth dataset records. If it does, dataset labeling rules apply; otherwise, regular workflow rules apply.

**Regular workflow mode (no associated ground truth dataset):**
- Allowed within 5 minutes of `completed_at`.
- Returns 409 if the window has passed.

**Dataset labeling mode (document linked to a ground truth dataset):**
- Allowed any time unless the dataset containing this document's ground truth is locked for benchmarking.
- Checks `GroundTruthDataset.locked` status — returns 409 if locked.

**Reopen behavior:**
- Sets status back to `in_progress`, clears `completed_at`.
- Re-acquires the document lock.
- Only the reviewer who completed the session can reopen it (checked via `reviewer_id`).
- Audit log records the reopen event.

### Frontend

- After approval/escalation/skip, show a persistent toast: "Document approved. Undo?" with countdown (5 min for workflow) or persistent button (dataset labeling).
- Toast persists across auto-advance into the next document.
- `Ctrl+Z` triggers field undo when there are field edits to undo, or session undo when the toast is visible and the field undo stack is empty.

---

## 3. Keyboard Shortcuts

All shortcuts use modifier keys (VS Code style). Destructive actions (approve, escalate, skip) work regardless of focus state. Navigation shortcuts are inactive when a text input is focused (except `Escape`).

| Shortcut | Action | Context |
|----------|--------|---------|
| `Ctrl+Down` / `Ctrl+Up` | Navigate to next/prev field | When not editing |
| `Ctrl+Enter` | Approve document | **Always** |
| `Ctrl+Shift+E` | Escalate document | **Always** |
| `Ctrl+Shift+S` | Skip document | **Always** |
| `Ctrl+Z` | Undo last change / undo approval | **Always** |
| `Ctrl+Shift+Z` | Redo | **Always** |
| `Enter` | Start editing focused field / confirm edit | Field focused |
| `Escape` | Cancel current edit, restore original value | **Always** |
| `Tab` / `Shift+Tab` | Commit edit, move to next/prev field | While editing |
| `Ctrl+Shift+V` | Toggle full document / snippet view | **Always** |
| `Ctrl+Shift+O` | Toggle field sort order | **Always** |
| `Ctrl+/` | Show/hide keyboard shortcuts overlay | **Always** |

### Implementation

- Populate the existing `useKeyboardShortcuts` hook with a registry pattern: each shortcut registered with handler, context condition, and enabled flag.
- `KeyboardManager` component wraps the review workspace, attaches a single `keydown` listener on the document.
- Shortcuts overlay (`Ctrl+/`): floating panel listing all available shortcuts.

---

## 4. Zoom-to-Field Navigation

**Applies to:** Full document view (canvas) only. Not applicable in snippet view.

### Behavior

- When the user navigates to a field (via keyboard or click in field panel), the `AnnotationCanvas` pans and zooms to center on the field's bounding box.
- Fixed zoom level (e.g., 2x). If the field's bounding box doesn't fit at the fixed zoom level, zoom out just enough to contain it with padding.
- Smooth animated transition (~200ms ease).
- Focused field's bounding box gets a highlight overlay (pulse animation on focus, then steady border).
- Fields without `boundingRegions`: no pan/zoom action, just highlight in the field panel.

### Implementation

- New `useFieldFocus` hook coordinating between `FieldPanel` and `AnnotationCanvas`.
- On active field change, compute center point from `boundingRegions[0].polygon`.
- `AnnotationCanvas` exposes a `panTo(x, y, zoom)` method via ref.
- Highlight overlay rendered as a canvas layer on top of bounding box regions.

---

## 5. Field Sorting by Confidence

### Behavior

- Sort toggle button in the `FieldPanel` header with icon indicating current mode.
- Two modes:
  - **Confidence** (lowest first) — default.
  - **Document order** (order fields appear in OCR output).
- Keyboard shortcut: `Ctrl+Shift+O` toggles between modes.
- Sort preference stored in local component state (not persisted to backend).

---

## 6. Auto-Advance on Completion

### Goal
After approve, skip, or escalate, immediately load the next document without manual navigation.

### Backend

New endpoint: `POST /sessions/next`

- Atomically: finds the next unlocked document in the queue (respecting current filters), creates a session, and acquires the lock.
- Accepts the same filter parameters as `GET /queue` (group_id, maxConfidence, modelId, etc.).
- Returns the new session with document data, or 404 if queue is empty.
- Prevents race conditions where two reviewers grab the same document via separate GET + POST calls.

### Frontend

- `useAutoAdvance` hook: called on successful approve/skip/escalate mutation.
- Calls `POST /sessions/next` with current queue filters.
- On success: navigates to the new session's review workspace.
- On 404 (empty queue): redirects to queue page with toast "No more documents to review."
- Brief loading indicator during transition.

---

## 7. Cropped Snippet View (Alternative View Mode)

### Goal
An alternative to the full document canvas where each field is shown alongside a cropped image snippet of its source region. For reviewers who don't need to see the whole document.

### Layout

- Vertical scrollable list of field rows.
- Each row: cropped document region on the left, field name + editable value + confidence badge on the right.
- Rows ordered by active sort mode (confidence or document order).
- Active/focused field row is visually highlighted.

### Cropping

- Use `boundingRegions[0].polygon` to compute a crop rectangle from the document image.
- Add padding around the bounding box (~20% of box dimensions) for context.
- Crop performed client-side from the already-loaded canvas image — no backend changes.
- Fields without bounding regions: show placeholder text "No source region available" instead of a snippet.

### Implementation

- New `SnippetView` component as a sibling to the existing canvas-based view in `ReviewWorkspacePage`.
- `viewMode` state: `'document'` | `'snippet'` — toggled via toolbar button or `Ctrl+Shift+V`.
- Field navigation (`Ctrl+Down`/`Ctrl+Up`) scrolls to and focuses the relevant row in snippet view.
- All editing, undo, and keyboard shortcuts work identically in both views.
- Approve/skip/escalate actions work the same regardless of view mode.

---

## Files Affected

### Backend (apps/backend-services)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `DocumentLock` model, add relation to `ReviewSession` |
| `src/hitl/hitl.controller.ts` | Add heartbeat, reopen, delete-correction, next-session endpoints |
| `src/hitl/hitl.service.ts` | Add locking logic, reopen logic, auto-advance logic |
| `src/hitl/review-db.service.ts` | Add lock CRUD, correction deletion, atomic next-document query |
| `src/hitl/dto/` | New DTOs for heartbeat, reopen, next-session requests/responses |
| New migration | `DocumentLock` table creation |

### Frontend (apps/frontend)

| File | Change |
|------|--------|
| `features/annotation/core/keyboard/useKeyboardShortcuts.ts` | Implement shortcut registry |
| `features/annotation/core/keyboard/KeyboardManager.tsx` | Implement keydown listener |
| `features/annotation/hitl/hooks/useReviewSession.ts` | Add undo stack, redo stack, field undo/redo logic |
| `features/annotation/hitl/hooks/useSessionHeartbeat.ts` | New — heartbeat + idle detection |
| `features/annotation/hitl/hooks/useAutoAdvance.ts` | New — auto-advance on completion |
| `features/annotation/hitl/hooks/useFieldFocus.ts` | New — coordinate field selection with canvas pan/zoom |
| `features/annotation/hitl/components/SnippetView.tsx` | New — cropped snippet alternative view |
| `features/annotation/hitl/components/ShortcutsOverlay.tsx` | New — keyboard shortcuts help panel |
| `features/annotation/hitl/pages/ReviewWorkspacePage.tsx` | Add view mode toggle, integrate new hooks |
| `features/annotation/core/canvas/AnnotationCanvas.tsx` | Expose `panTo()` method, add animated transitions |
| `features/annotation/core/field-panel/FieldPanel.tsx` | Add sort toggle, integrate field focus |
| `features/annotation/hitl/components/ReviewToolbar.tsx` | Add view toggle and sort toggle buttons |
