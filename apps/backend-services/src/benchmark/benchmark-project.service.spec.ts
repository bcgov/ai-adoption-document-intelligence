/**
 * Benchmark Project Service Tests
 *
 * Tests for benchmark project service operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

const mockPrismaClient = {
  benchmarkProject: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn(),
}));

jest.mock("@generated/client", () => ({
  PrismaClient: jest.fn(() => mockPrismaClient),
}));

jest.mock("@/utils/database-url", () => ({
  getPrismaPgOptions: jest.fn().mockReturnValue({}),
}));

import { ConflictException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { CreateProjectDto } from "./dto";
import { MLflowClientService } from "./mlflow-client.service";

describe("BenchmarkProjectService", () => {
  let service: BenchmarkProjectService;
  let mlflowClient: MLflowClientService;

  const mockMlflowClient = {
    createExperiment: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === "DATABASE_URL") return "postgresql://test";
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkProjectService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: MLflowClientService,
          useValue: mockMlflowClient,
        },
      ],
    }).compile();

    service = module.get<BenchmarkProjectService>(BenchmarkProjectService);
    mlflowClient = module.get<MLflowClientService>(MLflowClientService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create a benchmark project
  // -----------------------------------------------------------------------
  describe("createProject", () => {
    it("creates a project and MLflow experiment successfully", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        description: "Test description",
        createdBy: "user@example.com",
      };

      const mockMlflowExperimentId = "mlflow-exp-123";
      const mockProject = {
        id: "project-123",
        name: createDto.name,
        description: createDto.description,
        mlflowExperimentId: mockMlflowExperimentId,
        createdBy: createDto.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };

      mockMlflowClient.createExperiment.mockResolvedValue(
        mockMlflowExperimentId,
      );
      mockPrismaClient.benchmarkProject.create.mockResolvedValue(mockProject);

      const result = await service.createProject(createDto);

      expect(mockMlflowClient.createExperiment).toHaveBeenCalledWith(
        createDto.name,
      );
      expect(mockPrismaClient.benchmarkProject.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: createDto.description,
          mlflowExperimentId: mockMlflowExperimentId,
          createdBy: createDto.createdBy,
        },
        include: expect.any(Object),
      });

      expect(result.id).toBe(mockProject.id);
      expect(result.name).toBe(mockProject.name);
      expect(result.mlflowExperimentId).toBe(mockMlflowExperimentId);
      expect(result.definitions).toEqual([]);
      expect(result.recentRuns).toEqual([]);
    });

    it("handles null description", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        createdBy: "user@example.com",
      };

      const mockMlflowExperimentId = "mlflow-exp-123";
      const mockProject = {
        id: "project-123",
        name: createDto.name,
        description: null,
        mlflowExperimentId: mockMlflowExperimentId,
        createdBy: createDto.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };

      mockMlflowClient.createExperiment.mockResolvedValue(
        mockMlflowExperimentId,
      );
      mockPrismaClient.benchmarkProject.create.mockResolvedValue(mockProject);

      const result = await service.createProject(createDto);

      expect(mockPrismaClient.benchmarkProject.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: null,
          mlflowExperimentId: mockMlflowExperimentId,
          createdBy: createDto.createdBy,
        },
        include: expect.any(Object),
      });

      expect(result.description).toBeNull();
    });

    // Scenario 6: MLflow experiment creation failure is handled
    it("throws error when MLflow experiment creation fails", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        createdBy: "user@example.com",
      };

      const mlflowError = new Error("MLflow server unreachable");
      mockMlflowClient.createExperiment.mockRejectedValue(mlflowError);

      await expect(service.createProject(createDto)).rejects.toThrow(
        "Failed to create MLflow experiment",
      );

      // Ensure no project was created in Postgres
      expect(mockPrismaClient.benchmarkProject.create).not.toHaveBeenCalled();
    });

    it("throws ConflictException when MLflow experiment name already exists", async () => {
      const createDto: CreateProjectDto = {
        name: "Duplicate Project",
        createdBy: "user@example.com",
      };

      const mlflowError = new Error(
        'Failed to create MLflow experiment "Duplicate Project": RESOURCE_ALREADY_EXISTS',
      );
      mockMlflowClient.createExperiment.mockRejectedValue(mlflowError);

      await expect(service.createProject(createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.createProject(createDto)).rejects.toThrow(
        'A project with the name "Duplicate Project" already exists in MLflow',
      );

      expect(mockPrismaClient.benchmarkProject.create).not.toHaveBeenCalled();
    });

    it("handles database error after MLflow creation", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        createdBy: "user@example.com",
      };

      const mockMlflowExperimentId = "mlflow-exp-123";
      mockMlflowClient.createExperiment.mockResolvedValue(
        mockMlflowExperimentId,
      );

      const dbError = new Error("Database connection failed");
      mockPrismaClient.benchmarkProject.create.mockRejectedValue(dbError);

      await expect(service.createProject(createDto)).rejects.toThrow(
        "Database connection failed",
      );

      expect(mockMlflowClient.createExperiment).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: List benchmark projects
  // -----------------------------------------------------------------------
  describe("listProjects", () => {
    it("returns list of projects with counts", async () => {
      const mockProjects = [
        {
          id: "project-1",
          name: "Project 1",
          description: "Description 1",
          mlflowExperimentId: "exp-1",
          createdBy: "user1@example.com",
          createdAt: new Date("2024-01-01"),
          updatedAt: new Date("2024-01-02"),
          _count: {
            benchmarkDefinitions: 3,
            benchmarkRuns: 10,
          },
        },
        {
          id: "project-2",
          name: "Project 2",
          description: null,
          mlflowExperimentId: "exp-2",
          createdBy: "user2@example.com",
          createdAt: new Date("2024-01-03"),
          updatedAt: new Date("2024-01-04"),
          _count: {
            benchmarkDefinitions: 1,
            benchmarkRuns: 5,
          },
        },
      ];

      mockPrismaClient.benchmarkProject.findMany.mockResolvedValue(
        mockProjects,
      );

      const result = await service.listProjects();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("project-1");
      expect(result[0].name).toBe("Project 1");
      expect(result[0].definitionCount).toBe(3);
      expect(result[0].runCount).toBe(10);

      expect(result[1].id).toBe("project-2");
      expect(result[1].description).toBeNull();
      expect(result[1].definitionCount).toBe(1);
      expect(result[1].runCount).toBe(5);
    });

    it("returns empty array when no projects exist", async () => {
      mockPrismaClient.benchmarkProject.findMany.mockResolvedValue([]);

      const result = await service.listProjects();

      expect(result).toEqual([]);
    });

    it("orders projects by createdAt descending", async () => {
      mockPrismaClient.benchmarkProject.findMany.mockResolvedValue([]);

      await service.listProjects();

      expect(mockPrismaClient.benchmarkProject.findMany).toHaveBeenCalledWith({
        include: expect.any(Object),
        orderBy: {
          createdAt: "desc",
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Get project details
  // -----------------------------------------------------------------------
  describe("getProjectById", () => {
    it("returns full project details with definitions and recent runs", async () => {
      const projectId = "project-123";
      const mockProject = {
        id: projectId,
        name: "Test Project",
        description: "Test description",
        mlflowExperimentId: "exp-123",
        createdBy: "user@example.com",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
        benchmarkDefinitions: [
          {
            id: "def-1",
            name: "Definition 1",
            datasetVersionId: "ds-ver-1",
            evaluatorType: "schema-aware",
            immutable: false,
            createdAt: new Date("2024-01-01"),
          },
          {
            id: "def-2",
            name: "Definition 2",
            datasetVersionId: "ds-ver-2",
            evaluatorType: "black-box",
            immutable: true,
            createdAt: new Date("2024-01-02"),
          },
        ],
        benchmarkRuns: [
          {
            id: "run-1",
            status: "COMPLETED",
            mlflowRunId: "mlflow-run-1",
            temporalWorkflowId: "temporal-wf-1",
            startedAt: new Date("2024-01-01T10:00:00Z"),
            completedAt: new Date("2024-01-01T10:30:00Z"),
            definition: {
              name: "Definition 1",
            },
          },
          {
            id: "run-2",
            status: "RUNNING",
            mlflowRunId: "mlflow-run-2",
            temporalWorkflowId: "temporal-wf-2",
            startedAt: new Date("2024-01-02T11:00:00Z"),
            completedAt: null,
            definition: {
              name: "Definition 2",
            },
          },
        ],
      };

      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(
        mockProject,
      );

      const result = await service.getProjectById(projectId);

      expect(mockPrismaClient.benchmarkProject.findUnique).toHaveBeenCalledWith(
        {
          where: { id: projectId },
          include: expect.any(Object),
        },
      );

      expect(result.id).toBe(projectId);
      expect(result.name).toBe("Test Project");
      expect(result.definitions).toHaveLength(2);
      expect(result.definitions[0].id).toBe("def-1");
      expect(result.definitions[0].name).toBe("Definition 1");
      expect(result.definitions[1].evaluatorType).toBe("black-box");
      expect(result.definitions[1].immutable).toBe(true);

      expect(result.recentRuns).toHaveLength(2);
      expect(result.recentRuns[0].id).toBe("run-1");
      expect(result.recentRuns[0].definitionName).toBe("Definition 1");
      expect(result.recentRuns[0].status).toBe("COMPLETED");
      expect(result.recentRuns[1].completedAt).toBeNull();
    });

    // Scenario 4: Project not found returns 404
    it("throws NotFoundException when project does not exist", async () => {
      const projectId = "non-existent-id";
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(null);

      await expect(service.getProjectById(projectId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProjectById(projectId)).rejects.toThrow(
        `Benchmark project with ID "${projectId}" not found`,
      );
    });
  });
});
