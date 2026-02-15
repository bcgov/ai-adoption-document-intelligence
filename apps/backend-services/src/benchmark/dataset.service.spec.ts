const mockMkdtemp = jest.fn();
const mockRm = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockAccess = jest.fn();
const mockFs = {
  mkdtemp: jest.fn(),
  rm: jest.fn(),
  constants: {
    R_OK: 4,
  },
  promises: {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    readFile: mockReadFile,
    access: mockAccess,
  },
};

jest.mock("fs", () => mockFs);

jest.mock("util", () => ({
  ...jest.requireActual("util"),
  promisify: jest.fn((fn) => {
    if (fn === mockFs.mkdtemp) return mockMkdtemp;
    if (fn === mockFs.rm) return mockRm;
    return fn;
  }),
}));

import { AuditAction } from "@generated/client";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { DatasetService } from "./dataset.service";
import { DvcService } from "./dvc.service";

const mockPrismaClient = {
  dataset: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  datasetVersion: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  benchmarkAuditLog: {
    create: jest.fn(),
  },
};

const mockDvcService = {
  cloneRepository: jest.fn(),
  initRepository: jest.fn(),
  commitChanges: jest.fn(),
  checkout: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === "DATABASE_URL")
      return "postgresql://test:test@localhost:5432/test";
    return undefined;
  }),
};

jest.mock("@prisma/adapter-pg", () => ({
  PrismaPg: jest.fn(),
}));

