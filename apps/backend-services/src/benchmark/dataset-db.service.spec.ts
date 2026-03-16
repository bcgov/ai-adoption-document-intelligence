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
});
