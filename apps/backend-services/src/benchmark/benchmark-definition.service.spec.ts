/**
 * Benchmark Definition Service Tests
 *
 * Tests for the benchmark definition service.
 * See feature-docs/003-benchmarking-system/user-stories/US-011-benchmark-definition-service-controller.md
 */

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkDefinitionService } from "./benchmark-definition.service";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";
import { BenchmarkTemporalService } from "./benchmark-temporal.service";
import { EvaluatorRegistryService } from "./evaluator-registry.service";

const mockBenchmarkDefinitionDbService = {
  findBenchmarkProject: jest.fn(),
  findDatasetVersion: jest.fn(),
  findSplit: jest.fn(),
  findWorkflow: jest.fn(),
  createBenchmarkDefinition: jest.fn(),
  findBenchmarkDefinition: jest.fn(),
  findBenchmarkDefinitionForUpdate: jest.fn(),
  findAllBenchmarkDefinitions: jest.fn(),
  findBaselineBenchmarkRun: jest.fn().mockResolvedValue(null),
  updateBenchmarkDefinition: jest.fn(),
  deleteBenchmarkDefinition: jest.fn(),
  findBenchmarkDefinitionForDeletion: jest.fn(),
};

describe("BenchmarkDefinitionService", () => {
  let service: BenchmarkDefinitionService;
  let evaluatorRegistry: EvaluatorRegistryService;
  let temporalService: BenchmarkTemporalService;

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

  const mockWorkflow = {
    id: "workflow-1",
    name: "Test Workflow",
    description: "Test workflow description",
    user_id: "user-1",
    group_id: "test-group",
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
          provide: BenchmarkDefinitionDbService,
          useValue: mockBenchmarkDefinitionDbService,
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
      workflowId: "workflow-1",
      evaluatorType: "schema-aware",
      evaluatorConfig: { threshold: 0.9 },
      runtimeSettings: { timeout: 3600 },
    };

    it("creates a definition with all valid references", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(mockDatasetVersion);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findSplit")
        .mockResolvedValue(mockSplit);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findWorkflow")
        .mockResolvedValue(mockWorkflow);

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
        .spyOn(mockBenchmarkDefinitionDbService, "createBenchmarkDefinition")
        .mockResolvedValue(mockCreatedDefinition as never);

      const result = await service.createDefinition("project-1", createDto);

      expect(result).toBeDefined();
      expect(result.name).toBe(createDto.name);
      expect(result.immutable).toBe(false);
      expect(result.revision).toBe(1);
      expect(result.workflowConfigHash).toBeDefined();
      expect(
        mockBenchmarkDefinitionDbService.createBenchmarkDefinition,
      ).toHaveBeenCalled();
    });

    it("captures workflow config hash at creation time", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(mockDatasetVersion);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findSplit")
        .mockResolvedValue(mockSplit);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findWorkflow")
        .mockResolvedValue(mockWorkflow);

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
        .spyOn(mockBenchmarkDefinitionDbService, "createBenchmarkDefinition")
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
    };

    it("returns 400 when project does not exist", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(null);

      await expect(
        service.createDefinition("invalid-project", createDto),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns 400 when dataset version does not exist", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(null);

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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(mockDatasetVersion);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findSplit")
        .mockResolvedValue(null);

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow('Split with ID "split-1" does not exist');
    });

    it("returns 400 when split does not belong to dataset version", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(mockDatasetVersion);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findSplit")
        .mockResolvedValue({
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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(mockDatasetVersion);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findSplit")
        .mockResolvedValue(mockSplit);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findWorkflow")
        .mockResolvedValue(null);

      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createDefinition("project-1", createDto),
      ).rejects.toThrow('Workflow with ID "workflow-1" does not exist');
    });

    it("returns 400 when evaluator type is not registered", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(mockProject);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findDatasetVersion")
        .mockResolvedValue(mockDatasetVersion);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findSplit")
        .mockResolvedValue(mockSplit);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findWorkflow")
        .mockResolvedValue(mockWorkflow);

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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
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
        .spyOn(mockBenchmarkDefinitionDbService, "findAllBenchmarkDefinitions")
        .mockResolvedValue(mockDefinitions as never);

      const result = await service.listDefinitions("project-1");

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Definition 1");
      expect(result[0].immutable).toBe(false);
      expect(result[1].immutable).toBe(true);
    });

    it("returns 404 when project does not exist", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkProject")
        .mockResolvedValue(null);

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
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
      };

      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
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
        workflowId: "workflow-1",
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
        workflow: mockWorkflow,
        benchmarkRuns: [],
      };

      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
        .mockResolvedValue(mockDefinition as never);

      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBaselineBenchmarkRun")
        .mockResolvedValue(null);

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
        workflowId: "workflow-1",
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
        workflow: mockWorkflow,
        _count: {
          benchmarkRuns: 1, // Has runs
        },
      };

      jest
        .spyOn(
          mockBenchmarkDefinitionDbService,
          "findBenchmarkDefinitionForUpdate",
        )
        .mockResolvedValue(existingDefinition as never);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "updateBenchmarkDefinition")
        .mockResolvedValue({
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
        .spyOn(mockBenchmarkDefinitionDbService, "createBenchmarkDefinition")
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
      expect(
        mockBenchmarkDefinitionDbService.updateBenchmarkDefinition,
      ).toHaveBeenCalledWith("def-1", { immutable: true });
      expect(
        mockBenchmarkDefinitionDbService.createBenchmarkDefinition,
      ).toHaveBeenCalled();
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
        .spyOn(
          mockBenchmarkDefinitionDbService,
          "findBenchmarkDefinitionForUpdate",
        )
        .mockResolvedValue(existingDefinition as never);

      const updatedDefinition = {
        ...existingDefinition,
        name: "Updated Name",
        benchmarkRuns: [],
      };

      jest
        .spyOn(mockBenchmarkDefinitionDbService, "updateBenchmarkDefinition")
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
      expect(
        mockBenchmarkDefinitionDbService.updateBenchmarkDefinition,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockBenchmarkDefinitionDbService.createBenchmarkDefinition,
      ).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 8: Definition not found returns 404
  // -----------------------------------------------------------------------
  describe("getDefinitionById - not found", () => {
    it("returns 404 when definition does not exist", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
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
      workflowId: "workflow-1",
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
      workflow: mockWorkflow,
    };

    it("creates a new schedule when enabling", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
        .mockResolvedValue(mockDefinition as never);

      jest
        .spyOn(temporalService, "createSchedule")
        .mockResolvedValue("schedule-def-1");

      jest
        .spyOn(mockBenchmarkDefinitionDbService, "updateBenchmarkDefinition")
        .mockResolvedValue({
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
      expect(
        mockBenchmarkDefinitionDbService.updateBenchmarkDefinition,
      ).toHaveBeenCalledWith("def-1", {
        scheduleEnabled: true,
        scheduleCron: "0 2 * * *",
        scheduleId: "schedule-def-1",
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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
        .mockResolvedValue(definitionWithSchedule as never);

      jest.spyOn(temporalService, "deleteSchedule").mockResolvedValue();

      jest
        .spyOn(mockBenchmarkDefinitionDbService, "updateBenchmarkDefinition")
        .mockResolvedValue({
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
      expect(
        mockBenchmarkDefinitionDbService.updateBenchmarkDefinition,
      ).toHaveBeenCalledWith("def-1", {
        scheduleEnabled: false,
        scheduleCron: null,
        scheduleId: null,
      });
    });

    it("throws error when enabling without cron expression", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
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
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
        .mockResolvedValue(mockDefinition as never);

      const result = await service.getScheduleInfo("project-1", "def-1");

      expect(result).toBeNull();
      expect(temporalService.getScheduleInfo).not.toHaveBeenCalled();
    });

    it("throws error when definition not found", async () => {
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "findBenchmarkDefinition")
        .mockResolvedValue(null);

      await expect(
        service.getScheduleInfo("project-1", "invalid-def"),
      ).rejects.toThrow(NotFoundException);
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
        .spyOn(
          mockBenchmarkDefinitionDbService,
          "findBenchmarkDefinitionForDeletion",
        )
        .mockResolvedValue(mockDefinition as never);
      jest
        .spyOn(mockBenchmarkDefinitionDbService, "deleteBenchmarkDefinition")
        .mockResolvedValue(undefined);

      await service.deleteDefinition("project-1", "def-1");

      expect(
        mockBenchmarkDefinitionDbService.deleteBenchmarkDefinition,
      ).toHaveBeenCalledWith("def-1");
    });

    it("throws NotFoundException when definition does not exist", async () => {
      jest
        .spyOn(
          mockBenchmarkDefinitionDbService,
          "findBenchmarkDefinitionForDeletion",
        )
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
        .spyOn(
          mockBenchmarkDefinitionDbService,
          "findBenchmarkDefinitionForDeletion",
        )
        .mockResolvedValue(mockDefinition as never);

      await expect(
        service.deleteDefinition("project-1", "def-1"),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
