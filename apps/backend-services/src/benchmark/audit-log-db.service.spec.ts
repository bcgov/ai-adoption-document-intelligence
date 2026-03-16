import { AuditAction } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { AuditLogDbService } from "./audit-log-db.service";

const mockPrismaClient = {
  benchmarkAuditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe("AuditLogDbService", () => {
  let service: AuditLogDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogDbService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrismaClient },
        },
      ],
    }).compile();

    service = module.get<AuditLogDbService>(AuditLogDbService);
    jest.clearAllMocks();
  });

  describe("createAuditLog", () => {
    it("creates an audit log entry without timestamp", async () => {
      const mockLog = {
        id: "log-1",
        timestamp: new Date(),
        userId: "user-1",
        action: AuditAction.dataset_created,
        entityType: "Dataset",
        entityId: "dataset-1",
        metadata: { name: "Test" },
      };

      mockPrismaClient.benchmarkAuditLog.create.mockResolvedValue(mockLog);

      const result = await service.createAuditLog({
        userId: "user-1",
        action: AuditAction.dataset_created,
        entityType: "Dataset",
        entityId: "dataset-1",
        metadata: { name: "Test" },
      });

      expect(result).toEqual(mockLog);
      expect(mockPrismaClient.benchmarkAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          action: AuditAction.dataset_created,
          entityType: "Dataset",
          entityId: "dataset-1",
          metadata: { name: "Test" },
        },
      });
    });

    it("creates an audit log entry with explicit timestamp", async () => {
      const ts = new Date("2026-01-01T00:00:00Z");
      const mockLog = {
        id: "log-2",
        timestamp: ts,
        userId: "user-1",
        action: AuditAction.run_started,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: null,
      };

      mockPrismaClient.benchmarkAuditLog.create.mockResolvedValue(mockLog);

      await service.createAuditLog({
        userId: "user-1",
        action: AuditAction.run_started,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        timestamp: ts,
      });

      expect(mockPrismaClient.benchmarkAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ timestamp: ts }),
      });
    });
  });

  describe("findAllAuditLogs", () => {
    it("returns audit logs with filters and default limit", async () => {
      const mockLogs = [
        {
          id: "log-1",
          entityType: "Dataset",
          entityId: "ds-1",
          action: AuditAction.dataset_created,
        },
      ];

      mockPrismaClient.benchmarkAuditLog.findMany.mockResolvedValue(mockLogs);

      const result = await service.findAllAuditLogs({
        entityType: "Dataset",
        entityId: "ds-1",
      });

      expect(result).toEqual(mockLogs);
      expect(mockPrismaClient.benchmarkAuditLog.findMany).toHaveBeenCalledWith({
        where: { entityType: "Dataset", entityId: "ds-1" },
        orderBy: { timestamp: "asc" },
        take: 100,
      });
    });

    it("applies custom limit", async () => {
      mockPrismaClient.benchmarkAuditLog.findMany.mockResolvedValue([]);

      await service.findAllAuditLogs({}, 25);

      expect(mockPrismaClient.benchmarkAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 25 }),
      );
    });
  });
});
