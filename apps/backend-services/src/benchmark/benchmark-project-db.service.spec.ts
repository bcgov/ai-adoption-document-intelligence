import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { BenchmarkProjectDbService } from "./benchmark-project-db.service";

const mockPrismaClient = {
  benchmarkProject: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
};

describe("BenchmarkProjectDbService", () => {
  let service: BenchmarkProjectDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkProjectDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<BenchmarkProjectDbService>(BenchmarkProjectDbService);
    jest.clearAllMocks();
  });

  describe("createBenchmarkProject", () => {
    it("creates a project and includes definition and run summaries", async () => {
      const mockProject = {
        id: "p-1",
        name: "My Project",
        description: null,
        createdBy: "user-1",
        group_id: "g-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };
      mockPrismaClient.benchmarkProject.create.mockResolvedValue(mockProject);

      const result = await service.createBenchmarkProject({
        name: "My Project",
        description: null,
        createdBy: "user-1",
        group_id: "g-1",
      });

      expect(result).toEqual(mockProject);
      expect(mockPrismaClient.benchmarkProject.create).toHaveBeenCalledWith({
        data: {
          name: "My Project",
          description: null,
          createdBy: "user-1",
          group_id: "g-1",
        },
        include: expect.any(Object),
      });
    });
  });

  describe("findBenchmarkProject", () => {
    it("returns the project when found", async () => {
      const mockProject = {
        id: "p-1",
        benchmarkDefinitions: [],
        benchmarkRuns: [],
      };
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(
        mockProject,
      );

      const result = await service.findBenchmarkProject("p-1");

      expect(result).toEqual(mockProject);
      expect(mockPrismaClient.benchmarkProject.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "p-1" } }),
      );
    });

    it("returns null when not found", async () => {
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(null);

      const result = await service.findBenchmarkProject("missing");

      expect(result).toBeNull();
    });
  });

  describe("findBenchmarkProjectForDeletion", () => {
    it("returns project with active run filter", async () => {
      const mockProject = { id: "p-1", name: "P", benchmarkRuns: [] };
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(
        mockProject,
      );

      const result = await service.findBenchmarkProjectForDeletion("p-1");

      expect(result).toEqual(mockProject);
      expect(mockPrismaClient.benchmarkProject.findUnique).toHaveBeenCalledWith(
        {
          where: { id: "p-1" },
          include: {
            benchmarkRuns: {
              where: { status: { in: ["pending", "running"] } },
              select: { id: true, status: true },
            },
          },
        },
      );
    });
  });

  describe("findAllBenchmarkProjects", () => {
    it("returns projects with counts filtered by group", async () => {
      const mockProjects = [
        {
          id: "p-1",
          group_id: "g-1",
          _count: { benchmarkDefinitions: 2, benchmarkRuns: 3 },
        },
      ];
      mockPrismaClient.benchmarkProject.findMany.mockResolvedValue(
        mockProjects,
      );

      const result = await service.findAllBenchmarkProjects(["g-1"]);

      expect(result).toEqual(mockProjects);
      expect(mockPrismaClient.benchmarkProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { group_id: { in: ["g-1"] } } }),
      );
    });
  });

  describe("deleteBenchmarkProject", () => {
    it("deletes the project by ID", async () => {
      mockPrismaClient.benchmarkProject.delete.mockResolvedValue({ id: "p-1" });

      await service.deleteBenchmarkProject("p-1");

      expect(mockPrismaClient.benchmarkProject.delete).toHaveBeenCalledWith({
        where: { id: "p-1" },
      });
    });
  });
});
