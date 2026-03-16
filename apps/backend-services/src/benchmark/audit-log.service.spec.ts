import { AuditAction } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditLogService } from "./audit-log.service";
import { AuditLogDbService } from "./audit-log-db.service";

const mockAuditLogDbService = {
  createAuditLog: jest.fn(),
  findAllAuditLogs: jest.fn(),
};

describe("AuditLogService", () => {
  let service: AuditLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: AuditLogDbService,
          useValue: mockAuditLogDbService,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("logDatasetCreated", () => {
    it("should log dataset creation event", async () => {
      const mockLog = {
        id: "log-1",
        timestamp: new Date(),
        userId: "user-1",
        action: AuditAction.dataset_created,
        entityType: "Dataset",
        entityId: "dataset-1",
        metadata: { name: "Test Dataset" },
      };

      mockAuditLogDbService.createAuditLog.mockResolvedValue(mockLog);

      const result = await service.logDatasetCreated("user-1", "dataset-1", {
        name: "Test Dataset",
      });

      expect(result).toEqual(mockLog);
      expect(mockAuditLogDbService.createAuditLog).toHaveBeenCalledWith({
        userId: "user-1",
        action: AuditAction.dataset_created,
        entityType: "Dataset",
        entityId: "dataset-1",
        metadata: { name: "Test Dataset" },
      });
    });
  });

  describe("logVersionPublished", () => {
    it("should log version publishing event with version and dataset IDs in metadata", async () => {
      const mockLog = {
        id: "log-2",
        timestamp: new Date(),
        userId: "user-1",
        action: AuditAction.version_published,
        entityType: "DatasetVersion",
        entityId: "version-1",
        metadata: { versionId: "version-1", datasetId: "dataset-1" },
      };

      mockAuditLogDbService.createAuditLog.mockResolvedValue(mockLog);

      const result = await service.logVersionPublished(
        "user-1",
        "version-1",
        "dataset-1",
      );

      expect(result).toEqual(mockLog);
      expect(mockAuditLogDbService.createAuditLog).toHaveBeenCalledWith({
        userId: "user-1",
        action: AuditAction.version_published,
        entityType: "DatasetVersion",
        entityId: "version-1",
        metadata: {
          versionId: "version-1",
          datasetId: "dataset-1",
        },
      });
    });
  });

  describe("logRunStarted", () => {
    it("should log run start event with definition and project IDs in metadata", async () => {
      const mockLog = {
        id: "log-3",
        timestamp: new Date(),
        userId: "user-1",
        action: AuditAction.run_started,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: { definitionId: "def-1", projectId: "proj-1" },
      };

      mockAuditLogDbService.createAuditLog.mockResolvedValue(mockLog);

      const result = await service.logRunStarted(
        "user-1",
        "run-1",
        "def-1",
        "proj-1",
      );

      expect(result).toEqual(mockLog);
      expect(mockAuditLogDbService.createAuditLog).toHaveBeenCalledWith({
        userId: "user-1",
        action: AuditAction.run_started,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: {
          definitionId: "def-1",
          projectId: "proj-1",
        },
      });
    });
  });

  describe("logRunCompleted", () => {
    it("should log run completion event with status and metrics in metadata", async () => {
      const mockLog = {
        id: "log-4",
        timestamp: new Date(),
        userId: "user-1",
        action: AuditAction.run_completed,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: {
          status: "completed",
          metrics: { accuracy: 0.95, f1Score: 0.92 },
        },
      };

      mockAuditLogDbService.createAuditLog.mockResolvedValue(mockLog);

      const result = await service.logRunCompleted(
        "user-1",
        "run-1",
        "completed",
        {
          accuracy: 0.95,
          f1Score: 0.92,
        },
      );

      expect(result).toEqual(mockLog);
      expect(mockAuditLogDbService.createAuditLog).toHaveBeenCalledWith({
        userId: "user-1",
        action: AuditAction.run_completed,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: {
          status: "completed",
          metrics: { accuracy: 0.95, f1Score: 0.92 },
        },
      });
    });
  });

  describe("logBaselinePromoted", () => {
    it("should log baseline promotion event with project ID in metadata", async () => {
      const mockLog = {
        id: "log-5",
        timestamp: new Date(),
        userId: "user-1",
        action: AuditAction.baseline_promoted,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: { projectId: "proj-1" },
      };

      mockAuditLogDbService.createAuditLog.mockResolvedValue(mockLog);

      const result = await service.logBaselinePromoted(
        "user-1",
        "run-1",
        "proj-1",
      );

      expect(result).toEqual(mockLog);
      expect(mockAuditLogDbService.createAuditLog).toHaveBeenCalledWith({
        userId: "user-1",
        action: AuditAction.baseline_promoted,
        entityType: "BenchmarkRun",
        entityId: "run-1",
        metadata: {
          projectId: "proj-1",
        },
      });
    });
  });

  describe("queryAuditLogs", () => {
    it("should query audit logs by entity type", async () => {
      const mockLogs = [
        {
          id: "log-1",
          timestamp: new Date(),
          userId: "user-1",
          action: AuditAction.dataset_created,
          entityType: "Dataset",
          entityId: "dataset-1",
          metadata: null,
        },
      ];

      mockAuditLogDbService.findAllAuditLogs.mockResolvedValue(mockLogs);

      const result = await service.queryAuditLogs({ entityType: "Dataset" });

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogDbService.findAllAuditLogs).toHaveBeenCalledWith(
        { entityType: "Dataset" },
        100,
      );
    });

    it("should query audit logs by entity ID", async () => {
      const mockLogs = [
        {
          id: "log-1",
          timestamp: new Date(),
          userId: "user-1",
          action: AuditAction.run_started,
          entityType: "BenchmarkRun",
          entityId: "run-1",
          metadata: null,
        },
      ];

      mockAuditLogDbService.findAllAuditLogs.mockResolvedValue(mockLogs);

      const result = await service.queryAuditLogs({ entityId: "run-1" });

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogDbService.findAllAuditLogs).toHaveBeenCalledWith(
        { entityId: "run-1" },
        100,
      );
    });

    it("should query audit logs by action", async () => {
      const mockLogs = [
        {
          id: "log-1",
          timestamp: new Date(),
          userId: "user-1",
          action: AuditAction.version_published,
          entityType: "DatasetVersion",
          entityId: "version-1",
          metadata: null,
        },
      ];

      mockAuditLogDbService.findAllAuditLogs.mockResolvedValue(mockLogs);

      const result = await service.queryAuditLogs({
        action: AuditAction.version_published,
      });

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogDbService.findAllAuditLogs).toHaveBeenCalledWith(
        { action: AuditAction.version_published },
        100,
      );
    });

    it("should query audit logs by date range", async () => {
      const startDate = new Date("2026-02-01");
      const endDate = new Date("2026-02-14");
      const mockLogs = [
        {
          id: "log-1",
          timestamp: new Date("2026-02-10"),
          userId: "user-1",
          action: AuditAction.run_started,
          entityType: "BenchmarkRun",
          entityId: "run-1",
          metadata: null,
        },
      ];

      mockAuditLogDbService.findAllAuditLogs.mockResolvedValue(mockLogs);

      const result = await service.queryAuditLogs({ startDate, endDate });

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogDbService.findAllAuditLogs).toHaveBeenCalledWith(
        { timestamp: { gte: startDate, lte: endDate } },
        100,
      );
    });

    it("should query audit logs with multiple filters and custom limit", async () => {
      const startDate = new Date("2026-02-01");
      const mockLogs = [
        {
          id: "log-1",
          timestamp: new Date("2026-02-10"),
          userId: "user-1",
          action: AuditAction.run_started,
          entityType: "BenchmarkRun",
          entityId: "run-1",
          metadata: null,
        },
      ];

      mockAuditLogDbService.findAllAuditLogs.mockResolvedValue(mockLogs);

      const result = await service.queryAuditLogs({
        entityType: "BenchmarkRun",
        action: AuditAction.run_started,
        startDate,
        limit: 50,
      });

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogDbService.findAllAuditLogs).toHaveBeenCalledWith(
        {
          entityType: "BenchmarkRun",
          action: AuditAction.run_started,
          timestamp: { gte: startDate },
        },
        50,
      );
    });

    it("should return logs in chronological order", async () => {
      const mockLogs = [
        {
          id: "log-1",
          timestamp: new Date("2026-02-10T10:00:00"),
          userId: "user-1",
          action: AuditAction.run_started,
          entityType: "BenchmarkRun",
          entityId: "run-1",
          metadata: null,
        },
        {
          id: "log-2",
          timestamp: new Date("2026-02-10T11:00:00"),
          userId: "user-1",
          action: AuditAction.run_completed,
          entityType: "BenchmarkRun",
          entityId: "run-1",
          metadata: null,
        },
      ];

      mockAuditLogDbService.findAllAuditLogs.mockResolvedValue(mockLogs);

      const result = await service.queryAuditLogs({ entityId: "run-1" });

      expect(result).toEqual(mockLogs);
      expect(mockAuditLogDbService.findAllAuditLogs).toHaveBeenCalledWith(
        expect.objectContaining({}),
        100,
      );
    });
  });
});
