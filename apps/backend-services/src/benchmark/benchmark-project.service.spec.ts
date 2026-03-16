/**
 * Benchmark Project Service Tests
 *
 * Tests for benchmark project service operations.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { BenchmarkProjectDbService } from "./benchmark-project-db.service";
import { CreateProjectDto } from "./dto";

const mockBenchmarkProjectDbService = {
  createBenchmarkProject: jest.fn(),
  findBenchmarkProject: jest.fn(),
  findBenchmarkProjectForDeletion: jest.fn(),
  findAllBenchmarkProjects: jest.fn(),
  deleteBenchmarkProject: jest.fn(),
};

describe("BenchmarkProjectService", () => {
  let service: BenchmarkProjectService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkProjectService,
        {
          provide: BenchmarkProjectDbService,
          useValue: mockBenchmarkProjectDbService,
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
        groupId: "test-group",
      };

      const mockProject = {
        id: "project-123",
        name: createDto.name,
        description: createDto.description,
        createdBy: "user@example.com",
        group_id: "test-group",
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };

      mockBenchmarkProjectDbService.createBenchmarkProject.mockResolvedValue(
        mockProject,
      );

      const result = await service.createProject(createDto, "user@example.com");

      expect(
        mockBenchmarkProjectDbService.createBenchmarkProject,
      ).toHaveBeenCalledWith({
        name: createDto.name,
        description: createDto.description,
        createdBy: "user@example.com",
        group_id: createDto.groupId,
      });

      expect(result.id).toBe(mockProject.id);
      expect(result.name).toBe(mockProject.name);
      expect(result.definitions).toEqual([]);
      expect(result.recentRuns).toEqual([]);
    });

    it("handles null description", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        groupId: "test-group",
      };

      const mockProject = {
        id: "project-123",
        name: createDto.name,
        description: null,
        createdBy: "user@example.com",
        group_id: "test-group",
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };

      mockBenchmarkProjectDbService.createBenchmarkProject.mockResolvedValue(
        mockProject,
      );

      const result = await service.createProject(createDto, "user@example.com");

      expect(
        mockBenchmarkProjectDbService.createBenchmarkProject,
      ).toHaveBeenCalledWith({
        name: createDto.name,
        description: null,
        createdBy: "user@example.com",
        group_id: createDto.groupId,
      });

      expect(result.description).toBeNull();
    });

    it("throws ConflictException when project name already exists", async () => {
      const createDto: CreateProjectDto = {
        name: "Duplicate Project",
        groupId: "test-group",
      };

      const prismaError = new Error("Unique constraint failed") as Error & {
        code: string;
      };
      prismaError.code = "P2002";
      mockBenchmarkProjectDbService.createBenchmarkProject.mockRejectedValue(
        prismaError,
      );

      await expect(
        service.createProject(createDto, "user@example.com"),
      ).rejects.toThrow(ConflictException);
    });

    it("handles database error", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        groupId: "test-group",
      };

      const dbError = new Error("Database connection failed");
      mockBenchmarkProjectDbService.createBenchmarkProject.mockRejectedValue(
        dbError,
      );

      await expect(
        service.createProject(createDto, "user@example.com"),
      ).rejects.toThrow("Database connection failed");
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
          group_id: "test-group",
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
          group_id: "test-group",
          createdAt: new Date("2024-01-03"),
          updatedAt: new Date("2024-01-04"),
          _count: {
            benchmarkDefinitions: 1,
            benchmarkRuns: 5,
          },
        },
      ];

      mockBenchmarkProjectDbService.findAllBenchmarkProjects.mockResolvedValue(
        mockProjects,
      );

      const result = await service.listProjects(["test-group"]);

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
      mockBenchmarkProjectDbService.findAllBenchmarkProjects.mockResolvedValue(
        [],
      );

      const result = await service.listProjects(["test-group"]);

      expect(result).toEqual([]);
    });

    it("orders projects by createdAt descending", async () => {
      mockBenchmarkProjectDbService.findAllBenchmarkProjects.mockResolvedValue(
        [],
      );

      await service.listProjects(["test-group"]);

      expect(
        mockBenchmarkProjectDbService.findAllBenchmarkProjects,
      ).toHaveBeenCalledWith(["test-group"]);
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
        group_id: "test-group",
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

      mockBenchmarkProjectDbService.findBenchmarkProject.mockResolvedValue(
        mockProject,
      );

      const result = await service.getProjectById(projectId);

      expect(
        mockBenchmarkProjectDbService.findBenchmarkProject,
      ).toHaveBeenCalledWith(projectId);

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
      mockBenchmarkProjectDbService.findBenchmarkProject.mockResolvedValue(
        null,
      );

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
      mockBenchmarkProjectDbService.findBenchmarkProjectForDeletion.mockResolvedValue(
        {
          id: projectId,
          name: "Test Project",
          group_id: "test-group",
          benchmarkRuns: [],
        },
      );
      mockBenchmarkProjectDbService.deleteBenchmarkProject.mockResolvedValue(
        undefined,
      );

      await service.deleteProject(projectId);

      expect(
        mockBenchmarkProjectDbService.deleteBenchmarkProject,
      ).toHaveBeenCalledWith(projectId);
    });

    it("throws NotFoundException when project does not exist", async () => {
      mockBenchmarkProjectDbService.findBenchmarkProjectForDeletion.mockResolvedValue(
        null,
      );

      await expect(service.deleteProject("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ConflictException when project has active runs", async () => {
      mockBenchmarkProjectDbService.findBenchmarkProjectForDeletion.mockResolvedValue(
        {
          id: "project-123",
          name: "Test Project",
          group_id: "test-group",
          benchmarkRuns: [{ id: "run-1", status: "running" }],
        },
      );

      await expect(service.deleteProject("project-123")).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
