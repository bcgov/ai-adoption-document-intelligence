# HITL Interface Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the HITL review interface with document locking, keyboard shortcuts, zoom-to-field, field sorting, auto-advance, undo system, and a cropped snippet view.

**Architecture:** Incremental enhancement — each feature is an independent layer on the existing REST/React Query architecture. Backend adds locking via a new Prisma model with heartbeat-based TTL, new endpoints for undo/reopen/auto-advance. Frontend adds hooks for each feature, a keyboard shortcut registry, and an alternative snippet view component.

**Tech Stack:** NestJS, Prisma, PostgreSQL, React, React Query, Mantine UI, Konva (canvas), react-router-dom

---

## File Structure

### Backend (apps/backend-services)

| File | Responsibility |
|------|---------------|
| `apps/shared/prisma/schema.prisma` | Add `DocumentLock` model |
| `src/hitl/hitl.controller.ts` | Add heartbeat, delete-correction, reopen, next-session endpoints |
| `src/hitl/hitl.service.ts` | Locking logic, reopen logic, next-session logic |
| `src/hitl/review-db.service.ts` | Lock CRUD, correction deletion, atomic next-document query |
| `src/hitl/dto/lock.dto.ts` | New — heartbeat and lock response DTOs |
| `src/hitl/dto/next-session.dto.ts` | New — next-session request/response DTOs |
| `src/hitl/dto/hitl-responses.dto.ts` | Add ReopenSessionResponseDto |
| `src/hitl/hitl.service.spec.ts` | Tests for new service methods |
| `src/hitl/hitl.controller.spec.ts` | Tests for new endpoints |
| `src/hitl/review-db.service.spec.ts` | Tests for new DB methods |

### Frontend (apps/frontend/src/features/annotation)

| File | Responsibility |
|------|---------------|
| `core/keyboard/useKeyboardShortcuts.ts` | Keyboard shortcut registry hook |
| `core/keyboard/KeyboardManager.tsx` | Keydown listener wrapper component |
| `hitl/hooks/useSessionHeartbeat.ts` | New — heartbeat + idle detection |
| `hitl/hooks/useUndoRedo.ts` | New — undo/redo stack for field corrections |
| `hitl/hooks/useAutoAdvance.ts` | New — auto-advance on completion |
| `hitl/hooks/useFieldFocus.ts` | New — coordinate field focus with canvas pan/zoom |
| `hitl/components/SnippetView.tsx` | New — cropped snippet alternative view |
| `hitl/components/ShortcutsOverlay.tsx` | New — keyboard shortcuts help panel |
| `hitl/components/ReviewToolbar.tsx` | Add view toggle and sort toggle buttons |
| `hitl/hooks/useReviewSession.ts` | Add delete-correction and reopen mutations |
| `hitl/pages/ReviewWorkspacePage.tsx` | Integrate all new hooks, view mode toggle |
| `core/canvas/AnnotationCanvas.tsx` | Expose `panTo()` via ref, animated transitions |

---

## Task 1: DocumentLock Prisma Model & Migration

**Files:**
- Modify: `apps/shared/prisma/schema.prisma:362-375`

- [ ] **Step 1: Add DocumentLock model to Prisma schema**

Add after the `ReviewSession` model (line 375):

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

Add relation fields to existing models:

In `Document` model, add:
```prisma
  lock              DocumentLock?
```

In `ReviewSession` model, add:
```prisma
  lock         DocumentLock?
```

- [ ] **Step 2: Run migration**

```bash
cd apps/backend-services && npx prisma migrate dev --name add_document_locks
```

- [ ] **Step 3: Generate Prisma client**

```bash
cd apps/backend-services && npm run db:generate
```

- [ ] **Step 4: Verify migration applied**

```bash
cd apps/backend-services && npx prisma migrate status
```

Expected: All migrations applied, no pending migrations.

- [ ] **Step 5: Commit**

```bash
git add apps/shared/prisma/schema.prisma apps/shared/prisma/migrations/
git commit -m "feat(hitl): add DocumentLock model for pessimistic document locking"
```

---

## Task 2: Backend Lock CRUD in ReviewDbService

**Files:**
- Modify: `apps/backend-services/src/hitl/review-db.service.ts`
- Test: `apps/backend-services/src/hitl/review-db.service.spec.ts`

- [ ] **Step 1: Write failing tests for lock methods**

Add to `review-db.service.spec.ts`:

```typescript
describe('acquireDocumentLock', () => {
  it('should create a lock for a document', async () => {
    const lockData = {
      document_id: 'doc-1',
      reviewer_id: 'reviewer-1',
      session_id: 'session-1',
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    };
    mockPrisma.documentLock.create.mockResolvedValue({
      id: 'lock-1',
      ...lockData,
      acquired_at: new Date(),
      last_heartbeat: new Date(),
    });

    const result = await service.acquireDocumentLock(lockData);
    expect(result.document_id).toBe('doc-1');
    expect(mockPrisma.documentLock.create).toHaveBeenCalledWith({
      data: lockData,
    });
  });
});

describe('releaseDocumentLock', () => {
  it('should delete the lock by session_id', async () => {
    mockPrisma.documentLock.deleteMany.mockResolvedValue({ count: 1 });

    await service.releaseDocumentLock('session-1');
    expect(mockPrisma.documentLock.deleteMany).toHaveBeenCalledWith({
      where: { session_id: 'session-1' },
    });
  });
});

describe('refreshLockHeartbeat', () => {
  it('should update last_heartbeat and expires_at', async () => {
    const newExpiry = new Date(Date.now() + 10 * 60 * 1000);
    mockPrisma.documentLock.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.refreshLockHeartbeat('session-1', newExpiry);
    expect(result).toBe(true);
    expect(mockPrisma.documentLock.updateMany).toHaveBeenCalledWith({
      where: { session_id: 'session-1' },
      data: {
        last_heartbeat: expect.any(Date),
        expires_at: newExpiry,
      },
    });
  });

  it('should return false when no lock found', async () => {
    mockPrisma.documentLock.updateMany.mockResolvedValue({ count: 0 });
    const result = await service.refreshLockHeartbeat('no-session', new Date());
    expect(result).toBe(false);
  });
});

describe('findActiveLock', () => {
  it('should find lock by document_id where not expired', async () => {
    const lock = {
      id: 'lock-1',
      document_id: 'doc-1',
      reviewer_id: 'reviewer-1',
      session_id: 'session-1',
      acquired_at: new Date(),
      last_heartbeat: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    };
    mockPrisma.documentLock.findFirst.mockResolvedValue(lock);

    const result = await service.findActiveLock('doc-1');
    expect(result).toEqual(lock);
  });
});

describe('deleteCorrection', () => {
  it('should delete a correction by id and session_id', async () => {
    mockPrisma.fieldCorrection.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.deleteCorrection('correction-1', 'session-1');
    expect(result).toBe(true);
    expect(mockPrisma.fieldCorrection.deleteMany).toHaveBeenCalledWith({
      where: { id: 'correction-1', session_id: 'session-1' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend-services && npx jest src/hitl/review-db.service.spec.ts --verbose 2>&1 | tail -20
```

Expected: FAIL — methods not defined.

- [ ] **Step 3: Implement lock methods in ReviewDbService**

Add to `review-db.service.ts`:

```typescript
async acquireDocumentLock(
  data: {
    document_id: string;
    reviewer_id: string;
    session_id: string;
    expires_at: Date;
  },
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? this.prisma;
  this.logger.debug("Acquiring document lock", { document_id: data.document_id });
  return client.documentLock.create({ data });
}

async releaseDocumentLock(
  sessionId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? this.prisma;
  this.logger.debug("Releasing document lock", { sessionId });
  await client.documentLock.deleteMany({
    where: { session_id: sessionId },
  });
}

async refreshLockHeartbeat(
  sessionId: string,
  expiresAt: Date,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const client = tx ?? this.prisma;
  const result = await client.documentLock.updateMany({
    where: { session_id: sessionId },
    data: {
      last_heartbeat: new Date(),
      expires_at: expiresAt,
    },
  });
  return result.count > 0;
}

async findActiveLock(
  documentId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? this.prisma;
  return client.documentLock.findFirst({
    where: {
      document_id: documentId,
      expires_at: { gt: new Date() },
    },
  });
}

async deleteCorrection(
  correctionId: string,
  sessionId: string,
  tx?: Prisma.TransactionClient,
): Promise<boolean> {
  const client = tx ?? this.prisma;
  this.logger.debug("Deleting correction", { correctionId, sessionId });
  const result = await client.fieldCorrection.deleteMany({
    where: { id: correctionId, session_id: sessionId },
  });
  return result.count > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/backend-services && npx jest src/hitl/review-db.service.spec.ts --verbose 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/hitl/review-db.service.ts apps/backend-services/src/hitl/review-db.service.spec.ts
git commit -m "feat(hitl): add lock CRUD and correction deletion to ReviewDbService"
```

