/**
 * Benchmark Project Controller Tests
 *
 * Tests for benchmark project REST API endpoints.
 * See feature-docs/003-benchmarking-system/user-stories/US-010-benchmark-project-service-controller.md
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { BenchmarkProjectController } from "./benchmark-project.controller";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { CreateProjectDto, ProjectDetailsDto, ProjectSummaryDto } from "./dto";

describe("BenchmarkProjectController", () => {
  let controller: BenchmarkProjectController;
  let service: BenchmarkProjectService;

  const mockBenchmarkProjectService = {
    createProject: jest.fn(),
    listProjects: jest.fn(),
    getProjectById: jest.fn(),
    deleteProject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BenchmarkProjectController],
      providers: [
        {
          provide: BenchmarkProjectService,
          useValue: mockBenchmarkProjectService,
        },
      ],
    }).compile();

    controller = module.get<BenchmarkProjectController>(
      BenchmarkProjectController,
    );
    service = module.get<BenchmarkProjectService>(BenchmarkProjectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create a benchmark project
  // -----------------------------------------------------------------------
  describe("POST /api/benchmark/projects", () => {
    it("creates a project successfully", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        description: "Test description",
        createdBy: "user@example.com",
      };

      const expectedResponse: ProjectDetailsDto = {
        id: "project-123",
        name: createDto.name,
        description: createDto.description,
        mlflowExperimentId: "exp-123",
        createdBy: createDto.createdBy,
        definitions: [],
        recentRuns: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockBenchmarkProjectService.createProject.mockResolvedValue(
        expectedResponse,
      );

      const result = await controller.createProject(createDto);

      expect(service.createProject).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(expectedResponse);
    });

    it("returns 409 when project name already exists in MLflow", async () => {
      const createDto: CreateProjectDto = {
        name: "Existing Project",
        createdBy: "user@example.com",
      };

      mockBenchmarkProjectService.createProject.mockRejectedValue(
        new ConflictException(
          'A project with the name "Existing Project" already exists in MLflow. Please choose a different name.',
        ),
      );

      await expect(controller.createProject(createDto)).rejects.toThrow(
        ConflictException,
      );
    });

    // Scenario 6: MLflow experiment creation failure is handled
    it("returns 503 when MLflow service is unavailable", async () => {
      const createDto: CreateProjectDto = {
        name: "Test Project",
        createdBy: "user@example.com",
      };

      mockBenchmarkProjectService.createProject.mockRejectedValue(
        new Error("Failed to create MLflow experiment: Connection refused"),
      );

      await expect(controller.createProject(createDto)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: List benchmark projects
  // -----------------------------------------------------------------------
  describe("GET /api/benchmark/projects", () => {
    it("returns list of projects", async () => {
      const mockProjects: ProjectSummaryDto[] = [
        {
          id: "project-1",
          name: "Project 1",
          description: "Description 1",
          mlflowExperimentId: "exp-1",
          createdBy: "user1@example.com",
          definitionCount: 3,
          runCount: 10,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "project-2",
          name: "Project 2",
          description: null,
          mlflowExperimentId: "exp-2",
          createdBy: "user2@example.com",
          definitionCount: 1,
          runCount: 5,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockBenchmarkProjectService.listProjects.mockResolvedValue(mockProjects);

      const result = await controller.listProjects();

      expect(service.listProjects).toHaveBeenCalled();
      expect(result).toEqual(mockProjects);
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no projects exist", async () => {
      mockBenchmarkProjectService.listProjects.mockResolvedValue([]);

      const result = await controller.listProjects();

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Get project details
  // -----------------------------------------------------------------------
  describe("GET /api/benchmark/projects/:id", () => {
    it("returns project details", async () => {
      const projectId = "project-123";
      const mockProject: ProjectDetailsDto = {
        id: projectId,
        name: "Test Project",
        description: "Test description",
        mlflowExperimentId: "exp-123",
        createdBy: "user@example.com",
        definitions: [
          {
            id: "def-1",
            name: "Definition 1",
            datasetVersionId: "ds-ver-1",
            evaluatorType: "schema-aware",
            immutable: false,
            createdAt: new Date(),
          },
        ],
        recentRuns: [
          {
            id: "run-1",
            definitionName: "Definition 1",
            status: "COMPLETED",
            mlflowRunId: "mlflow-run-1",
            temporalWorkflowId: "temporal-wf-1",
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockBenchmarkProjectService.getProjectById.mockResolvedValue(mockProject);

      const result = await controller.getProjectById(projectId);

      expect(service.getProjectById).toHaveBeenCalledWith(projectId);
      expect(result).toEqual(mockProject);
      expect(result.definitions).toHaveLength(1);
      expect(result.recentRuns).toHaveLength(1);
    });

    // Scenario 4: Project not found returns 404
    it("returns 404 when project not found", async () => {
      const projectId = "non-existent-id";

      mockBenchmarkProjectService.getProjectById.mockRejectedValue(
        new NotFoundException(
          `Benchmark project with ID "${projectId}" not found`,
        ),
      );

      await expect(controller.getProjectById(projectId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Delete a benchmark project
  // -----------------------------------------------------------------------
  describe("DELETE /api/benchmark/projects/:id", () => {
    it("deletes a project successfully", async () => {
      const projectId = "project-123";
      mockBenchmarkProjectService.deleteProject.mockResolvedValue(undefined);

      await controller.deleteProject(projectId);

      expect(service.deleteProject).toHaveBeenCalledWith(projectId);
    });

    it("returns 404 when project not found", async () => {
      mockBenchmarkProjectService.deleteProject.mockRejectedValue(
        new NotFoundException("Project not found"),
      );

      await expect(controller.deleteProject("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns 409 when project has active runs", async () => {
      mockBenchmarkProjectService.deleteProject.mockRejectedValue(
        new ConflictException("Cannot delete project: it has active runs"),
      );

      await expect(controller.deleteProject("project-123")).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
