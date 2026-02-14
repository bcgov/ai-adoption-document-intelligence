/**
 * Benchmark Definition Service Tests
 *
 * Tests for the benchmark definition service.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { PrismaClient } from "@generated/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkEvaluator } from "./evaluator.interface";
import { EvaluatorRegistryService } from "./evaluator-registry.service";

// Mock Prisma
jest.mock("@generated/client", () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      benchmarkProject: {
        findUnique: jest.fn(),
      },
      datasetVersion: {
        findUnique: jest.fn(),
      },
      split: {
        findUnique: jest.fn(),
      },
      workflow: {
        findUnique: jest.fn(),
      },
      benchmarkDefinition: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    })),
  };
});

describe("BenchmarkDefinitionService", () => {
  let service: BenchmarkDefinitionService;
  let evaluatorRegistry: EvaluatorRegistryService;
  let prisma: PrismaClient;

  const mockEvaluator: BenchmarkEvaluator = {
    type: "schema-aware",
    evaluate: jest.fn(),
  };

  const mockProject = {
    id: "project-1",
    name: "Test Project",
    description: "Test Description",
    mlflowExperimentId: "exp-1",
    createdBy: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockDatasetVersion = {
    id: "ds-version-1",
    datasetId: "ds-1",
    version: "v1.0.0",
    gitRevision: "abc123",
    manifestPath: "/path/to/manifest.json",
    documentCount: 100,
    groundTruthSchema: null,
    status: "published" as never,
    publishedAt: new Date(),
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

  const mockWorkflow = {
    id: "workflow-1",
    name: "Test Workflow",
    description: "Test workflow description",
    user_id: "user-1",
    config: {
      schemaVersion: "1.0",
      metadata: { name: "Test", tags: [] },
      nodes: {},
      edges: [],
      entryNodeId: "start",
      ctx: {},
    },
    version: 1,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkDefinitionService,
        EvaluatorRegistryService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("postgresql://test"),
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

    // Access the private prisma instance
    prisma = service["prisma"];

    // Register mock evaluator
    evaluatorRegistry.register(mockEvaluator);
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
      workflowId: "workflow-1",
      evaluatorType: "schema-aware",
      evaluatorConfig: { threshold: 0.9 },
      runtimeSettings: { timeout: 3600 },
      artifactPolicy: { keepAll: true },
    };

    it("creates a definition with all valid references", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest.spyOn(prisma.workflow, "findUnique").mockResolvedValue(mockWorkflow);

      const mockCreatedDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: createDto.name,
        datasetVersionId: createDto.datasetVersionId,
        splitId: createDto.splitId,
        workflowId: createDto.workflowId,
        workflowConfigHash: expect.any(String),
        evaluatorType: createDto.evaluatorType,
        evaluatorConfig: createDto.evaluatorConfig,
        runtimeSettings: createDto.runtimeSettings,
        artifactPolicy: createDto.artifactPolicy,
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflow: mockWorkflow,
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
      jest.spyOn(prisma.workflow, "findUnique").mockResolvedValue(mockWorkflow);

      const mockCreatedDefinition = {
        id: "def-1",
        projectId: "project-1",
        name: createDto.name,
        datasetVersionId: createDto.datasetVersionId,
        splitId: createDto.splitId,
        workflowId: createDto.workflowId,
        workflowConfigHash: "abc123hash",
        evaluatorType: createDto.evaluatorType,
        evaluatorConfig: createDto.evaluatorConfig,
        runtimeSettings: createDto.runtimeSettings,
        artifactPolicy: createDto.artifactPolicy,
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflow: mockWorkflow,
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
  });

  // -----------------------------------------------------------------------
  // Scenario 2: Validate referenced entities on creation
  // -----------------------------------------------------------------------
  describe("createDefinition - validation", () => {
    const createDto = {
      name: "Test Definition",
      datasetVersionId: "ds-version-1",
      splitId: "split-1",
      workflowId: "workflow-1",
      evaluatorType: "schema-aware",
      evaluatorConfig: { threshold: 0.9 },
      runtimeSettings: { timeout: 3600 },
      artifactPolicy: { keepAll: true },
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
      jest.spyOn(prisma.workflow, "findUnique").mockResolvedValue(null);

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow('Workflow with ID "workflow-1" does not exist');
    });

    it("returns 400 when evaluator type is not registered", async () => {
      jest
        .spyOn(prisma.benchmarkProject, "findUnique")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(prisma.datasetVersion, "findUnique")
        .mockResolvedValue(mockDatasetVersion);
      jest.spyOn(prisma.split, "findUnique").mockResolvedValue(mockSplit);
      jest.spyOn(prisma.workflow, "findUnique").mockResolvedValue(mockWorkflow);

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
          workflow: mockWorkflow,
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
          workflow: mockWorkflow,
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
        workflowId: "workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        artifactPolicy: { keepAll: true },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflow: mockWorkflow,
        benchmarkRuns: [
          {
            id: "run-1",
            status: "completed",
            mlflowRunId: "mlflow-1",
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
        workflowId: "workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        artifactPolicy: { keepAll: true },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflow: mockWorkflow,
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
        workflowId: "workflow-1",
        workflowConfigHash: "abc123",
        evaluatorType: "schema-aware",
        evaluatorConfig: { threshold: 0.9 },
        runtimeSettings: { timeout: 3600 },
        artifactPolicy: { keepAll: true },
        immutable: false,
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: mockDatasetVersion,
        split: mockSplit,
        workflow: mockWorkflow,
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
});
