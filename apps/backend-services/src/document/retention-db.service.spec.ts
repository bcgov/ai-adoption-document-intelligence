import { ReviewStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { RetentionDbService } from "./retention-db.service";

const mockPrisma = {
  auditEvent: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  benchmarkAuditLog: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  reviewSession: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe("RetentionDbService", () => {
  let service: RetentionDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetentionDbService,
        { provide: PrismaService, useValue: { prisma: mockPrisma } },
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
      mockPrisma.auditEvent.findMany.mockResolvedValue([]);

      const result = await service.deleteAuditEventsOlderThan(CUTOFF, LIMIT);

      expect(result).toBe(0);
      expect(mockPrisma.auditEvent.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes exactly the IDs returned by findMany and returns the count", async () => {
      mockPrisma.auditEvent.findMany.mockResolvedValue([
        { id: "a1" },
        { id: "a2" },
      ]);
      mockPrisma.auditEvent.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.deleteAuditEventsOlderThan(CUTOFF, LIMIT);

      expect(result).toBe(2);
      expect(mockPrisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { occurred_at: { lt: CUTOFF } },
          take: LIMIT,
        }),
      );
      expect(mockPrisma.auditEvent.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["a1", "a2"] } },
      });
    });

    it("respects the limit in the findMany query", async () => {
      mockPrisma.auditEvent.findMany.mockResolvedValue([]);

      await service.deleteAuditEventsOlderThan(CUTOFF, 25);

      expect(mockPrisma.auditEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // deleteBenchmarkAuditLogsOlderThan
  // -------------------------------------------------------------------------

  describe("deleteBenchmarkAuditLogsOlderThan", () => {
    it("returns 0 and skips deleteMany when no rows are found", async () => {
      mockPrisma.benchmarkAuditLog.findMany.mockResolvedValue([]);

      const result = await service.deleteBenchmarkAuditLogsOlderThan(
        CUTOFF,
        LIMIT,
      );

      expect(result).toBe(0);
      expect(mockPrisma.benchmarkAuditLog.deleteMany).not.toHaveBeenCalled();
    });

    it("deletes exactly the IDs returned by findMany and returns the count", async () => {
      mockPrisma.benchmarkAuditLog.findMany.mockResolvedValue([
        { id: "b1" },
        { id: "b2" },
        { id: "b3" },
      ]);
      mockPrisma.benchmarkAuditLog.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteBenchmarkAuditLogsOlderThan(
        CUTOFF,
        LIMIT,
      );

      expect(result).toBe(3);
      expect(mockPrisma.benchmarkAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { timestamp: { lt: CUTOFF } },
          take: LIMIT,
        }),
      );
      expect(mockPrisma.benchmarkAuditLog.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["b1", "b2", "b3"] } },
      });
    });
  });

  // -------------------------------------------------------------------------
  // deleteCompletedReviewSessionsOlderThan
  // -------------------------------------------------------------------------

  describe("deleteCompletedReviewSessionsOlderThan", () => {
    it("returns 0 and skips deleteMany when no rows are found", async () => {
      mockPrisma.reviewSession.findMany.mockResolvedValue([]);

      const result = await service.deleteCompletedReviewSessionsOlderThan(
        CUTOFF,
        LIMIT,
      );

      expect(result).toBe(0);
      expect(mockPrisma.reviewSession.deleteMany).not.toHaveBeenCalled();
    });

    it("filters on terminal statuses and completed_at, then deletes", async () => {
      mockPrisma.reviewSession.findMany.mockResolvedValue([{ id: "r1" }]);
      mockPrisma.reviewSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.deleteCompletedReviewSessionsOlderThan(
        CUTOFF,
        LIMIT,
      );

      expect(result).toBe(1);
      expect(mockPrisma.reviewSession.findMany).toHaveBeenCalledWith(
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
      expect(mockPrisma.reviewSession.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["r1"] } },
      });
    });

    it("does not include in_progress sessions in the filter", async () => {
      mockPrisma.reviewSession.findMany.mockResolvedValue([]);

      await service.deleteCompletedReviewSessionsOlderThan(CUTOFF, LIMIT);

      const [call] = mockPrisma.reviewSession.findMany.mock.calls[0] as [
        { where: { status: { in: ReviewStatus[] } } },
      ];
      expect(call.where.status.in).not.toContain(ReviewStatus.in_progress);
    });
  });
});
