import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { BenchmarkDefinitionDbService } from "./benchmark-definition-db.service";

const mockPrismaClient = {
  benchmarkProject: {
    findUnique: jest.fn(),
  },
  datasetVersion: {
    findUnique: jest.fn(),
  },
  split: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  workflow: {
    findUnique: jest.fn(),
  },
  benchmarkDefinition: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  benchmarkRun: {
    findFirst: jest.fn(),
  },
};

describe("BenchmarkDefinitionDbService", () => {
  let service: BenchmarkDefinitionDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkDefinitionDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<BenchmarkDefinitionDbService>(
      BenchmarkDefinitionDbService,
    );
    jest.clearAllMocks();
  });

  describe("findBenchmarkProject", () => {
    it("returns the project when found", async () => {
      const mockProject = { id: "p-1", name: "Project" };
      mockPrismaClient.benchmarkProject.findUnique.mockResolvedValue(
        mockProject,
      );

      const result = await service.findBenchmarkProject("p-1");

      expect(result).toEqual(mockProject);
      expect(mockPrismaClient.benchmarkProject.findUnique).toHaveBeenCalledWith(
        {
          where: { id: "p-1" },
        },
      );
    });
  });

  describe("findDatasetVersion", () => {
    it("looks up a dataset version scoped with groupIds", async () => {
      const mockVersion = { id: "v-1", version: "1.0" };
      mockPrismaClient.datasetVersion.findUnique.mockResolvedValue(mockVersion);

      const result = await service.findDatasetVersion("v-1");

      expect(result).toEqual(mockVersion);
      expect(mockPrismaClient.datasetVersion.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "v-1" }),
        }),
      );
    });
  });

  describe("createBenchmarkDefinition", () => {
    it("creates a definition and returns it with full details", async () => {
      const mockDefinition = {
        id: "def-1",
        name: "My Definition",
        projectId: "p-1",
        datasetVersionId: "v-1",
        splitId: "s-1",
        workflowId: "w-1",
        immutable: false,
        isBaseline: false,
        description: null,
        metadata: null,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        datasetVersion: {},
        split: {},
        workflow: {},
        benchmarkRuns: [],
      };
      mockPrismaClient.benchmarkDefinition.create.mockResolvedValue(
        mockDefinition,
      );

      const result = await service.createBenchmarkDefinition({
        name: "My Definition",
        projectId: "p-1",
        datasetVersionId: "v-1",
        splitId: "s-1",
        workflowId: "w-1",
        evaluatorType: "schema-aware",
        evaluatorConfig: {},
        runtimeSettings: {},
        workflowConfigHash: "hash123",
        revision: 1,
        immutable: false,
      });

      expect(result).toEqual(mockDefinition);
      expect(mockPrismaClient.benchmarkDefinition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "My Definition",
            projectId: "p-1",
            datasetVersionId: "v-1",
          }),
        }),
      );
    });
  });

  describe("findBenchmarkDefinition", () => {
    it("returns the definition by id and projectId", async () => {
      const mockDefinition = {
        id: "def-1",
        datasetVersion: {},
        split: {},
        workflow: {},
        benchmarkRuns: [],
      };
      mockPrismaClient.benchmarkDefinition.findFirst.mockResolvedValue(
        mockDefinition,
      );

      const result = await service.findBenchmarkDefinition("def-1", "p-1");

      expect(result).toEqual(mockDefinition);
      expect(
        mockPrismaClient.benchmarkDefinition.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "def-1", projectId: "p-1" } }),
      );
    });

    it("returns null when not found", async () => {
      mockPrismaClient.benchmarkDefinition.findFirst.mockResolvedValue(null);

      const result = await service.findBenchmarkDefinition("missing", "p-1");

      expect(result).toBeNull();
    });
  });

  describe("updateBenchmarkDefinition", () => {
    it("updates the definition and returns the updated record", async () => {
      const mockDefinition = { id: "def-1", isBaseline: true };
      mockPrismaClient.benchmarkDefinition.update.mockResolvedValue(
        mockDefinition,
      );

      const result = await service.updateBenchmarkDefinition("def-1", {
        immutable: true,
      });

      expect(result).toEqual(mockDefinition);
      expect(mockPrismaClient.benchmarkDefinition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "def-1" },
          data: { immutable: true },
        }),
      );
    });
  });

  describe("deleteBenchmarkDefinition", () => {
    it("deletes the definition", async () => {
      mockPrismaClient.benchmarkDefinition.delete.mockResolvedValue({
        id: "def-1",
      });

      await service.deleteBenchmarkDefinition("def-1");

      expect(mockPrismaClient.benchmarkDefinition.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "def-1" }),
        }),
      );
    });
  });

  describe("findAllBenchmarkDefinitions", () => {
    it("returns all definitions for a project", async () => {
      const mockDefs = [{ id: "def-1" }, { id: "def-2" }];
      mockPrismaClient.benchmarkDefinition.findMany.mockResolvedValue(mockDefs);

      const result = await service.findAllBenchmarkDefinitions("p-1");

      expect(result).toEqual(mockDefs);
      expect(
        mockPrismaClient.benchmarkDefinition.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: "p-1" } }),
      );
    });
  });

  describe("transaction support", () => {
    it("uses provided transaction client instead of this.prisma", async () => {
      const txClient = {
        benchmarkDefinition: {
          findFirst: jest.fn().mockResolvedValue({ id: "def-tx" }),
        },
      } as unknown as import("@generated/client").Prisma.TransactionClient;

      const result = await service.findBenchmarkDefinition(
        "def-tx",
        "p-1",
        txClient,
      );

      expect(result).toEqual({ id: "def-tx" });
      expect(
        mockPrismaClient.benchmarkDefinition.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  // ---- Additional tx tests ---------------------------------------------------

  describe("findBenchmarkProject tx support", () => {
    it("uses provided tx client", async () => {
      const txBP = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        benchmarkProject: txBP,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findBenchmarkProject("p-1", tx);
      expect(txBP.findUnique).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkProject.findUnique,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findDatasetVersion tx support", () => {
    it("uses provided tx client", async () => {
      const txDV = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        datasetVersion: txDV,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findDatasetVersion("v-1", tx);
      expect(txDV.findUnique).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findSplit", () => {
    it("finds a split (no tx)", async () => {
      mockPrismaClient.split.findUnique.mockResolvedValue({ id: "s-1" });
      const result = await service.findSplit("s-1");
      expect(result).toEqual({ id: "s-1" });
    });

    it("uses provided tx client", async () => {
      const txSplit = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        split: txSplit,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findSplit("s-1", tx);
      expect(txSplit.findUnique).toHaveBeenCalled();
      expect(mockPrismaClient.split.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findWorkflow", () => {
    it("finds a workflow (no tx)", async () => {
      mockPrismaClient.workflow.findUnique.mockResolvedValue({ id: "w-1" });
      const result = await service.findWorkflow("w-1");
      expect(result).toEqual({ id: "w-1" });
    });

    it("uses provided tx client", async () => {
      const txWf = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = {
        workflow: txWf,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findWorkflow("w-1", tx);
      expect(txWf.findUnique).toHaveBeenCalled();
      expect(mockPrismaClient.workflow.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("createBenchmarkDefinition tx support", () => {
    it("uses provided tx client", async () => {
      const txDef = { create: jest.fn().mockResolvedValue({ id: "def-tx" }) };
      const tx = {
        benchmarkDefinition: txDef,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.createBenchmarkDefinition(
        {
          name: "X",
          projectId: "p-1",
          datasetVersionId: "v-1",
          splitId: "s-1",
          workflowId: "w-1",
          evaluatorType: "t",
          evaluatorConfig: {},
          runtimeSettings: {},
          workflowConfigHash: "h",
          revision: 1,
          immutable: false,
        },
        tx,
      );
      expect(txDef.create).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkDefinition.create,
      ).not.toHaveBeenCalled();
    });
  });

  describe("updateBenchmarkDefinition tx support", () => {
    it("uses provided tx client", async () => {
      const txDef = { update: jest.fn().mockResolvedValue({ id: "def-1" }) };
      const tx = {
        benchmarkDefinition: txDef,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.updateBenchmarkDefinition("def-1", {}, tx);
      expect(txDef.update).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkDefinition.update,
      ).not.toHaveBeenCalled();
    });
  });

  describe("findAllBenchmarkDefinitions tx support", () => {
    it("uses provided tx client", async () => {
      const txDef = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = {
        benchmarkDefinition: txDef,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findAllBenchmarkDefinitions("p-1", tx);
      expect(txDef.findMany).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkDefinition.findMany,
      ).not.toHaveBeenCalled();
    });
  });
});
