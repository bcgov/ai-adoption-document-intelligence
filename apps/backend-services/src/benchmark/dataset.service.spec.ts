const mockMkdtemp = jest.fn();
const mockRm = jest.fn();
const mockFs = {
  mkdtemp: jest.fn(),
  rm: jest.fn(),
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
  benchmarkAuditLog: {
    create: jest.fn(),
  },
};

const mockDvcService = {
  cloneRepository: jest.fn(),
  initRepository: jest.fn(),
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
});
