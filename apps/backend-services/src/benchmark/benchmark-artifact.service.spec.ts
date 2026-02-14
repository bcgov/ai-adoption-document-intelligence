/**
 * Benchmark Artifact Service Tests
 *
 * Tests for artifact storage, retrieval, and filtering.
 *
 * See feature-docs/003-benchmarking-system/user-stories/US-013-benchmark-artifact-management.md
 */

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkArtifactType } from "@generated/client";
import { BenchmarkArtifactService } from "./benchmark-artifact.service";
import { MinioBlobStorageService } from "@/blob-storage/minio-blob-storage.service";

// Mock Prisma Client
const mockPrismaClient = {
  benchmarkRun: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  benchmarkArtifact: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.mock("@generated/client", () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
  BenchmarkArtifactType: {
    per_doc_output: "per_doc_output",
    intermediate_node_output: "intermediate_node_output",
    diff_report: "diff_report",
    evaluation_report: "evaluation_report",
    error_log: "error_log",
  },
}));

describe("BenchmarkArtifactService", () => {
  let service: BenchmarkArtifactService;
  let minioBlobStorage: jest.Mocked<MinioBlobStorageService>;

  beforeEach(async () => {
    const mockMinioBlobStorage = {
      write: jest.fn(),
      read: jest.fn(),
      exists: jest.fn(),
      delete: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === "DATABASE_URL") return "postgresql://test:test@localhost:5432/test";
        if (key === "MINIO_ARTIFACT_BUCKET") return "benchmark-outputs";
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkArtifactService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MinioBlobStorageService,
          useValue: mockMinioBlobStorage,
        },
      ],
    }).compile();

    service = module.get<BenchmarkArtifactService>(BenchmarkArtifactService);
    minioBlobStorage = module.get(MinioBlobStorageService) as jest.Mocked<MinioBlobStorageService>;

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createArtifact", () => {
    it("should create an artifact with all fields", async () => {
      const runId = "run-123";
      const content = Buffer.from("test content");
      const mockRun = { id: runId, status: "running" };
      const mockArtifact = {
        id: "artifact-123",
        runId,
        type: "per_doc_output" as BenchmarkArtifactType,
        path: `${runId}/per_doc_output/sample-001-node-002-${Date.now()}.json`,
        sampleId: "sample-001",
        nodeId: "node-002",
        sizeBytes: BigInt(content.length),
        mimeType: "application/json",
        createdAt: new Date(),
      };

      mockPrismaClient.benchmarkRun.findUnique.mockResolvedValue(mockRun);
      mockPrismaClient.benchmarkArtifact.create.mockResolvedValue(mockArtifact);
      minioBlobStorage.write.mockResolvedValue(undefined);

      const result = await service.createArtifact({
        runId,
        type: "per_doc_output" as BenchmarkArtifactType,
        content,
        sampleId: "sample-001",
        nodeId: "node-002",
        mimeType: "application/json",
      });

      expect(mockPrismaClient.benchmarkRun.findUnique).toHaveBeenCalledWith({
        where: { id: runId },
      });
      expect(minioBlobStorage.write).toHaveBeenCalled();
      expect(mockPrismaClient.benchmarkArtifact.create).toHaveBeenCalled();
      expect(result.id).toBe("artifact-123");
      expect(result.runId).toBe(runId);
      expect(result.type).toBe("per_doc_output");
      expect(result.sampleId).toBe("sample-001");
      expect(result.nodeId).toBe("node-002");
    });

    it("should create an artifact without sampleId and nodeId", async () => {
      const runId = "run-123";
      const content = Buffer.from("error log content");
      const mockRun = { id: runId, status: "running" };
      const mockArtifact = {
        id: "artifact-456",
        runId,
        type: "error_log" as BenchmarkArtifactType,
        path: `${runId}/error_log/${Date.now()}.txt`,
        sampleId: null,
        nodeId: null,
        sizeBytes: BigInt(content.length),
        mimeType: "text/plain",
        createdAt: new Date(),
      };

      mockPrismaClient.benchmarkRun.findUnique.mockResolvedValue(mockRun);
      mockPrismaClient.benchmarkArtifact.create.mockResolvedValue(mockArtifact);
      minioBlobStorage.write.mockResolvedValue(undefined);

      const result = await service.createArtifact({
        runId,
        type: "error_log" as BenchmarkArtifactType,
        content,
        mimeType: "text/plain",
      });

      expect(result.sampleId).toBeNull();
      expect(result.nodeId).toBeNull();
    });

    it("should throw NotFoundException if run does not exist", async () => {
      mockPrismaClient.benchmarkRun.findUnique.mockResolvedValue(null);

      await expect(
        service.createArtifact({
          runId: "non-existent-run",
          type: "per_doc_output" as BenchmarkArtifactType,
          content: Buffer.from("test"),
          mimeType: "application/json",
        }),
      ).rejects.toThrow('Benchmark run with ID "non-existent-run" not found');
    });
  });

  describe("listArtifacts", () => {
    it("should list all artifacts for a run", async () => {
      const projectId = "project-123";
      const runId = "run-123";
      const mockRun = { id: runId, projectId, status: "completed" };
      const mockArtifacts = [
        {
          id: "artifact-1",
          runId,
          type: "per_doc_output" as BenchmarkArtifactType,
          path: "path/to/artifact1.json",
          sampleId: "sample-001",
          nodeId: "node-001",
          sizeBytes: BigInt(100),
          mimeType: "application/json",
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "artifact-2",
          runId,
          type: "diff_report" as BenchmarkArtifactType,
          path: "path/to/artifact2.txt",
          sampleId: "sample-002",
          nodeId: null,
          sizeBytes: BigInt(200),
          mimeType: "text/plain",
          createdAt: new Date("2026-01-02"),
        },
      ];

      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue(mockRun);
      mockPrismaClient.benchmarkArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.listArtifacts(projectId, runId);

      expect(mockPrismaClient.benchmarkRun.findFirst).toHaveBeenCalledWith({
        where: { id: runId, projectId },
      });
      expect(mockPrismaClient.benchmarkArtifact.findMany).toHaveBeenCalledWith({
        where: { runId },
        orderBy: { createdAt: "desc" },
      });
      expect(result.total).toBe(2);
      expect(result.artifacts).toHaveLength(2);
      expect(result.artifacts[0].id).toBe("artifact-1");
      expect(result.artifacts[1].id).toBe("artifact-2");
    });

    it("should filter artifacts by type", async () => {
      const projectId = "project-123";
      const runId = "run-123";
      const type = "diff_report" as BenchmarkArtifactType;
      const mockRun = { id: runId, projectId, status: "completed" };
      const mockArtifacts = [
        {
          id: "artifact-2",
          runId,
          type: "diff_report" as BenchmarkArtifactType,
          path: "path/to/artifact2.txt",
          sampleId: "sample-002",
          nodeId: null,
          sizeBytes: BigInt(200),
          mimeType: "text/plain",
          createdAt: new Date("2026-01-02"),
        },
      ];

      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue(mockRun);
      mockPrismaClient.benchmarkArtifact.findMany.mockResolvedValue(mockArtifacts);

      const result = await service.listArtifacts(projectId, runId, type);

      expect(mockPrismaClient.benchmarkArtifact.findMany).toHaveBeenCalledWith({
        where: { runId, type },
        orderBy: { createdAt: "desc" },
      });
      expect(result.total).toBe(1);
      expect(result.artifacts[0].type).toBe("diff_report");
    });

    it("should throw NotFoundException if run does not exist for project", async () => {
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue(null);

      await expect(
        service.listArtifacts("project-123", "non-existent-run"),
      ).rejects.toThrow(
        'Benchmark run with ID "non-existent-run" not found for project "project-123"',
      );
    });

    it("should return empty list if no artifacts exist", async () => {
      const projectId = "project-123";
      const runId = "run-123";
      const mockRun = { id: runId, projectId, status: "completed" };

      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue(mockRun);
      mockPrismaClient.benchmarkArtifact.findMany.mockResolvedValue([]);

      const result = await service.listArtifacts(projectId, runId);

      expect(result.total).toBe(0);
      expect(result.artifacts).toHaveLength(0);
    });
  });
});
