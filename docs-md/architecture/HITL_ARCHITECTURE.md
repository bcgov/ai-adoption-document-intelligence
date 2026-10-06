# Human-In-The-Loop (HITL) Architecture

## Overview

The Human-In-The-Loop (HITL) system provides a workflow for human reviewers to validate and correct OCR-extracted data from documents. The system is built around the concept of **review sessions** - bounded, temporal interactions where one reviewer reviews one document.

## Core Concepts

### What is a Review Session?

A **review session** represents a single, complete review interaction with these characteristics:

- **Bounded scope**: One document, one reviewer, one continuous interaction
- **Stateful lifecycle**: Clear progression through defined states (in progress → completed)
- **Trackable**: Records timestamps, actions taken, and corrections made
- **Atomic unit of work**: Contains all corrections and decisions for that review instance

The term "session" emphasizes this is a **temporary, interactive state** rather than a permanent relationship. Once a session reaches a terminal state (approved/flagged/abandoned), that review is complete.

### Session vs Document

- **Document**: Permanent record of the uploaded file and its OCR results
- **Session**: Temporary review context - multiple sessions can exist for the same document
- A document can have multiple sessions over time (e.g., initial review, re-review after a flag)
- Each session is independent and creates its own audit trail

## Data Model

### Database Schema

```prisma
model ReviewSession {
  id           String            @id @default(cuid())
  document_id  String
  document     Document          @relation(fields: [document_id], references: [id], onDelete: Cascade)
  actor_id     String
  actor        Actor             @relation(fields: [actor_id], references: [id])
  status       ReviewStatus      @default(in_progress)
  started_at   DateTime          @default(now())
  completed_at DateTime?
  flag_note    String?
  corrections  FieldCorrection[]
  lock         DocumentLock?

  @@map("review_sessions")
}

model FieldCorrection {
  id              String           @id @default(cuid())
  session_id      String
  session         ReviewSession    @relation(fields: [session_id], references: [id], onDelete: Cascade)
  field_key       String
  original_value  String?
  corrected_value String?
  original_conf   Float?
  action          CorrectionAction @default(confirmed)
  created_at      DateTime         @default(now())
  actor_id        String?
  actor           Actor?           @relation(fields: [actor_id], references: [id])

  @@map("field_corrections")
}

enum ReviewStatus {
  in_progress
  approved
  rejected
  flagged
  abandoned
}

enum CorrectionAction {
  confirmed   // Field was reviewed and is correct
  corrected   // Field value was changed/fixed
  flagged     // Field was flagged for issues
  deleted     // Field should be ignored/deleted
}
```

### Document Locking

```prisma
model DocumentLock {
  id             String        @id @default(cuid())
  document_id    String        @unique
  document       Document      @relation(fields: [document_id], references: [id], onDelete: Cascade)
  reviewer_id    String
  session_id     String        @unique
  session        ReviewSession @relation(fields: [session_id], references: [id], onDelete: Cascade)
  acquired_at    DateTime      @default(now())
  last_heartbeat DateTime      @default(now())
  expires_at     DateTime

  @@index([expires_at])
  @@map("document_locks")
}
```

Document locks prevent concurrent editing:
- A lock is acquired when a session starts (10-minute TTL)
- The frontend sends heartbeat requests to extend the lock
- Locks are released when a session completes (approve/reject/flag/skip)
- Expired locks are automatically treated as released: `findActiveLock` ignores them, and `LockExpiryService` (a cron running every minute) deletes the row, ends any still-`in_progress` session, and records a `review_session_expired` audit event whose payload names the session's new status. A session that carries a flag note goes back to `flagged`, so a document taken over from the Flagged tab returns there with its note and corrections; any other session becomes `abandoned`
- When a heartbeat answers 409 because the lock is gone, the review page says the session was released and returns to the queue; edits not yet saved are lost
- If the same reviewer starts a session on an already-locked document, the existing session is returned
- If a different reviewer tries, a `ConflictException` is thrown

### Key Relationships

- **ReviewSession** is the parent entity linking document, reviewer, and lifecycle state. The reviewer is stored as `actor_id` referencing the `Actor` model (the API layer still exposes it as `reviewerId`); `DocumentLock` keeps a plain `reviewer_id` string. Taking over a flagged session makes it the new reviewer's
- A **rejected** session also keeps why: `rejection_reason`, one of five fixed reasons (`INPUT_QUALITY`, `OCR_FAILURE`, `MODEL_MISMATCH`, `CONFIDENCE_TOO_LOW`, `SYSTEMIC_ERROR`), and an optional `rejection_comment`
- A **flagged** session keeps the note left when it was flagged (`flag_note`). Taking the session over keeps the note; flagging it again replaces it
- **FieldCorrection** records are children - one per field interaction. Each records who made it (`actor_id`), so a session that changed hands credits every correction to the right reviewer. Corrections saved before authors were recorded have no `actor_id`
- **DocumentLock** is a one-to-one relation on both Document and ReviewSession, preventing concurrent edits
- **Cascade delete**: Deleting a session automatically deletes all its corrections and lock
- Sessions track duration via `started_at` and `completed_at` timestamps

