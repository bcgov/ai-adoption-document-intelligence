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

The term "session" emphasizes this is a **temporary, interactive state** rather than a permanent relationship. Once a session reaches a terminal state (approved/escalated/skipped), that review is complete.

### Session vs Document

- **Document**: Permanent record of the uploaded file and its OCR results
- **Session**: Temporary review context - multiple sessions can exist for the same document
- A document can have multiple sessions over time (e.g., initial review, re-review after escalation)
- Each session is independent and creates its own audit trail

## Data Model

### Database Schema

```prisma
model ReviewSession {
  id              String           @id @default(cuid())
  document_id     String
  document        Document         @relation(fields: [document_id], references: [id], onDelete: Cascade)
  reviewer_id     String
  status          ReviewStatus     @default(in_progress)
  started_at      DateTime         @default(now())
  completed_at    DateTime?
  corrections     FieldCorrection[]

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

  @@map("field_corrections")
}

enum ReviewStatus {
  in_progress
  approved
  escalated
  skipped
}

enum CorrectionAction {
  confirmed   // Field was reviewed and is correct
  corrected   // Field value was changed/fixed
  flagged     // Field was flagged for issues (used for escalation)
  deleted     // Field should be ignored/deleted
}
```

### Key Relationships

- **ReviewSession** is the parent entity linking document, reviewer, and lifecycle state
- **FieldCorrection** records are children - one per field interaction
- **Cascade delete**: Deleting a session automatically deletes all its corrections
- Sessions track duration via `started_at` and `completed_at` timestamps

## Status Transitions

### State Machine

```
[Create Session]
      ↓
  in_progress (initial state)
      ↓
   ┌──┴──────────────┐
   ↓                 ↓                 ↓
approved        escalated         skipped
(terminal)      (terminal)        (terminal)
```

### Transition Rules

| From | To | Trigger | Side Effects |
|------|-----|---------|--------------|
| (none) | `in_progress` | `POST /sessions` | Sets `started_at` |
| `in_progress` | `approved` | `POST /sessions/:id/submit` | Sets `completed_at` |
| `in_progress` | `escalated` | `POST /sessions/:id/escalate` | Sets `completed_at`, stores reason |
| `in_progress` | `skipped` | `POST /sessions/:id/skip` | Sets `completed_at` |

**Important**: Once a session reaches a terminal state (`approved`, `escalated`, or `skipped`), it cannot transition to another state. Terminal states are permanent.

## System Flow

### 1. Queue View Flow

```
User (ReviewQueuePage)
      ↓
GET /api/hitl/queue
  ?modelId=prebuilt-invoice
  &maxConfidence=0.9
  &reviewStatus=pending
      ↓
HitlController.getQueue()
      ↓
HitlService.getQueue()
      ↓
DatabaseService.findReviewQueue()
      ↓
Returns: Documents with:
  - status = 'completed_ocr'
  - confidence < threshold
  - lastSession info (if reviewed)
```

**Queue Filtering:**
- Shows documents that need review (low confidence scores)
- Default confidence threshold: 0.9
- Can filter by OCR model, review status, pagination
- Includes last session info for previously reviewed documents

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
DatabaseService.createReviewSession({
  document_id: documentId,
  reviewer_id: reviewerId,
  status: 'in_progress',
  started_at: new Date()
})
      ↓
INSERT INTO review_sessions (...)
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

```
User edits fields and submits corrections
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
  DatabaseService.createFieldCorrection({
    session_id: sessionId,
    field_key: correction.field_key,
    original_value: correction.original_value,
    corrected_value: correction.corrected_value,
    original_conf: correction.original_conf,
    action: correction.action
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
POST /api/hitl/sessions/:id/submit
      ↓
UPDATE review_sessions
SET status = 'approved',
    completed_at = NOW()
WHERE id = :id
      ↓
Invalidate query cache
      ↓
Navigate back to queue
```

