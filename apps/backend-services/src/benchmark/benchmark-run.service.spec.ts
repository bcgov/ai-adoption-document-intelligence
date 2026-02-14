/**
 * Benchmark Run Service Tests
 *
 * Tests for the benchmark run service.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { PrismaClient } from "@generated/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkRunService } from "./benchmark-run.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { MLflowClientService } from "./mlflow-client.service";

// Mock Prisma
jest.mock("@generated/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      benchmarkProject: {
        findUnique: jest.fn(),
      },
      benchmarkDefinition: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      benchmarkRun: {
        create: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      benchmarkAuditLog: {
        create: jest.fn(),
      },
    })),
  };
});

// Mock child_process
jest.mock("child_process", () => ({
  execSync: jest.fn().mockReturnValue("abc123\n"),
}));

describe("BenchmarkRunService", () => {
  let service: BenchmarkRunService;
  let mlflowClient: MLflowClientService;
  let benchmarkTemporal: BenchmarkTemporalService;
  let prisma: PrismaClient;

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    mlflowExperimentId: "exp-1",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDefinition = {
    id: "def-1",
    projectId: "project-1",
    name: "Test Definition",
    datasetVersionId: "ds-version-1",
    splitId: "split-1",
    workflowId: "workflow-1",
    workflowConfigHash: "hash123",
    evaluatorType: "schema-aware",
    evaluatorConfig: { threshold: 0.9 },
    runtimeSettings: { timeout: 3600 },
    artifactPolicy: { storage: "all" },
    immutable: false,
    revision: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: mockProject,
    datasetVersion: {
      id: "ds-version-1",
      version: "v1.0.0",
      dataset: {
        name: "Test Dataset",
      },
    },
    split: {
      id: "split-1",
      name: "test",
      type: "test",
    },
    workflow: {
      id: "workflow-1",
      name: "Test Workflow",
      version: 1,
    },
  };

  const mockRun = {
    id: "run-1",
    definitionId: "def-1",
    projectId: "project-1",
    status: "pending",
    mlflowRunId: "mlflow-run-1",
    temporalWorkflowId: "benchmark-run-run-1",
    workerImageDigest: null,
    workerGitSha: "abc123",
    startedAt: null,
    completedAt: null,
    metrics: {},
    params: { runtimeSettings: { timeout: 3600 } },
    tags: {},
    error: null,
    isBaseline: false,
    createdAt: new Date(),
    definition: {
      name: "Test Definition",
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkRunService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("postgresql://test"),
          },
        },
        {
          provide: MLflowClientService,
          useValue: {
            createRun: jest.fn(),
          },
        },
        {
          provide: BenchmarkTemporalService,
          useValue: {
            startBenchmarkRunWorkflow: jest.fn(),
            cancelBenchmarkRunWorkflow: jest.fn(),
            getWorkflowStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BenchmarkRunService>(BenchmarkRunService);
    mlflowClient = module.get<MLflowClientService>(MLflowClientService);
    benchmarkTemporal = module.get<BenchmarkTemporalService>(
      BenchmarkTemporalService,
    );

    // Access the private prisma instance
    prisma = service["prisma"];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Start a benchmark run
  // -----------------------------------------------------------------------
  describe("startRun", () => {
    it("should create a run, start Temporal workflow, and mark definition as immutable", async () => {
      const createDto = {
        runtimeSettingsOverride: { concurrency: 5 },
        tags: { team: "ml" },
      };

      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        mockDefinition,
      );
      (mlflowClient.createRun as jest.Mock).mockResolvedValue("mlflow-run-1");
      (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue({
        ...mockRun,
        id: "run-1",
        temporalWorkflowId: "",
      });
      (
        benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
      ).mockResolvedValue("benchmark-run-run-1");
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
        startedAt: new Date(),
      });
      (prisma.benchmarkDefinition.update as jest.Mock).mockResolvedValue(
        mockDefinition,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
        startedAt: new Date(),
      });

      const result = await service.startRun("project-1", "def-1", createDto);

      // Verify MLflow run was created
      expect(mlflowClient.createRun).toHaveBeenCalledWith(
        "exp-1",
        expect.stringContaining("Test Definition"),
      );

      // Verify Temporal workflow was started
      expect(benchmarkTemporal.startBenchmarkRunWorkflow).toHaveBeenCalledWith(
        expect.stringMatching(/^run-/),
        expect.objectContaining({
          definitionId: "def-1",
          evaluatorType: "schema-aware",
        }),
      );

      // Verify definition was marked immutable
      expect(prisma.benchmarkDefinition.update).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: { immutable: true },
      });

      expect(result.status).toBe("running");
    });

    it("should throw NotFoundException when definition does not exist", async () => {
      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.startRun("project-1", "def-1", {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should mark run as failed if Temporal workflow fails to start", async () => {
      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        mockDefinition,
      );
      (mlflowClient.createRun as jest.Mock).mockResolvedValue("mlflow-run-1");
      (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue(mockRun);
      (
        benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
      ).mockRejectedValue(new Error("Temporal error"));
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...mockRun,
        status: "failed",
        error: "Failed to start Temporal workflow: Temporal error",
      });

      await expect(service.startRun("project-1", "def-1", {})).rejects.toThrow(
        "Failed to start benchmark run workflow",
      );

      expect(prisma.benchmarkRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            error: expect.stringContaining("Temporal error"),
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Cancel a running benchmark
  // -----------------------------------------------------------------------
  describe("cancelRun", () => {
    it("should cancel a running benchmark", async () => {
      const runningRun = {
        ...mockRun,
        status: "running",
        startedAt: new Date(),
      };

      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        runningRun,
      );
      (
        benchmarkTemporal.cancelBenchmarkRunWorkflow as jest.Mock
      ).mockResolvedValue(undefined);

      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...runningRun,
        status: "cancelled",
        completedAt: new Date(),
      });

      // Mock findFirst for getRunById call - first call returns running run, second returns cancelled
      (prisma.benchmarkRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(runningRun)
        .mockResolvedValueOnce({
          ...runningRun,
          status: "cancelled",
          completedAt: new Date(),
          definition: {
            name: "Test Definition",
          },
        });

      const result = await service.cancelRun("project-1", "run-1");

      expect(benchmarkTemporal.cancelBenchmarkRunWorkflow).toHaveBeenCalledWith(
        "benchmark-run-run-1",
      );
      expect(prisma.benchmarkRun.update).toHaveBeenCalledWith({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: "cancelled",
        }),
      });
      expect(result.status).toBe("cancelled");
    });

    it("should throw NotFoundException when run does not exist", async () => {
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.cancelRun("project-1", "run-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException when run is not in cancellable state", async () => {
      const completedRun = {
        ...mockRun,
        status: "completed",
        completedAt: new Date(),
      };

      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        completedRun,
      );

      await expect(service.cancelRun("project-1", "run-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Get run details
  // -----------------------------------------------------------------------
  describe("getRunById", () => {
    it("should return run details", async () => {
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
        ...mockRun,
        definition: {
          name: "Test Definition",
        },
      });

      const result = await service.getRunById("project-1", "run-1");

      expect(result.id).toBe("run-1");
      expect(result.definitionName).toBe("Test Definition");
      expect(result.status).toBe("pending");
    });

    it("should throw NotFoundException when run does not exist", async () => {
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getRunById("project-1", "run-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: List runs for a project
  // -----------------------------------------------------------------------
  describe("listRuns", () => {
    it("should return list of runs with summary information", async () => {
      const startedAt = new Date();
      const completedAt = new Date(startedAt.getTime() + 60000); // 1 minute later

      (prisma.benchmarkProject.findUnique as jest.Mock).mockResolvedValue(
        mockProject,
      );
      (prisma.benchmarkRun.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockRun,
          status: "completed",
          startedAt,
          completedAt,
          metrics: { accuracy: 0.95 },
          definition: {
            name: "Test Definition",
          },
        },
      ]);

      const result = await service.listRuns("project-1");

      expect(result).toHaveLength(1);
      expect(result[0].definitionName).toBe("Test Definition");
      expect(result[0].durationMs).toBe(60000);
      expect(result[0].headlineMetrics).toEqual({ accuracy: 0.95 });
    });

    it("should throw NotFoundException when project does not exist", async () => {
      (prisma.benchmarkProject.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.listRuns("project-1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Get drill-down summary
  // -----------------------------------------------------------------------
  describe("getDrillDown", () => {
    it("should return drill-down analysis for completed run", async () => {
      const completedRun = {
        ...mockRun,
        status: "completed",
        completedAt: new Date(),
        metrics: {
          perSampleResults: [
            {
              sampleId: "s1",
              metricName: "accuracy",
              metricValue: 0.5,
              metadata: { type: "invoice" },
            },
            {
              sampleId: "s2",
              metricName: "accuracy",
              metricValue: 0.9,
              metadata: { type: "receipt" },
            },
          ],
          fieldErrorBreakdown: [
            { fieldName: "total", errorCount: 5, errorRate: 0.25 },
          ],
          errorClusters: { ocr_error: 10, parsing_error: 3 },
        },
      };

      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        completedRun,
      );

      const result = await service.getDrillDown("project-1", "run-1");

      expect(result.runId).toBe("run-1");
      expect(result.worstSamples).toHaveLength(2);
      expect(result.worstSamples[0].sampleId).toBe("s1");
      expect(result.fieldErrorBreakdown).toHaveLength(1);
      expect(result.errorClusters).toEqual({ ocr_error: 10, parsing_error: 3 });
    });

    it("should throw NotFoundException when run does not exist", async () => {
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.getDrillDown("project-1", "run-1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw BadRequestException when run is not completed", async () => {
      const runningRun = {
        ...mockRun,
        status: "running",
      };

      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        runningRun,
      );

      await expect(service.getDrillDown("project-1", "run-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