jest.mock("@generated/client", () => {
  const actual = jest.requireActual("@generated/client");
  return {
    ...actual,
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

describe("DatasetService", () => {
  let service: DatasetService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatasetService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DvcService, useValue: mockDvcService },
      ],
    }).compile();

    service = module.get<DatasetService>(DatasetService);

    // Mock file system operations
    mockMkdtemp.mockResolvedValue("/tmp/dataset-init-test123");
    mockRm.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
    mockReadFile.mockRejectedValue(new Error("File not found")); // Default: no existing manifest
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create a new dataset
  // -----------------------------------------------------------------------
  describe("createDataset", () => {
    const createDto = {
      name: "Test Dataset",
      description: "Test description",
      metadata: { domain: "invoices" },
      repositoryUrl: "https://github.com/user/dataset.git",
    };

    const userId = "user-123";

    it("creates a dataset successfully with DVC initialization", async () => {
      const mockDataset = {
        id: "dataset-123",
        name: createDto.name,
        description: createDto.description,
        metadata: createDto.metadata,
        repositoryUrl: createDto.repositoryUrl,
        dvcRemote: "minio",
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.dataset.create.mockResolvedValue(mockDataset);
      mockPrismaClient.benchmarkAuditLog.create.mockResolvedValue({});
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.initRepository.mockResolvedValue(undefined);

      const result = await service.createDataset(createDto, userId);

      expect(mockMkdtemp).toHaveBeenCalled();
      expect(mockDvcService.cloneRepository).toHaveBeenCalledWith(
        createDto.repositoryUrl,
        "/tmp/dataset-init-test123",
      );
      expect(mockDvcService.initRepository).toHaveBeenCalledWith(
        "/tmp/dataset-init-test123",
      );
      expect(mockPrismaClient.dataset.create).toHaveBeenCalledWith({
        data: {
          name: createDto.name,
          description: createDto.description,
          metadata: createDto.metadata,
          repositoryUrl: createDto.repositoryUrl,
          dvcRemote: "minio",
          createdBy: userId,
        },
      });
      expect(mockPrismaClient.benchmarkAuditLog.create).toHaveBeenCalledWith({
        data: {
          userId: userId,
          action: AuditAction.dataset_created,
          entityType: "Dataset",
          entityId: mockDataset.id,
          metadata: {
            name: mockDataset.name,
            repositoryUrl: mockDataset.repositoryUrl,
          },
        },
      });
      expect(mockRm).toHaveBeenCalledWith(
        "/tmp/dataset-init-test123",
        expect.objectContaining({ recursive: true, force: true }),
      );
      expect(result.id).toBe(mockDataset.id);
      expect(result.name).toBe(createDto.name);
    });

    it("throws BadRequestException when name is missing", async () => {
      const invalidDto = { ...createDto, name: "" };

      await expect(service.createDataset(invalidDto, userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createDataset(invalidDto, userId)).rejects.toThrow(
        "Dataset name is required",
      );
    });

    it("throws BadRequestException when repositoryUrl is missing", async () => {
      const invalidDto = { ...createDto, repositoryUrl: "" };

      await expect(service.createDataset(invalidDto, userId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createDataset(invalidDto, userId)).rejects.toThrow(
        "Repository URL is required",
      );
    });

    it("cleans up temp directory even when DVC initialization fails", async () => {
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.initRepository.mockRejectedValue(
        new Error("DVC init failed"),
      );

      await expect(service.createDataset(createDto, userId)).rejects.toThrow(
        "DVC init failed",
      );

      expect(mockRm).toHaveBeenCalledWith(
        "/tmp/dataset-init-test123",
        expect.objectContaining({ recursive: true, force: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: List datasets with pagination
  // -----------------------------------------------------------------------
  describe("listDatasets", () => {
    it("returns paginated datasets", async () => {
      const mockDatasets = [
        {
          id: "dataset-1",
          name: "Dataset 1",
          description: "Description 1",
          metadata: {},
          repositoryUrl: "https://github.com/user/dataset1.git",
          dvcRemote: "minio",
          createdBy: "user-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [{ id: "v1" }, { id: "v2" }],
        },
        {
          id: "dataset-2",
          name: "Dataset 2",
          description: null,
          metadata: {},
          repositoryUrl: "https://github.com/user/dataset2.git",
          dvcRemote: "minio",
          createdBy: "user-2",
          createdAt: new Date(),
          updatedAt: new Date(),
          versions: [{ id: "v1" }],
        },
      ];

      mockPrismaClient.dataset.count.mockResolvedValue(2);
      mockPrismaClient.dataset.findMany.mockResolvedValue(mockDatasets);

      const result = await service.listDatasets(1, 20);

      expect(mockPrismaClient.dataset.count).toHaveBeenCalled();
      expect(mockPrismaClient.dataset.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          versions: {
            select: { id: true },
          },
        },
      });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].versionCount).toBe(2);
      expect(result.data[1].versionCount).toBe(1);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
    });

    it("validates and corrects pagination parameters", async () => {
      mockPrismaClient.dataset.count.mockResolvedValue(0);
      mockPrismaClient.dataset.findMany.mockResolvedValue([]);

      // Test with page 0 (should be corrected to 1)
      await service.listDatasets(0, 20);
      expect(mockPrismaClient.dataset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0 }),
      );

      // Test with limit > 100 (should be capped at 100)
      await service.listDatasets(1, 200);
      expect(mockPrismaClient.dataset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Get dataset details
  // -----------------------------------------------------------------------
  describe("getDatasetById", () => {
    it("returns dataset with recent versions", async () => {
      const mockDataset = {
        id: "dataset-123",
        name: "Test Dataset",
        description: "Description",
        metadata: { domain: "invoices" },
        repositoryUrl: "https://github.com/user/dataset.git",
        dvcRemote: "minio",
        createdBy: "user-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [
          {
            id: "v1",
            version: "1.0.0",
            status: "published",
            documentCount: 100,
            createdAt: new Date(),
          },
          {
            id: "v2",
            version: "1.1.0",
            status: "draft",
            documentCount: 120,
            createdAt: new Date(),
          },
        ],
      };

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);

      const result = await service.getDatasetById("dataset-123");

      expect(mockPrismaClient.dataset.findUnique).toHaveBeenCalledWith({
        where: { id: "dataset-123" },
        include: {
          versions: {
            select: {
              id: true,
              version: true,
              status: true,
              documentCount: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      });
      expect(result.id).toBe(mockDataset.id);
      expect(result.versionCount).toBe(2);
      expect(result.recentVersions).toHaveLength(2);
    });

    it("throws NotFoundException when dataset not found", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(service.getDatasetById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getDatasetById("nonexistent")).rejects.toThrow(
        "Dataset with ID nonexistent not found",
      );
    });
  });

  // -----------------------------------------------------------------------
  // Version Management Tests
  // -----------------------------------------------------------------------
  describe("createVersion", () => {
    const createDto = {
      version: "1.0.0",
      groundTruthSchema: { type: "object" },
      manifestPath: "manifest.json",
    };

    const userId = "user-123";

    it("creates a version successfully with DVC workflow", async () => {
      const mockDataset = {
        id: "dataset-123",
        repositoryUrl: "https://github.com/user/dataset.git",
      };

      const mockVersion = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        gitRevision: "abc123",
        manifestPath: "manifest.json",
        documentCount: 0,
        groundTruthSchema: { type: "object" },
        status: "draft",
        publishedAt: null,
        createdAt: new Date(),
      };

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.create.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.commitChanges.mockResolvedValue("abc123");

      const result = await service.createVersion(
        "dataset-123",
        createDto,
        userId,
      );

      expect(mockDvcService.cloneRepository).toHaveBeenCalled();
      expect(mockDvcService.commitChanges).toHaveBeenCalled();
      expect(mockPrismaClient.datasetVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          datasetId: "dataset-123",
          version: "1.0.0",
          gitRevision: "abc123",
          status: "draft",
        }),
      });
      expect(result.id).toBe(mockVersion.id);
      expect(result.status).toBe("draft");
    });

    it("throws NotFoundException when dataset not found", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(
        service.createVersion("nonexistent", createDto, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("publishVersion", () => {
    const userId = "user-123";

    it("publishes a draft version successfully", async () => {
      const mockVersion = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        status: "draft",
        gitRevision: "abc123",
      };

      const mockPublishedVersion = {
        ...mockVersion,
        status: "published",
        publishedAt: new Date(),
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockPrismaClient.datasetVersion.update.mockResolvedValue(
        mockPublishedVersion,
      );
      mockPrismaClient.benchmarkAuditLog.create.mockResolvedValue({});

      const result = await service.publishVersion(
        "dataset-123",
        "version-123",
        userId,
      );

      expect(mockPrismaClient.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "version-123" },
        data: {
          status: "published",
          publishedAt: expect.any(Date),
        },
      });
      expect(mockPrismaClient.benchmarkAuditLog.create).toHaveBeenCalled();
      expect(result.status).toBe("published");
    });

    it("throws BadRequestException when version is already published", async () => {
      const mockVersion = {
        id: "version-123",
        status: "published",
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);

      await expect(
        service.publishVersion("dataset-123", "version-123", userId),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.publishVersion("dataset-123", "version-123", userId),
      ).rejects.toThrow("already published");
    });

    it("throws NotFoundException when version not found", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.publishVersion("dataset-123", "nonexistent", userId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("archiveVersion", () => {
    it("archives a version successfully", async () => {
      const mockVersion = {
        id: "version-123",
        datasetId: "dataset-123",
        status: "published",
      };

      const mockArchivedVersion = {
        ...mockVersion,
        status: "archived",
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockPrismaClient.datasetVersion.update.mockResolvedValue(
        mockArchivedVersion,
      );

      const result = await service.archiveVersion("dataset-123", "version-123");

      expect(mockPrismaClient.datasetVersion.update).toHaveBeenCalledWith({
        where: { id: "version-123" },
        data: {
          status: "archived",
        },
      });
      expect(result.status).toBe("archived");
    });

    it("throws NotFoundException when version not found", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.archiveVersion("dataset-123", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("listVersions", () => {
    it("returns list of versions for a dataset", async () => {
      const mockDataset = { id: "dataset-123" };
      const mockVersions = [
        {
          id: "v1",
          version: "1.0.0",
          status: "published",
          documentCount: 100,
          gitRevision: "abc123",
          publishedAt: new Date(),
          createdAt: new Date(),
        },
        {
          id: "v2",
          version: "1.1.0",
          status: "draft",
          documentCount: 120,
          gitRevision: "def456",
          publishedAt: null,
          createdAt: new Date(),
        },
      ];

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockPrismaClient.datasetVersion.findMany.mockResolvedValue(mockVersions);

      const result = await service.listVersions("dataset-123");

      expect(mockPrismaClient.datasetVersion.findMany).toHaveBeenCalledWith({
        where: { datasetId: "dataset-123" },
        orderBy: { createdAt: "desc" },
      });
      expect(result.versions).toHaveLength(2);
      expect(result.versions[0].version).toBe("1.0.0");
    });

    it("throws NotFoundException when dataset not found", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(service.listVersions("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getVersionById", () => {
    it("returns version details with splits", async () => {
      const mockVersion = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        gitRevision: "abc123",
        manifestPath: "manifest.json",
        documentCount: 100,
        groundTruthSchema: { type: "object" },
        status: "published",
        publishedAt: new Date(),
        createdAt: new Date(),
        splits: [
          {
            id: "split-1",
            name: "test",
            type: "test",
            sampleIds: ["s1", "s2", "s3"],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);

      const result = await service.getVersionById("dataset-123", "version-123");

      expect(mockPrismaClient.datasetVersion.findFirst).toHaveBeenCalledWith({
        where: {
          id: "version-123",
          datasetId: "dataset-123",
        },
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
      expect(result.id).toBe(mockVersion.id);
      expect(result.splits).toHaveLength(1);
      expect(result.splits[0].sampleCount).toBe(3);
    });

    it("throws NotFoundException when version not found", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.getVersionById("dataset-123", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // File Upload Tests
  // -----------------------------------------------------------------------
  describe("uploadFiles", () => {
    const mockFiles: any[] = [
      {
        fieldname: "files",
        originalname: "sample-001.jpg",
        encoding: "7bit",
        mimetype: "image/jpeg",
        buffer: Buffer.from("fake image data"),
        size: 1024,
      },
      {
        fieldname: "files",
        originalname: "sample-001_gt.json",
        encoding: "7bit",
        mimetype: "application/json",
        buffer: Buffer.from('{"field": "value"}'),
        size: 256,
      },
    ];

    it("uploads files successfully and updates manifest", async () => {
      const mockDataset = {
        id: "dataset-123",
        repositoryUrl: "https://github.com/user/dataset.git",
      };

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);

      const result = await service.uploadFiles("dataset-123", mockFiles);

      expect(mockDvcService.cloneRepository).toHaveBeenCalled();
      expect(mockMkdir).toHaveBeenCalledTimes(2); // inputs and ground-truth dirs
      expect(mockWriteFile).toHaveBeenCalledTimes(3); // 2 files + 1 manifest
      expect(result.datasetId).toBe("dataset-123");
      expect(result.uploadedFiles).toHaveLength(2);
      expect(result.manifestUpdated).toBe(true);
      expect(result.totalFiles).toBe(2);
      expect(result.uploadedFiles[0].path).toBe("inputs/sample-001.jpg");
      expect(result.uploadedFiles[1].path).toBe(
        "ground-truth/sample-001_gt.json",
      );
    });

    it("groups files by sample ID in manifest", async () => {
      const mockDataset = {
        id: "dataset-123",
        repositoryUrl: "https://github.com/user/dataset.git",
      };

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);

      await service.uploadFiles("dataset-123", mockFiles);

      // Verify manifest was written with grouped samples
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining("dataset-manifest.json"),
        expect.stringContaining("sample-001"),
      );
    });

    it("throws NotFoundException when dataset not found", async () => {
      mockPrismaClient.dataset.findUnique.mockResolvedValue(null);

      await expect(
        service.uploadFiles("nonexistent", mockFiles),
      ).rejects.toThrow(NotFoundException);
    });

    it("categorizes input and ground truth files correctly", async () => {
      const mixedFiles: any[] = [
        {
          fieldname: "files",
          originalname: "doc.pdf",
          mimetype: "application/pdf",
          buffer: Buffer.from("pdf data"),
          size: 2048,
        },
        {
          fieldname: "files",
          originalname: "data.csv",
          mimetype: "text/csv",
          buffer: Buffer.from("csv data"),
          size: 512,
        },
      ];

      const mockDataset = {
        id: "dataset-123",
        repositoryUrl: "https://github.com/user/dataset.git",
      };

      mockPrismaClient.dataset.findUnique.mockResolvedValue(mockDataset);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);

      const result = await service.uploadFiles("dataset-123", mixedFiles);

      const inputFile = result.uploadedFiles.find((f) =>
        f.path.startsWith("inputs/"),
      );
      const gtFile = result.uploadedFiles.find((f) =>
        f.path.startsWith("ground-truth/"),
      );

      expect(inputFile).toBeDefined();
      expect(gtFile).toBeDefined();
      expect(inputFile.filename).toBe("doc.pdf");
      expect(gtFile.filename).toBe("data.csv");
    });
  });

  // -----------------------------------------------------------------------
  // Scenario: List samples with pagination (US-009)
  // -----------------------------------------------------------------------
  describe("listSamples", () => {
    const datasetId = "dataset-123";
    const versionId = "version-123";

    const mockVersion = {
      id: versionId,
      datasetId: datasetId,
      version: "v1.0.0",
      gitRevision: "abc123",
      manifestPath: "dataset-manifest.json",
      documentCount: 100,
      groundTruthSchema: null,
      status: "published",
      publishedAt: new Date(),
      createdAt: new Date(),
      dataset: {
        id: datasetId,
        repositoryUrl: "https://github.com/user/dataset.git",
      },
    };

    const validManifest = {
      schemaVersion: "1.0",
      samples: [
        {
          id: "sample-001",
          inputs: [{ path: "inputs/form_0.jpg", mimeType: "image/jpeg" }],
          groundTruth: [{ path: "ground-truth/form_0.json", format: "json" }],
          metadata: {
            docType: "income-declaration",
            pageCount: 1,
            language: "en",
            source: "synthetic",
          },
        },
        {
          id: "sample-002",
          inputs: [{ path: "inputs/form_1.jpg", mimeType: "image/jpeg" }],
          groundTruth: [{ path: "ground-truth/form_1.json", format: "json" }],
          metadata: {
            docType: "income-declaration",
            pageCount: 2,
            language: "en",
            source: "synthetic",
          },
        },
        {
          id: "sample-003",
          inputs: [{ path: "inputs/form_2.jpg", mimeType: "image/jpeg" }],
          groundTruth: [{ path: "ground-truth/form_2.json", format: "json" }],
          metadata: {
            docType: "tax-form",
            pageCount: 1,
            language: "fr",
            source: "real",
          },
        },
      ],
    };

    it("returns paginated samples from manifest successfully", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 1, 2);

      expect(mockPrismaClient.datasetVersion.findFirst).toHaveBeenCalledWith({
        where: {
          id: versionId,
          datasetId: datasetId,
        },
        include: {
          dataset: true,
        },
      });
      expect(mockDvcService.cloneRepository).toHaveBeenCalled();
      expect(mockDvcService.checkout).toHaveBeenCalledWith(
        "/tmp/dataset-init-test123",
        "abc123",
      );
      expect(mockReadFile).toHaveBeenCalled();
      expect(result.samples).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.totalPages).toBe(2);
      expect(result.samples[0].id).toBe("sample-001");
      expect(result.samples[1].id).toBe("sample-002");
    });

    it("returns second page of samples correctly", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 2, 2);

      expect(result.samples).toHaveLength(1);
      expect(result.samples[0].id).toBe("sample-003");
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(2);
    });

    it("includes input file references with path and mimeType", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 1, 1);

      expect(result.samples[0].inputs).toHaveLength(1);
      expect(result.samples[0].inputs[0].path).toBe("inputs/form_0.jpg");
      expect(result.samples[0].inputs[0].mimeType).toBe("image/jpeg");
    });

    it("includes ground truth file references with path and format", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 1, 1);

      expect(result.samples[0].groundTruth).toHaveLength(1);
      expect(result.samples[0].groundTruth[0].path).toBe(
        "ground-truth/form_0.json",
      );
      expect(result.samples[0].groundTruth[0].format).toBe("json");
    });

    it("includes sample metadata", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 1, 1);

      expect(result.samples[0].metadata).toBeDefined();
      expect(result.samples[0].metadata.docType).toBe("income-declaration");
      expect(result.samples[0].metadata.pageCount).toBe(1);
      expect(result.samples[0].metadata.language).toBe("en");
      expect(result.samples[0].metadata.source).toBe("synthetic");
    });

    it("throws NotFoundException when version not found", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    });

    it("throws BadRequestException when manifest has invalid schema - missing schemaVersion", async () => {
      const invalidManifest = {
        samples: [],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: schemaVersion is required and must be a string",
      );
    });

    it("throws BadRequestException when manifest has invalid schema - samples not array", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: "not an array",
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow("Invalid manifest: samples must be an array");
    });

    it("throws BadRequestException when sample is missing id", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            inputs: [],
            groundTruth: [],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample at index 0 must have an 'id' field of type string",
      );
    });

    it("throws BadRequestException when sample is missing inputs array", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            groundTruth: [],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001' must have an 'inputs' array",
      );
    });

    it("throws BadRequestException when input file is missing path", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            inputs: [{ mimeType: "image/jpeg" }],
            groundTruth: [],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001', input at index 0 must have a 'path' field of type string",
      );
    });

    it("throws BadRequestException when input file is missing mimeType", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            inputs: [{ path: "inputs/form.jpg" }],
            groundTruth: [],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001', input at index 0 must have a 'mimeType' field of type string",
      );
    });

    it("throws BadRequestException when sample is missing groundTruth array", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            inputs: [],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001' must have a 'groundTruth' array",
      );
    });

    it("throws BadRequestException when groundTruth file is missing path", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            inputs: [],
            groundTruth: [{ format: "json" }],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001', groundTruth at index 0 must have a 'path' field of type string",
      );
    });

    it("throws BadRequestException when groundTruth file is missing format", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            inputs: [],
            groundTruth: [{ path: "ground-truth/form.json" }],
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001', groundTruth at index 0 must have a 'format' field of type string",
      );
    });

    it("throws BadRequestException when metadata is not an object", async () => {
      const invalidManifest = {
        schemaVersion: "1.0",
        samples: [
          {
            id: "sample-001",
            inputs: [],
            groundTruth: [],
            metadata: "not an object",
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(invalidManifest));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(
        "Invalid manifest: sample 'sample-001' metadata must be an object",
      );
    });

    it("throws NotFoundException when manifest file does not exist", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      const enoentError: NodeJS.ErrnoException = new Error("File not found");
      enoentError.code = "ENOENT";
      mockReadFile.mockRejectedValue(enoentError);

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow("Manifest file not found in repository");
    });

    it("throws BadRequestException when manifest is malformed JSON", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue("{ invalid json");

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow("Invalid manifest: malformed JSON");
    });

    it("caps limit at 100 items per page", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 1, 200);

      expect(result.limit).toBe(100);
    });

    it("validates page number (minimum 1)", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue(JSON.stringify(validManifest));

      const result = await service.listSamples(datasetId, versionId, 0, 20);

      expect(result.page).toBe(1);
    });

    it("cleans up temp directory even when error occurs", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockReadFile.mockRejectedValue(new Error("Read failed"));

      await expect(
        service.listSamples(datasetId, versionId, 1, 20),
      ).rejects.toThrow();

      expect(mockRm).toHaveBeenCalledWith(
        "/tmp/dataset-init-test123",
        expect.objectContaining({ recursive: true, force: true }),
      );
    });
  });

  describe("validateDatasetVersion", () => {
    const datasetId = "dataset-123";
    const versionId = "version-456";

    const mockDataset = {
      id: datasetId,
      repositoryUrl: "git@example.com:dataset-repo.git",
      dvcRemote: "minio",
    };

    const mockVersion = {
      id: versionId,
      datasetId: datasetId,
      version: "1.0.0",
      gitRevision: "abc123",
      manifestPath: "dataset-manifest.json",
      documentCount: 3,
      groundTruthSchema: null,
      status: "draft",
      dataset: mockDataset,
    };

    const validManifest = {
      schemaVersion: "1.0",
      samples: [
        {
          id: "sample-001",
          inputs: [{ path: "inputs/doc1.jpg", mimeType: "image/jpeg" }],
          groundTruth: [{ path: "ground-truth/doc1.json", format: "json" }],
          metadata: { docType: "invoice" },
        },
        {
          id: "sample-002",
          inputs: [{ path: "inputs/doc2.jpg", mimeType: "image/jpeg" }],
          groundTruth: [{ path: "ground-truth/doc2.json", format: "json" }],
          metadata: { docType: "receipt" },
        },
        {
          id: "sample-003",
          inputs: [{ path: "inputs/doc3.jpg", mimeType: "image/jpeg" }],
          groundTruth: [{ path: "ground-truth/doc3.json", format: "json" }],
          metadata: { docType: "invoice" },
        },
      ],
    };

    beforeEach(() => {
      mockAccess.mockResolvedValue(undefined);
    });

    it("validates a dataset version with no issues", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);

      // Mock manifest file read
      let readCount = 0;
      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(validManifest));
        }
        // Mock ground truth files with unique content
        if (path.includes("ground-truth")) {
          readCount++;
          return Promise.resolve(
            JSON.stringify({ field1: `value-${readCount}` }),
          );
        }
        // Mock input image files (JPEG magic bytes)
        if (path.includes("inputs")) {
          const jpegHeader = Buffer.from([
            0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
          ]);
          return Promise.resolve(jpegHeader);
        }
        return Promise.reject(new Error("File not found"));
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        {},
      );

      expect(result.valid).toBe(true);
      expect(result.sampled).toBe(false);
      expect(result.totalSamples).toBe(3);
      expect(result.issueCount.schemaViolations).toBe(0);
      expect(result.issueCount.missingGroundTruth).toBe(0);
      expect(result.issueCount.duplicates).toBe(0);
      expect(result.issueCount.corruption).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it("detects missing ground truth", async () => {
      const manifestWithMissing = {
        ...validManifest,
        samples: [
          {
            id: "sample-001",
            inputs: [{ path: "inputs/doc1.jpg", mimeType: "image/jpeg" }],
            groundTruth: [],
            metadata: { docType: "invoice" },
          },
        ],
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);
      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(manifestWithMissing));
        }
        return Promise.reject(new Error("File not found"));
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.missingGroundTruth).toBe(1);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].category).toBe("missing_ground_truth");
      expect(result.issues[0].sampleId).toBe("sample-001");
    });

    it("detects file corruption (unreadable files)", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);
      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(validManifest));
        }
        return Promise.resolve(JSON.stringify({ field1: "value" }));
      });

      // Mock access failure for ground truth file
      mockAccess.mockImplementation((path: string) => {
        if (path.includes("ground-truth/doc1.json")) {
          return Promise.reject(new Error("File not found"));
        }
        return Promise.resolve(undefined);
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.corruption).toBeGreaterThan(0);
      const corruptionIssue = result.issues.find(
        (i) =>
          i.category === "corruption" &&
          i.filePath === "ground-truth/doc1.json",
      );
      expect(corruptionIssue).toBeDefined();
    });

    it("detects duplicate ground truth content", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);

      // All ground truth files have identical content
      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(validManifest));
        }
        if (path.includes("ground-truth")) {
          return Promise.resolve(JSON.stringify({ field1: "same-value" }));
        }
        if (path.includes("inputs")) {
          const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
          return Promise.resolve(jpegHeader);
        }
        return Promise.reject(new Error("File not found"));
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.duplicates).toBeGreaterThan(0);
      const duplicateIssue = result.issues.find(
        (i) => i.category === "duplicate",
      );
      expect(duplicateIssue).toBeDefined();
      expect(duplicateIssue?.details?.duplicateSampleIds).toHaveLength(3);
    });

    it("validates JSON schema when groundTruthSchema is provided", async () => {
      const schema = {
        type: "object",
        properties: {
          field1: { type: "string" },
          field2: { type: "number" },
        },
        required: ["field1", "field2"],
      };

      const versionWithSchema = {
        ...mockVersion,
        groundTruthSchema: schema,
      };

      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(
        versionWithSchema,
      );
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);

      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(validManifest));
        }
        if (path.includes("ground-truth")) {
          // Missing required field2
          return Promise.resolve(JSON.stringify({ field1: "value" }));
        }
        if (path.includes("inputs")) {
          const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
          return Promise.resolve(jpegHeader);
        }
        return Promise.reject(new Error("File not found"));
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.schemaViolations).toBeGreaterThan(0);
      const schemaIssue = result.issues.find(
        (i) => i.category === "schema_violation",
      );
      expect(schemaIssue).toBeDefined();
    });

    it("supports sampling validation with sampleSize parameter", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);

      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(validManifest));
        }
        if (path.includes("ground-truth")) {
          return Promise.resolve(JSON.stringify({ field1: "value" }));
        }
        if (path.includes("inputs")) {
          const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
          return Promise.resolve(jpegHeader);
        }
        return Promise.reject(new Error("File not found"));
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        { sampleSize: 2 },
      );

      expect(result.sampled).toBe(true);
      expect(result.sampleSize).toBe(2);
      expect(result.totalSamples).toBe(3);
    });

    it("validates image file headers", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockResolvedValue(undefined);
      mockDvcService.checkout.mockResolvedValue(undefined);

      mockReadFile.mockImplementation((path: string) => {
        if (path.endsWith("dataset-manifest.json")) {
          return Promise.resolve(JSON.stringify(validManifest));
        }
        if (path.includes("ground-truth")) {
          return Promise.resolve(JSON.stringify({ field1: "value" }));
        }
        if (path.includes("inputs")) {
          // Invalid JPEG header
          const invalidHeader = Buffer.from([0x00, 0x00, 0x00, 0x00]);
          return Promise.resolve(invalidHeader);
        }
        return Promise.reject(new Error("File not found"));
      });

      const result = await service.validateDatasetVersion(
        datasetId,
        versionId,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.issueCount.corruption).toBeGreaterThan(0);
      const corruptionIssue = result.issues.find(
        (i) =>
          i.category === "corruption" &&
          i.message.includes("Invalid image file header"),
      );
      expect(corruptionIssue).toBeDefined();
    });

    it("throws NotFoundException when version not found", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.validateDatasetVersion(datasetId, versionId, {}),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.validateDatasetVersion(datasetId, versionId, {}),
      ).rejects.toThrow(
        `Version with ID ${versionId} not found for dataset ${datasetId}`,
      );
    });

    it("cleans up temp directory even when error occurs", async () => {
      mockPrismaClient.datasetVersion.findFirst.mockResolvedValue(mockVersion);
      mockDvcService.cloneRepository.mockRejectedValue(
        new Error("Clone failed"),
      );

      await expect(
        service.validateDatasetVersion(datasetId, versionId, {}),
      ).rejects.toThrow("Clone failed");

      expect(mockRm).toHaveBeenCalledWith(
        "/tmp/dataset-init-test123",
        expect.objectContaining({ recursive: true, force: true }),
      );
    });
  });
});