#### Escalate Path
```
User clicks "Escalate" with reason
      ↓
POST /api/hitl/sessions/:id/escalate
  { reason: "Complex case requiring expert review" }
      ↓
1. Create special field correction:
   INSERT INTO field_corrections (
     session_id,
     field_key = "_escalation",
     corrected_value = reason,
     action = 'flagged'
   )

2. Update session:
   UPDATE review_sessions
   SET status = 'escalated',
       completed_at = NOW()
   WHERE id = :id
      ↓
Returns updated session
```

#### Skip Path
```
User clicks "Skip"
      ↓
POST /api/hitl/sessions/:id/skip
      ↓
UPDATE review_sessions
SET status = 'skipped',
    completed_at = NOW()
WHERE id = :id
```

## API Endpoints

### Session Management

| Method | Endpoint | Purpose | Auth Required |
|--------|----------|---------|---------------|
| `POST` | `/api/hitl/sessions` | Start a new review session | Yes |
| `GET` | `/api/hitl/sessions/:id` | Get session details | Yes |
| `POST` | `/api/hitl/sessions/:id/corrections` | Submit field corrections | Yes |
| `GET` | `/api/hitl/sessions/:id/corrections` | Get correction history | Yes |
| `POST` | `/api/hitl/sessions/:id/submit` | Approve session | Yes |
| `POST` | `/api/hitl/sessions/:id/escalate` | Escalate session with reason | Yes |
| `POST` | `/api/hitl/sessions/:id/skip` | Skip session | Yes |

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

- `modelId` (string): Filter by OCR model used
- `maxConfidence` (number): Show documents below this confidence (default: 0.9)
- `reviewStatus` (enum): `pending` | `reviewed` | `all`
- `limit` (number): Pagination limit
- `offset` (number): Pagination offset
- `group_id` (UUID, optional): Scope results to a single group. When omitted, returns items across all groups the identity belongs to. When provided, `identityCanAccessGroup` is called and a `403` is returned if the identity is not a member.

### Query Parameters for `/api/hitl/queue/stats`

- `reviewStatus` (enum): `pending` | `reviewed` | `all`
- `group_id` (UUID, optional): Scope stats to a single group. Same access check as `/queue`.

### Query Parameters for `/api/hitl/analytics`

- `startDate` (date, optional): Start of analytics period
- `endDate` (date, optional): End of analytics period
- `reviewerId` (string, optional): Filter by reviewer ID
- `group_id` (UUID, optional): Scope analytics to a single group. Same access check as `/queue`.

## Frontend Architecture

### Key Components

**[ReviewQueuePage.tsx](../apps/frontend/src/features/hitl/components/ReviewQueuePage.tsx)**
- Displays list of documents requiring review
- Filters by model, confidence threshold, review status
- Shows queue statistics (pending count, reviewed count)
- Includes last session info for each document
- "Review" button starts new session

**[ReviewWorkspacePage.tsx](../apps/frontend/src/features/hitl/components/ReviewWorkspacePage.tsx)**
- Main review interface for active session
- Side-by-side view: document image + extracted fields
- Fields panel search/filter for quick field lookup during review
- Field editing with original/corrected value tracking
- Actions: Approve, Escalate (with reason), Skip
- Supports read-only mode for viewing completed sessions

### Key Hooks

**[useReviewQueue.ts](../apps/frontend/src/features/hitl/hooks/useReviewQueue.ts)**
- Manages queue data fetching and filters
- Consumes `GroupContext` via `useGroup()` — automatically scopes queue and stats requests to `activeGroup.id` when set
- `startSessionAsync(documentId)`: Creates new session
- Handles queue statistics
- React Query integration for caching; both `queueQuery` and `statsQuery` keys include `activeGroupId` so switching groups triggers automatic re-fetches

**[useReviewSession.ts](../apps/frontend/src/features/hitl/hooks/useReviewSession.ts)**
- Manages active session state
- `submitCorrectionsAsync(corrections)`: Saves field corrections
- `approveSessionAsync()`: Completes session as approved
- `escalateSessionAsync(reason)`: Escalates with reason
- `skipSessionAsync()`: Skips session
- Auto-invalidates cache on mutations

