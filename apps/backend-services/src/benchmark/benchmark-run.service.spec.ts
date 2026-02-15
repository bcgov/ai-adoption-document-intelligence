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
        findUnique: jest.fn(),
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
      status: "published",
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

    it("should capture worker image digest when WORKER_IMAGE_DIGEST env var is set", async () => {
      const originalEnv = process.env.WORKER_IMAGE_DIGEST;
      process.env.WORKER_IMAGE_DIGEST = "sha256:abc123def456";

      try {
        (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
          mockDefinition,
        );
        (mlflowClient.createRun as jest.Mock).mockResolvedValue("mlflow-run-1");
        (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue({
          ...mockRun,
          workerImageDigest: "sha256:abc123def456",
        });
        (
          benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
        ).mockResolvedValue("benchmark-run-run-1");
        (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
          ...mockRun,
          workerImageDigest: "sha256:abc123def456",
          temporalWorkflowId: "benchmark-run-run-1",
          status: "running",
        });
        (prisma.benchmarkDefinition.update as jest.Mock).mockResolvedValue(
          mockDefinition,
        );
        (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
          ...mockRun,
          workerImageDigest: "sha256:abc123def456",
          temporalWorkflowId: "benchmark-run-run-1",
          status: "running",
          definition: {
            name: "Test Definition",
          },
        });

        await service.startRun("project-1", "def-1", {});

        // Verify worker image digest was captured in create call
        expect(prisma.benchmarkRun.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              workerImageDigest: "sha256:abc123def456",
            }),
          }),
        );
      } finally {
        if (originalEnv === undefined) {
          delete process.env.WORKER_IMAGE_DIGEST;
        } else {
          process.env.WORKER_IMAGE_DIGEST = originalEnv;
        }
      }
    });

    it("should set workerImageDigest to null when WORKER_IMAGE_DIGEST env var is not set", async () => {
      const originalEnv = process.env.WORKER_IMAGE_DIGEST;
      delete process.env.WORKER_IMAGE_DIGEST;

      try {
        (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
          mockDefinition,
        );
        (mlflowClient.createRun as jest.Mock).mockResolvedValue("mlflow-run-1");
        (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue(mockRun);
        (
          benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
        ).mockResolvedValue("benchmark-run-run-1");
        (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
          ...mockRun,
          temporalWorkflowId: "benchmark-run-run-1",
          status: "running",
        });
        (prisma.benchmarkDefinition.update as jest.Mock).mockResolvedValue(
          mockDefinition,
        );
        (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
          ...mockRun,
          temporalWorkflowId: "benchmark-run-run-1",
          status: "running",
          definition: {
            name: "Test Definition",
          },
        });

        await service.startRun("project-1", "def-1", {});

        // Verify worker image digest is null
        expect(prisma.benchmarkRun.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              workerImageDigest: null,
            }),
          }),
        );
      } finally {
        if (originalEnv !== undefined) {
          process.env.WORKER_IMAGE_DIGEST = originalEnv;
        }
      }
    });

    it("should add draft_dataset tag when dataset version status is draft", async () => {
      const draftDefinition = {
        ...mockDefinition,
        datasetVersion: {
          ...mockDefinition.datasetVersion,
          status: "draft",
        },
      };

      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        draftDefinition,
      );
      (mlflowClient.createRun as jest.Mock).mockResolvedValue("mlflow-run-1");
      (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue(mockRun);
      (
        benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
      ).mockResolvedValue("benchmark-run-run-1");
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
      });
      (prisma.benchmarkDefinition.update as jest.Mock).mockResolvedValue(
        draftDefinition,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
        definition: {
          name: "Test Definition",
        },
      });

      await service.startRun("project-1", "def-1", {});

      // Verify draft_dataset tag was added
      expect(prisma.benchmarkRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: expect.objectContaining({
              draft_dataset: "true",
            }),
          }),
        }),
      );
    });

    it("should not add draft_dataset tag when dataset version status is published", async () => {
      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        mockDefinition,
      );
      (mlflowClient.createRun as jest.Mock).mockResolvedValue("mlflow-run-1");
      (prisma.benchmarkRun.create as jest.Mock).mockResolvedValue(mockRun);
      (
        benchmarkTemporal.startBenchmarkRunWorkflow as jest.Mock
      ).mockResolvedValue("benchmark-run-run-1");
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
      });
      (prisma.benchmarkDefinition.update as jest.Mock).mockResolvedValue(
        mockDefinition,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
        definition: {
          name: "Test Definition",
        },
      });

      await service.startRun("project-1", "def-1", {});

      // Verify draft_dataset tag was NOT added
      expect(prisma.benchmarkRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: expect.not.objectContaining({
              draft_dataset: expect.anything(),
            }),
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

  describe("promoteToBaseline", () => {
    it("should promote a completed run to baseline", async () => {
      const completedRun = {
        ...mockRun,
        status: "completed",
        isBaseline: false,
      };

      (prisma.benchmarkRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(completedRun)  // First call: get the run to promote
        .mockResolvedValueOnce(null);  // Second call: find previous baseline (none exists)
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...completedRun,
        isBaseline: true,
      });

      const thresholds = [
        { metricName: "f1", type: "relative" as const, value: 0.95 },
        { metricName: "precision", type: "absolute" as const, value: 0.9 },
      ];

      const result = await service.promoteToBaseline("project-1", "run-1", {
        thresholds,
      });

      expect(result).toEqual({
        runId: "run-1",
        isBaseline: true,
        previousBaselineId: null,
        thresholds,
      });

      expect(prisma.benchmarkRun.update).toHaveBeenCalledWith({
        where: { id: "run-1" },
        data: {
          isBaseline: true,
          baselineThresholds: thresholds,
        },
      });
    });

    it("should clear previous baseline when promoting a new one", async () => {
      const completedRun = {
        ...mockRun,
        status: "completed",
        isBaseline: false,
      };

      const previousBaseline = {
        id: "baseline-run-1",
        definitionId: "def-1",
        isBaseline: true,
      };

      (prisma.benchmarkRun.findFirst as jest.Mock)
        .mockResolvedValueOnce(completedRun)
        .mockResolvedValueOnce(previousBaseline);

      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue({
        ...completedRun,
        isBaseline: true,
      });

      const result = await service.promoteToBaseline("project-1", "run-1", {});

      expect(result.previousBaselineId).toBe("baseline-run-1");

      // Should clear previous baseline
      expect(prisma.benchmarkRun.update).toHaveBeenCalledWith({
        where: { id: "baseline-run-1" },
        data: { isBaseline: false },
      });

      // Should promote new baseline
      expect(prisma.benchmarkRun.update).toHaveBeenCalledWith({
        where: { id: "run-1" },
        data: {
          isBaseline: true,
          baselineThresholds: null,
        },
      });
    });

    it("should throw NotFoundException if run does not exist", async () => {
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.promoteToBaseline("project-1", "run-1", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if run is not completed", async () => {
      const runningRun = {
        ...mockRun,
        status: "running",
      };

      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        runningRun,
      );

      await expect(
        service.promoteToBaseline("project-1", "run-1", {}),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("compareAgainstBaseline", () => {
    it("should return null if no baseline exists", async () => {
      const completedRun = {
        ...mockRun,
        status: "completed",
        metrics: { f1: 0.95, precision: 0.92 },
      };

      (prisma.benchmarkRun.findUnique as jest.Mock).mockResolvedValue(
        completedRun,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.compareAgainstBaseline("run-1");

      expect(result).toBeNull();
    });

    it("should return null when comparing baseline against itself", async () => {
      const baselineRun = {
        ...mockRun,
        id: "run-1",
        status: "completed",
        isBaseline: true,
        metrics: { f1: 0.95 },
      };

      (prisma.benchmarkRun.findUnique as jest.Mock).mockResolvedValue(
        baselineRun,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        baselineRun,
      );

      const result = await service.compareAgainstBaseline("run-1");

      expect(result).toBeNull();
    });

    it("should compare metrics with relative thresholds", async () => {
      const baselineRun = {
        id: "baseline-run",
        definitionId: "def-1",
        status: "completed",
        isBaseline: true,
        metrics: { f1: 0.9, precision: 0.85 },
        baselineThresholds: [
          { metricName: "f1", type: "relative", value: 0.95 }, // 95% of baseline
        ],
      };

      const currentRun = {
        ...mockRun,
        id: "run-1",
        status: "completed",
        metrics: { f1: 0.84, precision: 0.88 }, // f1 regressed below 95% (0.9 * 0.95 = 0.855, so 0.84 < 0.855)
        tags: {},
      };

      (prisma.benchmarkRun.findUnique as jest.Mock).mockResolvedValue(
        currentRun,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        baselineRun,
      );
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue(currentRun);

      const result = await service.compareAgainstBaseline("run-1");

      expect(result).toBeDefined();
      expect(result?.baselineRunId).toBe("baseline-run");
      expect(result?.overallPassed).toBe(false);
      expect(result?.regressedMetrics).toContain("f1");

      // Should update run with comparison and regression tag
      expect(prisma.benchmarkRun.update).toHaveBeenCalledWith({
        where: { id: "run-1" },
        data: {
          baselineComparison: expect.any(Object),
          tags: { regression: "true" },
        },
      });
    });

    it("should compare metrics with absolute thresholds", async () => {
      const baselineRun = {
        id: "baseline-run",
        definitionId: "def-1",
        status: "completed",
        isBaseline: true,
        metrics: { precision: 0.92 },
        baselineThresholds: [
          { metricName: "precision", type: "absolute", value: 0.9 }, // Must be >= 0.9
        ],
      };

      const currentRun = {
        ...mockRun,
        id: "run-1",
        status: "completed",
        metrics: { precision: 0.91 }, // Passes absolute threshold
        tags: {},
      };

      (prisma.benchmarkRun.findUnique as jest.Mock).mockResolvedValue(
        currentRun,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        baselineRun,
      );
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue(currentRun);

      const result = await service.compareAgainstBaseline("run-1");

      expect(result).toBeDefined();
      expect(result?.overallPassed).toBe(true);
      expect(result?.regressedMetrics).toHaveLength(0);
    });

    it("should calculate deltas correctly", async () => {
      const baselineRun = {
        id: "baseline-run",
        definitionId: "def-1",
        status: "completed",
        isBaseline: true,
        metrics: { f1: 0.8 },
        baselineThresholds: [],
      };

      const currentRun = {
        ...mockRun,
        id: "run-1",
        status: "completed",
        metrics: { f1: 0.9 }, // 0.1 improvement
        tags: {},
      };

      (prisma.benchmarkRun.findUnique as jest.Mock).mockResolvedValue(
        currentRun,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        baselineRun,
      );
      (prisma.benchmarkRun.update as jest.Mock).mockResolvedValue(currentRun);

      const result = await service.compareAgainstBaseline("run-1");

      expect(result).toBeDefined();
      expect(result?.metricComparisons).toHaveLength(1);
      expect(result?.metricComparisons[0].metricName).toBe("f1");
      expect(result?.metricComparisons[0].currentValue).toBe(0.9);
      expect(result?.metricComparisons[0].baselineValue).toBe(0.8);
      expect(result?.metricComparisons[0].delta).toBeCloseTo(0.1, 5);
      expect(result?.metricComparisons[0].deltaPercent).toBeCloseTo(12.5, 5);
    });
  });
});
