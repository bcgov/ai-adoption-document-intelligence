import { Prisma, ReviewStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { RetentionDbService } from "./retention-db.service";

const mockPrisma = {
  transaction: async (_tx: Prisma.TransactionClient) => {},
};

const mockTxImpl = {
  auditEvent: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  benchmarkAuditLog: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  reviewSession: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const mockTransactionClient = mockTxImpl as unknown as Prisma.TransactionClient;

describe("RetentionDbService", () => {
  let service: RetentionDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionDbService,
        { provide: PrismaService, useValue: { prisma: mockPrisma } },
        { provide: AppLoggerService, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get<RetentionDbService>(RetentionDbService);
    jest.clearAllMocks();
  });

  const CUTOFF = new Date("2026-01-01T00:00:00Z");
  const LIMIT = 50;

  // -------------------------------------------------------------------------
  // deleteAuditEventsOlderThan
  // -------------------------------------------------------------------------

  describe("deleteAuditEventsOlderThan", () => {
    it("returns 0 and skips deleteMany when no rows are found", async () => {
      mockTxImpl.auditEvent.findMany.mockResolvedValue([]);

      const result = await service.deleteAuditEventsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      expect(result).toBe(0);
      expect(mockTxImpl.auditEvent.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes exactly the IDs returned by findMany and returns the count", async () => {
      mockTxImpl.auditEvent.findMany.mockResolvedValue([
        { id: "a1" },
        { id: "a2" },
      ]);
      mockTxImpl.auditEvent.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.deleteAuditEventsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      expect(result).toBe(2);
      expect(mockTxImpl.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { occurred_at: { lt: CUTOFF } },
          take: LIMIT,
        }),
      );
      expect(mockTxImpl.auditEvent.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["a1", "a2"] } },
      });
    });

    it("respects the limit in the findMany query", async () => {
      mockTxImpl.auditEvent.findMany.mockResolvedValue([]);

      await service.deleteAuditEventsOlderThan(
        CUTOFF,
        25,
        mockTransactionClient,
      );

      expect(mockTxImpl.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // deleteBenchmarkAuditLogsOlderThan
  // -------------------------------------------------------------------------

  describe("deleteBenchmarkAuditLogsOlderThan", () => {
    it("returns 0 and skips deleteMany when no rows are found", async () => {
      mockTxImpl.benchmarkAuditLog.findMany.mockResolvedValue([]);

      const result = await service.deleteBenchmarkAuditLogsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      expect(result).toBe(0);
      expect(mockTxImpl.benchmarkAuditLog.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes exactly the IDs returned by findMany and returns the count", async () => {
      mockTxImpl.benchmarkAuditLog.findMany.mockResolvedValue([
        { id: "b1" },
        { id: "b2" },
        { id: "b3" },
      ]);
      mockTxImpl.benchmarkAuditLog.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteBenchmarkAuditLogsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      expect(result).toBe(3);
      expect(mockTxImpl.benchmarkAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: { lt: CUTOFF } },
          take: LIMIT,
        }),
      );
      expect(mockTxImpl.benchmarkAuditLog.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["b1", "b2", "b3"] } },
      });
    });
  });

  // -------------------------------------------------------------------------
  // deleteCompletedReviewSessionsOlderThan
  // -------------------------------------------------------------------------

  describe("deleteCompletedReviewSessionsOlderThan", () => {
    it("returns 0 and skips deleteMany when no rows are found", async () => {
      mockTxImpl.reviewSession.findMany.mockResolvedValue([]);

      const result = await service.deleteCompletedReviewSessionsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      expect(result).toBe(0);
      expect(mockTxImpl.reviewSession.deleteMany).not.toHaveBeenCalled();
    });

    it("filters on terminal statuses and completed_at, then deletes", async () => {
      mockTxImpl.reviewSession.findMany.mockResolvedValue([{ id: "r1" }]);
      mockTxImpl.reviewSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteCompletedReviewSessionsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      expect(result).toBe(1);
      expect(mockTxImpl.reviewSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: expect.arrayContaining([
                ReviewStatus.approved,
                ReviewStatus.escalated,
                ReviewStatus.skipped,
              ]),
            },
            completed_at: { lt: CUTOFF },
          },
          take: LIMIT,
        }),
      );
      expect(mockTxImpl.reviewSession.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["r1"] } },
      });
    });

    it("does not include in_progress sessions in the filter", async () => {
      mockTxImpl.reviewSession.findMany.mockResolvedValue([]);

      await service.deleteCompletedReviewSessionsOlderThan(
        CUTOFF,
        LIMIT,
        mockTransactionClient,
      );

      const [call] = mockTxImpl.reviewSession.findMany.mock.calls[0] as [
        { where: { status: { in: ReviewStatus[] } } },
      ];
      expect(call.where.status.in).not.toContain(ReviewStatus.in_progress);
    });
  });
});
