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
    delete: jest.fn(),
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

describe("BenchmarkProjectService", () => {
  let service: BenchmarkProjectService;

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
      ],
    }).compile();

    service = module.get<BenchmarkProjectService>(BenchmarkProjectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create a benchmark project
  // -----------------------------------------------------------------------
  describe("createProject", () => {
    it("creates a project successfully", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        description: "Test description",
        createdBy: "user@example.com",
      };

      const mockProject = {
        id: "project-123",
        name: createDto.name,
        description: createDto.description,
        createdBy: createDto.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };

      mockPrismaClient.benchmarkProject.create.mockResolvedValue(mockProject);

      const result = await service.createProject(createDto);

      expect(mockPrismaClient.benchmarkProject.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: createDto.description,
          createdBy: createDto.createdBy,
        },
        include: expect.any(Object),
      });

      expect(result.id).toBe(mockProject.id);
      expect(result.name).toBe(mockProject.name);
      expect(result.definitions).toEqual([]);
      expect(result.recentRuns).toEqual([]);
    });

    it("handles null description", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        createdBy: "user@example.com",
      };

      const mockProject = {
        id: "project-123",
        name: createDto.name,
        description: null,
        createdBy: createDto.createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };

      mockPrismaClient.benchmarkProject.create.mockResolvedValue(mockProject);

      const result = await service.createProject(createDto);

      expect(mockPrismaClient.benchmarkProject.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: null,
          createdBy: createDto.createdBy,
        },
        include: expect.any(Object),
      });

      expect(result.description).toBeNull();
    });

    it("throws ConflictException when project name already exists", async () => {
      const createDto: CreateProjectDto = {
        name: "Duplicate Project",
        createdBy: "user@example.com",
      };

      const prismaError = new Error("Unique constraint failed") as Error & { code: string };
      prismaError.code = "P2002";
      mockPrismaClient.benchmarkProject.create.mockRejectedValue(prismaError);

      await expect(service.createProject(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it("handles database error", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        createdBy: "user@example.com",
      };

      const dbError = new Error("Database connection failed");
      mockPrismaClient.benchmarkProject.create.mockRejectedValue(dbError);

      await expect(service.createProject(createDto)).rejects.toThrow(
        "Database connection failed",
      );
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

  // -----------------------------------------------------------------------
  // Scenario 5: Delete a benchmark project
  // -----------------------------------------------------------------------
  describe("deleteProject", () => {
    it("deletes a project with no active runs", async () => {
      const projectId = "project-123";
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue({
        id: projectId,
        name: "Test Project",
        benchmarkRuns: [],
      });
      mockPrismaClient.benchmarkProject.delete.mockResolvedValue(undefined);

      await service.deleteProject(projectId);

      expect(mockPrismaClient.benchmarkProject.delete).toHaveBeenCalledWith({
        where: { id: projectId },
      });
    });

    it("throws NotFoundException when project does not exist", async () => {
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(null);

      await expect(service.deleteProject("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ConflictException when project has active runs", async () => {
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue({
        id: "project-123",
        name: "Test Project",
        benchmarkRuns: [{ id: "run-1", status: "running" }],
      });

      await expect(service.deleteProject("project-123")).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
