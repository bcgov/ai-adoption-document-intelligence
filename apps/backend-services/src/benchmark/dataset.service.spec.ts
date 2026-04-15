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
import { AuditLogDbService } from "./audit-log-db.service";
import { DatasetService } from "./dataset.service";
import { DatasetDbService } from "./dataset-db.service";

const mockDatasetDbService = {
  createDataset: jest.fn(),
  updateDataset: jest.fn(),
  findDataset: jest.fn(),
  findDatasetWithVersions: jest.fn(),
  findDatasetForDeletion: jest.fn(),
  countDatasets: jest.fn(),
  findAllDatasets: jest.fn(),
  deleteDataset: jest.fn(),
  createDatasetVersion: jest.fn(),
  findDatasetVersion: jest.fn(),
  findDatasetVersionWithSplits: jest.fn(),
  findDatasetVersionForDeletion: jest.fn(),
  findAllDatasetVersionsWithSplits: jest.fn(),
  countDatasetVersions: jest.fn(),
  updateDatasetVersion: jest.fn(),
  deleteDatasetVersion: jest.fn(),
  deleteManyDatasetVersions: jest.fn(),
  createSplit: jest.fn(),
  findSplit: jest.fn(),
  findSplitByName: jest.fn(),
  findAllSplitsForVersion: jest.fn().mockResolvedValue([]),
  updateSplit: jest.fn(),
  deleteManySplits: jest.fn(),
  deleteManyBenchmarkRuns: jest.fn(),
  deleteManyBenchmarkDefinitions: jest.fn(),
};

const mockAuditLogDbService = {
  createAuditLog: jest.fn(),
  findAllAuditLogs: jest.fn(),
};

