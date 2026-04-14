/**
 * Benchmark Definition Service Tests
 *
 * Tests for the benchmark definition service.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { computeConfigHash } from "@/workflow/config-hash";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";

const mockPrismaClient = {
  benchmarkProject: {
    findUnique: jest.fn(),
  },
  datasetVersion: {
    findUnique: jest.fn(),
  },
  split: {
    findUnique: jest.fn(),
  },
  workflowLineage: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workflowVersion: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  },
  benchmarkDefinition: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  benchmarkRun: {
    findFirst: jest.fn().mockResolvedValue(null),
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrismaClient),
  ),
};

describe("BenchmarkDefinitionService", () => {
  let service: BenchmarkDefinitionService;
  let evaluatorRegistry: EvaluatorRegistryService;
  let temporalService: BenchmarkTemporalService;
  let prisma: typeof mockPrismaClient;

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    description: "Test Description",
    createdBy: "user-1",
    group_id: "test-group",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDatasetVersion = {
    id: "ds-version-1",
    datasetId: "ds-1",
    version: "v1.0.0",
    name: null,
    storagePrefix: "datasets/ds-1/ds-version-1/",
    manifestPath: "/path/to/manifest.json",
    documentCount: 100,
    groundTruthSchema: null,
    frozen: false,
    createdAt: new Date(),
    dataset: {
      name: "Test Dataset",
    },
  };

  const mockSplit = {
    id: "split-1",
    datasetVersionId: "ds-version-1",
    name: "test",
    type: "test" as never,
    sampleIds: ["s1", "s2"],
    stratificationRules: null,
    frozen: true,
    createdAt: new Date(),
  };

  const mockWorkflowVersion = {
    id: "wv-workflow-1",
    version_number: 1,
    config: {
      schemaVersion: "1.0",
      metadata: { name: "Test", tags: [] },
      nodes: {},
      edges: [],
      entryNodeId: "start",
      ctx: {},
    },
    lineage: {
      id: "workflow-1",
      name: "Test Workflow",
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkDefinitionService,
        BenchmarkDefinitionDbService,
        EvaluatorRegistryService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrismaClient },
        },
        {
          provide: BenchmarkTemporalService,
          useValue: {
            createSchedule: jest.fn(),
            deleteSchedule: jest.fn(),
            getScheduleInfo: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BenchmarkDefinitionService>(
      BenchmarkDefinitionService,
    );
    evaluatorRegistry = module.get<EvaluatorRegistryService>(
      EvaluatorRegistryService,
    );
    temporalService = module.get<BenchmarkTemporalService>(
      BenchmarkTemporalService,
    );

    prisma = mockPrismaClient;

    // Register mock evaluator type
    evaluatorRegistry.registerType("schema-aware");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create a benchmark definition
  // -----------------------------------------------------------------------
  describe("createDefinition", () => {
    const createDto = {
      name: "Test Definition",
      datasetVersionId: "ds-version-1",
      splitId: "split-1",
      workflowVersionId: "wv-workflow-1",
      evaluatorType: "schema-aware",
      evaluatorConfig: { threshold: 0.9 },
      runtimeSettings: { timeout: 3600 },
    };

    it("creates a definition with all valid references", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest
        .spyOn(prisma.workflowVersion, "findUnique")
        .mockResolvedValue(mockWorkflowVersion);

      const mockCreatedDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: createDto.name,
        datasetVersionId: createDto.datasetVersionId,
        splitId: createDto.splitId,
        workflowVersionId: createDto.workflowVersionId,
        workflowConfigHash: expect.any(String),
        evaluatorType: createDto.evaluatorType,
        evaluatorConfig: createDto.evaluatorConfig,
        runtimeSettings: createDto.runtimeSettings,
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflowVersion: mockWorkflowVersion,
        benchmarkRuns: [],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "create")
        .mockResolvedValue(mockCreatedDefinition as never);

      const result = await service.createDefinition("project-1", createDto);

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
      expect(result.immutable).toBe(false);
      expect(result.revision).toBe(1);
      expect(result.workflowConfigHash).toBeDefined();
      expect(prisma.benchmarkDefinition.create).toHaveBeenCalled();
    });

    it("captures workflow config hash at creation time", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest
        .spyOn(prisma.workflowVersion, "findUnique")
        .mockResolvedValue(mockWorkflowVersion);

      const mockCreatedDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: createDto.name,
        datasetVersionId: createDto.datasetVersionId,
        splitId: createDto.splitId,
        workflowVersionId: createDto.workflowVersionId,
        workflowConfigHash: "abc123hash",
        evaluatorType: createDto.evaluatorType,
        evaluatorConfig: createDto.evaluatorConfig,
        runtimeSettings: createDto.runtimeSettings,
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflowVersion: mockWorkflowVersion,
        benchmarkRuns: [],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "create")
        .mockResolvedValue(mockCreatedDefinition as never);

      const result = await service.createDefinition("project-1", createDto);

      expect(result.workflowConfigHash).toBeDefined();
      expect(typeof result.workflowConfigHash).toBe("string");
      expect(result.workflowConfigHash.length).toBeGreaterThan(0);
    });

    it("creates a definition with workflowConfigOverrides", async () => {
      const workflowVersionWithExposedParams = {
        ...mockWorkflowVersion,
        config: {
          ...mockWorkflowVersion.config,
          nodeGroups: {
            "ocr-extraction": {
              label: "OCR",
              nodeIds: ["node1"],
              exposedParams: [
                {
                  label: "OCR Model",
                  path: "ctx.modelId.defaultValue",
                  type: "select",
                  options: ["prebuilt-layout", "prebuilt-read"],
                  default: "prebuilt-layout",
                },
              ],
            },
          },
        },
      };

      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest
        .spyOn(prisma.workflowVersion, "findUnique")
        .mockResolvedValue(workflowVersionWithExposedParams);

      const mockCreatedDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "Test with overrides",
        datasetVersionId: "ds-version-1",
        splitId: "split-1",
        workflowVersionId: "wv-workflow-1",
        workflowConfigHash: expect.any(String),
        workflowConfigOverrides: {
          "ctx.modelId.defaultValue": "prebuilt-read",
        },
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        runtimeSettings: { maxParallelDocuments: 10 },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflowVersion: workflowVersionWithExposedParams,
        benchmarkRuns: [],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "create")
        .mockResolvedValue(mockCreatedDefinition as never);

      const dto = {
        name: "Test with overrides",
        datasetVersionId: "ds-version-1",
        splitId: "split-1",
        workflowVersionId: "wv-workflow-1",
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        runtimeSettings: { maxParallelDocuments: 10 },
        workflowConfigOverrides: {
          "ctx.modelId.defaultValue": "prebuilt-read",
        },
      };

      const result = await service.createDefinition("project-1", dto);

      expect(result.workflowConfigOverrides).toEqual({
        "ctx.modelId.defaultValue": "prebuilt-read",
      });
      expect(prisma.benchmarkDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflowConfigOverrides: {
              "ctx.modelId.defaultValue": "prebuilt-read",
            },
          }),
        }),
      );
    });

    it("rejects overrides with invalid paths", async () => {
      const workflowVersionWithExposedParams = {
        ...mockWorkflowVersion,
        config: {
          ...mockWorkflowVersion.config,
          nodeGroups: {
            "ocr-extraction": {
              label: "OCR",
              nodeIds: ["node1"],
              exposedParams: [
                {
                  label: "OCR Model",
                  path: "ctx.modelId.defaultValue",
                  type: "select",
                  options: ["prebuilt-layout", "prebuilt-read"],
                  default: "prebuilt-layout",
                },
              ],
            },
          },
        },
      };

      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest
        .spyOn(prisma.workflowVersion, "findUnique")
        .mockResolvedValue(workflowVersionWithExposedParams);

      const dto = {
        name: "Test invalid",
        datasetVersionId: "ds-version-1",
        splitId: "split-1",
        workflowVersionId: "wv-workflow-1",
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        runtimeSettings: { maxParallelDocuments: 10 },
        workflowConfigOverrides: { "nodes.node1.activityType": "evil.type" },
      };

      await expect(service.createDefinition("project-1", dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Validate referenced entities on creation
  // -----------------------------------------------------------------------
  describe("createDefinition - validation", () => {
    const createDto = {
      name: "Test Definition",
      datasetVersionId: "ds-version-1",
      splitId: "split-1",
      workflowVersionId: "wv-workflow-1",
      evaluatorType: "schema-aware",
      evaluatorConfig: { threshold: 0.9 },
      runtimeSettings: { timeout: 3600 },
    };

    it("returns 400 when project does not exist", async () => {
      jest.spyOn(prisma.benchmarkProject, "findUnique").mockResolvedValue(null);

      await expect(
        service.createDefinition("invalid-project", createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns 400 when dataset version does not exist", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest.spyOn(prisma.datasetVersion, "findUnique").mockResolvedValue(null);

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(
        'Dataset version with ID "ds-version-1" does not exist',
      );
    });

    it("returns 400 when split does not exist", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(null);

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow('Split with ID "split-1" does not exist');
    });

    it("returns 400 when split does not belong to dataset version", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue({
        ...mockSplit,
        datasetVersionId: "different-ds-version",
      });

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(
        'Split "split-1" does not belong to dataset version "ds-version-1"',
      );
    });

    it("returns 400 when workflow does not exist", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest.spyOn(prisma.workflowVersion, "findUnique").mockResolvedValue(null);

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(
        'Workflow version with ID "wv-workflow-1" does not exist',
      );
    });

    it("returns 400 when evaluator type is not registered", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest
        .spyOn(prisma.workflowVersion, "findUnique")
        .mockResolvedValue(mockWorkflowVersion);

      const invalidDto = {
        ...createDto,
        evaluatorType: "non-existent-evaluator",
      };

      await expect(
        service.createDefinition("project-1", invalidDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", invalidDto),
      ).rejects.toThrow(
        'Evaluator type "non-existent-evaluator" is not registered',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 4: List definitions for a project
  // -----------------------------------------------------------------------
  describe("listDefinitions", () => {
    it("returns list of definitions for a project", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);

      const mockDefinitions = [
        {
          id: "def-1",
          name: "Definition 1",
          evaluatorType: "schema-aware",
          immutable: false,
          revision: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          datasetVersion: mockDatasetVersion,
          workflowVersion: mockWorkflowVersion,
        },
        {
          id: "def-2",
          name: "Definition 2",
          evaluatorType: "schema-aware",
          immutable: true,
          revision: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          datasetVersion: mockDatasetVersion,
          workflowVersion: mockWorkflowVersion,
        },
      ];

      jest
        .spyOn(prisma.benchmarkDefinition, "findMany")
        .mockResolvedValue(mockDefinitions as never);

      const result = await service.listDefinitions("project-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Definition 1");
      expect(result[0].immutable).toBe(false);
      expect(result[1].immutable).toBe(true);
    });

    it("returns 404 when project does not exist", async () => {
      jest.spyOn(prisma.benchmarkProject, "findUnique").mockResolvedValue(null);

      await expect(service.listDefinitions("invalid-project")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Get definition details
  // -----------------------------------------------------------------------
  describe("getDefinitionById", () => {
    it("returns full definition details with run history", async () => {
      const mockDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "Test Definition",
        datasetVersionId: "ds-version-1",
        splitId: "split-1",
        workflowVersionId: "wv-workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflowVersion: mockWorkflowVersion,
        benchmarkRuns: [
          {
            id: "run-1",
            status: "completed",
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      const result = await service.getDefinitionById("project-1", "def-1");

      expect(result).toBeDefined();
      expect(result.id).toBe("def-1");
      expect(result.name).toBe("Test Definition");
      expect(result.runHistory).toHaveLength(1);
      expect(result.runHistory[0].status).toBe("completed");
    });

    it("returns definition details with null split", async () => {
      const mockDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "No Split Definition",
        datasetVersionId: "ds-version-1",
        splitId: null,
        workflowVersionId: "wv-workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        immutable: false,
        revision: 1,
        scheduleEnabled: false,
        scheduleCron: null,
        scheduleId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: null,
        workflowVersion: mockWorkflowVersion,
        benchmarkRuns: [],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      jest.spyOn(prisma.benchmarkRun, "findFirst").mockResolvedValue(null);

      const result = await service.getDefinitionById("project-1", "def-1");

      expect(result).toBeDefined();
      expect(result.id).toBe("def-1");
      expect(result.split).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 6: Immutability enforcement after first run
  // -----------------------------------------------------------------------
  describe("updateDefinition - immutability", () => {
    it("creates a new revision when definition has runs", async () => {
      const existingDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "Original Name",
        datasetVersionId: "ds-version-1",
        splitId: "split-1",
        workflowVersionId: "wv-workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflowVersion: mockWorkflowVersion,
        _count: {
          benchmarkRuns: 1, // Has runs
        },
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(existingDefinition as never);
      jest.spyOn(prisma.benchmarkDefinition, "update").mockResolvedValue({
        ...existingDefinition,
        immutable: true,
      } as never);

      const newRevision = {
        ...existingDefinition,
        id: "def-2",
        name: "Updated Name",
        revision: 2,
        benchmarkRuns: [],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "create")
        .mockResolvedValue(newRevision as never);

      const updateDto = {
        name: "Updated Name",
      };

      const result = await service.updateDefinition(
        "project-1",
        "def-1",
        updateDto,
      );

      expect(result.id).toBe("def-2"); // New ID
      expect(result.name).toBe("Updated Name");
      expect(result.revision).toBe(2);
      expect(prisma.benchmarkDefinition.update).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: { immutable: true },
      });
      expect(prisma.benchmarkDefinition.create).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 7: Editing a mutable definition updates in place
  // -----------------------------------------------------------------------
  describe("updateDefinition - mutable", () => {
    it("updates in place when definition has no runs", async () => {
      const existingDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "Original Name",
        datasetVersionId: "ds-version-1",
        splitId: "split-1",
        workflowVersionId: "wv-workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflowVersion: mockWorkflowVersion,
        _count: {
          benchmarkRuns: 0, // No runs
        },
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(existingDefinition as never);

      const updatedDefinition = {
        ...existingDefinition,
        name: "Updated Name",
        benchmarkRuns: [],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "update")
        .mockResolvedValue(updatedDefinition as never);

      const updateDto = {
        name: "Updated Name",
      };

      const result = await service.updateDefinition(
        "project-1",
        "def-1",
        updateDto,
      );

      expect(result.id).toBe("def-1"); // Same ID
      expect(result.name).toBe("Updated Name");
      expect(result.revision).toBe(1); // Same revision
      expect(prisma.benchmarkDefinition.update).toHaveBeenCalledTimes(1);
      expect(prisma.benchmarkDefinition.create).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Definition not found returns 404
  // -----------------------------------------------------------------------
  describe("getDefinitionById - not found", () => {
    it("returns 404 when definition does not exist", async () => {
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.getDefinitionById("project-1", "invalid-def"),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.getDefinitionById("project-1", "invalid-def"),
      ).rejects.toThrow(
        'Benchmark definition with ID "invalid-def" not found for project "project-1"',
      );
    });
  });

  // -----------------------------------------------------------------------
  // US-035: Schedule Configuration Tests
  // -----------------------------------------------------------------------
  describe("configureSchedule", () => {
    const mockDefinition = {
      id: "def-1",
      projectId: "project-1",
      name: "Test Definition",
      datasetVersionId: "ds-version-1",
      splitId: "split-1",
      workflowVersionId: "wv-workflow-1",
      workflowConfigHash: "hash-123",
      evaluatorType: "schema-aware",
      evaluatorConfig: { threshold: 0.9 },
      runtimeSettings: { maxParallelDocuments: 5 },
      immutable: false,
      revision: 1,
      scheduleEnabled: false,
      scheduleCron: null,
      scheduleId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      datasetVersion: mockDatasetVersion,
      split: mockSplit,
      workflowVersion: mockWorkflowVersion,
    };

    it("creates a new schedule when enabling", async () => {
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      jest
        .spyOn(temporalService, "createSchedule")
        .mockResolvedValue("schedule-def-1");

      jest.spyOn(prisma.benchmarkDefinition, "update").mockResolvedValue({
        ...mockDefinition,
        scheduleEnabled: true,
        scheduleCron: "0 2 * * *",
        scheduleId: "schedule-def-1",
        benchmarkRuns: [],
      } as never);

      const result = await service.configureSchedule("project-1", "def-1", {
        enabled: true,
        cron: "0 2 * * *",
      });

      expect(temporalService.createSchedule).toHaveBeenCalledWith(
        "def-1",
        "0 2 * * *",
        expect.objectContaining({
          definitionId: "def-1",
          evaluatorType: "schema-aware",
        }),
      );
      expect(prisma.benchmarkDefinition.update).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: {
          scheduleEnabled: true,
          scheduleCron: "0 2 * * *",
          scheduleId: "schedule-def-1",
        },
        include: expect.any(Object),
      });
      expect(result.scheduleEnabled).toBe(true);
    });

    it("deletes existing schedule when disabling", async () => {
      const definitionWithSchedule = {
        ...mockDefinition,
        scheduleEnabled: true,
        scheduleCron: "0 2 * * *",
        scheduleId: "schedule-def-1",
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(definitionWithSchedule as never);

      jest.spyOn(temporalService, "deleteSchedule").mockResolvedValue();

      jest.spyOn(prisma.benchmarkDefinition, "update").mockResolvedValue({
        ...mockDefinition,
        scheduleEnabled: false,
        scheduleCron: null,
        scheduleId: null,
        benchmarkRuns: [],
      } as never);

      await service.configureSchedule("project-1", "def-1", {
        enabled: false,
      });

      expect(temporalService.deleteSchedule).toHaveBeenCalledWith(
        "schedule-def-1",
      );
      expect(prisma.benchmarkDefinition.update).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: {
          scheduleEnabled: false,
          scheduleCron: null,
          scheduleId: null,
        },
        include: expect.any(Object),
      });
    });

    it("throws error when enabling without cron expression", async () => {
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      await expect(
        service.configureSchedule("project-1", "def-1", {
          enabled: true,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.configureSchedule("project-1", "def-1", {
          enabled: true,
        }),
      ).rejects.toThrow("Cron expression is required when enabling schedule");
    });

    it("throws error when definition not found", async () => {
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.configureSchedule("project-1", "invalid-def", {
          enabled: true,
          cron: "0 2 * * *",
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getScheduleInfo", () => {
    it("returns schedule info when schedule exists", async () => {
      const mockDefinition = {
        id: "def-1",
        scheduleId: "schedule-def-1",
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      const mockScheduleInfo = {
        scheduleId: "schedule-def-1",
        cron: "0 2 * * *",
        nextRunTime: new Date("2026-02-16T02:00:00Z"),
        paused: false,
      };

      jest
        .spyOn(temporalService, "getScheduleInfo")
        .mockResolvedValue(mockScheduleInfo);

      const result = await service.getScheduleInfo("project-1", "def-1");

      expect(result).toEqual(mockScheduleInfo);
      expect(temporalService.getScheduleInfo).toHaveBeenCalledWith(
        "schedule-def-1",
      );
    });

    it("returns null when no schedule is configured", async () => {
      const mockDefinition = {
        id: "def-1",
        scheduleId: null,
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      const result = await service.getScheduleInfo("project-1", "def-1");

      expect(result).toBeNull();
      expect(temporalService.getScheduleInfo).not.toHaveBeenCalled();
    });

    it("throws error when definition not found", async () => {
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.getScheduleInfo("project-1", "invalid-def"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // applyToBaseWorkflow
  // -----------------------------------------------------------------------
  describe("applyToBaseWorkflow", () => {
    const candidateConfig = {
      schemaVersion: "1.0",
      metadata: { description: "Test graph" },
      entryNodeId: "start",
      ctx: { documentId: { type: "string" } },
      nodes: {
        start: {
          id: "start",
          type: "activity",
          label: "Start",
          activityType: "document.updateStatus",
          inputs: [{ port: "documentId", ctxKey: "documentId" }],
        },
      },
      edges: [],
    };

    it("copies candidate config as new version on base lineage", async () => {
      const projectId = "project-1";
      const candidateWorkflowVersionId = "candidate-v1";
      const baseLineageId = "base-lineage";
      const newBaseVersionId = "wv-new-base";

      jest.spyOn(prisma.workflowVersion, "findUnique").mockResolvedValue({
        id: candidateWorkflowVersionId,
        config: candidateConfig,
        lineage: {
          id: "cand-lineage",
          workflow_kind: "benchmark_candidate",
          source_workflow_id: baseLineageId,
        },
      } as never);

      jest.spyOn(prisma.workflowVersion, "findFirst").mockResolvedValue({
        version_number: 2,
      } as never);

      jest.spyOn(prisma.workflowVersion, "create").mockResolvedValue({
        id: newBaseVersionId,
        version_number: 3,
      } as never);

      jest
        .spyOn(prisma.workflowLineage, "update")
        .mockResolvedValue({} as never);
      jest
        .spyOn(prisma.benchmarkDefinition, "updateMany")
        .mockResolvedValue({} as never);
      jest
        .spyOn(prisma.workflowLineage, "delete")
        .mockResolvedValue({} as never);

      const result = await service.applyToBaseWorkflow(
        projectId,
        candidateWorkflowVersionId,
        false,
      );

      expect(result).toMatchObject({
        newBaseWorkflowVersionId: newBaseVersionId,
        baseLineageId,
        newVersionNumber: 3,
        cleanedUp: false,
      });

      expect(prisma.$transaction).toHaveBeenCalled();

      expect(prisma.workflowVersion.create).toHaveBeenCalledWith({
        data: {
          lineage_id: baseLineageId,
          version_number: 3,
          config: candidateConfig,
        },
      });

      expect(prisma.workflowLineage.update).toHaveBeenCalledWith({
        where: { id: baseLineageId },
        data: { head_version_id: newBaseVersionId },
      });
    });

    it("cleans up candidate artifacts when cleanupCandidateArtifacts is true", async () => {
      const projectId = "project-1";
      const candidateWorkflowVersionId = "candidate-v1";
      const baseLineageId = "base-lineage";
      const candidateLineageId = "cand-lineage";

      jest.spyOn(prisma.workflowVersion, "findUnique").mockResolvedValue({
        id: candidateWorkflowVersionId,
        config: candidateConfig,
        lineage: {
          id: candidateLineageId,
          workflow_kind: "benchmark_candidate",
          source_workflow_id: baseLineageId,
        },
      } as never);

      jest.spyOn(prisma.workflowVersion, "findFirst").mockResolvedValue({
        version_number: 2,
      } as never);

      jest.spyOn(prisma.workflowVersion, "create").mockResolvedValue({
        id: "wv-new-base",
        version_number: 3,
      } as never);

      jest
        .spyOn(prisma.workflowLineage, "update")
        .mockResolvedValue({} as never);

      // Candidate lineage has two versions
      jest
        .spyOn(prisma.workflowVersion, "findMany")
        .mockResolvedValue([{ id: "cand-v1" }, { id: "cand-v2" }] as never);

      // Two definitions point to candidate versions
      jest
        .spyOn(prisma.benchmarkDefinition, "findMany")
        .mockResolvedValue([
          { id: "def-cand-1" },
          { id: "def-cand-2" },
        ] as never);

      jest
        .spyOn(prisma.benchmarkRun, "deleteMany")
        .mockResolvedValue({ count: 3 } as never);

      jest
        .spyOn(prisma.benchmarkDefinition, "deleteMany")
        .mockResolvedValue({ count: 2 } as never);

      jest
        .spyOn(prisma.workflowLineage, "delete")
        .mockResolvedValue({} as never);

      const result = await service.applyToBaseWorkflow(
        projectId,
        candidateWorkflowVersionId,
        true,
      );

      expect(result.cleanedUp).toBe(true);

      // Fetched candidate versions for the lineage
      expect(prisma.workflowVersion.findMany).toHaveBeenCalledWith({
        where: { lineage_id: candidateLineageId },
        select: { id: true },
      });

      // Found definitions pointing to candidate versions
      expect(prisma.benchmarkDefinition.findMany).toHaveBeenCalledWith({
        where: {
          projectId,
          workflowVersionId: { in: ["cand-v1", "cand-v2"] },
        },
        select: { id: true },
      });

      // Deleted runs for those definitions
      expect(prisma.benchmarkRun.deleteMany).toHaveBeenCalledWith({
        where: { definitionId: { in: ["def-cand-1", "def-cand-2"] } },
      });

      // Deleted the definitions themselves
      expect(prisma.benchmarkDefinition.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["def-cand-1", "def-cand-2"] } },
      });

      // Deleted the candidate lineage (cascades versions)
      expect(prisma.workflowLineage.delete).toHaveBeenCalledWith({
        where: { id: candidateLineageId },
      });
    });

    it("rejects non-candidate workflows", async () => {
      jest.spyOn(prisma.workflowVersion, "findUnique").mockResolvedValue({
        id: "wv-primary",
        config: candidateConfig,
        lineage: {
          id: "primary-lineage",
          workflow_kind: "primary",
          source_workflow_id: null,
        },
      } as never);

      await expect(
        service.applyToBaseWorkflow("project-1", "wv-primary", false),
      ).rejects.toThrow(/not a benchmark candidate/i);
    });

    it("throws ConflictException when definition pin does not match lineage head inside transaction", async () => {
      const projectId = "project-1";
      const definitionId = "def-1";
      const candidateWorkflowVersionId = "wv-cand-1";
      const baseLineageId = "lin-base";
      const baseLineageGroupId = "group-1";
      const headAtTx = "wv-head-at-tx";

      const candidateConfig = {
        schemaVersion: "1.0",
        metadata: { description: "Test graph" },
        entryNodeId: "start",
        ctx: { documentId: { type: "string" } },
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            inputs: [{ port: "documentId", ctxKey: "documentId" }],
          },
        },
        edges: [],
      };

      let findFirstCalls = 0;
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockImplementation(() => {
          findFirstCalls += 1;
          if (findFirstCalls === 1) {
            return Promise.resolve({
              id: definitionId,
              projectId,
              workflowVersionId: headAtTx,
              workflowVersion: {
                lineage: {
                  id: baseLineageId,
                  group_id: baseLineageGroupId,
                },
              },
            } as never);
          }
          return Promise.resolve({
            workflowVersionId: "wv-stale-pin",
          } as never);
        });

      jest.spyOn(prisma.workflowLineage, "findUnique").mockResolvedValue({
        id: baseLineageId,
        head_version_id: headAtTx,
      } as never);

      jest.spyOn(prisma.workflowVersion, "findUnique").mockResolvedValue({
        id: candidateWorkflowVersionId,
        config: candidateConfig,
        lineage: {
          id: "lin-cand",
          group_id: baseLineageGroupId,
          workflow_kind: "benchmark_candidate",
          source_workflow_id: baseLineageId,
        },
      } as never);

      await expect(
        service.promoteCandidateWorkflow(
          projectId,
          definitionId,
          candidateWorkflowVersionId,
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.workflowVersion.create).not.toHaveBeenCalled();
    });

    it("continues when candidate lineage delete fails (e.g. FK references)", async () => {
      const projectId = "project-1";
      const definitionId = "def-1";
      const candidateWorkflowVersionId = "wv-cand-1";
      const baseLineageId = "lin-base";
      const baseLineageGroupId = "group-1";
      const oldBaseHeadVersionId = "wv-old-head";
      const newBaseVersionId = "wv-new-base";

      const candidateConfig = {
        schemaVersion: "1.0",
        metadata: {},
        entryNodeId: "start",
        ctx: {},
        nodes: {
          start: {
            id: "start",
            type: "activity",
            label: "Start",
            activityType: "document.updateStatus",
            inputs: [],
          },
        },
        edges: [],
      };

      jest
        .spyOn(service, "getDefinitionById")
        .mockResolvedValue({ id: definitionId } as never);

      jest.spyOn(prisma.benchmarkDefinition, "findFirst").mockResolvedValue({
        id: definitionId,
        projectId,
        workflowVersionId: oldBaseHeadVersionId,
        workflowVersion: {
          lineage: { id: baseLineageId, group_id: baseLineageGroupId },
        },
      } as never);

      jest.spyOn(prisma.workflowLineage, "findUnique").mockResolvedValue({
        id: baseLineageId,
        group_id: baseLineageGroupId,
        head_version_id: oldBaseHeadVersionId,
      } as never);

      jest.spyOn(prisma.workflowVersion, "findUnique").mockResolvedValue({
        id: candidateWorkflowVersionId,
        config: candidateConfig,
        lineage: {
          id: "lin-cand",
          group_id: baseLineageGroupId,
          workflow_kind: "benchmark_candidate",
          source_workflow_id: baseLineageId,
        },
      } as never);

      jest.spyOn(prisma.workflowVersion, "findFirst").mockResolvedValue({
        version_number: 1,
      } as never);
      jest.spyOn(prisma.workflowVersion, "create").mockResolvedValue({
        id: newBaseVersionId,
      } as never);
      jest
        .spyOn(prisma.workflowLineage, "update")
        .mockResolvedValue({} as never);
      jest
        .spyOn(prisma.benchmarkDefinition, "updateMany")
        .mockResolvedValue({} as never);
      jest
        .spyOn(prisma.workflowLineage, "delete")
        .mockRejectedValue(new Error("Foreign key violation"));

      await expect(
        service.promoteCandidateWorkflow(
          projectId,
          definitionId,
          candidateWorkflowVersionId,
        ),
      ).resolves.toBeDefined();

      expect(prisma.workflowLineage.delete).toHaveBeenCalledWith({
        where: { id: "lin-cand" },
      });
    });
  });

  // -----------------------------------------------------------------------
  // deleteDefinition
  // -----------------------------------------------------------------------
  describe("deleteDefinition", () => {
    it("deletes a definition with no active runs", async () => {
      const mockDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "Test Definition",
        benchmarkRuns: [
          { id: "run-1", status: "completed" },
          { id: "run-2", status: "failed" },
        ],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);
      jest
        .spyOn(prisma.benchmarkDefinition, "delete")
        .mockResolvedValue(mockDefinition as never);

      await service.deleteDefinition("project-1", "def-1");

      expect(prisma.benchmarkDefinition.delete).toHaveBeenCalledWith({
        where: { id: "def-1" },
      });
    });

    it("throws NotFoundException when definition does not exist", async () => {
      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(null);

      await expect(
        service.deleteDefinition("project-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when definition has active runs", async () => {
      const mockDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: "Test Definition",
        benchmarkRuns: [
          { id: "run-1", status: "running" },
          { id: "run-2", status: "completed" },
        ],
      };

      jest
        .spyOn(prisma.benchmarkDefinition, "findFirst")
        .mockResolvedValue(mockDefinition as never);

      await expect(
        service.deleteDefinition("project-1", "def-1"),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
