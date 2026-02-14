const mockMkdtemp = jest.fn();
const mockRm = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReadFile = jest.fn();
const mockFs = {
  mkdtemp: jest.fn(),
  rm: jest.fn(),
  promises: {
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    readFile: mockReadFile,
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
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === "DATABASE_URL") return "postgresql://test:test@localhost:5432/test";
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

      const result = await service.getVersionById(
        "dataset-123",
        "version-123",
      );

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
      expect(result.uploadedFiles[1].path).toBe("ground-truth/sample-001_gt.json");
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
});