describe("DatasetService", () => {
  let service: DatasetService;
  let blobStorage: BlobStorageInterface;

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
    storagePath: "testgroup1/benchmark/datasets/dataset-1",
    createdBy: "user-1",
    group_id: "test-group",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatasetDbService.findAllSplitsForVersion.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetService,
        {
          provide: DatasetDbService,
          useValue: mockDatasetDbService,
        },
        {
          provide: AuditLogDbService,
          useValue: mockAuditLogDbService,
        },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
      ],
    }).compile();

    service = module.get<DatasetService>(DatasetService);
    blobStorage = module.get<BlobStorageInterface>(BLOB_STORAGE);
  });

  // -----------------------------------------------------------------------
  // Create Dataset
  // -----------------------------------------------------------------------
  describe("createDataset", () => {
    it("creates a dataset with auto-generated storagePath", async () => {
      mockDatasetDbService.createDataset.mockResolvedValue({
        ...mockDataset,
        storagePath: "",
      });
      mockDatasetDbService.updateDataset.mockResolvedValue(mockDataset);
      mockAuditLogDbService.createAuditLog.mockResolvedValue({});

      const result = await service.createDataset(createDto, "user-1");

      expect(mockDatasetDbService.createDataset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: createDto.name,
          description: createDto.description,
          metadata: createDto.metadata,
          storagePath: "",
          createdBy: "user-1",
        }),
      );
      expect(mockDatasetDbService.updateDataset).toHaveBeenCalledWith(
        "dataset-1",
        { storagePath: "datasets/dataset-1" },
      );
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
      mockDatasetDbService.createDataset.mockRejectedValue(error);

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
      mockDatasetDbService.countDatasets.mockResolvedValue(1);
      mockDatasetDbService.findAllDatasets.mockResolvedValue([
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
      mockDatasetDbService.countDatasets.mockResolvedValue(0);
      mockDatasetDbService.findAllDatasets.mockResolvedValue([]);

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
      mockDatasetDbService.findDatasetWithVersions.mockResolvedValue({
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
      mockDatasetDbService.findDatasetWithVersions.mockResolvedValue(null);

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
      mockDatasetDbService.findDatasetForDeletion.mockResolvedValue({
        ...mockDataset,
        versions: [],
      });
      mockDatasetDbService.deleteManyDatasetVersions.mockResolvedValue(
        undefined,
      );
      mockDatasetDbService.deleteDataset.mockResolvedValue(undefined);

      await service.deleteDataset("dataset-1");

      expect(mockDatasetDbService.deleteDataset).toHaveBeenCalledWith(
        "dataset-1",
      );
      expect(blobStorage.deleteByPrefix).toHaveBeenCalledWith(
        "testgroup1/benchmark/datasets/dataset-1",
      );
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockDatasetDbService.findDatasetForDeletion.mockResolvedValue(null);

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

      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.countDatasetVersions.mockResolvedValue(0);
      mockDatasetDbService.createDatasetVersion.mockResolvedValue(mockVersion);

      const result = await service.createVersion(
        "dataset-1",
        {
          version: "1.0.0",
        },
        "actor-1",
      );

      expect(result.id).toBe("version-1");
      expect(result.version).toBe("1.0.0");
      expect(result.storagePrefix).toBeNull();
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(null);

      await expect(
        service.createVersion("nonexistent", { version: "1.0.0" }, "actor-1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // List Versions
  // -----------------------------------------------------------------------
  describe("listVersions", () => {
    it("returns versions for a dataset", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findAllDatasetVersionsWithSplits.mockResolvedValue([
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
      mockDatasetDbService.findDataset.mockResolvedValue(null);

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
      mockDatasetDbService.findDatasetVersionWithSplits.mockResolvedValue({
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
      mockDatasetDbService.findDatasetVersionWithSplits.mockResolvedValue(null);

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
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);
      // Mock manifest read failure (first upload, no existing manifest)
      (mockBlobStorage.read as jest.Mock).mockRejectedValueOnce(
        new Error("Not found"),
      );
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue({
        ...mockVersion,
        storagePrefix: "datasets/dataset-1/version-1",
        documentCount: 1,
      });

      const result = await service.uploadFilesToVersion(
        "dataset-1",
        "version-1",
        mockFiles,
        "actor-1",
        "group-1",
      );

      // Verify files were uploaded to blob storage
      expect(blobStorage.write).toHaveBeenCalledWith(
        expect.stringContaining(
          "group-1/benchmark/datasets/dataset-1/version-1/inputs/sample1.pdf",
        ),
        expect.any(Buffer),
      );
      expect(blobStorage.write).toHaveBeenCalledWith(
        expect.stringContaining(
          "group-1/benchmark/datasets/dataset-1/version-1/ground-truth/sample1.json",
        ),
        expect.any(Buffer),
      );

      // Verify manifest was written
      expect(blobStorage.write).toHaveBeenCalledWith(
        "group-1/benchmark/datasets/dataset-1/version-1/dataset-manifest.json",
        expect.any(Buffer),
      );

      expect(result.manifestUpdated).toBe(true);
      expect(result.uploadedFiles).toHaveLength(2);
    });

    it("throws NotFoundException when dataset does not exist", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(null);

      await expect(
        service.uploadFilesToVersion(
          "nonexistent",
          "v1",
          mockFiles,
          "actor-1",
          "group-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.uploadFilesToVersion(
          "dataset-1",
          "nonexistent",
          mockFiles,
          "actor-1",
          "group-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when version is frozen", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        ...mockVersion,
        frozen: true,
      });

      await expect(
        service.uploadFilesToVersion(
          "dataset-1",
          "version-1",
          mockFiles,
          "actor-1",
          "group-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // Delete Sample
  // -----------------------------------------------------------------------
  describe("deleteSample", () => {
    it("removes sample from manifest and deletes files from storage", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
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
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue({});

      await service.deleteSample(
        "dataset-1",
        "version-1",
        "sample-1",
        "group-1",
      );

      // Verify files were deleted from storage
      expect(blobStorage.delete).toHaveBeenCalledWith(
        "group-1/benchmark/datasets/dataset-1/version-1/inputs/sample-1.pdf",
      );
      expect(blobStorage.delete).toHaveBeenCalledWith(
        "group-1/benchmark/datasets/dataset-1/version-1/ground-truth/sample-1.json",
      );

      // Verify updated manifest was written
      expect(blobStorage.write).toHaveBeenCalledWith(
        "group-1/benchmark/datasets/dataset-1/version-1/dataset-manifest.json",
        expect.any(Buffer),
      );

      // Verify document count was updated
      expect(mockDatasetDbService.updateDatasetVersion).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ documentCount: 1 }),
      );
    });

    it("throws BadRequestException when version is frozen", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        storagePrefix: "datasets/dataset-1/version-1",
        manifestPath: "dataset-manifest.json",
        documentCount: 2,
        frozen: true,
      });

      await expect(
        service.deleteSample("dataset-1", "version-1", "sample-1", "group-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws NotFoundException when sample not found in manifest", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
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
        service.deleteSample(
          "dataset-1",
          "version-1",
          "nonexistent",
          "group-1",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Freeze Version
  // -----------------------------------------------------------------------
  describe("freezeVersion", () => {
    it("freezes a dataset version", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        frozen: false,
      });
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        frozen: true,
      });

      const result = await service.freezeVersion("dataset-1", "version-1");

      expect(result.frozen).toBe(true);
      expect(mockDatasetDbService.updateDatasetVersion).toHaveBeenCalledWith(
        "version-1",
        { frozen: true },
      );
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

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
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersionForDeletion.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/version-1",
        benchmarkDefinitions: [],
      });
      mockDatasetDbService.deleteManyDatasetVersions.mockResolvedValue(
        undefined,
      );

      await service.deleteVersion("dataset-1", "version-1");

      expect(blobStorage.deleteByPrefix).toHaveBeenCalledWith(
        "test-group/benchmark/datasets/dataset-1/version-1",
      );
    });

    it("throws NotFoundException when version does not exist", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersionForDeletion.mockResolvedValue(
        null,
      );

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

      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue(
        updatedVersion,
      );
      mockDatasetDbService.findDatasetVersionWithSplits.mockResolvedValue(
        updatedVersion,
      );

      const result = await service.updateVersionName(
        "dataset-1",
        "version-1",
        "Q4 invoices",
      );

      expect(mockDatasetDbService.updateDatasetVersion).toHaveBeenCalledWith(
        "version-1",
        { name: "Q4 invoices" },
      );
      expect(result.name).toBe("Q4 invoices");
    });

    it("throws NotFoundException when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.updateVersionName("dataset-1", "nonexistent", "test"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when version is frozen", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "version-1",
        datasetId: "dataset-1",
        frozen: true,
      });

      await expect(
        service.updateVersionName("dataset-1", "version-1", "test"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // List Samples
  // -----------------------------------------------------------------------
  describe("listSamples", () => {
    const validManifest = {
      schemaVersion: "1.0",
      samples: [
        {
          id: "s1",
          inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
          groundTruth: [{ path: "ground-truth/s1.json", format: "json" }],
        },
        {
          id: "s2",
          inputs: [{ path: "inputs/s2.pdf", mimeType: "application/pdf" }],
          groundTruth: [{ path: "ground-truth/s2.json", format: "json" }],
        },
      ],
    };

    it("returns paginated samples", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });
      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(validManifest)),
      );

      const result = await service.listSamples("dataset-1", "v1", 1, 20);

      expect(result.samples).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
    });

    it("returns empty when version has no storagePrefix", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: null,
      });

      const result = await service.listSamples("dataset-1", "v1");

      expect(result.samples).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("throws NotFoundException when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.listSamples("dataset-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Get Ground Truth
  // -----------------------------------------------------------------------
  describe("getGroundTruth", () => {
    it("returns ground truth content", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [{ path: "ground-truth/s1.json", format: "json" }],
          },
        ],
      };

      // First read: exists check for manifest
      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      // Second read: manifest content
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );
      // Third read: ground truth file content
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify({ field: "value" })),
      );

      const result = await service.getGroundTruth("dataset-1", "v1", "s1");

      expect(result.sampleId).toBe("s1");
      expect(result.content).toEqual({ field: "value" });
      expect(result.format).toBe("json");
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.getGroundTruth("dataset-1", "v1", "s1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when version has no files", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: null,
      });

      await expect(
        service.getGroundTruth("dataset-1", "v1", "s1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws when sample not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "other",
            inputs: [{ path: "inputs/other.pdf", mimeType: "application/pdf" }],
            groundTruth: [{ path: "ground-truth/other.json", format: "json" }],
          },
        ],
      };

      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );

      await expect(
        service.getGroundTruth("dataset-1", "v1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when sample has no ground truth files", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [],
          },
        ],
      };

      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );

      await expect(
        service.getGroundTruth("dataset-1", "v1", "s1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Get Sample File
  // -----------------------------------------------------------------------
  describe("getSampleFile", () => {
    it("returns file buffer, filename, and mime type", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from("pdf content"),
      );

      const result = await service.getSampleFile(
        "dataset-1",
        "v1",
        "inputs/sample.pdf",
      );

      expect(result.filename).toBe("sample.pdf");
      expect(result.mimeType).toBe("application/pdf");
      expect(result.buffer).toEqual(Buffer.from("pdf content"));
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.getSampleFile("dataset-1", "v1", "inputs/sample.pdf"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when version has no files", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: null,
      });

      await expect(
        service.getSampleFile("dataset-1", "v1", "inputs/sample.pdf"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws on directory traversal attempt", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      await expect(
        service.getSampleFile("dataset-1", "v1", "../../../etc/passwd"),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws when file does not exist", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(false);

      await expect(
        service.getSampleFile("dataset-1", "v1", "inputs/missing.pdf"),
      ).rejects.toThrow(NotFoundException);
    });

    it("detects json mime type", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from("{}"),
      );

      const result = await service.getSampleFile(
        "dataset-1",
        "v1",
        "ground-truth/sample.json",
      );

      expect(result.mimeType).toBe("application/json");
    });

    it("uses octet-stream for unknown extension", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      (mockBlobStorage.exists as jest.Mock).mockResolvedValueOnce(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from("data"),
      );

      const result = await service.getSampleFile(
        "dataset-1",
        "v1",
        "inputs/sample.xyz",
      );

      expect(result.mimeType).toBe("application/octet-stream");
    });
  });

  // -----------------------------------------------------------------------
  // Validate Dataset Version
  // -----------------------------------------------------------------------
  describe("validateDatasetVersion", () => {
    const mockVersion = {
      id: "v1",
      datasetId: "dataset-1",
      storagePrefix: "datasets/dataset-1/v1",
      groundTruthSchema: null,
    };

    it("validates with no issues for a valid dataset", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [{ path: "ground-truth/s1.json", format: "json" }],
          },
        ],
      };

      (mockBlobStorage.exists as jest.Mock).mockResolvedValue(true);
      (mockBlobStorage.read as jest.Mock)
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(manifest)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify({ field: "value" })));

      const result = await service.validateDatasetVersion(
        "dataset-1",
        "v1",
        {},
      );

      expect(result.valid).toBe(true);
      expect(result.totalSamples).toBe(1);
    });

    it("detects missing ground truth", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [],
          },
        ],
      };

      (mockBlobStorage.exists as jest.Mock).mockResolvedValue(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );

      const result = await service.validateDatasetVersion(
        "dataset-1",
        "v1",
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.missingGroundTruth).toBe(1);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.validateDatasetVersion("dataset-1", "v1", {}),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when version has no files", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        ...mockVersion,
        storagePrefix: null,
      });

      await expect(
        service.validateDatasetVersion("dataset-1", "v1", {}),
      ).rejects.toThrow(BadRequestException);
    });

    it("detects missing ground truth files in storage", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [{ path: "ground-truth/s1.json", format: "json" }],
          },
        ],
      };

      // manifest exists
      (mockBlobStorage.exists as jest.Mock)
        .mockResolvedValueOnce(true) // manifest exists
        .mockResolvedValueOnce(false) // gt file does not exist
        .mockResolvedValueOnce(true); // input file exists
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );

      const result = await service.validateDatasetVersion(
        "dataset-1",
        "v1",
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.corruption).toBeGreaterThan(0);
    });

    it("supports sampling with sampleSize", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      const samples = Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        inputs: [{ path: `inputs/s${i}.pdf`, mimeType: "application/pdf" }],
        groundTruth: [{ path: `ground-truth/s${i}.json`, format: "json" }],
      }));

      const manifest = { schemaVersion: "1.0", samples };

      (mockBlobStorage.exists as jest.Mock).mockResolvedValue(true);
      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );

      // Return valid JSON for gt files
      for (let i = 0; i < 3; i++) {
        (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
          Buffer.from(JSON.stringify({ data: i })),
        );
      }

      const result = await service.validateDatasetVersion("dataset-1", "v1", {
        sampleSize: 3,
      });

      expect(result.sampled).toBe(true);
      expect(result.totalSamples).toBe(10);
    });

    it("validates with schema and detects violations", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        ...mockVersion,
        groundTruthSchema: {
          type: "object",
          required: ["name"],
          properties: { name: { type: "string" } },
        },
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [{ path: "ground-truth/s1.json", format: "json" }],
          },
        ],
      };

      (mockBlobStorage.exists as jest.Mock).mockResolvedValue(true);
      (mockBlobStorage.read as jest.Mock)
        .mockResolvedValueOnce(Buffer.from(JSON.stringify(manifest)))
        .mockResolvedValueOnce(Buffer.from(JSON.stringify({ notName: 123 })));

      const result = await service.validateDatasetVersion(
        "dataset-1",
        "v1",
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.schemaViolations).toBeGreaterThan(0);
    });
  });

  // -----------------------------------------------------------------------
  // Create Split
  // -----------------------------------------------------------------------
  describe("createSplit", () => {
    it("creates a split successfully", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplitByName.mockResolvedValue(null);
      mockDatasetDbService.createSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        name: "test-split",
        type: "test",
        sampleIds: ["s1", "s2"],
        stratificationRules: null,
        frozen: false,
        createdAt: new Date(),
      });

      const result = await service.createSplit("dataset-1", "v1", {
        name: "test-split",
        type: "test",
        sampleIds: ["s1", "s2"],
      });

      expect(result.id).toBe("split-1");
      expect(result.name).toBe("test-split");
      expect(result.sampleIds).toEqual(["s1", "s2"]);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.createSplit("dataset-1", "v1", {
          name: "test",
          type: "test",
          sampleIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when split name already exists", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplitByName.mockResolvedValue({
        id: "existing",
        name: "test-split",
      });

      await expect(
        service.createSplit("dataset-1", "v1", {
          name: "test-split",
          type: "test",
          sampleIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // List Splits
  // -----------------------------------------------------------------------
  describe("listSplits", () => {
    it("returns splits for a version", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findAllSplitsForVersion.mockResolvedValue([
        {
          id: "split-1",
          datasetVersionId: "v1",
          name: "test",
          type: "test",
          sampleIds: ["s1", "s2"],
          frozen: false,
          stratificationRules: null,
          createdAt: new Date(),
        },
      ]);

      const result = await service.listSplits("dataset-1", "v1");

      expect(result).toHaveLength(1);
      expect(result[0].sampleCount).toBe(2);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(service.listSplits("dataset-1", "v1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Get Split
  // -----------------------------------------------------------------------
  describe("getSplit", () => {
    it("returns split details", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        name: "test",
        type: "test",
        sampleIds: ["s1"],
        frozen: false,
        stratificationRules: null,
        createdAt: new Date(),
      });

      const result = await service.getSplit("dataset-1", "v1", "split-1");

      expect(result.id).toBe("split-1");
      expect(result.sampleCount).toBe(1);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.getSplit("dataset-1", "v1", "split-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when split not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue(null);

      await expect(
        service.getSplit("dataset-1", "v1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Update Split
  // -----------------------------------------------------------------------
  describe("updateSplit", () => {
    it("updates split sample IDs", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        frozen: false,
      });
      mockDatasetDbService.updateSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        name: "test",
        type: "test",
        sampleIds: ["s1", "s2", "s3"],
        frozen: false,
        createdAt: new Date(),
      });

      const result = await service.updateSplit("dataset-1", "v1", "split-1", {
        sampleIds: ["s1", "s2", "s3"],
      });

      expect(result.sampleIds).toEqual(["s1", "s2", "s3"]);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.updateSplit("dataset-1", "v1", "split-1", {
          sampleIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when split not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue(null);

      await expect(
        service.updateSplit("dataset-1", "v1", "nonexistent", {
          sampleIds: [],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when split is frozen", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        frozen: true,
      });

      await expect(
        service.updateSplit("dataset-1", "v1", "split-1", {
          sampleIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // Freeze Split
  // -----------------------------------------------------------------------
  describe("freezeSplit", () => {
    it("freezes a split", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        frozen: false,
      });
      mockDatasetDbService.updateSplit.mockResolvedValue({
        id: "split-1",
        datasetVersionId: "v1",
        name: "test",
        type: "test",
        frozen: true,
      });

      const result = await service.freezeSplit("dataset-1", "v1", "split-1");

      expect(result.frozen).toBe(true);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.freezeSplit("dataset-1", "v1", "split-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when split not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.findSplit.mockResolvedValue(null);

      await expect(
        service.freezeSplit("dataset-1", "v1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Update Version After HITL Import
  // -----------------------------------------------------------------------
  describe("updateVersionAfterHitlImport", () => {
    it("updates storagePrefix and documentCount", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
      });
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        version: "1.0.0",
        name: null,
        storagePrefix: "datasets/dataset-1/v1",
        manifestPath: "dataset-manifest.json",
        documentCount: 10,
        groundTruthSchema: null,
        frozen: false,
        createdAt: new Date(),
      });

      const result = await service.updateVersionAfterHitlImport(
        "dataset-1",
        "v1",
        "datasets/dataset-1/v1",
        10,
      );

      expect(result.documentCount).toBe(10);
      expect(result.storagePrefix).toBe("datasets/dataset-1/v1");
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.updateVersionAfterHitlImport("dataset-1", "v1", "prefix", 5),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // Delete Sample - additional branch coverage
  // -----------------------------------------------------------------------
  describe("deleteSample - additional branches", () => {
    it("throws when dataset not found", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(null);

      await expect(
        service.deleteSample("nonexistent", "v1", "s1", "group-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when version not found", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(null);

      await expect(
        service.deleteSample("dataset-1", "nonexistent", "s1", "group-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws when version has no storagePrefix", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: null,
      });

      await expect(
        service.deleteSample("dataset-1", "v1", "s1", "group-1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("removes sample ID from splits that reference it", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
      });

      const manifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "s1",
            inputs: [{ path: "inputs/s1.pdf", mimeType: "application/pdf" }],
            groundTruth: [],
          },
        ],
      };

      (mockBlobStorage.read as jest.Mock).mockResolvedValueOnce(
        Buffer.from(JSON.stringify(manifest)),
      );
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue({});
      mockDatasetDbService.findAllSplitsForVersion.mockResolvedValue([
        { id: "split-1", sampleIds: ["s1", "s2"] },
      ]);
      mockDatasetDbService.updateSplit.mockResolvedValue({});

      await service.deleteSample("dataset-1", "v1", "s1", "group-1");

      expect(mockDatasetDbService.updateSplit).toHaveBeenCalledWith("split-1", {
        sampleIds: ["s2"],
      });
    });
  });

  // -----------------------------------------------------------------------
  // Delete Version - additional branch coverage
  // -----------------------------------------------------------------------
  describe("deleteVersion - additional branches", () => {
    it("rejects when version has benchmark definitions", async () => {
      mockDatasetDbService.findDatasetVersionForDeletion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: "datasets/dataset-1/v1",
        benchmarkDefinitions: [{ id: "def-1", name: "Def 1" }],
      });

      await expect(service.deleteVersion("dataset-1", "v1")).rejects.toThrow(
        ConflictException,
      );
    });

    it("handles version with no storagePrefix", async () => {
      mockDatasetDbService.findDatasetVersionForDeletion.mockResolvedValue({
        id: "v1",
        datasetId: "dataset-1",
        storagePrefix: null,
        benchmarkDefinitions: [],
      });
      mockDatasetDbService.deleteManySplits.mockResolvedValue(undefined);
      mockDatasetDbService.deleteDatasetVersion.mockResolvedValue(undefined);

      await service.deleteVersion("dataset-1", "v1");

      // Should not try to delete storage
      expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Upload Files - additional branch coverage
  // -----------------------------------------------------------------------
  describe("uploadFilesToVersion - additional branches", () => {
    const mockVersion = {
      id: "version-1",
      datasetId: "dataset-1",
      version: "1.0.0",
      storagePrefix: null,
      manifestPath: "dataset-manifest.json",
      documentCount: 0,
      groundTruthSchema: null,
      createdAt: new Date(),
    };

    it("throws BadRequestException on NoSuchBucket error", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      (mockBlobStorage.write as jest.Mock).mockRejectedValueOnce(
        new Error("NoSuchBucket: bucket does not exist"),
      );

      await expect(
        service.uploadFilesToVersion(
          "dataset-1",
          "version-1",
          [
            {
              fieldname: "files",
              originalname: "test.pdf",
              encoding: "7bit",
              mimetype: "application/pdf",
              buffer: Buffer.from("data"),
              size: 4,
            },
          ],
          "actor-1",
          "group-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException on Failed to write blob error", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      (mockBlobStorage.write as jest.Mock).mockRejectedValueOnce(
        new Error("Failed to write blob: connection timeout"),
      );

      await expect(
        service.uploadFilesToVersion(
          "dataset-1",
          "version-1",
          [
            {
              fieldname: "files",
              originalname: "test.pdf",
              encoding: "7bit",
              mimetype: "application/pdf",
              buffer: Buffer.from("data"),
              size: 4,
            },
          ],
          "actor-1",
          "group-1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("deduplicates filenames in the same directory", async () => {
      mockDatasetDbService.findDataset.mockResolvedValue(mockDataset);
      mockDatasetDbService.findDatasetVersion.mockResolvedValue(mockVersion);

      const dupeFiles = [
        {
          fieldname: "files",
          originalname: "sample.pdf",
          encoding: "7bit",
          mimetype: "application/pdf",
          buffer: Buffer.from("pdf1"),
          size: 4,
        },
        {
          fieldname: "files",
          originalname: "sample.pdf",
          encoding: "7bit",
          mimetype: "application/pdf",
          buffer: Buffer.from("pdf2"),
          size: 4,
        },
      ];

      (mockBlobStorage.read as jest.Mock).mockRejectedValueOnce(
        new Error("Not found"),
      );
      mockDatasetDbService.updateDatasetVersion.mockResolvedValue({
        ...mockVersion,
        storagePrefix: "datasets/dataset-1/version-1",
        documentCount: 2,
      });

      const result = await service.uploadFilesToVersion(
        "dataset-1",
        "version-1",
        dupeFiles,
        "actor-1",
        "group-1",
      );

      const filenames = result.uploadedFiles.map(
        (f: { filename: string }) => f.filename,
      );
      expect(filenames).toContain("sample.pdf");
      expect(filenames).toContain("sample_2.pdf");
    });
  });
});