---

## Task 3: Backend Lock DTOs

**Files:**
- Create: `apps/backend-services/src/hitl/dto/lock.dto.ts`
- Create: `apps/backend-services/src/hitl/dto/next-session.dto.ts`
- Modify: `apps/backend-services/src/hitl/dto/hitl-responses.dto.ts`

- [ ] **Step 1: Create lock.dto.ts**

```typescript
import { ApiProperty } from "@nestjs/swagger";

export class HeartbeatResponseDto {
  @ApiProperty({ description: "Whether the heartbeat was accepted" })
  ok: boolean;

  @ApiProperty({ description: "New expiry time for the lock" })
  expiresAt: Date;
}

export class LockExpiredResponseDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  expired: boolean;
}
```

- [ ] **Step 2: Create next-session.dto.ts**

```typescript
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { ReviewStatusFilter } from "./status-constants.dto";

export class NextSessionFilterDto {
  @ApiPropertyOptional({ description: "Filter by model ID" })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiPropertyOptional({
    description: "Maximum confidence threshold",
    default: 0.9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  maxConfidence?: number;

  @ApiPropertyOptional({
    description: "Filter by review status",
    enum: ReviewStatusFilter,
  })
  @IsOptional()
  @IsEnum(ReviewStatusFilter)
  reviewStatus?: ReviewStatusFilter;

  @ApiPropertyOptional({ description: "Scope to a specific group ID" })
  @IsOptional()
  @IsString()
  group_id?: string;
}
```

- [ ] **Step 3: Add ReopenSessionResponseDto to hitl-responses.dto.ts**

Add to the end of `hitl-responses.dto.ts`:

```typescript
export class ReopenSessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  message: string;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend-services/src/hitl/dto/
git commit -m "feat(hitl): add DTOs for lock, next-session, and reopen endpoints"
```

---

## Task 4: Backend - Locking Integration in HitlService

**Files:**
- Modify: `apps/backend-services/src/hitl/hitl.service.ts`
- Test: `apps/backend-services/src/hitl/hitl.service.spec.ts`

- [ ] **Step 1: Write failing tests for locking in startSession**

Add to `hitl.service.spec.ts`:

```typescript
describe('startSession with locking', () => {
  it('should acquire a document lock when starting a session', async () => {
    mockDocumentService.findDocument.mockResolvedValue(mockDocument);
    mockReviewDbService.findActiveLock.mockResolvedValue(null);
    mockReviewDbService.createReviewSession.mockResolvedValue({
      ...mockReviewSession,
      document: mockDocumentWithOcr,
      corrections: [],
    });
    mockReviewDbService.acquireDocumentLock.mockResolvedValue({
      id: 'lock-1',
      document_id: 'doc-1',
      reviewer_id: 'reviewer-1',
      session_id: 'session-1',
      acquired_at: new Date(),
      last_heartbeat: new Date(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    await service.startSession({ documentId: 'doc-1' } as ReviewSessionDto, 'reviewer-1');

    expect(mockReviewDbService.acquireDocumentLock).toHaveBeenCalled();
  });

  it('should return existing session if reviewer already has an active lock', async () => {
    mockDocumentService.findDocument.mockResolvedValue(mockDocument);
    mockReviewDbService.findActiveLock.mockResolvedValue({
      id: 'lock-1',
      document_id: 'doc-1',
      reviewer_id: 'reviewer-1',
      session_id: 'session-1',
      acquired_at: new Date(),
      last_heartbeat: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });
    mockReviewDbService.findReviewSession.mockResolvedValue({
      ...mockReviewSession,
      document: mockDocumentWithOcr,
      corrections: [],
    });

    const result = await service.startSession(
      { documentId: 'doc-1' } as ReviewSessionDto,
      'reviewer-1',
    );

    expect(result.id).toBe('session-1');
    expect(mockReviewDbService.createReviewSession).not.toHaveBeenCalled();
  });

  it('should throw ConflictException if document is locked by another reviewer', async () => {
    mockDocumentService.findDocument.mockResolvedValue(mockDocument);
    mockReviewDbService.findActiveLock.mockResolvedValue({
      id: 'lock-1',
      document_id: 'doc-1',
      reviewer_id: 'other-reviewer',
      session_id: 'other-session',
      acquired_at: new Date(),
      last_heartbeat: new Date(),
      expires_at: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(
      service.startSession({ documentId: 'doc-1' } as ReviewSessionDto, 'reviewer-1'),
    ).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/backend-services && npx jest src/hitl/hitl.service.spec.ts --testNamePattern="startSession with locking" --verbose 2>&1 | tail -20
```

- [ ] **Step 3: Update startSession to acquire lock**

In `hitl.service.ts`, add `ConflictException` to NestJS imports, then update `startSession`:

```typescript
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
```

Replace the `startSession` method body. After verifying the document exists:

```typescript
async startSession(dto: ReviewSessionDto, reviewerId: string) {
  this.logger.debug(`Starting review session for document: ${dto.documentId}`);

  const document = await this.documentService.findDocument(dto.documentId);
  if (!document) {
    throw new NotFoundException(`Document ${dto.documentId} not found`);
  }

  // Check for existing active lock
  const existingLock = await this.reviewDb.findActiveLock(dto.documentId);
  if (existingLock) {
    if (existingLock.reviewer_id === reviewerId) {
      // Same reviewer — return their existing session
      return this.getSession(existingLock.session_id);
    }
    throw new ConflictException(
      `Document ${dto.documentId} is currently locked by another reviewer`,
    );
  }

  // Create session and lock atomically
  const session = await this.reviewDb.createReviewSession(
    dto.documentId,
    reviewerId,
  );

  const lockTtlMs = 10 * 60 * 1000; // 10 minutes
  await this.reviewDb.acquireDocumentLock({
    document_id: dto.documentId,
    reviewer_id: reviewerId,
    session_id: session.id,
    expires_at: new Date(Date.now() + lockTtlMs),
  });

  const doc = session.document as {
    group_id?: string;
    workflow_execution_id?: string;
  };
  await this.auditService.recordEvent({
    event_type: "review_session_started",
    resource_type: "review_session",
    resource_id: session.id,
    actor_id: reviewerId,
    document_id: session.document_id,
    workflow_execution_id: doc.workflow_execution_id ?? undefined,
    group_id: doc.group_id ?? undefined,
    payload: { document_id: session.document_id },
  });

  return {
    id: session.id,
    documentId: session.document_id,
    reviewerId: session.reviewer_id,
    status: session.status,
    startedAt: session.started_at,
    document: {
      id: session.document.id,
      original_filename: session.document.original_filename,
      storage_path: session.document.file_path,
      ocr_result: {
        fields:
          (session.document as { ocr_result?: { keyValuePairs?: unknown } })
            .ocr_result?.keyValuePairs || {},
      },
    },
  };
}
```

- [ ] **Step 4: Add lock release to approveSession, escalateSession, skipSession**

In each of the three methods, add after updating the session status:

```typescript
await this.reviewDb.releaseDocumentLock(sessionId);
```

- [ ] **Step 5: Write and run tests for lock release on approve/escalate/skip**

Add tests verifying `releaseDocumentLock` is called in each terminal action. Then run:

```bash
cd apps/backend-services && npx jest src/hitl/hitl.service.spec.ts --verbose 2>&1 | tail -30
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend-services/src/hitl/hitl.service.ts apps/backend-services/src/hitl/hitl.service.spec.ts
git commit -m "feat(hitl): integrate document locking into session lifecycle"
```

---

## Task 5: Backend - Queue Filtering to Exclude Locked Documents

**Files:**
- Modify: `apps/backend-services/src/hitl/review-db.service.ts:85-163`
- Test: `apps/backend-services/src/hitl/review-db.service.spec.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('findReviewQueue with lock filtering', () => {
  it('should exclude documents with active locks', async () => {
    mockPrisma.document.findMany.mockResolvedValue([]);
    await service.findReviewQueue({ reviewStatus: 'pending' });

    const callArgs = mockPrisma.document.findMany.mock.calls[0][0];
    expect(callArgs.where.lock).toEqual({
      OR: [
        { is: null },
        { expires_at: { lte: expect.any(Date) } },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend-services && npx jest src/hitl/review-db.service.spec.ts --testNamePattern="lock filtering" --verbose 2>&1 | tail -10
```

- [ ] **Step 3: Update findReviewQueue to exclude locked documents**

In `review-db.service.ts`, in the `findReviewQueue` method, add to the `where` clause after `groundTruthJob: { is: null }`:

