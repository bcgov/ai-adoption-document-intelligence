import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import {
  CreateDatasetDto,
  DatasetResponseDto,
  CreateVersionDto,
  VersionResponseDto,
} from "./dto";

const mockDatasetService = {
  createDataset: jest.fn(),
  listDatasets: jest.fn(),
  getDatasetById: jest.fn(),
  createVersion: jest.fn(),
  publishVersion: jest.fn(),
  archiveVersion: jest.fn(),
  listVersions: jest.fn(),
  getVersionById: jest.fn(),
};

describe("DatasetController", () => {
  let controller: DatasetController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatasetController],
      providers: [{ provide: DatasetService, useValue: mockDatasetService }],
    }).compile();

    controller = module.get<DatasetController>(DatasetController);
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Create a new dataset
  // -----------------------------------------------------------------------
  describe("POST /api/benchmark/datasets", () => {
    const createDto: CreateDatasetDto = {
      name: "Test Dataset",
      description: "Test description",
      metadata: { domain: "invoices" },
      repositoryUrl: "https://github.com/user/dataset.git",
    };

    const mockRequest = {
      user: {
        sub: "user-123",
      },
    } as any;

    it("creates a dataset successfully", async () => {
      const mockResponse: DatasetResponseDto = {
        id: "dataset-123",
        name: createDto.name,
        description: createDto.description,
        metadata: createDto.metadata,
        repositoryUrl: createDto.repositoryUrl,
        dvcRemote: "minio",
        createdBy: "user-123",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDatasetService.createDataset.mockResolvedValue(mockResponse);

      const result = await controller.createDataset(createDto, mockRequest);

      expect(mockDatasetService.createDataset).toHaveBeenCalledWith(
        createDto,
        "user-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws BadRequestException when user ID is missing", async () => {
      const mockRequestNoUser = {
        user: undefined,
      } as any;

      await expect(
        controller.createDataset(createDto, mockRequestNoUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.createDataset(createDto, mockRequestNoUser),
      ).rejects.toThrow("User ID not found in request");
    });

    it("propagates validation errors from service", async () => {
      mockDatasetService.createDataset.mockRejectedValue(
        new BadRequestException("Dataset name is required"),
      );

      await expect(
        controller.createDataset({ ...createDto, name: "" }, mockRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 2: List datasets with pagination
  // -----------------------------------------------------------------------
  describe("GET /api/benchmark/datasets", () => {
    it("returns paginated datasets with default parameters", async () => {
      const mockResponse = {
        data: [
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
            versionCount: 2,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      mockDatasetService.listDatasets.mockResolvedValue(mockResponse);

      const result = await controller.listDatasets();

      expect(mockDatasetService.listDatasets).toHaveBeenCalledWith(1, 20);
      expect(result).toEqual(mockResponse);
    });

    it("returns paginated datasets with custom parameters", async () => {
      const mockResponse = {
        data: [],
        total: 100,
        page: 2,
        limit: 50,
        totalPages: 2,
      };

      mockDatasetService.listDatasets.mockResolvedValue(mockResponse);

      const result = await controller.listDatasets("2", "50");

      expect(mockDatasetService.listDatasets).toHaveBeenCalledWith(2, 50);
      expect(result).toEqual(mockResponse);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Get dataset details
  // -----------------------------------------------------------------------
  describe("GET /api/benchmark/datasets/:id", () => {
    it("returns dataset details with recent versions", async () => {
      const mockResponse: DatasetResponseDto = {
        id: "dataset-123",
        name: "Test Dataset",
        description: "Description",
        metadata: { domain: "invoices" },
        repositoryUrl: "https://github.com/user/dataset.git",
        dvcRemote: "minio",
        createdBy: "user-123",
        createdAt: new Date(),
        updatedAt: new Date(),
        versionCount: 2,
        recentVersions: [
          {
            id: "v1",
            version: "1.0.0",
            status: "published",
            documentCount: 100,
            createdAt: new Date(),
          },
        ],
      };

      mockDatasetService.getDatasetById.mockResolvedValue(mockResponse);

      const result = await controller.getDatasetById("dataset-123");

      expect(mockDatasetService.getDatasetById).toHaveBeenCalledWith(
        "dataset-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws NotFoundException when dataset not found", async () => {
      mockDatasetService.getDatasetById.mockRejectedValue(
        new NotFoundException("Dataset with ID nonexistent not found"),
      );

      await expect(controller.getDatasetById("nonexistent")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Version Management Tests
  // -----------------------------------------------------------------------
  describe("POST /api/benchmark/datasets/:id/versions", () => {
    const createDto: CreateVersionDto = {
      version: "1.0.0",
      groundTruthSchema: { type: "object" },
    };

    const mockRequest = {
      user: {
        sub: "user-123",
      },
    } as any;

    it("creates a version successfully", async () => {
      const mockResponse: VersionResponseDto = {
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

      mockDatasetService.createVersion.mockResolvedValue(mockResponse);

      const result = await controller.createVersion(
        "dataset-123",
        createDto,
        mockRequest,
      );

      expect(mockDatasetService.createVersion).toHaveBeenCalledWith(
        "dataset-123",
        createDto,
        "user-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws BadRequestException when user ID is missing", async () => {
      const mockRequestNoUser = {
        user: undefined,
      } as any;

      await expect(
        controller.createVersion("dataset-123", createDto, mockRequestNoUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("GET /api/benchmark/datasets/:id/versions", () => {
    it("returns list of versions", async () => {
      const mockResponse = {
        versions: [
          {
            id: "v1",
            version: "1.0.0",
            status: "published",
            documentCount: 100,
            gitRevision: "abc123",
            publishedAt: new Date(),
            createdAt: new Date(),
          },
        ],
      };

      mockDatasetService.listVersions.mockResolvedValue(mockResponse);

      const result = await controller.listVersions("dataset-123");

      expect(mockDatasetService.listVersions).toHaveBeenCalledWith(
        "dataset-123",
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe("GET /api/benchmark/datasets/:id/versions/:versionId", () => {
    it("returns version details", async () => {
      const mockResponse: VersionResponseDto = {
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
        splits: [],
      };

      mockDatasetService.getVersionById.mockResolvedValue(mockResponse);

      const result = await controller.getVersionById(
        "dataset-123",
        "version-123",
      );

      expect(mockDatasetService.getVersionById).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws NotFoundException when version not found", async () => {
      mockDatasetService.getVersionById.mockRejectedValue(
        new NotFoundException("Version not found"),
      );

      await expect(
        controller.getVersionById("dataset-123", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("PATCH /api/benchmark/datasets/:id/versions/:versionId/publish", () => {
    const mockRequest = {
      user: {
        sub: "user-123",
      },
    } as any;

    it("publishes a version successfully", async () => {
      const mockResponse: VersionResponseDto = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        gitRevision: "abc123",
        manifestPath: "manifest.json",
        documentCount: 100,
        groundTruthSchema: null,
        status: "published",
        publishedAt: new Date(),
        createdAt: new Date(),
      };

      mockDatasetService.publishVersion.mockResolvedValue(mockResponse);

      const result = await controller.publishVersion(
        "dataset-123",
        "version-123",
        mockRequest,
      );

      expect(mockDatasetService.publishVersion).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
        "user-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws BadRequestException when user ID is missing", async () => {
      const mockRequestNoUser = {
        user: undefined,
      } as any;

      await expect(
        controller.publishVersion(
          "dataset-123",
          "version-123",
          mockRequestNoUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("PATCH /api/benchmark/datasets/:id/versions/:versionId/archive", () => {
    it("archives a version successfully", async () => {
      const mockResponse: VersionResponseDto = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        gitRevision: "abc123",
        manifestPath: "manifest.json",
        documentCount: 100,
        groundTruthSchema: null,
        status: "archived",
        publishedAt: null,
        createdAt: new Date(),
      };

      mockDatasetService.archiveVersion.mockResolvedValue(mockResponse);

      const result = await controller.archiveVersion(
        "dataset-123",
        "version-123",
      );

      expect(mockDatasetService.archiveVersion).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
      );
      expect(result).toEqual(mockResponse);
    });
  });
});
