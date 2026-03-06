/**
 * Dataset Service Tests
 *
 * Tests for the dataset service with blob storage backend.
 * See feature-docs/003-benchmarking-system/user-stories/US-006-dataset-service-controller.md
 */

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { PrismaService } from "@/database/prisma.service";
import { DatasetService } from "./dataset.service";

const mockPrismaClient = {
  dataset: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  datasetVersion: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
  },
  split: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  benchmarkDefinition: {
    deleteMany: jest.fn(),
  },
  benchmarkRun: {
    deleteMany: jest.fn(),
  },
  benchmarkAuditLog: {
    create: jest.fn(),
  },
};

describe("DatasetService", () => {
  let service: DatasetService;
  let blobStorage: BlobStorageInterface;
  let prisma: typeof mockPrismaClient;

  const mockBlobStorage: BlobStorageInterface = {
    write: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue(Buffer.from("{}")),
    exists: jest.fn().mockResolvedValue(false),
    delete: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    deleteByPrefix: jest.fn().mockResolvedValue(undefined),
  };

  const createDto = {
    name: "Test Dataset",
    description: "Test description",
    metadata: { domain: "invoices" },
    groupId: "test-group",
  };

  const mockDataset = {
    id: "dataset-1",
    name: "Test Dataset",
    description: "Test description",
    metadata: { domain: "invoices" },
    storagePath: "datasets/dataset-1",
    createdBy: "user-1",
    group_id: "test-group",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetService,
        {
          provide: PrismaService,
          useValue: { prisma: mockPrismaClient },
        },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
      ],
    }).compile();

    service = module.get<DatasetService>(DatasetService);
    blobStorage = module.get<BlobStorageInterface>(BLOB_STORAGE);
    prisma = mockPrismaClient;
  });

  // -----------------------------------------------------------------------
  // Create Dataset
  // -----------------------------------------------------------------------
  describe("createDataset", () => {
    it("creates a dataset with auto-generated storagePath", async () => {
      mockPrismaClient.dataset.create.mockResolvedValue({
        ...mockDataset,
        storagePath: "",
      });
      mockPrismaClient.dataset.update.mockResolvedValue(mockDataset);
      mockPrismaClient.benchmarkAuditLog.create.mockResolvedValue({});

      const result = await service.createDataset(createDto, "user-1");

      expect(prisma.dataset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: createDto.name,
          description: createDto.description,
          metadata: createDto.metadata,
          storagePath: "",
          createdBy: "user-1",
        }),
      });
      expect(prisma.dataset.update).toHaveBeenCalledWith({
        where: { id: "dataset-1" },
        data: { storagePath: "datasets/dataset-1" },
      });
      expect(result.id).toBe("dataset-1");
      expect(result.storagePath).toBe("datasets/dataset-1");
    });

    it("throws BadRequestException when name is missing", async () => {
      await expect(
        service.createDataset({ name: "", groupId: "test-group" }, "user-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException when name already exists", async () => {
      const error = new Error("Unique constraint failed") as Error & {
        code: string;
      };
      error.code = "P2002";
      Object.setPrototypeOf(
        error,
        (await import("@generated/client")).Prisma.PrismaClientKnownRequestError
          .prototype,
      );
      mockPrismaClient.dataset.create.mockRejectedValue(error);

      await expect(service.createDataset(createDto, "user-1")).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // List Datasets
  // -----------------------------------------------------------------------
  describe("listDatasets", () => {
    it("returns paginated datasets", async () => {
      mockPrismaClient.dataset.count.mockResolvedValue(1);
      mockPrismaClient.dataset.findMany.mockResolvedValue([
        {
          ...mockDataset,
          versions: [{ id: "v1" }, { id: "v2" }],
        },
      ]);

      const result = await service.listDatasets(1, 20, ["test-group"]);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.data[0].id).toBe("dataset-1");
    });

    it("returns empty list when no datasets exist", async () => {
      mockPrismaClient.dataset.count.mockResolvedValue(0);
      mockPrismaClient.dataset.findMany.mockResolvedValue([]);

      const result = await service.listDatasets(1, 20, ["test-group"]);

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // Get Dataset by ID
  // -----------------------------------------------------------------------
  describe("getDatasetById", () => {
    it("returns dataset with recent versions", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue({
        ...mockDataset,
        versions: [
          {
            id: "v1",
            version: "1.0.0",
            documentCount: 100,
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.getDatasetById("dataset-1");

      expect(result.id).toBe("dataset-1");
      expect(result.recentVersions).toHaveLength(1);
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(service.getDatasetById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Delete Dataset
  // -----------------------------------------------------------------------
  describe("deleteDataset", () => {
    it("deletes dataset and its storage files", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue({
        ...mockDataset,
        versions: [],
      });
      mockPrismaClient.datasetVersion.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaClient.dataset.delete.mockResolvedValue(mockDataset);

      await service.deleteDataset("dataset-1");

      expect(prisma.dataset.delete).toHaveBeenCalledWith({
        where: { id: "dataset-1" },
      });
      expect(blobStorage.deleteByPrefix).toHaveBeenCalledWith(
        "datasets/dataset-1",
      );
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(service.deleteDataset("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Create Version
  // -----------------------------------------------------------------------
  describe("createVersion", () => {
    it("creates a new draft version", async () => {
      const mockVersion = {
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        storagePrefix: null,
        manifestPath: "dataset-manifest.json",
        documentCount: 0,
        groundTruthSchema: null,
        createdAt: new Date(),
      };

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.count.mockResolvedValue(0);
      mockPrismaClient.datasetVersion.create.mockResolvedValue(mockVersion);

      const result = await service.createVersion(
        "dataset-1",
        { version: "1.0.0" },
        "user-1",
      );

      expect(result.id).toBe("version-1");
      expect(result.version).toBe("1.0.0");
      expect(result.storagePrefix).toBeNull();
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(
        service.createVersion("nonexistent", { version: "1.0.0" }, "user-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // List Versions
  // -----------------------------------------------------------------------
  describe("listVersions", () => {
    it("returns versions for a dataset", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findMany.mockResolvedValue([
        {
          id: "v1",
          version: "1.0.0",
          name: null,
          documentCount: 10,
          storagePrefix: "datasets/dataset-1/v1/",
          frozen: false,
          createdAt: new Date(),
          splits: [],
        },
      ]);

      const result = await service.listVersions("dataset-1");

      expect(result.versions).toHaveLength(1);
      expect(result.versions[0].storagePrefix).toBe("datasets/dataset-1/v1/");
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(service.listVersions("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Get Version by ID
  // -----------------------------------------------------------------------
  describe("getVersionById", () => {
    it("returns version details", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        storagePrefix: "datasets/dataset-1/v1/",
        manifestPath: "dataset-manifest.json",
        documentCount: 10,
        groundTruthSchema: null,
        frozen: false,
        createdAt: new Date(),
        splits: [],
      });

      const result = await service.getVersionById("dataset-1", "v1");

      expect(result.id).toBe("v1");
      expect(result.storagePrefix).toBe("datasets/dataset-1/v1/");
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.getVersionById("dataset-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Upload Files to Version
  // -----------------------------------------------------------------------
  describe("uploadFilesToVersion", () => {
    const mockFiles = [
      {
        fieldname: "files",
        originalname: "sample1.pdf",
        encoding: "7bit",
        mimetype: "application/pdf",
        buffer: Buffer.from("pdf data"),
        size: 1024,
      },
      {
        fieldname: "files",
        originalname: "sample1.json",
        encoding: "7bit",
        mimetype: "application/json",
        buffer: Buffer.from("{}"),
        size: 128,
      },
    ];

    const mockVersion = {
      id: "version-1",
      datasetId: "dataset-1",
      version: "1.0.0",
      name: null,
      storagePrefix: null,
      manifestPath: "dataset-manifest.json",
      documentCount: 0,
      groundTruthSchema: null,
      createdAt: new Date(),
    };

    it("uploads files to blob storage and updates manifest", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      // Mock manifest read failure (first upload, no existing manifest)
      (mockBlobStorage.read as jest.Mock).mockRejectedValueOnce(
        new Error("Not found"),
      );
      mockPrismaClient.datasetVersion.update.mockResolvedValue({
        ...mockVersion,
        storagePrefix: "datasets/dataset-1/version-1",
        documentCount: 1,
      });

      const result = await service.uploadFilesToVersion(
        "dataset-1",
        "version-1",
        mockFiles,
        "user-1",
      );

      // Verify files were uploaded to blob storage
      expect(blobStorage.write).toHaveBeenCalledWith(
        expect.stringContaining(
          "datasets/dataset-1/version-1/inputs/sample1.pdf",
        ),
        expect.any(Buffer),
      );
      expect(blobStorage.write).toHaveBeenCalledWith(
        expect.stringContaining(
          "datasets/dataset-1/version-1/ground-truth/sample1.json",
        ),
        expect.any(Buffer),
      );

      // Verify manifest was written
      expect(blobStorage.write).toHaveBeenCalledWith(
        "datasets/dataset-1/version-1/dataset-manifest.json",
        expect.any(Buffer),
      );

      expect(result.manifestUpdated).toBe(true);
      expect(result.uploadedFiles).toHaveLength(2);
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadFilesToVersion("nonexistent", "v1", mockFiles, "user-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.uploadFilesToVersion(
          "dataset-1",
          "nonexistent",
          mockFiles,
          "user-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when version is frozen", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        ...mockVersion,
        frozen: true,
      });

      await expect(
        service.uploadFilesToVersion(
          "dataset-1",
          "version-1",
          mockFiles,
          "user-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // Delete Sample
  // -----------------------------------------------------------------------
  describe("deleteSample", () => {
    it("removes sample from manifest and deletes files from storage", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        storagePrefix: "datasets/dataset-1/version-1",
        manifestPath: "dataset-manifest.json",
        documentCount: 2,
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-1",
            inputs: [
              { path: "inputs/sample-1.pdf", mimeType: "application/pdf" },
            ],
            groundTruth: [
              { path: "ground-truth/sample-1.json", format: "json" },
            ],
          },
          {
            id: "sample-2",
            inputs: [
              { path: "inputs/sample-2.pdf", mimeType: "application/pdf" },
            ],
            groundTruth: [],
          },
        ],
      };

      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );
      mockPrismaClient.datasetVersion.update.mockResolvedValue({});

      await service.deleteSample("dataset-1", "version-1", "sample-1");

      // Verify files were deleted from storage
      expect(blobStorage.delete).toHaveBeenCalledWith(
        "datasets/dataset-1/version-1/inputs/sample-1.pdf",
      );
      expect(blobStorage.delete).toHaveBeenCalledWith(
        "datasets/dataset-1/version-1/ground-truth/sample-1.json",
      );

      // Verify updated manifest was written
      expect(blobStorage.write).toHaveBeenCalledWith(
        "datasets/dataset-1/version-1/dataset-manifest.json",
        expect.any(Buffer),
      );

      // Verify document count was updated
      expect(prisma.datasetVersion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documentCount: 1 }),
        }),
      );
    });

    it("throws BadRequestException when version is frozen", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        storagePrefix: "datasets/dataset-1/version-1",
        manifestPath: "dataset-manifest.json",
        documentCount: 2,
        frozen: true,
      });

      await expect(
        service.deleteSample("dataset-1", "version-1", "sample-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when sample not found in manifest", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/version-1",
        manifestPath: "dataset-manifest.json",
        documentCount: 1,
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-1",
            inputs: [],
            groundTruth: [],
          },
        ],
      };

      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );

      await expect(
        service.deleteSample("dataset-1", "version-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Freeze Version
  // -----------------------------------------------------------------------
  describe("freezeVersion", () => {
    it("freezes a dataset version", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        frozen: false,
      });
      mockPrismaClient.datasetVersion.update.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        frozen: true,
      });

      const result = await service.freezeVersion("dataset-1", "version-1");

      expect(result.frozen).toBe(true);
      expect(prisma.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "version-1" },
        data: { frozen: true },
      });
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.freezeVersion("dataset-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Delete Version
  // -----------------------------------------------------------------------
  describe("deleteVersion", () => {
    it("deletes version and its storage files", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/version-1",
        benchmarkDefinitions: [],
      });
      mockPrismaClient.datasetVersion.deleteMany.mockResolvedValue({
        count: 1,
      });

      await service.deleteVersion("dataset-1", "version-1");

      expect(blobStorage.deleteByPrefix).toHaveBeenCalledWith(
        "datasets/dataset-1/version-1",
      );
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteVersion("dataset-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Update Version Name
  // -----------------------------------------------------------------------
  describe("updateVersionName", () => {
    it("updates version name successfully", async () => {
      const mockVersion = {
        id: "version-1",
        datasetId: "dataset-1",
        version: "v1",
        name: null,
        frozen: false,
        storagePrefix: "datasets/dataset-1/version-1",
        manifestPath: "dataset-manifest.json",
        documentCount: 5,
        groundTruthSchema: null,
        createdAt: new Date(),
      };

      const updatedVersion = {
        ...mockVersion,
        name: "Q4 invoices",
        splits: [],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockPrismaClient.datasetVersion.update.mockResolvedValue(updatedVersion);

      const result = await service.updateVersionName(
        "dataset-1",
        "version-1",
        "Q4 invoices",
      );

      expect(mockPrismaClient.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "version-1" },
        data: { name: "Q4 invoices" },
        include: {
          splits: {
            select: {
              id: true,
              name: true,
              type: true,
              sampleIds: true,
            },
          },
        },
      });
      expect(result.name).toBe("Q4 invoices");
    });

    it("throws NotFoundException when version not found", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.updateVersionName("dataset-1", "nonexistent", "test"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when version is frozen", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        frozen: true,
      });

      await expect(
        service.updateVersionName("dataset-1", "version-1", "test"),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