## Status Transitions

### State Machine

```
[Create Session] ──→ acquires document lock
      ↓
  in_progress (initial state)
      ↓
   ┌──┴──────────────┬──────────────────┬──────────────────┬────────────────────┐
   ↓                 ↓                  ↓                  ↓                    ↓
approved          rejected           flagged           abandoned            abandoned
(terminal)       (terminal)         (terminal)        (skip, terminal)     (lock expired)
   ↓                 ↓                  ↓                  ↓                    ↓
releases lock   releases lock      releases lock      releases lock        lock deleted
   ↓                 ↓                  ↓                  ↓                    ↓
final             final           Flagged tab,      back to Pending      back to Pending
                                  view-only + Take
                   ↓
              in_progress
```

A lapsed lock on a session that carries a flag note ends it as `flagged`
rather than `abandoned` (see [Transition Rules](#transition-rules)).

### Transition Rules

| From | To | Trigger | Side Effects |
|------|-----|---------|--------------|
| (none) | `in_progress` | `POST /sessions` | Sets `started_at`, acquires document lock |
| `in_progress` | `approved` | `POST /sessions/:id/approve` | Sets `completed_at`, marks document `complete`, releases lock, and signals a workflow parked at a `humanGate` with `approved: true`. Only an in-progress session can be approved; approving twice answers 409 |
| `in_progress` | `rejected` | `POST /sessions/:id/reject` | Sets `completed_at`, stores the required `rejectionReason` and optional comment on the session, marks the document `rejected`, releases lock, and signals a workflow parked at a `humanGate` with `approved: false`. Only an in-progress session can be rejected; rejecting twice answers 409 |
| `in_progress` | `flagged` | `POST /sessions/:id/flag` | Stores the optional `note` as `flag_note`, releases lock; document moves to the Flagged tab, which shows the note |
| `in_progress` | `abandoned` | `POST /sessions/:id/skip` | Releases lock; document returns to the Pending queue |
| `in_progress` | `abandoned` | Lock expiry cron, session has no flag note | Releases lock; document returns to the Pending queue |
| `in_progress` | `flagged` | Lock expiry cron, session carries a flag note | Releases lock; document returns to the Flagged tab with its note and corrections, for the next reviewer to take |
| `flagged` | `in_progress` | `POST /sessions/:id/reopen` | Any member of the group takes the session over: the session and its lock move to them, the flag note stays, and the previous reviewer's corrections stay, still credited to whoever made them |
| `approved` | `in_progress` | `POST /sessions/:id/reopen` | Dataset labeling only, and only while the dataset version is unfrozen. Clears `completed_at`, re-acquires lock, sets document `awaiting_review` |

**Important**: approving a document review is final. It signals the workflow
parked at the `humanGate`, which then runs every node after the gate, and no
request can call that back — reopening one answers 409. Review the document
again by reprocessing it. Rejecting is final in the same way: the document
moves to `rejected`, no queue tab lists it, and the Documents page no longer
offers it for review. Two terminal states do reopen:
- `flagged`, which is a hand-off rather than an ending
- `approved` on a dataset labeling job, which drives nothing downstream and can go back for another pass until its dataset version is frozen

## System Flow

### 1. Queue View Flow

```
User (ReviewQueuePage)
      ↓
GET /api/hitl/queue
  ?group_id=<group>
  &modelId=prebuilt-invoice
  &reviewStatus=pending
      ↓
HitlController.getQueue()
      ↓
HitlService.getQueue()
      ↓
ReviewDbService.findReviewQueue()
      ↓
Returns: Documents with:
  - status = 'awaiting_review' (default; the EXTRACTED /
    ALL filters also admit status = 'extracted')
  - average_confidence, computed on the server
  - workflow_name (null when uploaded without a workflow)
  - lastSession info (if reviewed)
```

**How documents enter the queue:** the queue reads persisted `ocr_results`
rows — it never queries Temporal. Gated seeded workflows therefore persist OCR
before pausing: `checkConfidence → persistOcr (ocr.storeResults) → reviewSwitch
→ humanReview`, where the `humanReview` (humanGate) executor sets the document
to `awaiting_review`. The post-gate `storeResults` node runs the same upsert
again after the reviewer approves, persisting corrected values. (Before
2026-08-01 the templates only stored results after the gate, so paused
documents never appeared in the queue.)

**Queue Filtering:**
- Shows the documents a workflow has sent to review. The queue applies no
  confidence threshold of its own: the workflow's review step decides which
  documents need a person (see [HITL_REVIEW_CRITERIA.md](HITL_REVIEW_CRITERIA.md))
- Can filter by OCR model, review status, pagination
- Excludes documents with active (non-expired) locks held by other reviewers
- Excludes documents that belong to ground truth generation jobs
- Includes last session info for previously reviewed documents
- Gives each document an `average_confidence`, the mean of its fields'
  confidence computed on the server (a field with no score counts as 0), so
  the queue never sends OCR results to the browser

### 2. Start Session Flow

```
User clicks "Review" button
      ↓
POST /api/hitl/sessions
  { documentId: "abc123" }
      ↓
HitlController.startSession()
  (extracts reviewerId from auth token)
      ↓
HitlService.startSession(documentId, reviewerId)
      ↓
ReviewDbService.createReviewSession(documentId, reviewerId)
      ↓
INSERT INTO review_sessions (...)
  (status = 'in_progress', started_at = now)
      ↓
Returns: {
  session: { id, status, started_at, ... },
  document: { id, title, ... },
  ocr_results: { ... }
}
      ↓
Navigate to ReviewWorkspacePage
```

### 3. Submit Corrections Flow

The review page keeps the reviewer's edits until they approve, reject or flag
the document, and each of those first sends the corrections not saved yet.
Skipping discards them. A session that is reopened, or taken over from another
reviewer, opens with its saved corrections on the page; only a field whose value
differs from its last saved correction is sent, so nothing is stored twice or
credited to the wrong reviewer.

```
Reviewer approves, rejects or flags; the page sends its unsaved corrections
      ↓
POST /api/hitl/sessions/:id/corrections
  {
    corrections: [
      {
        field_key: "invoice_number",
        original_value: "INV-001",
        corrected_value: "INV-101",
        original_conf: 0.85,
        action: "corrected"
      },
      {
        field_key: "total_amount",
        original_value: "1000.00",
        corrected_value: "1000.00",
        original_conf: 0.92,
        action: "confirmed"
      }
    ]
  }
      ↓
HitlController.submitCorrections()
      ↓
HitlService.submitCorrections()
      ↓
For each correction:
  ReviewDbService.createFieldCorrection(sessionId, {
    field_key: correction.field_key,
    original_value: correction.original_value,
    corrected_value: correction.corrected_value,
    original_conf: correction.original_conf,
    action: correction.action,
    actor_id: <the caller's actor, from the signed-in identity>
  })
      ↓
INSERT INTO field_corrections (...)
      ↓
Returns: saved corrections
      ↓
React Query cache invalidated
```

### 4. Complete Session Flow

#### Approve Path
```
User clicks "Approve"
      ↓
POST /api/hitl/sessions/:id/approve
      ↓
UPDATE review_sessions
SET status = 'approved',
    completed_at = NOW()
WHERE id = :id
      ↓
Document status set to 'complete'
      ↓
Lock released; if the document belongs to a
ground truth generation job, that job is completed
      ↓
Invalidate query cache
      ↓
Navigate back to queue (or auto-advance)
```

#### Reject Path
```
User clicks "Reject", picks a reason, optionally adds a comment
      ↓
POST /api/hitl/sessions/:id/reject
      ↓
UPDATE review_sessions
SET status = 'rejected',
    completed_at = NOW(),
    rejection_reason = :reason,
    rejection_comment = :comment
WHERE id = :id
      ↓
Document status set to 'rejected'; lock released
      ↓
Workflow signalled with approved: false; its review gate
fails the run (HUMAN_GATE_REJECTED), and the status stays 'rejected'
      ↓
Documents page lists it as Rejected; the document viewer's
Details tab shows who rejected it, the reason and the comment
```

Reject is hidden while labelling a benchmark dataset: there is no workflow to
reject, and approval is what completes a labelling job.

#### Flag Path
```
User clicks "Flag" and, in the dialog, optionally writes a note
      ↓
POST /api/hitl/sessions/:id/flag   { note?: string }
      ↓
UPDATE review_sessions
SET status = 'flagged',
    flag_note = :note   (trimmed; blank means no note)
WHERE id = :id
      ↓
Lock released; document listed in the Flagged tab with its note,
and opens read-only with the note shown as a banner
```

The note is meant for whoever picks the document up next, so it stays on the
session when someone takes it over: the banner stays up while they work, and
the Flag button carries a marker whose tooltip repeats the note. The flag
dialog opens with the session's current note, so flagging again can extend it
or replace it. The `review_session_flagged` audit event records the note as
well.

#### Skip Path
```
User clicks "Skip"
      ↓
POST /api/hitl/sessions/:id/skip
      ↓
UPDATE review_sessions
SET status = 'abandoned'
WHERE id = :id
      ↓
Lock released; document returns to the Pending queue, and the next
reviewer to open it starts a fresh session
```

## API Endpoints

### Session Management

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| `POST` | `/api/hitl/sessions/next` | Atomically pick next eligible document and start session | Yes |
| `POST` | `/api/hitl/sessions` | Start a new review session for a specific document | Yes |
| `GET` | `/api/hitl/sessions/:id` | Get session details | Yes |
| `POST` | `/api/hitl/sessions/:id/corrections` | Submit field corrections | Yes |
| `GET` | `/api/hitl/sessions/:id/corrections` | Get correction history | Yes |
| `DELETE` | `/api/hitl/sessions/:id/corrections/:correctionId` | Delete a correction | Yes |
| `POST` | `/api/hitl/sessions/:id/approve` | Approve session | Yes |
| `POST` | `/api/hitl/sessions/:id/reject` | Reject session | Yes |
| `POST` | `/api/hitl/sessions/:id/flag` | Flag session for priority attention, with an optional `note` for the next reviewer | Yes |
| `POST` | `/api/hitl/sessions/:id/skip` | Skip session, returning the document to the queue | Yes |
| `POST` | `/api/hitl/sessions/:id/heartbeat` | Extend document lock TTL | Yes |
| `POST` | `/api/hitl/sessions/:id/reopen` | Take over a flagged session, or reopen a dataset labeling job | Yes |

### Queue Management

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| `GET` | `/api/hitl/queue` | Get review queue with filters | Yes |
| `GET` | `/api/hitl/queue/stats` | Get queue statistics | Yes |

### Analytics

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| `GET` | `/api/hitl/analytics` | Get HITL analytics data | Yes |

### Query Parameters for `/api/hitl/queue`

- `group_id` (string, required): The group to list. The caller needs that group's `HITL_QUEUE_RETRIEVE` permission, otherwise `403`.
- `reviewStatus` (enum): Which tab to list — `pending` (default) | `claimed` | `flagged` | `reviewed` | `all`. `claimed` lists the documents the caller holds an unexpired lock on.
- `status` (enum): Document status filter — `extracted` lists documents at `extracted`, `all` lists `extracted` and `awaiting_review`, and leaving it out lists `awaiting_review`. The Reviewed tab also includes `complete`.
- `modelId` (string): Filter by OCR model used
- `limit` (number): Pagination limit, 1–100 (default 50)
- `offset` (number): Pagination offset (default 0)

### Query Parameters for `/api/hitl/queue/stats`

- `group_id` (string, required): The group to summarise. Same permission check as `/queue`.

### Query Parameters for `/api/hitl/analytics`

- `startDate` (date, optional): Start of analytics period
- `endDate` (date, optional): End of analytics period
- `reviewerId` (string, optional): Filter by reviewer: the sessions that reviewer holds, and the corrections that reviewer made. Corrections saved before authors were recorded match no reviewer.
- `group_id` (string, required): The group to report on. The caller needs that group's `HITL_SESSION_RETRIEVE` permission, otherwise `403`.

## Frontend Architecture

### Key Components

**[ReviewQueuePage.tsx](../../apps/frontend/src/features/annotation/hitl/pages/ReviewQueuePage.tsx)**
- Lists the queue in four tabs: Pending, Claimed by you, Flagged and Reviewed (see [Queue States](#queue-states)). The Flagged tab shows each document's flag note
- Pending and Claimed by you show each document's model, workflow name, average confidence and upload date
- Shows the queue-wide figures: total documents, requires review, average confidence and reviewed today (see [Queue Statistics](#queue-statistics))
- Reloads every tab and the figures every 30 seconds while the page is in view, so documents other reviewers pick up drop out without a manual refresh
- Includes last session info for each document
- "Start review" on Pending opens a new session; "Resume" on Claimed by you returns to the caller's open one

**[ReviewWorkspacePage.tsx](../../apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx)**
- Main review interface for active session
- Side-by-side view: document image + extracted fields
- Inline canvas editing: [CanvasFieldOverlay.tsx](../../apps/frontend/src/features/annotation/hitl/components/CanvasFieldOverlay.tsx) anchors an input under each field's bounding box on the document image, sized to the box and colored by OCR confidence tier ([ConfidenceIndicator.tsx](../../apps/frontend/src/features/annotation/hitl/components/ConfidenceIndicator.tsx)); Tab moves between fields ([useFieldFocus.ts](../../apps/frontend/src/features/annotation/hitl/hooks/useFieldFocus.ts)), F2 toggles the overlay, hover fades it to reveal the source pixels
- Fields panel search/filter for quick field lookup during review
- Field editing with original/corrected value tracking
- Actions: Approve, Reject (with a reason), Flag (with an optional note), Skip
- Shows a session's flag note as a banner, and marks the Flag button while a note is on the session
- Supports read-only mode for viewing completed sessions

### Key Hooks

**[useReviewQueue.ts](../../apps/frontend/src/features/annotation/hitl/hooks/useReviewQueue.ts)**
- Manages queue data fetching and filters
- Consumes `GroupContext` via `useGroup()` — automatically scopes queue and stats requests to `activeGroup.id` when set
- `startSessionAsync(documentId)`: Creates new session
- Handles queue statistics
- React Query integration for caching; both `queueQuery` and `statsQuery` keys include `activeGroupId` so switching groups triggers automatic re-fetches

**[useReviewSession.ts](../../apps/frontend/src/features/annotation/hitl/hooks/useReviewSession.ts)**
- Manages active session state
- `submitCorrectionsAsync(corrections)`: Saves field corrections
- `approveSessionAsync()`: Completes session as approved
- `flagSessionAsync({ note })`: Flags the session for priority attention, with an optional note for the next reviewer
- `skipSessionAsync()`: Skips session, returning the document to the queue
- Auto-invalidates cache on mutations

## Backend Architecture

### Key Services

**[hitl.controller.ts](../../apps/backend-services/src/hitl/hitl.controller.ts)**
- REST API endpoints for HITL workflow
- Request validation and authentication
- Extracts reviewer ID from auth token

**[hitl.service.ts](../../apps/backend-services/src/hitl/hitl.service.ts)**
- Business logic for sessions and corrections
- Orchestrates database operations
- Enforces business rules (e.g., one session per document at a time)

**[review-db.service.ts](../../apps/backend-services/src/hitl/review-db.service.ts)**
- HITL data access layer using Prisma
- Query builders for complex filtering (queue, locks, corrections, field definitions)
- Optional transaction client support for atomic operations

## Additional Features

### Queue States

The queue has four tabs. A document appears in at most one of them, and a
document locked by another reviewer appears in none.

A document is *undecided* while it has no review sessions, or only
`in_progress` or `abandoned` ones. A lock is *live* until its `expires_at`
passes: it lasts 10 minutes, and the review workspace extends it while open.

**Pending**: Undecided documents at `awaiting_review` with no live lock.
**Start review** opens a new session and takes the lock, which moves the
document to Claimed by you.

**Claimed by you**: Undecided documents at `awaiting_review` whose live lock is
the caller's. **Resume** returns to that session. When the lock lapses, the
document goes back to Pending.

**Flagged**: Documents with a `flagged` session and no `approved` session, each
listed with the note left when it was flagged. **View** opens the document
read-only with the note as a banner, so any number of people can read it and
the correction history at once without taking it. **Take**, at the top of that
view, reopens the session for the reader: the status returns to `in_progress`,
the session and its lock move to them, the note stays on screen, and the
document rejoins the ordinary review flow with the previous reviewer's
corrections intact. Editing therefore always holds a lock, and flagging hands
work on rather than parking it.

**Reviewed**: Documents with at least one `approved` session.

### Resuming a gated workflow

A workflow that reaches a `humanGate` sets its document to `awaiting_review` and
then blocks on the `humanApproval` signal — in the seeded templates with a 24
hour timeout and `onTimeout: "fail"`. Approving a session sends that signal, so
the workflow continues into the nodes after the gate:

- The Temporal workflow id is derived from the document (`graph-<documentId>`).
  `Document.workflow_execution_id` is the billing run id and is not the workflow
  id.
- Not every reviewable document has a workflow waiting — seeded documents and
  ungated pipelines have none, and a gate that already timed out is gone. The
  review is complete regardless, so a failed signal never fails the approval.
- The outcome is auditable either way: `human_approval_signal_sent` when the
  workflow was resumed, `human_approval_signal_skipped` (with the reason) when
  there was nothing to resume. Both carry `source: "hitl_session"`.

Rejection sends the same signal with `approved: false`, plus the
`rejectionReason` and `comments` supplied on the reject call. The review gate fails the run with `HUMAN_GATE_REJECTED` as soon as it reads
`approved: false`, so no node after the gate runs. The rejection does not
depend on the workflow: the reject call marks the document `rejected` itself,
and the workflow's failure hook only moves documents that are still in OCR, so
it leaves `rejected` alone.

Both the approval and the rejection name the person who made the request, in
the audit event's `actor_id` and in the signal's `reviewer`, which is not
always whoever started the session.

### Queue Statistics

`GET /api/hitl/queue/stats` reports on the whole queue rather than the tab in
view. Every figure reads the same per-tab filters the queue lists use, so the
numbers match the tabs:

- **Total documents**: the four tabs added together. A document a workflow
  completed without sending it to review is in no tab, and is not counted.
- **Requires review**: Pending plus Claimed by you
- **Avg confidence**: the mean of each document's mean field confidence, over
  the same documents as Total documents. Fields with no confidence score are
  left out of a document's mean.
- **Reviewed today**: sessions approved since local midnight

### Last Session Tracking

Queue view includes last session metadata for each document:

```typescript
lastSession: {
  id: string;
  reviewer_id: string;
  status: ReviewStatus;
  completed_at: Date;
  corrections_count: number;
  flag_note?: string;
}
```

This allows reviewers to see:
- Who previously reviewed the document
- When it was reviewed
- What the outcome was
- How many corrections were made
- Why it was flagged, on the Flagged tab

Which session that is depends on the tab. On Flagged it is the most recent
`flagged` session and on Reviewed the most recent `approved` one; on the other
tabs it is the most recent `approved`, `flagged` or `abandoned` session. A newer
abandoned attempt therefore never hides the flagged session that **Take**
reopens.

### Read-Only Mode

Completed sessions can be viewed in read-only mode:
- All terminal-state sessions (`approved`, `flagged`, `abandoned`), and every session opened from the Flagged tab with **View**
- Frontend disables editing controls
- Displays original vs corrected values
- Shows correction history

### Analytics Tracking

The system tracks metrics for:
- Session duration (via `started_at` and `completed_at`)
- Correction counts per session
- Reviewer performance
- Field accuracy rates
- Escalation patterns

## Implementation Files

### Database
- **Schema**: [apps/shared/prisma/schema.prisma](../../apps/shared/prisma/schema.prisma)

### Backend
- **Controller**: [apps/backend-services/src/hitl/hitl.controller.ts](../../apps/backend-services/src/hitl/hitl.controller.ts)
- **Service**: [apps/backend-services/src/hitl/hitl.service.ts](../../apps/backend-services/src/hitl/hitl.service.ts)
- **Review DB Service**: [apps/backend-services/src/hitl/review-db.service.ts](../../apps/backend-services/src/hitl/review-db.service.ts)

### Frontend
- **Queue Page**: [apps/frontend/src/features/annotation/hitl/pages/ReviewQueuePage.tsx](../../apps/frontend/src/features/annotation/hitl/pages/ReviewQueuePage.tsx)
- **Workspace Page**: [apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx](../../apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx)
- **Queue Hook**: [apps/frontend/src/features/annotation/hitl/hooks/useReviewQueue.ts](../../apps/frontend/src/features/annotation/hitl/hooks/useReviewQueue.ts)
- **Session Hook**: [apps/frontend/src/features/annotation/hitl/hooks/useReviewSession.ts](../../apps/frontend/src/features/annotation/hitl/hooks/useReviewSession.ts)

## Use Cases

### Basic Review Workflow

1. **Reviewer accesses queue**
   - Sees documents with confidence < 0.9
   - Filters by model or review status

2. **Reviewer starts session**
   - Clicks "Review" on a document
   - System creates session with `in_progress` status

3. **Reviewer corrects fields**
   - Views OCR results side-by-side with document
   - Edits incorrect values
   - Confirms correct values

4. **Reviewer completes session**
   - Approves if satisfied → status: `approved`
   - Rejects if the document cannot be used → status: `rejected`
   - Flags if it needs someone else's eyes → status: `flagged`
   - Skips if cannot complete → status: `abandoned`
   - Approving, rejecting and flagging save the corrections first; skipping
     discards them

### Flagging Workflow

1. Reviewer encounters a case they should not decide
2. Clicks "Flag" and writes a short note on what stopped them (optional)
3. System saves the corrections made so far, marks the session `flagged`,
   keeps the note and releases the lock
4. Document appears in the Flagged tab with the note, where anyone in the group
   can open it with **View** and read it along with the corrections already made
5. Whoever picks it up presses **Take** in that view. The session becomes
   theirs, under their own lock, and the note stays in view while they work
6. If they flag it again, the dialog opens with the existing note for them to
   extend or replace

### Analytics Use Case

Administrators can analyze:
- Which fields have highest error rates
- Which OCR models need improvement
- Reviewer throughput and accuracy
- How often documents are flagged rather than approved

## Design Rationale

### Why "Sessions"?

The session model provides:
- **Clear boundaries**: Each review is self-contained
- **Audit trail**: Complete history of who did what, when
- **Flexibility**: Same document can be reviewed multiple times
- **Analytics**: Measurable units for performance tracking
- **State management**: Simple, predictable lifecycle

### Why Terminal States?

Terminal states are immutable to:
- Prevent accidental changes to completed work
- Maintain accurate audit trails
- Enable reliable analytics
- Simplify state machine logic

### Why Cascade Delete?

Corrections are meaningless without their parent session:
- Maintains referential integrity
- Simplifies cleanup
- Prevents orphaned records
- Corrections always have context

## HITL Enhancement Features

### Document Locking

The system uses pessimistic locking via the `DocumentLock` model to prevent concurrent editing of the same document by multiple reviewers.

**Lock Lifecycle:**

1. **Acquisition**: A lock is created when a session starts, with a 10-minute TTL (`expires_at = now + 10 min`)
2. **Heartbeat**: The frontend sends `POST /sessions/:id/heartbeat` every 60 seconds to extend the lock TTL by another 10 minutes
3. **Idle Warning**: At 8 minutes of inactivity (no heartbeat), the frontend displays a warning to the reviewer
4. **Auto-Release**: If no heartbeat is received and the TTL expires, the lock is ignored immediately by lock lookups, and within a minute the lock-expiry cron deletes the row and marks the session `abandoned`, returning the document to the Pending queue
5. **Explicit Release**: Completing a session (approve/flag/skip) explicitly deletes the lock

**Conflict Handling:**

- If the same reviewer requests a session on a document they already have locked, the existing session is returned
- If a different reviewer requests a session on a locked document, a `ConflictException` (409) is thrown
- Expired locks are transparently ignored, allowing any reviewer to pick up the document

### Multi-User Queue

The review queue is designed for concurrent multi-reviewer usage:

- Documents with active (non-expired) locks held by **other** reviewers are excluded from the queue results
- A reviewer's own locked documents remain visible in their queue
- This prevents multiple reviewers from attempting to start sessions on the same document
- When a lock expires or a session completes, the document reappears in all reviewers' queues

### Auto-Advance

After a reviewer completes a session (approve, skip, or flag), the frontend automatically fetches the next eligible document — unless they have turned the Auto-advance toggle off, in which case they return to the queue:

1. The terminal action (approve/skip/flag) completes and releases the lock
2. The frontend calls `POST /sessions/next` which atomically selects the next eligible document and starts a new session
3. The reviewer is seamlessly transitioned to the next document without returning to the queue page
4. If no eligible documents remain, the reviewer is returned to the queue view

The `/sessions/next` endpoint applies the same filtering as the queue (confidence threshold, model, group) and respects document locks to avoid conflicts.

### Keyboard Shortcuts

The review workspace supports VS Code-style modifier keyboard shortcuts for efficient reviewing:

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Approve session |
| `Ctrl+Shift+E` | Escalate session |
| `Ctrl+Shift+S` | Skip session |
| `Tab` / `Shift+Tab` | Next / previous field (while editing a field) |
| `Escape` | Deselect field |
| `Ctrl+Z` | Undo last field change |
| `Ctrl+Shift+Z` | Redo last undone change |
| `Ctrl+Shift+V` | Toggle between Document view and Snippet view |
| `Ctrl+Shift+O` | Toggle field sort order |
| `Ctrl+/` | Show/hide keyboard shortcuts help panel |

Action shortcuts use modifier keys to avoid interfering with normal text editing in field inputs.

### View Modes

The review workspace supports two view modes, toggled via `Ctrl+Shift+V`:

**Document View (default):**
- Displays the full document image on a zoomable, pannable canvas
- Selecting a field highlights its bounding box on the document
- Supports zoom-to-field (see below)

**Snippet View:**
- Displays cropped image regions for each field alongside their editable input fields
- Each snippet shows the relevant portion of the document image corresponding to the field's bounding box
- Useful for focused, field-by-field review without needing to navigate the full document

### Undo/Redo

The system provides two levels of undo capability:

**Field-Level Undo Stack:**
- Each field edit is pushed onto an undo stack
- `Ctrl+Z` reverts the last field change, restoring the previous value
- `Ctrl+Shift+Z` re-applies the last undone change
- The undo/redo stack is maintained for the duration of the active session

**Session-Level Reopen:**
- `POST /sessions/:id/reopen` returns a session to `in_progress` and re-acquires the document lock
- **Flagged session**: any member of the group takes it over, at any time, and the lock moves to them
- **Dataset labeling job**: its original reviewer reopens it until the dataset version is frozen
- **Approved document review**: refused. Approving signals the gated workflow, which has already run the nodes after the gate

### Field Sorting

Fields in the review workspace can be sorted in two orders, toggled via `Ctrl+Shift+O`:

- **Confidence order (default)**: Lowest confidence fields appear first, directing reviewer attention to the most uncertain extractions
- **Alphabetical order**: Fields are sorted by field key, providing a stable, predictable ordering

### Zoom-to-Field

When a field is selected in Document View:

- The canvas animates to center on the field's bounding box
- A fixed 5x zoom level is applied
- The transition is animated for smooth visual context switching
- This allows reviewers to quickly inspect the source region for any field without manual pan/zoom

## Format-Aware Validation

The HITL correction UI provides advisory validation on field inputs based on `format_spec` from the document's template model. Note: `field_format` is a separate column used for Azure Document Intelligence training hints (e.g., "ymd", "dmy", "currency") and is not used for validation.

### How it works

1. **Backend**: `HitlService.getSession()` returns a `fieldDefinitions` array alongside the session data. Field definitions are fetched from the first TemplateModel belonging to the document's group, containing `field_key` and `format_spec` pairs.

2. **Frontend**: `ReviewWorkspacePage` builds a validators map from `fieldDefinitions` using `buildFieldValidators()`. Each Textarea correction input receives an `error` prop that runs the validator on the current display value.

3. **Validation logic** (`format-validation.ts`):
   - Parses `format_spec` JSON specs containing `canonicalize`, `pattern`, and optional `displayTemplate`
   - Applies canonicalization operations (digits, uppercase, lowercase, strip-spaces, text, number, date formats)
   - Tests canonicalized value against the pattern regex
   - Returns error messages for unparseable values or pattern mismatches
   - Empty values always pass validation

### Advisory only

Validation is non-blocking. Reviewers see Mantine error indicators on fields with format mismatches but can still submit corrections with non-conforming values.

### Files

- `apps/backend-services/src/hitl/hitl.service.ts` - getSession returns fieldDefinitions
- `apps/backend-services/src/hitl/review-db.service.ts` - findFieldDefinitionsByGroupId query
- `apps/frontend/src/features/annotation/hitl/utils/format-validation.ts` - validation utility
- `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` - wired into Textarea error prop

## Review Plan Persistence and Field Filtering

The per-field `reviewPlan` produced by the `hitl.applyReviewCriteria` activity (see [HITL_REVIEW_CRITERIA.md](./HITL_REVIEW_CRITERIA.md)) can be persisted onto the document and used to pre-filter the review workspace to just the fields that need a human look.

### Persistence

- `Document.review_plan` (`Json?` on the `documents` table) stores the `ReviewPlanEntry[]` array (`{ field, decision, reason, ruleName, confidence }` per field) produced by `hitl.applyReviewCriteria`.
- The `document.persistReviewPlan` Temporal activity (`apps/temporal/src/activities/persist-review-plan.ts`) writes this column. A workflow graph wires it downstream of `hitl.applyReviewCriteria`, passing its `reviewPlan` output straight through. It is a no-op for benchmark documents that don't exist in the DB (same short-circuit as `ocr.storeResults`).
- Each successful write also records a best-effort `audit_events` row (`event_type: "document_review_plan_updated"`, `resource_type: "document"`, payload `{ field_count, review_field_count }`); an audit failure never fails the main update. See [AUDIT.md](./AUDIT.md).
- `standard-ocr-workflow-sdpr.json` wires `document.persistReviewPlan` immediately after `hitl.applyReviewCriteria` (node `persistReviewPlan`, between `reviewCriteria` and `reviewSwitch`), passing `reviewPlan` straight through.

### Review UI behavior

- `HitlService.getSession()` reads `session.document.review_plan`, validates its shape, and returns it as `reviewPlan` on the session response (`ReviewSessionResponseDto.reviewPlan`, typed via `ReviewPlanEntryDto[]`). Malformed or absent data (e.g. documents predating this feature) yields `reviewPlan: undefined`.
- `ReviewWorkspacePage` defaults to showing **only** fields with `decision: "review"` whenever the session has a review plan with at least one flagged field; each flagged field's card shows its `reason` beneath the field key. Sessions without a review plan (or where no field was flagged) show every field, same as before this feature.
- A "Show all fields" / "Show flagged only" toggle next to the field list lets the reviewer switch between the filtered and full field sets at any time; the flagged-only filter composes with the existing field-name search filter.

### Files

- `apps/shared/prisma/schema.prisma` / `apps/shared/prisma/migrations/20260729140000_add_document_review_plan/` - `Document.review_plan` column
- `apps/temporal/src/activities/persist-review-plan.ts` (+ `.test.ts`) - persistence activity, registered as `document.persistReviewPlan`
- `apps/backend-services/src/hitl/hitl.service.ts` - `getSession` returns `reviewPlan`
- `apps/backend-services/src/hitl/dto/hitl-responses.dto.ts` - `ReviewPlanEntryDto`, `ReviewSessionResponseDto.reviewPlan`
- `apps/frontend/src/features/annotation/hitl/hooks/useReviewSession.ts` - `ReviewPlanEntry` / `ReviewSession.reviewPlan` types
- `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx` - flagged-only default filter, toggle, reason display

## Future Enhancements

Potential areas for expansion:
- Batch review sessions (multiple documents at once)
- Collaborative review (multiple reviewers per session)
- Review assignment/routing rules
- Quality scoring based on correction patterns
- Machine learning feedback loop from corrections
