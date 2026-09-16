import { Prisma } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { PrismaService } from "../database/prisma.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { LockExpiryService } from "./lock-expiry.service";
import { ReviewDbService } from "./review-db.service";

describe("LockExpiryService", () => {
  let service: LockExpiryService;
  let reviewDb: jest.Mocked<ReviewDbService>;
  let auditService: { recordEvent: jest.Mock };

  const expiredLock = {
    session_id: "session-1",
    document_id: "doc-1",
    group_id: "group-1",
    workflow_execution_id: "wf-1",
  };

  beforeEach(async () => {
    const mockReviewDb = {
      findExpiredLocks: jest.fn(),
      abandonSessions: jest.fn().mockResolvedValue(0),
      releaseDocumentLocks: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LockExpiryService,
        { provide: ReviewDbService, useValue: mockReviewDb },
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: AuditService,
          useValue: { recordEvent: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PrismaService,
          useValue: {
            transaction: jest.fn(
              async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                fn({} as Prisma.TransactionClient),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(LockExpiryService);
    reviewDb = module.get(ReviewDbService);
    auditService = module.get(AuditService);
  });

  it("abandons the session, releases the lock, and audits the expiry", async () => {
    reviewDb.findExpiredLocks.mockResolvedValueOnce([expiredLock]);
    reviewDb.abandonSessions.mockResolvedValueOnce(1);

    await service.expireAbandonedSessions();

    expect(reviewDb.abandonSessions).toHaveBeenCalledWith(
      ["session-1"],
      expect.anything(),
    );
    expect(reviewDb.releaseDocumentLocks).toHaveBeenCalledWith(
      ["session-1"],
      expect.anything(),
    );
    expect(auditService.recordEvent).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          event_type: "review_session_expired",
          resource_type: "review_session",
          resource_id: "session-1",
          document_id: "doc-1",
          group_id: "group-1",
          workflow_execution_id: "wf-1",
        }),
      ],
      expect.anything(),
    );
  });

  it("does nothing when no lock has expired", async () => {
    reviewDb.findExpiredLocks.mockResolvedValueOnce([]);

    await service.expireAbandonedSessions();

    expect(reviewDb.abandonSessions).not.toHaveBeenCalled();
    expect(reviewDb.releaseDocumentLocks).not.toHaveBeenCalled();
    expect(auditService.recordEvent).not.toHaveBeenCalled();
  });

  it("still releases the lock when the session already finished", async () => {
    reviewDb.findExpiredLocks.mockResolvedValueOnce([expiredLock]);
    reviewDb.abandonSessions.mockResolvedValueOnce(0);

    await service.expireAbandonedSessions();

    expect(reviewDb.releaseDocumentLocks).toHaveBeenCalledWith(
      ["session-1"],
      expect.anything(),
    );
  });
});
