import { SplitType } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { DatasetDbService } from "./dataset-db.service";

const mockPrismaClient = {
  dataset: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  datasetVersion: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  split: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  benchmarkRun: {
    deleteMany: jest.fn(),
  },
  benchmarkDefinition: {
    deleteMany: jest.fn(),
  },
};

describe("DatasetDbService", () => {
  let service: DatasetDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetDbService,
        { provide: PrismaService, useValue: { prisma: mockPrismaClient } },
      ],
    }).compile();

    service = module.get<DatasetDbService>(DatasetDbService);
    jest.clearAllMocks();
  });

  describe("createDataset", () => {
    it("creates and returns a dataset", async () => {
      const mockDataset = {
        id: "d-1",
        name: "Test Dataset",
        description: null,
        metadata: {},
        storagePath: "datasets/d-1",
        createdBy: "user-1",
        group_id: "g-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaClient.dataset.create.mockResolvedValue(mockDataset);

      const result = await service.createDataset({
        name: "Test Dataset",
        metadata: {},
        storagePath: "datasets/d-1",
        createdBy: "user-1",
        group_id: "g-1",
      });

      expect(result).toEqual(mockDataset);
      expect(mockPrismaClient.dataset.create).toHaveBeenCalledWith({
        data: {
          name: "Test Dataset",
          metadata: {},
          storagePath: "datasets/d-1",
          createdBy: "user-1",
          group_id: "g-1",
        },
      });
    });
  });

  describe("findDataset", () => {
    it("returns the dataset when found", async () => {
      const mockDataset = { id: "d-1", name: "Test" };
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);

      const result = await service.findDataset("d-1");

      expect(result).toEqual(mockDataset);
      expect(mockPrismaClient.dataset.findUnique).toHaveBeenCalledWith({
        where: { id: "d-1" },
      });
    });

    it("returns null when not found", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      const result = await service.findDataset("missing");

      expect(result).toBeNull();
    });
  });

  describe("deleteDataset", () => {
    it("deletes the dataset", async () => {
      mockPrismaClient.dataset.delete.mockResolvedValue({ id: "d-1" });

      await service.deleteDataset("d-1");

      expect(mockPrismaClient.dataset.delete).toHaveBeenCalledWith({
        where: { id: "d-1" },
      });
    });
  });

  describe("createDatasetVersion", () => {
    it("creates and returns a version", async () => {
      const mockVersion = {
        id: "v-1",
        datasetId: "d-1",
        version: "1.0",
        documentCount: 10,
        manifestPath: "path/to/manifest",
        frozen: false,
      };
      mockPrismaClient.datasetVersion.create.mockResolvedValue(mockVersion);

      const result = await service.createDatasetVersion({
        datasetId: "d-1",
        version: "1.0",
        documentCount: 10,
        manifestPath: "path/to/manifest",
      });

      expect(result).toEqual(mockVersion);
      expect(mockPrismaClient.datasetVersion.create).toHaveBeenCalledWith({
        data: {
          datasetId: "d-1",
          version: "1.0",
          documentCount: 10,
          manifestPath: "path/to/manifest",
        },
      });
    });
  });

  describe("findDatasetVersion", () => {
    it("finds a version scoped to a dataset", async () => {
      const mockVersion = { id: "v-1", datasetId: "d-1" };
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);

      const result = await service.findDatasetVersion("v-1", "d-1");

      expect(result).toEqual(mockVersion);
      expect(mockPrismaClient.datasetVersion.findFirst).toHaveBeenCalledWith({
        where: { id: "v-1", datasetId: "d-1" },
      });
    });

    it("finds a version without datasetId scope when not provided", async () => {
      const mockVersion = { id: "v-1" };
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);

      await service.findDatasetVersion("v-1");

      expect(mockPrismaClient.datasetVersion.findFirst).toHaveBeenCalledWith({
        where: { id: "v-1" },
      });
    });
  });

  describe("createSplit", () => {
    it("creates and returns a split", async () => {
      const mockSplit = {
        id: "s-1",
        datasetVersionId: "v-1",
        name: "train",
        type: SplitType.train,
        sampleIds: [],
        frozen: false,
      };
      mockPrismaClient.split.create.mockResolvedValue(mockSplit);

      const result = await service.createSplit({
        datasetVersionId: "v-1",
        name: "train",
        type: SplitType.train,
        sampleIds: [],
      });

      expect(result).toEqual(mockSplit);
    });
  });

  describe("deleteManySplits", () => {
    it("deletes splits matching the filter", async () => {
      mockPrismaClient.split.deleteMany.mockResolvedValue({ count: 3 });

      await service.deleteManySplits({ datasetVersionId: "v-1" });

      expect(mockPrismaClient.split.deleteMany).toHaveBeenCalledWith({
        where: { datasetVersionId: "v-1" },
      });
    });
  });

  describe("deleteManyBenchmarkRuns", () => {
    it("deletes benchmark runs matching the filter", async () => {
      mockPrismaClient.benchmarkRun.deleteMany.mockResolvedValue({ count: 2 });

      await service.deleteManyBenchmarkRuns({
        definition: { datasetVersionId: "v-1" },
      });

      expect(mockPrismaClient.benchmarkRun.deleteMany).toHaveBeenCalledWith({
        where: { definition: { datasetVersionId: "v-1" } },
      });
    });
  });

  describe("transaction support", () => {
    it("uses provided transaction client instead of this.prisma", async () => {
      const txClient = {
        dataset: {
          findUnique: jest.fn().mockResolvedValue({ id: "d-tx" }),
        },
      } as unknown as import("@generated/client").Prisma.TransactionClient;

      const result = await service.findDataset("d-tx", txClient);

      expect(result).toEqual({ id: "d-tx" });
      expect(mockPrismaClient.dataset.findUnique).not.toHaveBeenCalled();
    });
  });

  // ---- Additional dataset methods ------------------------------------------

  describe("updateDataset", () => {
    it("updates a dataset (no tx)", async () => {
      const updated = { id: "d-1", name: "Updated" };
      mockPrismaClient.dataset.update.mockResolvedValue(updated);
      const result = await service.updateDataset("d-1", { name: "Updated" });
      expect(result).toEqual(updated);
      expect(mockPrismaClient.dataset.update).toHaveBeenCalledWith({
        where: { id: "d-1" },
        data: { name: "Updated" },
      });
    });

    it("uses provided tx client", async () => {
      const txDataset = { update: jest.fn().mockResolvedValue({ id: "d-1" }) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.updateDataset("d-1", {}, tx);
      expect(txDataset.update).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.update).not.toHaveBeenCalled();
    });
  });

  describe("findDatasetWithVersions", () => {
    it("returns dataset with versions (no tx)", async () => {
      const result = { id: "d-1", versions: [] };
      mockPrismaClient.dataset.findUnique.mockResolvedValue(result);
      expect(await service.findDatasetWithVersions("d-1")).toEqual(result);
    });

    it("uses provided tx client", async () => {
      const txDataset = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findDatasetWithVersions("d-1", tx);
      expect(txDataset.findUnique).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("findDatasetForDeletion", () => {
    it("returns dataset with full cascade data (no tx)", async () => {
      const result = { id: "d-1", versions: [] };
      mockPrismaClient.dataset.findUnique.mockResolvedValue(result);
      expect(await service.findDatasetForDeletion("d-1")).toEqual(result);
    });

    it("uses provided tx client", async () => {
      const txDataset = { findUnique: jest.fn().mockResolvedValue(null) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findDatasetForDeletion("d-1", tx);
      expect(txDataset.findUnique).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("countDatasets", () => {
    it("returns count of matching datasets (no tx)", async () => {
      mockPrismaClient.dataset.count.mockResolvedValue(5);
      const result = await service.countDatasets({ group_id: "g-1" });
      expect(result).toBe(5);
      expect(mockPrismaClient.dataset.count).toHaveBeenCalledWith({ where: { group_id: "g-1" } });
    });

    it("uses provided tx client", async () => {
      const txDataset = { count: jest.fn().mockResolvedValue(0) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.countDatasets({}, tx);
      expect(txDataset.count).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.count).not.toHaveBeenCalled();
    });
  });

  describe("findAllDatasets", () => {
    it("returns paginated datasets (no tx)", async () => {
      const datasets = [{ id: "d-1", versions: [] }];
      mockPrismaClient.dataset.findMany.mockResolvedValue(datasets);
      const result = await service.findAllDatasets({ group_id: "g-1" }, 0, 10);
      expect(result).toEqual(datasets);
      expect(mockPrismaClient.dataset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
    });

    it("uses provided tx client", async () => {
      const txDataset = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findAllDatasets({}, 0, 10, tx);
      expect(txDataset.findMany).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.findMany).not.toHaveBeenCalled();
    });
  });

  describe("createDataset tx support", () => {
    it("uses provided tx client", async () => {
      const txDataset = { create: jest.fn().mockResolvedValue({ id: "d-tx" }) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.createDataset({ name: "T", metadata: {}, storagePath: "p", createdBy: "u", group_id: "g" }, tx);
      expect(txDataset.create).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.create).not.toHaveBeenCalled();
    });
  });

  describe("deleteDataset tx support", () => {
    it("uses provided tx client", async () => {
      const txDataset = { delete: jest.fn().mockResolvedValue({}) };
      const tx = { dataset: txDataset } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteDataset("d-1", tx);
      expect(txDataset.delete).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.delete).not.toHaveBeenCalled();
    });
  });

  // ---- Version methods -------------------------------------------------------

  describe("createDatasetVersion tx support", () => {
    it("uses provided tx client", async () => {
      const txDV = { create: jest.fn().mockResolvedValue({ id: "v-tx" }) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.createDatasetVersion({ datasetId: "d-1", version: "1.0", documentCount: 0, manifestPath: "p" }, tx);
      expect(txDV.create).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.create).not.toHaveBeenCalled();
    });
  });

  describe("findDatasetVersion tx support", () => {
    it("uses provided tx client", async () => {
      const txDV = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findDatasetVersion("v-1", undefined, tx);
      expect(txDV.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findDatasetVersionWithSplits", () => {
    it("finds version with splits scoped to dataset (no tx)", async () => {
      const result = { id: "v-1", splits: [] };
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(result);
      await service.findDatasetVersionWithSplits("v-1", "d-1");
      expect(mockPrismaClient.datasetVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "v-1", datasetId: "d-1" } }),
      );
    });

    it("finds version without datasetId scope when not provided", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);
      await service.findDatasetVersionWithSplits("v-1");
      expect(mockPrismaClient.datasetVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "v-1" } }),
      );
    });

    it("uses provided tx client", async () => {
      const txDV = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findDatasetVersionWithSplits("v-1", undefined, tx);
      expect(txDV.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findDatasetVersionForDeletion", () => {
    it("finds version with definition references (no tx)", async () => {
      const result = { id: "v-1", benchmarkDefinitions: [] };
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(result);
      const r = await service.findDatasetVersionForDeletion("v-1", "d-1");
      expect(r).toEqual(result);
    });

    it("uses provided tx client", async () => {
      const txDV = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findDatasetVersionForDeletion("v-1", "d-1", tx);
      expect(txDV.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findAllDatasetVersionsWithSplits", () => {
    it("returns versions with splits (no tx)", async () => {
      mockPrismaClient.datasetVersion.findMany.mockResolvedValue([]);
      await service.findAllDatasetVersionsWithSplits("d-1");
      expect(mockPrismaClient.datasetVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { datasetId: "d-1" } }),
      );
    });

    it("uses provided tx client", async () => {
      const txDV = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findAllDatasetVersionsWithSplits("d-1", tx);
      expect(txDV.findMany).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.findMany).not.toHaveBeenCalled();
    });
  });

  describe("countDatasetVersions", () => {
    it("counts versions (no tx)", async () => {
      mockPrismaClient.datasetVersion.count.mockResolvedValue(3);
      const result = await service.countDatasetVersions({ datasetId: "d-1" });
      expect(result).toBe(3);
    });

    it("uses provided tx client", async () => {
      const txDV = { count: jest.fn().mockResolvedValue(0) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.countDatasetVersions({}, tx);
      expect(txDV.count).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.count).not.toHaveBeenCalled();
    });
  });

  describe("updateDatasetVersion", () => {
    it("updates a version (no tx)", async () => {
      const updated = { id: "v-1", documentCount: 5 };
      mockPrismaClient.datasetVersion.update.mockResolvedValue(updated);
      const result = await service.updateDatasetVersion("v-1", { documentCount: 5 });
      expect(result).toEqual(updated);
    });

    it("uses provided tx client", async () => {
      const txDV = { update: jest.fn().mockResolvedValue({ id: "v-1" }) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.updateDatasetVersion("v-1", {}, tx);
      expect(txDV.update).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteDatasetVersion", () => {
    it("deletes a version (no tx)", async () => {
      mockPrismaClient.datasetVersion.delete.mockResolvedValue({ id: "v-1" });
      await service.deleteDatasetVersion("v-1");
      expect(mockPrismaClient.datasetVersion.delete).toHaveBeenCalledWith({ where: { id: "v-1" } });
    });

    it("uses provided tx client", async () => {
      const txDV = { delete: jest.fn().mockResolvedValue({}) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteDatasetVersion("v-1", tx);
      expect(txDV.delete).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.delete).not.toHaveBeenCalled();
    });
  });

  describe("deleteManyDatasetVersions", () => {
    it("deletes versions by filter (no tx)", async () => {
      mockPrismaClient.datasetVersion.deleteMany.mockResolvedValue({ count: 2 });
      await service.deleteManyDatasetVersions({ datasetId: "d-1" });
      expect(mockPrismaClient.datasetVersion.deleteMany).toHaveBeenCalledWith({ where: { datasetId: "d-1" } });
    });

    it("uses provided tx client", async () => {
      const txDV = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      const tx = { datasetVersion: txDV } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteManyDatasetVersions({}, tx);
      expect(txDV.deleteMany).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ---- Split methods ---------------------------------------------------------

  describe("createSplit tx support", () => {
    it("uses provided tx client", async () => {
      const txSplit = { create: jest.fn().mockResolvedValue({ id: "s-tx" }) };
      const tx = { split: txSplit } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.createSplit({ datasetVersionId: "v-1", name: "train", type: SplitType.train, sampleIds: [] }, tx);
      expect(txSplit.create).toHaveBeenCalled();
      expect(mockPrismaClient.split.create).not.toHaveBeenCalled();
    });
  });

  describe("findSplit", () => {
    it("finds split scoped to version (no tx)", async () => {
      const split = { id: "s-1" };
      mockPrismaClient.split.findFirst.mockResolvedValue(split);
      await service.findSplit("s-1", "v-1");
      expect(mockPrismaClient.split.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "s-1", datasetVersionId: "v-1" } }),
      );
    });

    it("finds split without version scope when not provided", async () => {
      mockPrismaClient.split.findFirst.mockResolvedValue(null);
      await service.findSplit("s-1");
      expect(mockPrismaClient.split.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "s-1" } }),
      );
    });

    it("uses provided tx client", async () => {
      const txSplit = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { split: txSplit } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findSplit("s-1", undefined, tx);
      expect(txSplit.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.split.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findSplitByName", () => {
    it("finds split by name (no tx)", async () => {
      const split = { id: "s-1" };
      mockPrismaClient.split.findFirst.mockResolvedValue(split);
      const result = await service.findSplitByName("v-1", "train");
      expect(result).toEqual(split);
      expect(mockPrismaClient.split.findFirst).toHaveBeenCalledWith({
        where: { datasetVersionId: "v-1", name: "train" },
      });
    });

    it("uses provided tx client", async () => {
      const txSplit = { findFirst: jest.fn().mockResolvedValue(null) };
      const tx = { split: txSplit } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findSplitByName("v-1", "train", tx);
      expect(txSplit.findFirst).toHaveBeenCalled();
      expect(mockPrismaClient.split.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("findAllSplitsForVersion", () => {
    it("returns all splits for a version (no tx)", async () => {
      mockPrismaClient.split.findMany.mockResolvedValue([]);
      await service.findAllSplitsForVersion("v-1");
      expect(mockPrismaClient.split.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { datasetVersionId: "v-1" } }),
      );
    });

    it("uses provided tx client", async () => {
      const txSplit = { findMany: jest.fn().mockResolvedValue([]) };
      const tx = { split: txSplit } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.findAllSplitsForVersion("v-1", tx);
      expect(txSplit.findMany).toHaveBeenCalled();
      expect(mockPrismaClient.split.findMany).not.toHaveBeenCalled();
    });
  });

  describe("updateSplit", () => {
    it("updates a split (no tx)", async () => {
      const updated = { id: "s-1", frozen: true };
      mockPrismaClient.split.update.mockResolvedValue(updated);
      const result = await service.updateSplit("s-1", { frozen: true });
      expect(result).toEqual(updated);
    });

    it("uses provided tx client", async () => {
      const txSplit = { update: jest.fn().mockResolvedValue({ id: "s-1" }) };
      const tx = { split: txSplit } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.updateSplit("s-1", {}, tx);
      expect(txSplit.update).toHaveBeenCalled();
      expect(mockPrismaClient.split.update).not.toHaveBeenCalled();
    });
  });

  describe("deleteManySplits tx support", () => {
    it("uses provided tx client", async () => {
      const txSplit = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      const tx = { split: txSplit } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteManySplits({}, tx);
      expect(txSplit.deleteMany).toHaveBeenCalled();
      expect(mockPrismaClient.split.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ---- Cascade helpers -------------------------------------------------------

  describe("deleteManyBenchmarkRuns tx support", () => {
    it("uses provided tx client", async () => {
      const txRun = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      const tx = { benchmarkRun: txRun } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteManyBenchmarkRuns({}, tx);
      expect(txRun.deleteMany).toHaveBeenCalled();
      expect(mockPrismaClient.benchmarkRun.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("deleteManyBenchmarkDefinitions", () => {
    it("deletes benchmark definitions matching filter (no tx)", async () => {
      mockPrismaClient.benchmarkDefinition.deleteMany.mockResolvedValue({ count: 1 });
      await service.deleteManyBenchmarkDefinitions({ datasetVersionId: "v-1" });
      expect(mockPrismaClient.benchmarkDefinition.deleteMany).toHaveBeenCalledWith({
        where: { datasetVersionId: "v-1" },
      });
    });

    it("uses provided tx client", async () => {
      const txDef = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };
      const tx = { benchmarkDefinition: txDef } as unknown as import("@generated/client").Prisma.TransactionClient;
      await service.deleteManyBenchmarkDefinitions({}, tx);
      expect(txDef.deleteMany).toHaveBeenCalled();
      expect(mockPrismaClient.benchmarkDefinition.deleteMany).not.toHaveBeenCalled();
    });
  });
});