```typescript
// Exclude documents with active (non-expired) locks
lock: {
  OR: [
    { is: null },
    { expires_at: { lte: new Date() } },
  ],
},
```

- [ ] **Step 4: Run tests**

```bash
cd apps/backend-services && npx jest src/hitl/review-db.service.spec.ts --verbose 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend-services/src/hitl/review-db.service.ts apps/backend-services/src/hitl/review-db.service.spec.ts
git commit -m "feat(hitl): exclude locked documents from review queue"
```

---

## Task 6: Backend - Heartbeat, Delete Correction, Reopen, Next-Session Endpoints

**Files:**
- Modify: `apps/backend-services/src/hitl/hitl.controller.ts`
- Modify: `apps/backend-services/src/hitl/hitl.service.ts`
- Test: `apps/backend-services/src/hitl/hitl.service.spec.ts`
- Test: `apps/backend-services/src/hitl/hitl.controller.spec.ts`

- [ ] **Step 1: Write failing tests for heartbeat service method**

In `hitl.service.spec.ts`:

```typescript
describe('heartbeat', () => {
  it('should refresh the lock heartbeat', async () => {
    mockReviewDbService.refreshLockHeartbeat.mockResolvedValue(true);

    const result = await service.heartbeat('session-1');
    expect(result.ok).toBe(true);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('should return expired=true when lock not found', async () => {
    mockReviewDbService.refreshLockHeartbeat.mockResolvedValue(false);

    await expect(service.heartbeat('session-1')).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 2: Write failing tests for deleteCorrection service method**

```typescript
describe('deleteCorrection', () => {
  it('should delete a correction and return success', async () => {
    mockReviewDbService.findReviewSession.mockResolvedValue({
      ...mockReviewSession,
      document: mockDocumentWithOcr,
      corrections: [],
    });
    mockReviewDbService.deleteCorrection.mockResolvedValue(true);

    const result = await service.deleteCorrection('session-1', 'correction-1');
    expect(result).toEqual({ deleted: true });
  });

  it('should throw NotFoundException when correction not found', async () => {
    mockReviewDbService.findReviewSession.mockResolvedValue({
      ...mockReviewSession,
      document: mockDocumentWithOcr,
      corrections: [],
    });
    mockReviewDbService.deleteCorrection.mockResolvedValue(false);

    await expect(
      service.deleteCorrection('session-1', 'not-found'),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Write failing tests for reopenSession service method**

```typescript
describe('reopenSession', () => {
  it('should reopen an approved session within 5-minute window', async () => {
    const completedAt = new Date(Date.now() - 2 * 60 * 1000); // 2 min ago
    mockReviewDbService.findReviewSession.mockResolvedValue({
      ...mockReviewSession,
      status: ReviewStatus.approved,
      completed_at: completedAt,
      reviewer_id: 'reviewer-1',
      document: { ...mockDocumentWithOcr, groundTruthJob: null },
      corrections: [],
    });
    mockReviewDbService.updateReviewSession.mockResolvedValue({
      ...mockReviewSession,
      status: ReviewStatus.in_progress,
      completed_at: null,
      document: mockDocumentWithOcr,
      corrections: [],
    });
    mockReviewDbService.acquireDocumentLock.mockResolvedValue({
      id: 'lock-1',
      document_id: 'doc-1',
      reviewer_id: 'reviewer-1',
      session_id: 'session-1',
      acquired_at: new Date(),
      last_heartbeat: new Date(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    const result = await service.reopenSession('session-1', 'reviewer-1');
    expect(result.status).toBe('in_progress');
  });

  it('should reject reopen after 5-minute window in regular workflow', async () => {
    const completedAt = new Date(Date.now() - 6 * 60 * 1000); // 6 min ago
    mockReviewDbService.findReviewSession.mockResolvedValue({
      ...mockReviewSession,
      status: ReviewStatus.approved,
      completed_at: completedAt,
      reviewer_id: 'reviewer-1',
      document: { ...mockDocumentWithOcr, groundTruthJob: null },
      corrections: [],
    });

    await expect(
      service.reopenSession('session-1', 'reviewer-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject reopen by a different reviewer', async () => {
    mockReviewDbService.findReviewSession.mockResolvedValue({
      ...mockReviewSession,
      status: ReviewStatus.approved,
      completed_at: new Date(),
      reviewer_id: 'reviewer-1',
      document: { ...mockDocumentWithOcr, groundTruthJob: null },
      corrections: [],
    });

    await expect(
      service.reopenSession('session-1', 'reviewer-2'),
    ).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 4: Write failing tests for getNextSession service method**

```typescript
describe('getNextSession', () => {
  it('should find next document, create session, and acquire lock', async () => {
    mockReviewDbService.findReviewQueue.mockResolvedValue([mockDocumentWithOcr]);
    mockReviewDbService.findActiveLock.mockResolvedValue(null);
    mockReviewDbService.createReviewSession.mockResolvedValue({
      ...mockReviewSession,
      document: mockDocumentWithOcr,
      corrections: [],
    });
    mockReviewDbService.acquireDocumentLock.mockResolvedValue({
      id: 'lock-1',
      document_id: 'doc-1',
      reviewer_id: 'reviewer-1',
      session_id: 'session-1',
      acquired_at: new Date(),
      last_heartbeat: new Date(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });

    const result = await service.getNextSession({}, 'reviewer-1', ['group-1']);
    expect(result).toBeDefined();
    expect(result!.id).toBe('session-1');
  });

  it('should return null when queue is empty', async () => {
    mockReviewDbService.findReviewQueue.mockResolvedValue([]);

    const result = await service.getNextSession({}, 'reviewer-1', ['group-1']);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 5: Run all tests to confirm they fail**

```bash
cd apps/backend-services && npx jest src/hitl/hitl.service.spec.ts --verbose 2>&1 | tail -30
```

- [ ] **Step 6: Implement heartbeat method in HitlService**

```typescript
async heartbeat(sessionId: string) {
  const lockTtlMs = 10 * 60 * 1000;
  const newExpiry = new Date(Date.now() + lockTtlMs);
  const refreshed = await this.reviewDb.refreshLockHeartbeat(sessionId, newExpiry);

  if (!refreshed) {
    throw new ConflictException("Lock expired or session not found");
  }

  return { ok: true, expiresAt: newExpiry };
}
```

- [ ] **Step 7: Implement deleteCorrection method in HitlService**

```typescript
async deleteCorrection(sessionId: string, correctionId: string) {
  const session = await this.reviewDb.findReviewSession(sessionId);
  if (!session) {
    throw new NotFoundException(`Review session ${sessionId} not found`);
  }

  const deleted = await this.reviewDb.deleteCorrection(correctionId, sessionId);
  if (!deleted) {
    throw new NotFoundException(`Correction ${correctionId} not found`);
  }

  return { deleted: true };
}
```

- [ ] **Step 8: Implement reopenSession method in HitlService**

Add `ForbiddenException` to NestJS imports, then:

```typescript
async reopenSession(sessionId: string, reviewerId: string) {
  const session = await this.reviewDb.findReviewSession(sessionId);
  if (!session) {
    throw new NotFoundException(`Review session ${sessionId} not found`);
  }

  if (session.reviewer_id !== reviewerId) {
    throw new ForbiddenException("Only the original reviewer can reopen a session");
  }

  if (session.status === ReviewStatus.in_progress) {
    throw new ConflictException("Session is already in progress");
  }

  // Determine mode: check if document has a ground truth job
  const doc = session.document as { groundTruthJob?: { datasetVersion?: { frozen?: boolean } } };
  const hasGroundTruthJob = Boolean(doc.groundTruthJob);

  if (hasGroundTruthJob) {
    // Dataset labeling mode — check if dataset version is frozen
    if (doc.groundTruthJob?.datasetVersion?.frozen) {
      throw new ConflictException(
        "Cannot reopen: dataset version is frozen for benchmarking",
      );
    }
  } else {
    // Regular workflow — 5-minute window
    const completedAt = session.completed_at;
    if (!completedAt) {
      throw new ConflictException("Session has no completion timestamp");
    }
    const fiveMinutesMs = 5 * 60 * 1000;
    if (Date.now() - completedAt.getTime() > fiveMinutesMs) {
      throw new ConflictException(
        "Reopen window has expired (5 minutes after completion)",
      );
    }
  }

  const updated = await this.reviewDb.updateReviewSession(sessionId, {
    status: ReviewStatus.in_progress,
    completed_at: null,
  });

  // Re-acquire the document lock
  const lockTtlMs = 10 * 60 * 1000;
  await this.reviewDb.acquireDocumentLock({
    document_id: session.document_id,
    reviewer_id: reviewerId,
    session_id: sessionId,
    expires_at: new Date(Date.now() + lockTtlMs),
  });

  const docMeta = session.document as {
    group_id?: string;
    workflow_execution_id?: string;
  };
  await this.auditService.recordEvent({
    event_type: "review_session_reopened",
    resource_type: "review_session",
    resource_id: sessionId,
    actor_id: reviewerId,
    document_id: session.document_id,
    workflow_execution_id: docMeta.workflow_execution_id ?? undefined,
    group_id: docMeta.group_id ?? undefined,
    payload: { document_id: session.document_id },
  });

  return {
    id: updated!.id,
    status: updated!.status,
    message: "Review session reopened",
  };
}
```

Note: The `findReviewSession` in `review-db.service.ts` needs to be updated to include the `groundTruthJob` relation with `datasetVersion` for the reopen check. Update the `include` in `findReviewSession`:

```typescript
include: {
  document: {
    include: {
      ocr_result: true,
      groundTruthJob: {
        include: {
          datasetVersion: { select: { frozen: true } },
        },
      },
    },
  },
  corrections: true,
},
```

- [ ] **Step 9: Implement getNextSession method in HitlService**

```typescript
async getNextSession(
  filters: {
    modelId?: string;
    maxConfidence?: number;
    reviewStatus?: string;
  },
  reviewerId: string,
  groupIds: string[],
) {
  const maxConfidence = filters.maxConfidence ?? 0.9;

  // Get queue documents (already excludes locked ones)
  const documents = await this.reviewDb.findReviewQueue({
    status: DocumentStatus.completed_ocr,
    modelId: filters.modelId,
    maxConfidence,
    limit: 10, // Fetch a small batch to find one that passes confidence filter
    reviewStatus: (filters.reviewStatus as "pending" | "reviewed" | "all") ?? "pending",
    groupIds,
  });

  // Filter by confidence (same logic as getQueue)
  const eligible = documents.filter((doc: DocumentWithOcrResult) => {
    if (!doc.ocr_result) return false;
    const fields = doc.ocr_result.keyValuePairs as unknown as ExtractedFields | null;
    if (!fields || typeof fields !== "object") return false;
    return Object.values(fields).some(
      (field: DocumentField) =>
        field?.confidence !== undefined && field.confidence < maxConfidence,
    );
  });

  if (eligible.length === 0) return null;

  // Take the first eligible document and start a session
  const nextDoc = eligible[0];
  const dto: ReviewSessionDto = { documentId: nextDoc.id };
  return this.startSession(dto, reviewerId);
}
```

- [ ] **Step 10: Add controller endpoints**

Add to `hitl.controller.ts`, importing new DTOs and adding `ConflictException`, `Delete`, `ForbiddenException` to NestJS imports:

```typescript
@Post("sessions/:id/heartbeat")
@Identity({ allowApiKey: true })
@ApiOperation({ summary: "Send heartbeat to keep document lock alive" })
@ApiParam({ name: "id", description: "Session ID" })
@ApiOkResponse({
  description: "Heartbeat accepted, lock extended",
  type: HeartbeatResponseDto,
})
@ApiConflictResponse({ description: "Lock expired or session not found" })
async heartbeat(@Param("id") sessionId: string, @Req() req: Request) {
  const session = await this.hitlService.findReviewSession(sessionId);
  if (!session) {
    throw new NotFoundException(`Review session ${sessionId} not found`);
  }
  identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
  return this.hitlService.heartbeat(sessionId);
}

@Delete("sessions/:id/corrections/:correctionId")
@Identity({ allowApiKey: true })
@ApiOperation({ summary: "Delete a specific correction (undo)" })
@ApiParam({ name: "id", description: "Session ID" })
@ApiParam({ name: "correctionId", description: "Correction ID" })
@ApiOkResponse({ description: "Correction deleted" })
@ApiNotFoundResponse({ description: "Session or correction not found" })
@ApiForbiddenResponse({ description: "Access denied" })
async deleteCorrection(
  @Param("id") sessionId: string,
  @Param("correctionId") correctionId: string,
  @Req() req: Request,
) {
  const session = await this.hitlService.findReviewSession(sessionId);
  if (!session) {
    throw new NotFoundException(`Review session ${sessionId} not found`);
  }
  identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
  return this.hitlService.deleteCorrection(sessionId, correctionId);
}

@Post("sessions/:id/reopen")
@Identity({ allowApiKey: true })
@ApiOperation({ summary: "Reopen a completed review session" })
@ApiParam({ name: "id", description: "Session ID" })
@ApiOkResponse({
  description: "Session reopened",
  type: ReopenSessionResponseDto,
})
@ApiConflictResponse({ description: "Reopen window expired or dataset frozen" })
@ApiForbiddenResponse({ description: "Only the original reviewer can reopen" })
@ApiNotFoundResponse({ description: "Session not found" })
async reopenSession(@Param("id") sessionId: string, @Req() req: Request) {
  const session = await this.hitlService.findReviewSession(sessionId);
  if (!session) {
    throw new NotFoundException(`Review session ${sessionId} not found`);
  }
  identityCanAccessGroup(req.resolvedIdentity, session.document.group_id);
  const reviewerId =
    req.user?.sub || (req.user as { id?: string })?.id || "anonymous";
  return this.hitlService.reopenSession(sessionId, reviewerId);
}

@Post("sessions/next")
@Identity({ allowApiKey: true })
@ApiOperation({ summary: "Get next document and start a session atomically" })
@ApiOkResponse({
  description: "New session created for next document",
  type: ReviewSessionResponseDto,
})
@ApiNotFoundResponse({ description: "No documents available in queue" })
async getNextSession(
  @Body() filters: NextSessionFilterDto,
  @Req() req: Request,
) {
  let groupIds: string[];
  if (filters.group_id) {
    identityCanAccessGroup(req.resolvedIdentity, filters.group_id);
    groupIds = [filters.group_id];
  } else {
    groupIds = getIdentityGroupIds(req.resolvedIdentity);
  }
  const reviewerId =
    req.user?.sub || (req.user as { id?: string })?.id || "anonymous";
  const result = await this.hitlService.getNextSession(filters, reviewerId, groupIds);
  if (!result) {
    throw new NotFoundException("No documents available in the review queue");
  }
  return result;
}
```

Add imports at the top of the controller:

```typescript
import { ApiConflictResponse } from "@nestjs/swagger";
import { Delete } from "@nestjs/common";
import { HeartbeatResponseDto } from "./dto/lock.dto";
import { ReopenSessionResponseDto } from "./dto/hitl-responses.dto";
import { NextSessionFilterDto } from "./dto/next-session.dto";
```

Note: The `sessions/next` route must be defined BEFORE `sessions/:id` in the controller to avoid the `next` being captured as an `:id` parameter.

- [ ] **Step 11: Run all backend tests**

```bash
cd apps/backend-services && npx jest src/hitl/ --verbose 2>&1 | tail -40
```

Expected: All tests PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/backend-services/src/hitl/
git commit -m "feat(hitl): add heartbeat, delete-correction, reopen, and next-session endpoints"
```

---

## Task 7: Frontend - Keyboard Shortcuts System

**Files:**
- Modify: `apps/frontend/src/features/annotation/core/keyboard/useKeyboardShortcuts.ts`
- Modify: `apps/frontend/src/features/annotation/core/keyboard/KeyboardManager.tsx`

- [ ] **Step 1: Implement useKeyboardShortcuts hook**

Replace the empty stub in `useKeyboardShortcuts.ts`:

```typescript
import { useCallback, useEffect, useRef } from "react";

export interface ShortcutDefinition {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  description: string;
  /** If true, fires even when a text input is focused */
  alwaysActive?: boolean;
}

export const useKeyboardShortcuts = (shortcuts: ShortcutDefinition[]) => {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInputFocused =
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable;

    for (const shortcut of shortcutsRef.current) {
      if (!shortcut.alwaysActive && isInputFocused) continue;

      const ctrlMatch = shortcut.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  return { shortcuts };
};
```

- [ ] **Step 2: Implement KeyboardManager component**

Replace the stub in `KeyboardManager.tsx`:

```tsx
import { FC, ReactNode } from "react";
import {
  ShortcutDefinition,
  useKeyboardShortcuts,
} from "./useKeyboardShortcuts";

interface KeyboardManagerProps {
  shortcuts: ShortcutDefinition[];
  children: ReactNode;
}

export const KeyboardManager: FC<KeyboardManagerProps> = ({
  shortcuts,
  children,
}) => {
  useKeyboardShortcuts(shortcuts);
  return <>{children}</>;
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/annotation/core/keyboard/
git commit -m "feat(hitl): implement keyboard shortcut registry and manager"
```

---

## Task 8: Frontend - Shortcuts Overlay

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/components/ShortcutsOverlay.tsx`

- [ ] **Step 1: Create ShortcutsOverlay component**

```tsx
import { Kbd, Modal, Stack, Table, Text } from "@mantine/core";
import { FC } from "react";
import type { ShortcutDefinition } from "../../core/keyboard/useKeyboardShortcuts";

interface ShortcutsOverlayProps {
  opened: boolean;
  onClose: () => void;
  shortcuts: ShortcutDefinition[];
}

const formatShortcut = (s: ShortcutDefinition) => {
  const parts: string[] = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.shift) parts.push("Shift");
  if (s.alt) parts.push("Alt");

  const keyDisplay: Record<string, string> = {
    arrowdown: "↓",
    arrowup: "↑",
    enter: "Enter",
    escape: "Esc",
    tab: "Tab",
    "/": "/",
  };
  parts.push(keyDisplay[s.key.toLowerCase()] ?? s.key.toUpperCase());
  return parts;
};

export const ShortcutsOverlay: FC<ShortcutsOverlayProps> = ({
  opened,
  onClose,
  shortcuts,
}) => (
  <Modal
    opened={opened}
    onClose={onClose}
    title="Keyboard Shortcuts"
    size="md"
  >
    <Stack gap="xs">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Shortcut</Table.Th>
            <Table.Th>Action</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shortcuts.map((s, i) => (
            <Table.Tr key={i}>
              <Table.Td>
                {formatShortcut(s).map((part, j) => (
                  <span key={j}>
                    {j > 0 && (
                      <Text component="span" size="xs" c="dimmed" mx={2}>
                        +
                      </Text>
                    )}
                    <Kbd size="sm">{part}</Kbd>
                  </span>
                ))}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{s.description}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  </Modal>
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/components/ShortcutsOverlay.tsx
git commit -m "feat(hitl): add keyboard shortcuts overlay component"
```

---

## Task 9: Frontend - Session Heartbeat & Idle Detection

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/hooks/useSessionHeartbeat.ts`

- [ ] **Step 1: Create useSessionHeartbeat hook**

```typescript
import { notifications } from "@mantine/notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiService } from "@/data/services/api.service";

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
const IDLE_WARNING_MS = 8 * 60 * 1000; // 8 minutes
const IDLE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export const useSessionHeartbeat = (
  sessionId: string | undefined,
  queuePath: string,
) => {
  const navigate = useNavigate();
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const idleCheckRef = useRef<ReturnType<typeof setInterval>>();

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleWarning(false);
  }, []);

  // Track user activity
  useEffect(() => {
    const events = ["keydown", "mousedown", "mousemove", "click"] as const;
    const handler = () => resetActivity();

    for (const event of events) {
      document.addEventListener(event, handler, { passive: true });
    }
    return () => {
      for (const event of events) {
        document.removeEventListener(event, handler);
      }
    };
  }, [resetActivity]);

  // Heartbeat interval
  useEffect(() => {
    if (!sessionId) return;

    const sendHeartbeat = async () => {
      try {
        await apiService.post(`/hitl/sessions/${sessionId}/heartbeat`, {});
      } catch {
        // Lock expired — redirect to queue
        notifications.show({
          title: "Session expired",
          message:
            "Your session was released due to inactivity. Corrections have been saved.",
          color: "red",
          autoClose: 5000,
        });
        navigate(queuePath);
      }
    };

    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sessionId, navigate, queuePath]);

  // Idle warning check
  useEffect(() => {
    if (!sessionId) return;

    idleCheckRef.current = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;
      if (idleTime >= IDLE_WARNING_MS && !idleWarning) {
        setIdleWarning(true);
        notifications.show({
          title: "Idle warning",
          message:
            "Session will be released in 2 minutes due to inactivity.",
          color: "yellow",
          autoClose: false,
          id: "idle-warning",
        });
      }
    }, 10_000); // Check every 10 seconds

    return () => {
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);
    };
  }, [sessionId, idleWarning]);

  return { idleWarning, resetActivity };
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/hooks/useSessionHeartbeat.ts
git commit -m "feat(hitl): add session heartbeat with idle detection"
```

---

## Task 10: Frontend - Undo/Redo System

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/hooks/useUndoRedo.ts`

- [ ] **Step 1: Create useUndoRedo hook**

```typescript
import { useCallback, useRef, useState } from "react";
import { apiService } from "@/data/services/api.service";

interface UndoEntry {
  type: "field-edit" | "correction-delete";
  fieldKey: string;
  previousValue: string;
  /** Set after the correction is persisted server-side */
  correctionId?: string;
}

interface ReopenUndoEntry {
  sessionId: string;
  action: "approved" | "escalated" | "skipped";
}

export const useUndoRedo = (sessionId: string | undefined) => {
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [pendingReopen, setPendingReopen] = useState<ReopenUndoEntry | null>(
    null,
  );
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const pushUndo = useCallback(
    (entry: UndoEntry) => {
      setUndoStack((prev) => [...prev, entry]);
      setRedoStack([]); // Clear redo on new action
    },
    [],
  );

  const undo = useCallback((): UndoEntry | null => {
    let popped: UndoEntry | null = null;
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      popped = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    if (popped) {
      setRedoStack((prev) => [...prev, popped!]);

      // If server-side correction, delete it
      if (popped.correctionId && sessionId) {
        apiService
          .delete(
            `/hitl/sessions/${sessionId}/corrections/${popped.correctionId}`,
          )
          .catch(() => {
            // Best-effort deletion
          });
      }
    }
    return popped;
  }, [sessionId]);

  const redo = useCallback((): UndoEntry | null => {
    let popped: UndoEntry | null = null;
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      popped = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    if (popped) {
      setUndoStack((prev) => [...prev, popped!]);
    }
    return popped;
  }, []);

  const markCorrectionIds = useCallback(
    (corrections: Array<{ id: string; field_key: string }>) => {
      setUndoStack((prev) =>
        prev.map((entry) => {
          if (entry.correctionId) return entry;
          const match = corrections.find(
            (c) => c.field_key === entry.fieldKey,
          );
          if (match) return { ...entry, correctionId: match.id };
          return entry;
        }),
      );
    },
    [],
  );

  const setPendingSessionReopen = useCallback(
    (
      completedSessionId: string,
      action: "approved" | "escalated" | "skipped",
      timeoutMs?: number,
    ) => {
      if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);

      const entry: ReopenUndoEntry = {
        sessionId: completedSessionId,
        action,
      };
      setPendingReopen(entry);

      if (timeoutMs) {
        reopenTimerRef.current = setTimeout(() => {
          setPendingReopen(null);
        }, timeoutMs);
      }
    },
    [],
  );

  const undoSessionAction = useCallback(async (): Promise<boolean> => {
    if (!pendingReopen) return false;

    try {
      await apiService.post(
        `/hitl/sessions/${pendingReopen.sessionId}/reopen`,
        {},
      );
      setPendingReopen(null);
      if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);
      return true;
    } catch {
      return false;
    }
  }, [pendingReopen]);

  const clearPendingReopen = useCallback(() => {
    setPendingReopen(null);
    if (reopenTimerRef.current) clearTimeout(reopenTimerRef.current);
  }, []);

  const clear = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    undoStack,
    redoStack,
    pushUndo,
    undo,
    redo,
    markCorrectionIds,
    clear,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    pendingReopen,
    setPendingSessionReopen,
    undoSessionAction,
    clearPendingReopen,
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/hooks/useUndoRedo.ts
git commit -m "feat(hitl): add undo/redo system for field corrections and session actions"
```

---

## Task 11: Frontend - Auto-Advance Hook

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/hooks/useAutoAdvance.ts`

- [ ] **Step 1: Create useAutoAdvance hook**

```typescript
import { notifications } from "@mantine/notifications";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface NextSessionResponse {
  id: string;
  documentId: string;
  reviewerId: string;
  status: string;
  startedAt: string;
}

interface AutoAdvanceFilters {
  modelId?: string;
  maxConfidence?: number;
  reviewStatus?: string;
}

export const useAutoAdvance = (filters?: AutoAdvanceFilters) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { activeGroup } = useGroup();

  const getBasePath = useCallback(() => {
    const benchmarkMatch = location.pathname.match(
      /^\/benchmarking\/datasets\/([^/]+)\/versions\/([^/]+)\/review/,
    );
    if (benchmarkMatch) {
      return `/benchmarking/datasets/${benchmarkMatch[1]}/versions/${benchmarkMatch[2]}/review`;
    }
    return "/review";
  }, [location.pathname]);

  const nextSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post<NextSessionResponse>(
        "/hitl/sessions/next",
        {
          ...filters,
          group_id: activeGroup?.id,
        },
      );
      return response.data;
    },
    onSuccess: (data) => {
      if (data) {
        navigate(`${getBasePath()}/${data.id}`);
      }
    },
    onError: () => {
      notifications.show({
        title: "Queue complete",
        message: "No more documents to review.",
        color: "blue",
        autoClose: 3000,
      });
      navigate(getBasePath());
    },
  });

  const advance = useCallback(() => {
    nextSessionMutation.mutate();
  }, [nextSessionMutation]);

  return {
    advance,
    isAdvancing: nextSessionMutation.isPending,
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/hooks/useAutoAdvance.ts
git commit -m "feat(hitl): add auto-advance hook for seamless document progression"
```

---

## Task 12: Frontend - Field Focus & Zoom-to-Field Hook

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/hooks/useFieldFocus.ts`
- Modify: `apps/frontend/src/features/annotation/core/canvas/AnnotationCanvas.tsx`

- [ ] **Step 1: Add panTo method to AnnotationCanvas via forwardRef**

Update `AnnotationCanvas.tsx` to use `forwardRef` and `useImperativeHandle`:

Add to imports:
```typescript
import { forwardRef, useImperativeHandle } from "react";
```

Export a handle type:
```typescript
export interface AnnotationCanvasHandle {
  panTo: (centerX: number, centerY: number, targetZoom: number) => void;
}
```

Change the component to use `forwardRef`:

```typescript
export const AnnotationCanvas = forwardRef<
  AnnotationCanvasHandle,
  AnnotationCanvasProps
>(({
  imageUrl,
  width,
  height,
  boxes = [],
  activeTool = CanvasTool.SELECT,
  onBoxSelect,
  onBoxCreate,
}, ref) => {
  // ... existing state ...

  useImperativeHandle(ref, () => ({
    panTo: (centerX: number, centerY: number, targetZoom: number) => {
      const newScale = fitScale * targetZoom;
      // Center the target point in the viewport
      const newPanX = width / 2 - centerX * newScale;
      const newPanY = height / 2 - centerY * newScale;
      const clamped = clampPan({ x: newPanX, y: newPanY }, newScale);

      // Animate using Konva tween
      const stage = stageRef.current;
      if (stage) {
        new Konva.Tween({
          node: stage,
          duration: 0.2,
          x: clamped.x,
          y: clamped.y,
          scaleX: newScale,
          scaleY: newScale,
          easing: Konva.Easings.EaseInOut,
          onFinish: () => {
            setPan(clamped);
            setUserZoom(targetZoom);
          },
        }).play();
      }
    },
  }), [fitScale, width, height, clampPan]);

  // ... rest of component unchanged ...
});

AnnotationCanvas.displayName = "AnnotationCanvas";
```

- [ ] **Step 2: Create useFieldFocus hook**

```typescript
import { useCallback, useRef } from "react";
import type { AnnotationCanvasHandle } from "../../core/canvas/AnnotationCanvas";
import type { BoundingBox } from "../../core/types/canvas";

const DEFAULT_ZOOM = 2;

interface FieldWithBounds {
  fieldKey: string;
  boundingBox?: BoundingBox;
}

export const useFieldFocus = (fields: FieldWithBounds[]) => {
  const canvasRef = useRef<AnnotationCanvasHandle>(null);

  const focusField = useCallback(
    (fieldKey: string) => {
      const field = fields.find((f) => f.fieldKey === fieldKey);
      if (!field?.boundingBox?.polygon?.length) return;

      const points = field.boundingBox.polygon;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      canvasRef.current?.panTo(centerX, centerY, DEFAULT_ZOOM);
    },
    [fields],
  );

  return { canvasRef, focusField };
};
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/annotation/core/canvas/AnnotationCanvas.tsx apps/frontend/src/features/annotation/hitl/hooks/useFieldFocus.ts
git commit -m "feat(hitl): add zoom-to-field navigation with canvas panTo animation"
```

---

## Task 13: Frontend - Snippet View Component

**Files:**
- Create: `apps/frontend/src/features/annotation/hitl/components/SnippetView.tsx`

- [ ] **Step 1: Create SnippetView component**

```tsx
import {
  Badge,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { colorForFieldKeyWithBorder } from "@/shared/utils";
import { ConfidenceIndicator } from "./ConfidenceIndicator";

interface SnippetField {
  fieldKey: string;
  value: string;
  confidence?: number;
  boundingRegions?: Array<{ polygon: number[] }>;
}

interface SnippetViewProps {
  fields: SnippetField[];
  documentImage: HTMLImageElement | null;
  activeFieldKey: string | null;
  onFieldSelect: (fieldKey: string) => void;
  onFieldChange: (fieldKey: string, value: string) => void;
  correctionMap: Record<string, { corrected_value?: string }>;
  readOnly?: boolean;
}

const cropFieldSnippet = (
  image: HTMLImageElement,
  polygon: number[],
  padding: number = 0.2,
): string | null => {
  if (polygon.length < 4) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < polygon.length; i += 2) {
    xs.push(polygon[i]);
    ys.push(polygon[i + 1]);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;
  const padX = boxWidth * padding;
  const padY = boxHeight * padding;

  const cropX = Math.max(0, minX - padX);
  const cropY = Math.max(0, minY - padY);
  const cropW = Math.min(image.naturalWidth - cropX, boxWidth + 2 * padX);
  const cropH = Math.min(image.naturalHeight - cropY, boxHeight + 2 * padY);

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return canvas.toDataURL();
};

export const SnippetView: FC<SnippetViewProps> = ({
  fields,
  documentImage,
  activeFieldKey,
  onFieldSelect,
  onFieldChange,
  correctionMap,
  readOnly,
}) => {
  const [snippets, setSnippets] = useState<Record<string, string | null>>({});
  const activeRowRef = useRef<HTMLDivElement>(null);

  // Generate snippets when fields or image change
  useEffect(() => {
    if (!documentImage) return;

    const newSnippets: Record<string, string | null> = {};
    for (const field of fields) {
      const polygon = field.boundingRegions?.[0]?.polygon;
      if (polygon) {
        newSnippets[field.fieldKey] = cropFieldSnippet(
          documentImage,
          polygon,
        );
      } else {
        newSnippets[field.fieldKey] = null;
      }
    }
    setSnippets(newSnippets);
  }, [fields, documentImage]);

  // Scroll active row into view
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeFieldKey]);

  return (
    <ScrollArea
      type="auto"
      style={{ flex: 1, minHeight: 0 }}
      offsetScrollbars="present"
    >
      <Stack gap="md" p="sm">
        {fields.map((field) => {
          const isActive = field.fieldKey === activeFieldKey;
          const snippet = snippets[field.fieldKey];
          const { borderCss } = colorForFieldKeyWithBorder(field.fieldKey);
          const correctedValue = correctionMap[field.fieldKey]?.corrected_value;

          return (
            <Paper
              key={field.fieldKey}
              ref={isActive ? activeRowRef : undefined}
              withBorder
              p="sm"
              style={{
                borderColor: isActive ? "#ff0000" : borderCss,
                borderStyle: isActive ? "dashed" : "solid",
                borderWidth: isActive ? "3px" : "2px",
                cursor: "pointer",
              }}
              onClick={() => onFieldSelect(field.fieldKey)}
            >
              <Group align="flex-start" gap="md" wrap="nowrap">
                {/* Document snippet */}
                <div
                  style={{
                    width: 200,
                    minWidth: 200,
                    background: "#1a1a2e",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 60,
                  }}
                >
                  {snippet ? (
                    <img
                      src={snippet}
                      alt={`Source region for ${field.fieldKey}`}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 150,
                        objectFit: "contain",
                      }}
                    />
                  ) : (
                    <Text size="xs" c="dimmed" ta="center" p="xs">
                      No source region
                    </Text>
                  )}
                </div>

                {/* Field details */}
                <Stack gap="xs" style={{ flex: 1 }}>
                  <Group justify="space-between">
                    <Text fw={600} size="sm">
                      {field.fieldKey}
                    </Text>
                    <ConfidenceIndicator confidence={field.confidence} />
                  </Group>
                  <TextInput
                    value={correctedValue ?? field.value}
                    onChange={(e) =>
                      onFieldChange(field.fieldKey, e.currentTarget.value)
                    }
                    disabled={readOnly}
                    size="sm"
                  />
                </Stack>
              </Group>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/components/SnippetView.tsx
git commit -m "feat(hitl): add cropped snippet view as alternative to full document canvas"
```

---

## Task 14: Frontend - Update ReviewToolbar with View & Sort Toggles

**Files:**
- Modify: `apps/frontend/src/features/annotation/hitl/components/ReviewToolbar.tsx`

- [ ] **Step 1: Add view mode and sort toggle buttons**

Update `ReviewToolbar.tsx`:

```tsx
import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowsSort,
  IconCheck,
  IconLayoutGrid,
  IconPhoto,
  IconPlayerSkipForward,
} from "@tabler/icons-react";
import { FC } from "react";

type ViewMode = "document" | "snippet";
type SortMode = "confidence" | "document-order";

interface ReviewToolbarProps {
  onApprove: () => void;
  onEscalate: () => void;
  onSkip: () => void;
  isApproving?: boolean;
  isEscalating?: boolean;
  isSkipping?: boolean;
  viewMode?: ViewMode;
  onViewModeToggle?: () => void;
  sortMode?: SortMode;
  onSortModeToggle?: () => void;
}

export const ReviewToolbar: FC<ReviewToolbarProps> = ({
  onApprove,
  onEscalate,
  onSkip,
  isApproving,
  isEscalating,
  isSkipping,
  viewMode,
  onViewModeToggle,
  sortMode,
  onSortModeToggle,
}) => {
  return (
    <Group justify="space-between">
      <Group>
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={onApprove}
          loading={isApproving}
        >
          Approve
        </Button>
        <Button
          variant="light"
          color="yellow"
          leftSection={<IconAlertTriangle size={16} />}
          onClick={onEscalate}
          loading={isEscalating}
        >
          Escalate
        </Button>
      </Group>

      <Group>
        {onViewModeToggle && (
          <Tooltip
            label={
              viewMode === "document"
                ? "Switch to snippet view (Ctrl+Shift+V)"
                : "Switch to document view (Ctrl+Shift+V)"
            }
          >
            <ActionIcon
              variant="subtle"
              onClick={onViewModeToggle}
              size="lg"
            >
              {viewMode === "document" ? (
                <IconLayoutGrid size={18} />
              ) : (
                <IconPhoto size={18} />
              )}
            </ActionIcon>
          </Tooltip>
        )}
        {onSortModeToggle && (
          <Tooltip
            label={
              sortMode === "confidence"
                ? "Sort by document order (Ctrl+Shift+O)"
                : "Sort by confidence (Ctrl+Shift+O)"
            }
          >
            <ActionIcon
              variant="subtle"
              onClick={onSortModeToggle}
              size="lg"
            >
              <IconArrowsSort size={18} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Button
        variant="subtle"
        color="gray"
        leftSection={<IconPlayerSkipForward size={16} />}
        onClick={onSkip}
        loading={isSkipping}
      >
        Skip
      </Button>
    </Group>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/components/ReviewToolbar.tsx
git commit -m "feat(hitl): add view mode and sort toggle buttons to ReviewToolbar"
```

---

## Task 15: Frontend - Add reopen and deleteCorrection mutations to useReviewSession

**Files:**
- Modify: `apps/frontend/src/features/annotation/hitl/hooks/useReviewSession.ts`

- [ ] **Step 1: Add new mutations**

Add after the existing `skipSessionMutation` in `useReviewSession.ts`:

```typescript
const deleteCorrectionMutation = useMutation({
  mutationFn: async ({
    correctionId,
  }: {
    correctionId: string;
  }) => {
    const response = await apiService.delete(
      `/hitl/sessions/${sessionId}/corrections/${correctionId}`,
    );
    return response.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({
      queryKey: ["hitl-session-corrections", sessionId],
    });
  },
});

const reopenSessionMutation = useMutation({
  mutationFn: async (targetSessionId: string) => {
    const response = await apiService.post(
      `/hitl/sessions/${targetSessionId}/reopen`,
      {},
    );
    return response.data;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
  },
});
```

Add to the return object:

```typescript
deleteCorrection: deleteCorrectionMutation.mutate,
deleteCorrectionAsync: deleteCorrectionMutation.mutateAsync,
reopenSession: reopenSessionMutation.mutate,
reopenSessionAsync: reopenSessionMutation.mutateAsync,
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/annotation/hitl/hooks/useReviewSession.ts
git commit -m "feat(hitl): add deleteCorrection and reopenSession mutations"
```

---

## Task 16: Frontend - Integrate Everything into ReviewWorkspacePage

**Files:**
- Modify: `apps/frontend/src/features/annotation/hitl/pages/ReviewWorkspacePage.tsx`

This is the largest integration task. It wires all the new hooks and components into the existing page.

- [ ] **Step 1: Add imports for all new hooks and components**

Add to the imports in `ReviewWorkspacePage.tsx`:

```typescript
import { notifications } from "@mantine/notifications";
import type { ShortcutDefinition } from "../../core/keyboard/useKeyboardShortcuts";
import { KeyboardManager } from "../../core/keyboard/KeyboardManager";
import type { AnnotationCanvasHandle } from "../../core/canvas/AnnotationCanvas";
import { ShortcutsOverlay } from "../components/ShortcutsOverlay";
import { SnippetView } from "../components/SnippetView";
import { useSessionHeartbeat } from "../hooks/useSessionHeartbeat";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { useAutoAdvance } from "../hooks/useAutoAdvance";
import { useFieldFocus } from "../hooks/useFieldFocus";
```

- [ ] **Step 2: Add state for view mode, sort mode, shortcuts overlay, and image ref**

Inside the component, add:

```typescript
const [viewMode, setViewMode] = useState<"document" | "snippet">("document");
const [sortMode, setSortMode] = useState<"confidence" | "document-order">("confidence");
const [shortcutsOpen, setShortcutsOpen] = useState(false);
const documentImageRef = useRef<HTMLImageElement | null>(null);
```

- [ ] **Step 3: Initialize new hooks**

```typescript
const queuePath = location.pathname.match(
  /^\/benchmarking\/datasets\/([^/]+)\/versions\/([^/]+)\/review/,
)
  ? location.pathname.replace(/\/[^/]+$/, "")
  : "/review";

useSessionHeartbeat(sessionId, queuePath);

const {
  pushUndo,
  undo,
  redo,
  canUndo,
  pendingReopen,
  setPendingSessionReopen,
  undoSessionAction,
  clearPendingReopen,
  clear: clearUndoStack,
} = useUndoRedo(sessionId);

const { advance, isAdvancing } = useAutoAdvance();

const { canvasRef, focusField } = useFieldFocus(fields);
```

- [ ] **Step 4: Update sortedFields to respect sortMode**

Replace the existing `sortedFields` useMemo:

```typescript
const sortedFields = useMemo(() => {
  if (sortMode === "confidence") {
    return [...fields].sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1));
  }
  return fields; // document order (as returned by OCR)
}, [fields, sortMode]);
```

- [ ] **Step 5: Update handleFieldChange to push undo entries**

```typescript
const handleFieldChange = (field: ReviewField, value: string) => {
  const previousValue =
    correctionMap[field.fieldKey]?.corrected_value ?? field.value;

  pushUndo({
    type: "field-edit",
    fieldKey: field.fieldKey,
    previousValue,
  });

  setCorrectionMap((prev) => ({
    ...prev,
    [field.fieldKey]: {
      field_key: field.fieldKey,
      original_value: field.value,
      corrected_value: value,
      original_conf: field.confidence,
      action: CorrectionAction.CORRECTED,
    },
  }));
};
```

- [ ] **Step 6: Update handleApprove/handleEscalate/handleSkip for auto-advance and undo toast**

```typescript
const handleApprove = async () => {
  const payload = Object.values(correctionMap).filter(
    (correction) => correction.action === CorrectionAction.CORRECTED,
  );
  if (payload.length > 0) {
    await submitCorrectionsAsync(payload);
  }
  await approveSessionAsync();

  // Set up undo toast
  if (sessionId) {
    setPendingSessionReopen(sessionId, "approved", 5 * 60 * 1000);
    notifications.show({
      title: "Document approved",
      message: "Press Ctrl+Z to undo",
      color: "green",
      autoClose: 5000,
    });
  }

  clearUndoStack();
  setCorrectionMap({});
  advance();
};

const handleSkip = async () => {
  await skipSessionAsync();

  if (sessionId) {
    setPendingSessionReopen(sessionId, "skipped", 5 * 60 * 1000);
  }

  clearUndoStack();
  setCorrectionMap({});
  advance();
};
```

Update the escalate handler similarly (call `advance()` after escalation).

- [ ] **Step 7: Add field navigation helpers**

```typescript
const navigateToField = useCallback(
  (direction: "next" | "prev") => {
    const currentIndex = filteredSortedFields.findIndex(
      (f) => f.fieldKey === activeFieldKey,
    );
    let nextIndex: number;
    if (direction === "next") {
      nextIndex =
        currentIndex < filteredSortedFields.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex =
        currentIndex > 0 ? currentIndex - 1 : filteredSortedFields.length - 1;
    }
    const nextField = filteredSortedFields[nextIndex];
    if (nextField) {
      setActiveFieldKey(nextField.fieldKey);
      if (viewMode === "document") {
        focusField(nextField.fieldKey);
      }
    }
  },
  [filteredSortedFields, activeFieldKey, viewMode, focusField],
);
```

- [ ] **Step 8: Define keyboard shortcuts array**

```typescript
const handleUndo = useCallback(() => {
  if (canUndo) {
    const entry = undo();
    if (entry) {
      setCorrectionMap((prev) => {
        const next = { ...prev };
        if (entry.previousValue === fields.find((f) => f.fieldKey === entry.fieldKey)?.value) {
          delete next[entry.fieldKey];
        } else {
          next[entry.fieldKey] = {
            ...next[entry.fieldKey],
            field_key: entry.fieldKey,
            corrected_value: entry.previousValue,
            action: CorrectionAction.CORRECTED,
          };
        }
        return next;
      });
    }
  } else if (pendingReopen) {
    undoSessionAction();
  }
}, [canUndo, undo, pendingReopen, undoSessionAction, fields]);

const shortcuts: ShortcutDefinition[] = useMemo(
  () => [
    {
      key: "ArrowDown",
      ctrl: true,
      handler: () => navigateToField("next"),
      description: "Next field",
    },
    {
      key: "ArrowUp",
      ctrl: true,
      handler: () => navigateToField("prev"),
      description: "Previous field",
    },
    {
      key: "Enter",
      ctrl: true,
      handler: handleApprove,
      description: "Approve document",
      alwaysActive: true,
    },
    {
      key: "E",
      ctrl: true,
      shift: true,
      handler: () => setEscalationOpen(true),
      description: "Escalate document",
      alwaysActive: true,
    },
    {
      key: "S",
      ctrl: true,
      shift: true,
      handler: handleSkip,
      description: "Skip document",
      alwaysActive: true,
    },
    {
      key: "z",
      ctrl: true,
      handler: handleUndo,
      description: "Undo",
      alwaysActive: true,
    },
    {
      key: "z",
      ctrl: true,
      shift: true,
      handler: () => {
        const entry = redo();
        if (entry) {
          setCorrectionMap((prev) => ({
            ...prev,
            [entry.fieldKey]: {
              ...prev[entry.fieldKey],
              field_key: entry.fieldKey,
              corrected_value: entry.previousValue,
              action: CorrectionAction.CORRECTED,
            },
          }));
        }
      },
      description: "Redo",
      alwaysActive: true,
    },
    {
      key: "Escape",
      handler: () => setActiveFieldKey(null),
      description: "Deselect field / cancel edit",
      alwaysActive: true,
    },
    {
      key: "V",
      ctrl: true,
      shift: true,
      handler: () =>
        setViewMode((m) => (m === "document" ? "snippet" : "document")),
      description: "Toggle document/snippet view",
      alwaysActive: true,
    },
    {
      key: "O",
      ctrl: true,
      shift: true,
      handler: () =>
        setSortMode((m) =>
          m === "confidence" ? "document-order" : "confidence",
        ),
      description: "Toggle sort order",
      alwaysActive: true,
    },
    {
      key: "/",
      ctrl: true,
      handler: () => setShortcutsOpen((o) => !o),
      description: "Show keyboard shortcuts",
      alwaysActive: true,
    },
  ],
  [navigateToField, handleApprove, handleSkip, handleUndo, redo],
);
```

- [ ] **Step 9: Wrap the component return in KeyboardManager and add view mode switching**

Wrap the entire return JSX in `<KeyboardManager shortcuts={shortcuts}>`.

In the left panel (document viewer area), conditionally render based on `viewMode`:

```tsx
{viewMode === "document" ? (
  // Existing canvas/PDF viewer code, but pass canvasRef to AnnotationCanvas
  <AnnotationCanvas
    ref={canvasRef}
    imageUrl={documentUrl}
    width={canvasWidth}
    height={canvasHeight}
    boxes={boxes}
    activeTool={CanvasTool.SELECT}
    onBoxSelect={(boxId) => {
      setActiveFieldKey(boxId);
      if (boxId) focusField(boxId);
    }}
  />
) : null}

{viewMode === "snippet" ? (
  // Full-width snippet view replaces the two-panel layout
  <SnippetView
    fields={filteredSortedFields.map((f) => ({
      fieldKey: f.fieldKey,
      value: f.value,
      confidence: f.confidence,
      boundingRegions: /* get from original OCR data */,
    }))}
    documentImage={documentImageRef.current}
    activeFieldKey={activeFieldKey}
    onFieldSelect={(key) => setActiveFieldKey(key)}
    onFieldChange={(key, value) => {
      const field = fields.find((f) => f.fieldKey === key);
      if (field) handleFieldChange(field, value);
    }}
    correctionMap={correctionMap}
    readOnly={readOnly}
  />

Note: To get `boundingRegions` for each field in SnippetView, access the raw OCR data:

```typescript
const ocrFields = session?.document?.ocr_result?.fields;
// Then for each field:
const ocrField = ocrFields?.[field.fieldKey] as OcrField | undefined;
const boundingRegions = ocrField?.boundingRegions;
```

Map the fields passed to SnippetView like so:

```typescript
fields={filteredSortedFields.map((f) => {
  const ocrField = (session?.document?.ocr_result?.fields as Record<string, OcrField>)?.[f.fieldKey];
  return {
    fieldKey: f.fieldKey,
    value: f.value,
    confidence: f.confidence,
    boundingRegions: ocrField?.boundingRegions,
  };
})}
```
) : null}
```

Pass the toolbar new props:

```tsx
<ReviewToolbar
  onApprove={handleApprove}
  onEscalate={() => setEscalationOpen(true)}
  onSkip={handleSkip}
  isApproving={isApproving}
  isEscalating={isEscalating}
  isSkipping={isSkipping}
  viewMode={viewMode}
  onViewModeToggle={() =>
    setViewMode((m) => (m === "document" ? "snippet" : "document"))
  }
  sortMode={sortMode}
  onSortModeToggle={() =>
    setSortMode((m) =>
      m === "confidence" ? "document-order" : "confidence"
    )
  }
/>
```

Add the shortcuts overlay:

```tsx
<ShortcutsOverlay
  opened={shortcutsOpen}
  onClose={() => setShortcutsOpen(false)}
  shortcuts={shortcuts}
/>
```

- [ ] **Step 10: Store the document image ref for snippet view**

In the existing `useEffect` that loads the document, store the image:

```typescript
useEffect(() => {
  const loadDocument = async () => {
    if (!session?.document?.id) return;
    try {
      const response = await fetch(
        `/api/documents/${session.document.id}/download`,
        { credentials: "include" },
      );
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setDocumentUrl(url);

      // Store image ref for snippet view cropping
      const img = new Image();
      img.src = url;
      img.onload = () => {
        documentImageRef.current = img;
      };
    } catch {
      // Document load failed
    }
  };
  void loadDocument();
}, [session?.document?.id]);
```

- [ ] **Step 11: Update field click handler to trigger zoom-to-field in document view**

When a field is clicked in the panel (or selected via keyboard), call `focusField`:

```typescript
onClick={() => {
  setActiveFieldKey(field.fieldKey);
  if (viewMode === "document") {
    focusField(field.fieldKey);
  }
}}
```

- [ ] **Step 12: Run the frontend to verify no compilation errors**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/frontend/src/features/annotation/
git commit -m "feat(hitl): integrate all enhancements into ReviewWorkspacePage"
```

---

## Task 17: Documentation Update

**Files:**
- Modify: `docs-md/HITL_ARCHITECTURE.md`

- [ ] **Step 1: Update HITL architecture docs**

Add sections for:
- Document locking mechanism (heartbeat TTL, idle detection)
- Multi-user queue behavior (locked docs hidden)
- Keyboard shortcuts table
- View modes (document vs snippet)
- Undo/redo system
- Auto-advance behavior
- Session reopen rules (regular workflow vs dataset labeling)

- [ ] **Step 2: Commit**

```bash
git add docs-md/HITL_ARCHITECTURE.md
git commit -m "docs(hitl): update architecture docs with new enhancement features"
```

---

## Task 18: Run Full Test Suite

- [ ] **Step 1: Run all backend HITL tests**

```bash
cd apps/backend-services && npx jest src/hitl/ --verbose 2>&1 | tail -40
```

Expected: All tests PASS.

- [ ] **Step 2: Run frontend type check**

```bash
cd apps/frontend && npx tsc --noEmit 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 3: Run frontend lint**

```bash
cd apps/frontend && npx biome check src/features/annotation/ 2>&1 | tail -20
```

Expected: No lint errors (or only pre-existing ones).

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix(hitl): address test and lint issues from enhancement integration"
```
