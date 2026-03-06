/**
 * Benchmark Run Service Tests
 *
 * Tests for the benchmark run service.
 * See feature-docs/003-benchmarking-system/user-stories/US-012-benchmark-run-service-controller.md
 */

import { Prisma } from "@generated/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { BenchmarkRunService } from "./benchmark-run.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { DatasetService } from "./dataset.service";

// Mock child_process
jest.mock("child_process", () => ({
  execSync: jest.fn().mockReturnValue("abc123\n"),
  exec: jest.fn(),
}));

const mockPrismaClient = {
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
    delete: jest.fn(),
  },
  datasetVersion: {
    update: jest.fn(),
  },
  split: {
    update: jest.fn(),
  },
  benchmarkAuditLog: {
    create: jest.fn(),
  },
};

describe("BenchmarkRunService", () => {
  let service: BenchmarkRunService;
  let benchmarkTemporal: BenchmarkTemporalService;
  let datasetService: DatasetService;
  let prisma: typeof mockPrismaClient;

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    createdBy: "user-1",
    group_id: "test-group",
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
    immutable: false,
    revision: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: mockProject,
    datasetVersion: {
      id: "ds-version-1",
      version: "v1.0.0",
      storagePrefix: "datasets/ds-1/ds-version-1/",
      dataset: {
        name: "Test Dataset",
      },
    },
    split: {
      id: "split-1",
      name: "test",
      type: "test",
      sampleIds: ["sample-1", "sample-2"],
    },
    workflow: {
      id: "workflow-1",
      name: "Test Workflow",
      version: 1,
      config: { nodes: {}, edges: [] },
    },
  };

  const mockRun = {
    id: "run-1",
    definitionId: "def-1",
    projectId: "project-1",
    status: "pending",
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
          provide: PrismaService,
          useValue: { prisma: mockPrismaClient },
        },
        {
          provide: BenchmarkTemporalService,
          useValue: {
            startBenchmarkRunWorkflow: jest.fn(),
            cancelBenchmarkRunWorkflow: jest.fn(),
            getWorkflowStatus: jest.fn(),
          },
        },
        {
          provide: DatasetService,
          useValue: {
            validateDatasetVersion: jest.fn().mockResolvedValue({
              valid: true,
              sampled: false,
              totalSamples: 10,
              issueCount: {
                schemaViolations: 0,
                missingGroundTruth: 0,
                duplicates: 0,
                corruption: 0,
              },
              issues: [],
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BenchmarkRunService>(BenchmarkRunService);
    benchmarkTemporal = module.get<BenchmarkTemporalService>(
      BenchmarkTemporalService,
    );
    datasetService = module.get<DatasetService>(DatasetService);

    prisma = mockPrismaClient;
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

      // Verify Temporal workflow was started
      expect(benchmarkTemporal.startBenchmarkRunWorkflow).toHaveBeenCalledWith(
        expect.stringMatching(/^run-/),
        expect.objectContaining({
          evaluatorType: "schema-aware",
        }),
      );

      // Verify definition was marked immutable
      expect(prisma.benchmarkDefinition.update).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: { immutable: true },
      });

      // Verify dataset version was frozen
      expect(prisma.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "ds-version-1" },
        data: { frozen: true },
      });

      // Verify split was frozen
      expect(prisma.split.update).toHaveBeenCalledWith({
        where: { id: "split-1" },
        data: { frozen: true },
      });

      expect(result.status).toBe("running");
    });

    it("should freeze dataset version but not split when definition has no split", async () => {
      const definitionNoSplit = {
        ...mockDefinition,
        splitId: null,
        split: null,
      };

      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        definitionNoSplit,
      );
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
        definitionNoSplit,
      );
      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue({
        ...mockRun,
        temporalWorkflowId: "benchmark-run-run-1",
        status: "running",
        startedAt: new Date(),
      });

      await service.startRun("project-1", "def-1", {});

      // Verify dataset version was frozen
      expect(prisma.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "ds-version-1" },
        data: { frozen: true },
      });

      // Verify split was NOT frozen (no split on definition)
      expect(prisma.split.update).not.toHaveBeenCalled();
    });

    it("should throw BadRequestException when dataset validation fails", async () => {
      (prisma.benchmarkDefinition.findFirst as jest.Mock).mockResolvedValue(
        mockDefinition,
      );
      (datasetService.validateDatasetVersion as jest.Mock).mockResolvedValue({
        valid: false,
        sampled: false,
        totalSamples: 5,
        issueCount: {
          schemaViolations: 0,
          missingGroundTruth: 2,
          duplicates: 0,
          corruption: 0,
        },
        issues: [
          {
            category: "missing_ground_truth",
            severity: "error",
            sampleId: "sample-1",
            message: "Missing ground truth for sample-1",
          },
          {
            category: "missing_ground_truth",
            severity: "error",
            sampleId: "sample-2",
            message: "Missing ground truth for sample-2",
          },
        ],
      });

      await expect(service.startRun("project-1", "def-1", {})).rejects.toThrow(
        BadRequestException,
      );
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
          total_samples: 2,
          pass_rate: 0.5,
          perSampleResults: [
            {
              sampleId: "s1",
              metrics: { accuracy: 0.5 },
              diagnostics: { type: "invoice" },
              pass: false,
            },
            {
              sampleId: "s2",
              metrics: { accuracy: 0.9 },
              diagnostics: { type: "receipt" },
              pass: true,
            },
          ],
          _aggregate: {
            overall: { totalSamples: 2, passingSamples: 1, failingSamples: 1, passRate: 0.5, metrics: {} },
            failureAnalysis: {
              worstSamples: [
                { sampleId: "s1", metricValue: 0.5, metrics: { accuracy: 0.5 }, diagnostics: { type: "invoice" } },
              ],
              perFieldErrors: [
                { field: "total", totalOccurrences: 20, matchCount: 15, missingCount: 3, mismatchCount: 2, errorRate: 0.25 },
              ],
            },
          },
        },
      };

      (prisma.benchmarkRun.findFirst as jest.Mock).mockResolvedValue(
        completedRun,
      );

      const result = await service.getDrillDown("project-1", "run-1");

      expect(result.runId).toBe("run-1");
      expect(result.worstSamples).toHaveLength(1);
      expect(result.worstSamples[0].sampleId).toBe("s1");
      expect(result.fieldErrorBreakdown).toHaveLength(1);
      expect(result.fieldErrorBreakdown![0].fieldName).toBe("total");
      expect(result.fieldErrorBreakdown![0].errorRate).toBe(0.25);
      // aggregatedMetrics should only contain flat numeric values
      expect(result.aggregatedMetrics).toEqual({ total_samples: 2, pass_rate: 0.5 });
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
        .mockResolvedValueOnce(completedRun) // First call: get the run to promote
        .mockResolvedValueOnce(null); // Second call: find previous baseline (none exists)
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
          baselineThresholds: Prisma.JsonNull,
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

  // Scenario 9: Get per-sample results with filtering
  describe("getPerSampleResults", () => {
    it("should return paginated per-sample results with filtering", async () => {
      const runId = "run-1";
      const projectId = "project-1";

      // Mock Prisma findFirst to return a completed run with per-sample results
      prisma.benchmarkRun.findFirst = jest.fn().mockResolvedValue({
        id: runId,
        projectId,
        status: "completed",
        metrics: {
          perSampleResults: [
            {
              sampleId: "sample-001",
              metadata: { docType: "invoice", language: "en" },
              metrics: { accuracy: 0.95, f1: 0.93 },
            },
            {
              sampleId: "sample-002",
              metadata: { docType: "receipt", language: "en" },
              metrics: { accuracy: 0.88, f1: 0.85 },
            },
            {
              sampleId: "sample-003",
              metadata: { docType: "invoice", language: "fr" },
              metrics: { accuracy: 0.92, f1: 0.9 },
            },
          ],
        },
      });

      // Test without filters
      const resultAll = await service.getPerSampleResults(
        projectId,
        runId,
        {},
        1,
        10,
      );

      expect(resultAll.total).toBe(3);
      expect(resultAll.results).toHaveLength(3);
      expect(resultAll.availableDimensions).toContain("docType");
      expect(resultAll.availableDimensions).toContain("language");
      expect(resultAll.dimensionValues["docType"]).toContain("invoice");
      expect(resultAll.dimensionValues["docType"]).toContain("receipt");

      // Test with filter
      const resultFiltered = await service.getPerSampleResults(
        projectId,
        runId,
        { docType: "invoice" },
        1,
        10,
      );

      expect(resultFiltered.total).toBe(2);
      expect(resultFiltered.results).toHaveLength(2);
      expect(
        resultFiltered.results.every((r) => r.metadata.docType === "invoice"),
      ).toBe(true);
    });

    it("should throw NotFoundException if run not found", async () => {
      prisma.benchmarkRun.findFirst = jest.fn().mockResolvedValue(null);

      await expect(
        service.getPerSampleResults("project-1", "run-1", {}, 1, 10),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if run is not completed", async () => {
      prisma.benchmarkRun.findFirst = jest.fn().mockResolvedValue({
        id: "run-1",
        projectId: "project-1",
        status: "running",
        metrics: {},
      });

      await expect(
        service.getPerSampleResults("project-1", "run-1", {}, 1, 10),
      ).rejects.toThrow(BadRequestException);
    });

    it("should handle pagination correctly", async () => {
      const runId = "run-1";
      const projectId = "project-1";

      // Create 25 sample results
      const perSampleResults = Array.from({ length: 25 }, (_, i) => ({
        sampleId: `sample-${String(i + 1).padStart(3, "0")}`,
        metadata: { index: i },
        metrics: { score: i * 0.01 },
      }));

      prisma.benchmarkRun.findFirst = jest.fn().mockResolvedValue({
        id: runId,
        projectId,
        status: "completed",
        metrics: { perSampleResults },
      });

      // Get page 1
      const page1 = await service.getPerSampleResults(
        projectId,
        runId,
        {},
        1,
        10,
      );

      expect(page1.total).toBe(25);
      expect(page1.totalPages).toBe(3);
      expect(page1.results).toHaveLength(10);
      expect(page1.results[0].sampleId).toBe("sample-001");

      // Get page 2
      const page2 = await service.getPerSampleResults(
        projectId,
        runId,
        {},
        2,
        10,
      );

      expect(page2.results).toHaveLength(10);
      expect(page2.results[0].sampleId).toBe("sample-011");

      // Get page 3 (partial)
      const page3 = await service.getPerSampleResults(
        projectId,
        runId,
        {},
        3,
        10,
      );

      expect(page3.results).toHaveLength(5);
      expect(page3.results[0].sampleId).toBe("sample-021");
    });
  });

  // -----------------------------------------------------------------------
  // deleteRun
  // -----------------------------------------------------------------------
  describe("deleteRun", () => {
    it("deletes a completed run", async () => {
      const mockRun = {
        id: "run-1",
        projectId: "project-1",
        status: "completed",
      };

      jest
        .spyOn(prisma.benchmarkRun, "findFirst")
        .mockResolvedValue(mockRun as never);
      jest
        .spyOn(prisma.benchmarkRun, "delete")
        .mockResolvedValue(mockRun as never);

      await service.deleteRun("project-1", "run-1");

      expect(prisma.benchmarkRun.delete).toHaveBeenCalledWith({
        where: { id: "run-1" },
      });
    });

    it("deletes a failed run", async () => {
      const mockRun = {
        id: "run-2",
        projectId: "project-1",
        status: "failed",
      };

      jest
        .spyOn(prisma.benchmarkRun, "findFirst")
        .mockResolvedValue(mockRun as never);
      jest
        .spyOn(prisma.benchmarkRun, "delete")
        .mockResolvedValue(mockRun as never);

      await service.deleteRun("project-1", "run-2");

      expect(prisma.benchmarkRun.delete).toHaveBeenCalledWith({
        where: { id: "run-2" },
      });
    });

    it("throws NotFoundException when run does not exist", async () => {
      jest
        .spyOn(prisma.benchmarkRun, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.deleteRun("project-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when run is still running", async () => {
      const mockRun = {
        id: "run-3",
        projectId: "project-1",
        status: "running",
      };

      jest
        .spyOn(prisma.benchmarkRun, "findFirst")
        .mockResolvedValue(mockRun as never);

      await expect(
        service.deleteRun("project-1", "run-3"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when run is pending", async () => {
      const mockRun = {
        id: "run-4",
        projectId: "project-1",
        status: "pending",
      };

      jest
        .spyOn(prisma.benchmarkRun, "findFirst")
        .mockResolvedValue(mockRun as never);

      await expect(
        service.deleteRun("project-1", "run-4"),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