## Backend Architecture

### Key Services

**[hitl.controller.ts](../apps/backend-services/src/hitl/hitl.controller.ts)**
- REST API endpoints for HITL workflow
- Request validation and authentication
- Extracts reviewer ID from auth token

**[hitl.service.ts](../apps/backend-services/src/hitl/hitl.service.ts)**
- Business logic for sessions and corrections
- Orchestrates database operations
- Enforces business rules (e.g., one session per document at a time)

**[database.service.ts](../apps/backend-services/src/database/database.service.ts)**
- Data access layer using Prisma
- Query builders for complex filtering
- Transaction management

## Additional Features

### Queue States

**Pending**: Documents with either:
- No review sessions, OR
- Only `in_progress` sessions

**Reviewed**: Documents with at least one terminal-state session:
- `approved`
- `escalated`
- `skipped`

### Escalation Mechanism

Escalation is a special workflow path for complex cases:

1. Reviewer clicks "Escalate" and provides a reason
2. System creates a field correction with:
   - `field_key = "_escalation"`
   - `corrected_value = reason`
   - `action = 'flagged'`
3. Session status becomes `escalated`
4. Document appears in "escalated" queue for expert review

### Last Session Tracking

Queue view includes last session metadata for each document:

```typescript
lastSession: {
  id: string;
  reviewer_id: string;
  status: ReviewStatus;
  completed_at: Date;
  corrections_count: number;
}
```

This allows reviewers to see:
- Who previously reviewed the document
- When it was reviewed
- What the outcome was
- How many corrections were made

### Read-Only Mode

Completed sessions can be viewed in read-only mode:
- All terminal-state sessions (`approved`, `escalated`, `skipped`)
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
- **Schema**: [apps/shared/prisma/schema.prisma](../apps/shared/prisma/schema.prisma)

### Backend
- **Controller**: [apps/backend-services/src/hitl/hitl.controller.ts](../apps/backend-services/src/hitl/hitl.controller.ts)
- **Service**: [apps/backend-services/src/hitl/hitl.service.ts](../apps/backend-services/src/hitl/hitl.service.ts)
- **Database Service**: [apps/backend-services/src/database/database.service.ts](../apps/backend-services/src/database/database.service.ts)

### Frontend
- **Queue Page**: [apps/frontend/src/features/hitl/components/ReviewQueuePage.tsx](../apps/frontend/src/features/hitl/components/ReviewQueuePage.tsx)
- **Workspace Page**: [apps/frontend/src/features/hitl/components/ReviewWorkspacePage.tsx](../apps/frontend/src/features/hitl/components/ReviewWorkspacePage.tsx)
- **Queue Hook**: [apps/frontend/src/features/hitl/hooks/useReviewQueue.ts](../apps/frontend/src/features/hitl/hooks/useReviewQueue.ts)
- **Session Hook**: [apps/frontend/src/features/hitl/hooks/useReviewSession.ts](../apps/frontend/src/features/hitl/hooks/useReviewSession.ts)

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
   - System saves corrections continuously

4. **Reviewer completes session**
   - Approves if satisfied → status: `approved`
   - Escalates if complex → status: `escalated`
   - Skips if cannot complete → status: `skipped`

### Escalation Workflow

1. Reviewer encounters complex case
2. Clicks "Escalate" and provides reason
3. System marks session as `escalated`
4. Document appears in expert queue
5. Expert can start new session for re-review

### Analytics Use Case

Administrators can analyze:
- Which fields have highest error rates
- Which OCR models need improvement
- Reviewer throughput and accuracy
- Common escalation reasons

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

## Future Enhancements

Potential areas for expansion:
- Batch review sessions (multiple documents at once)
- Collaborative review (multiple reviewers per session)
- Review assignment/routing rules
- Session templates for common document types
- Quality scoring based on correction patterns
- Machine learning feedback loop from corrections
