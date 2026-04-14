import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { BenchmarkRunDbService } from "./benchmark-run-db.service";

const mockPrismaClient = {
  benchmarkDefinition: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  benchmarkProject: {
    findUnique: jest.fn(),
  },
  benchmarkRun: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  benchmarkOcrCache: {
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  datasetVersion: {
    update: jest.fn(),
  },
  split: {
    update: jest.fn(),
  },
  workflowVersion: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(mockPrismaClient),
  ),
};

describe("BenchmarkRunDbService", () => {
  let service: BenchmarkRunDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BenchmarkRunDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<BenchmarkRunDbService>(BenchmarkRunDbService);
    jest.clearAllMocks();
  });

  describe("findBenchmarkDefinitionForRun", () => {
    it("returns the definition with all nested data", async () => {
      const mockDef = {
        id: "def-1",
        project: {},
        datasetVersion: {},
        split: {},
        workflow: {},
      };
      mockPrismaClient.benchmarkDefinition.findFirst.mockResolvedValue(mockDef);

      const result = await service.findBenchmarkDefinitionForRun(
        "def-1",
        "p-1",
      );

      expect(result).toEqual(mockDef);
      expect(
        mockPrismaClient.benchmarkDefinition.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "def-1", projectId: "p-1" },
        }),
      );
    });

    it("returns null when definition not found", async () => {
      mockPrismaClient.benchmarkDefinition.findFirst.mockResolvedValue(null);

      const result = await service.findBenchmarkDefinitionForRun(
        "missing",
        "p-1",
      );

      expect(result).toBeNull();
    });
  });

  describe("createBenchmarkRun", () => {
    it("creates a benchmark run", async () => {
      const mockRun = {
        id: "run-1",
        definitionId: "def-1",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaClient.benchmarkRun.create.mockResolvedValue(mockRun);

      const result = await service.createBenchmarkRun({
        definitionId: "def-1",
        projectId: "p-1",
        status: "pending" as never,
        temporalWorkflowId: "",
        workerGitSha: "abc123",
      });

      expect(result).toEqual(mockRun);
      expect(mockPrismaClient.benchmarkRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ definitionId: "def-1" }),
        }),
      );
    });
  });

  describe("findBenchmarkRun", () => {
    it("returns run with definition when found", async () => {
      const mockRun = { id: "run-1", definition: { id: "def-1" } };
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue(mockRun);

      const result = await service.findBenchmarkRun("run-1", "p-1");

      expect(result).toEqual(mockRun);
    });

    it("returns null when not found", async () => {
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue(null);

      const result = await service.findBenchmarkRun("missing", "p-1");

      expect(result).toBeNull();
    });
  });

  describe("updateBenchmarkRun", () => {
    it("updates the run", async () => {
      const mockRun = { id: "run-1", status: "running" };
      mockPrismaClient.benchmarkRun.update.mockResolvedValue(mockRun);

      const result = await service.updateBenchmarkRun("run-1", {
        status: "running",
      });

      expect(result).toEqual(mockRun);
      expect(mockPrismaClient.benchmarkRun.update).toHaveBeenCalledWith({
        where: { id: "run-1" },
        data: { status: "running" },
      });
    });
  });

  describe("markBenchmarkDefinitionImmutable", () => {
    it("sets immutable=true on the definition", async () => {
      mockPrismaClient.benchmarkDefinition.update.mockResolvedValue({
        id: "def-1",
        immutable: true,
      });

      await service.markBenchmarkDefinitionImmutable("def-1");

      expect(mockPrismaClient.benchmarkDefinition.update).toHaveBeenCalledWith({
        where: { id: "def-1" },
        data: { immutable: true },
      });
    });
  });

  describe("freezeDatasetVersion", () => {
    it("sets frozen=true on the dataset version", async () => {
      mockPrismaClient.datasetVersion.update.mockResolvedValue({
        id: "v-1",
        frozen: true,
      });

      await service.freezeDatasetVersion("v-1");

      expect(mockPrismaClient.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "v-1" },
        data: { frozen: true },
      });
    });
  });

  describe("freezeSplit", () => {
    it("sets frozen=true on the split", async () => {
      mockPrismaClient.split.update.mockResolvedValue({
        id: "s-1",
        frozen: true,
      });

      await service.freezeSplit("s-1");

      expect(mockPrismaClient.split.update).toHaveBeenCalledWith({
        where: { id: "s-1" },
        data: { frozen: true },
      });
    });
  });

  describe("transaction support", () => {
    it("uses provided transaction client instead of this.prisma", async () => {
      const txClient = {
        benchmarkRun: {
          findFirst: jest.fn().mockResolvedValue({ id: "run-tx" }),
        },
      } as unknown as import("@generated/client").Prisma.TransactionClient;

      const result = await service.findBenchmarkRun(
        "run-tx",
        undefined,
        txClient,
      );

      expect(result).toEqual({ id: "run-tx" });
      expect(mockPrismaClient.benchmarkRun.findFirst).not.toHaveBeenCalled();
    });
  });

  // ---- Additional tx tests ---------------------------------------------------

  describe("findBenchmarkDefinitionForRun tx support", () => {
    it("uses provided tx client", async () => {
      const txDef = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = {
        benchmarkDefinition: txDef,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findBenchmarkDefinitionForRun("def-1", "p-1", tx);
      expect(txDef.findFirst).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkDefinition.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

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

  describe("createBenchmarkRun tx support", () => {
    it("uses provided tx client", async () => {
      const txRun = { create: jest.fn().mockResolvedValue({ id: "run-tx" }) };
      const tx = { benchmarkRun: txRun } as unknown as Parameters<
        typeof service.createBenchmarkRun
      >[1];
      await service.createBenchmarkRun(
        { definitionId: "def-1", projectId: "p-1" } as unknown as Parameters<
          typeof service.createBenchmarkRun
        >[0],
        tx,
      );
      expect(txRun.create).toHaveBeenCalled();
      expect(mockPrismaClient.benchmarkRun.create).not.toHaveBeenCalled();
    });
  });

  describe("markBenchmarkDefinitionImmutable tx support", () => {
    it("uses provided tx client", async () => {
      const txDef = { update: jest.fn().mockResolvedValue({}) };
      const tx = {
        benchmarkDefinition: txDef,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.markBenchmarkDefinitionImmutable("def-1", tx);
      expect(txDef.update).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkDefinition.update,
      ).not.toHaveBeenCalled();
    });
  });

  describe("freezeDatasetVersion tx support", () => {
    it("uses provided tx client", async () => {
      const txDV = { update: jest.fn().mockResolvedValue({}) };
      const tx = {
        datasetVersion: txDV,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.freezeDatasetVersion("v-1", tx);
      expect(txDV.update).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.update).not.toHaveBeenCalled();
    });
  });

  describe("freezeSplit tx support", () => {
    it("uses provided tx client", async () => {
      const txSplit = { update: jest.fn().mockResolvedValue({}) };
      const tx = {
        split: txSplit,
      } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.freezeSplit("s-1", tx);
      expect(txSplit.update).toHaveBeenCalled();
      expect(mockPrismaClient.split.update).not.toHaveBeenCalled();
    });
  });

  describe("transaction", () => {
    it("delegates to prisma.$transaction", async () => {
      const fn = jest.fn().mockResolvedValue("ok");
      const result = await service.transaction(fn);
      expect(result).toBe("ok");
      expect(mockPrismaClient.$transaction).toHaveBeenCalledWith(fn);
    });
  });

  describe("findBenchmarkDefinitionForStartRun", () => {
    it("includes workflow lineage", async () => {
      mockPrismaClient.benchmarkDefinition.findFirst.mockResolvedValue({
        id: "def-1",
      });
      await service.findBenchmarkDefinitionForStartRun("def-1", "p-1");
      expect(
        mockPrismaClient.benchmarkDefinition.findFirst,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "def-1", projectId: "p-1" },
          include: {
            project: true,
            datasetVersion: { include: { dataset: true } },
            split: true,
            workflowVersion: { include: { lineage: true } },
          },
        }),
      );
    });
  });

  describe("findWorkflowVersionConfig", () => {
    it("selects config only", async () => {
      mockPrismaClient.workflowVersion.findUnique.mockResolvedValue({
        config: {},
      });
      const result = await service.findWorkflowVersionConfig("wv-1");
      expect(result).toEqual({ config: {} });
      expect(mockPrismaClient.workflowVersion.findUnique).toHaveBeenCalledWith({
        where: { id: "wv-1" },
        select: { config: true },
      });
    });
  });

  describe("findRunForOcrCacheValidation", () => {
    it("scopes by project, definition, and completed status", async () => {
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue({ id: "r-1" });
      await service.findRunForOcrCacheValidation("p-1", "def-1", "r-1");
      expect(mockPrismaClient.benchmarkRun.findFirst).toHaveBeenCalledWith({
        where: {
          id: "r-1",
          projectId: "p-1",
          status: "completed",
          definition: { datasetVersionId: "def-1" },
        },
      });
    });
  });

  describe("findLatestCompletedBaselineRunId", () => {
    it("returns id when found", async () => {
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue({
        id: "base-1",
      });
      const result = await service.findLatestCompletedBaselineRunId(
        "p-1",
        "def-1",
      );
      expect(result).toBe("base-1");
    });
  });

  describe("findBenchmarkRunBare", () => {
    it("finds by run and project without includes", async () => {
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValue({ id: "r-1" });
      await service.findBenchmarkRunBare("r-1", "p-1");
      expect(mockPrismaClient.benchmarkRun.findFirst).toHaveBeenCalledWith({
        where: { id: "r-1", projectId: "p-1" },
      });
    });
  });

  describe("deleteBenchmarkRun", () => {
    it("deletes benchmark_ocr_cache rows then the run in one transaction", async () => {
      mockPrismaClient.benchmarkRun.delete.mockResolvedValue({} as never);

      await service.deleteBenchmarkRun("run-xyz");

      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
      expect(
        mockPrismaClient.benchmarkOcrCache.deleteMany,
      ).toHaveBeenCalledWith({
        where: { sourceRunId: "run-xyz" },
      });
      expect(mockPrismaClient.benchmarkRun.delete).toHaveBeenCalledWith({
        where: { id: "run-xyz" },
      });
    });
  });

  describe("postTemporalStartTransaction", () => {
    it("updates run, definition, dataset, and optional split in one transaction", async () => {
      mockPrismaClient.benchmarkRun.update.mockResolvedValue({});
      await service.postTemporalStartTransaction(
        "run-1",
        "def-1",
        "dv-1",
        "split-1",
        "tw-1",
      );
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
      expect(mockPrismaClient.benchmarkRun.update).toHaveBeenCalled();
      expect(mockPrismaClient.benchmarkDefinition.update).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.update).toHaveBeenCalled();
      expect(mockPrismaClient.split.update).toHaveBeenCalled();
    });

    it("skips split update when splitId is null", async () => {
      jest.clearAllMocks();
      mockPrismaClient.benchmarkRun.update.mockResolvedValue({});
      await service.postTemporalStartTransaction(
        "run-1",
        "def-1",
        "dv-1",
        null,
        "tw-1",
      );
      expect(mockPrismaClient.split.update).not.toHaveBeenCalled();
    });
  });

  describe("promoteRunToBaseline", () => {
    it("clears previous baseline and sets thresholds in one transaction", async () => {
      mockPrismaClient.benchmarkRun.findFirst.mockResolvedValueOnce({
        id: "old-base",
      });
      mockPrismaClient.benchmarkRun.update.mockResolvedValue({});
      const result = await service.promoteRunToBaseline("run-1", "def-1", {
        metricName: "x",
        type: "absolute",
        value: 1,
      } as never);
      expect(result.previousBaselineId).toBe("old-base");
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });
  });
});
