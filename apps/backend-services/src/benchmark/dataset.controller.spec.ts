import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import { CreateDatasetDto, DatasetResponseDto } from "./dto";

const mockDatasetService = {
  createDataset: jest.fn(),
  listDatasets: jest.fn(),
  getDatasetById: jest.fn(),
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
});
