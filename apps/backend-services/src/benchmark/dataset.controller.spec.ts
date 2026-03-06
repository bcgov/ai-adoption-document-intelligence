jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockResolvedValue(undefined),
  getIdentityGroupIds: jest.fn().mockResolvedValue(["test-group"]),
}));

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DatabaseService } from "@/database/database.service";
import { DatasetController } from "./dataset.controller";
import { DatasetService } from "./dataset.service";
import {
  CreateDatasetDto,
  CreateVersionDto,
  DatasetResponseDto,
  VersionResponseDto,
} from "./dto";

const mockDatasetService = {
  createDataset: jest.fn(),
  listDatasets: jest.fn(),
  getDatasetById: jest.fn(),
  uploadFilesToVersion: jest.fn(),
  createVersion: jest.fn(),
  listVersions: jest.fn(),
  getVersionById: jest.fn(),
  deleteVersion: jest.fn(),
  deleteSample: jest.fn(),
  updateVersionName: jest.fn(),
};

const mockDatabaseService = {
  isUserSystemAdmin: jest.fn().mockResolvedValue(false),
  getUsersGroups: jest.fn().mockResolvedValue([{ group_id: 'test-group' }]),
  isUserInGroup: jest.fn().mockResolvedValue(true),
};

describe("DatasetController", () => {
  let controller: DatasetController;

  const mockReq = {
    user: { sub: "user-123" },
    resolvedIdentity: { userId: "user-123" },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatasetController],
      providers: [
        { provide: DatasetService, useValue: mockDatasetService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
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
      groupId: "test-group",
    };

    it("creates a dataset successfully", async () => {
      const mockResponse: DatasetResponseDto = {
        id: "dataset-123",
        name: createDto.name,
        description: createDto.description,
        metadata: createDto.metadata,
        storagePath: "datasets/dataset-123",
        createdBy: "user-123",
        groupId: "test-group",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDatasetService.createDataset.mockResolvedValue(mockResponse);

      const result = await controller.createDataset(createDto, mockReq);

      expect(mockDatasetService.createDataset).toHaveBeenCalledWith(
        createDto,
        "user-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("uses anonymous user ID when user ID is missing", async () => {
      const mockRequestNoUser = {
        user: undefined,
        resolvedIdentity: { userId: undefined },
      } as unknown as Request;

      await controller.createDataset(createDto, mockRequestNoUser);

      expect(mockDatasetService.createDataset).toHaveBeenCalledWith(
        createDto,
        "anonymous",
      );
    });

    it("propagates validation errors from service", async () => {
      mockDatasetService.createDataset.mockRejectedValue(
        new BadRequestException("Dataset name is required"),
      );

      await expect(
        controller.createDataset({ ...createDto, name: "" }, mockReq),
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
            storagePath: "datasets/dataset-1",
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

      const result = await controller.listDatasets(undefined, undefined, undefined, mockReq);

      expect(mockDatasetService.listDatasets).toHaveBeenCalledWith(1, 20, ["test-group"]);
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

      const result = await controller.listDatasets("2", "50", undefined, mockReq);

      expect(mockDatasetService.listDatasets).toHaveBeenCalledWith(2, 50, ["test-group"]);
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
        storagePath: "datasets/dataset-123",
        createdBy: "user-123",
        groupId: "test-group",
        createdAt: new Date(),
        updatedAt: new Date(),
        versionCount: 2,
        recentVersions: [
          {
            id: "v1",
            version: "1.0.0",
            documentCount: 100,
            createdAt: new Date(),
          },
        ],
      };

      mockDatasetService.getDatasetById.mockResolvedValue(mockResponse);

      const result = await controller.getDatasetById("dataset-123", mockReq);

      expect(mockDatasetService.getDatasetById).toHaveBeenCalledWith(
        "dataset-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws NotFoundException when dataset not found", async () => {
      mockDatasetService.getDatasetById.mockRejectedValue(
        new NotFoundException("Dataset with ID nonexistent not found"),
      );

      await expect(controller.getDatasetById("nonexistent", mockReq)).rejects.toThrow(
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

    it("creates a version successfully", async () => {
      const mockResponse: VersionResponseDto = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        name: null,
        storagePrefix: "datasets/dataset-123/version-123/",
        manifestPath: "manifest.json",
        documentCount: 0,
        groundTruthSchema: { type: "object" },
        frozen: false,
        createdAt: new Date(),
      };

      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });
      mockDatasetService.createVersion.mockResolvedValue(mockResponse);

      const result = await controller.createVersion(
        "dataset-123",
        createDto,
        mockReq,
      );

      expect(mockDatasetService.createVersion).toHaveBeenCalledWith(
        "dataset-123",
        createDto,
        "user-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("uses anonymous user ID when user ID is missing", async () => {
      const mockRequestNoUser = {
        user: undefined,
        resolvedIdentity: { userId: undefined },
      } as unknown as Request;

      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });

      await controller.createVersion("dataset-123", createDto, mockRequestNoUser);

      expect(mockDatasetService.createVersion).toHaveBeenCalledWith(
        "dataset-123",
        createDto,
        "anonymous",
      );
    });
  });

  describe("GET /api/benchmark/datasets/:id/versions", () => {
    it("returns list of versions", async () => {
      const mockResponse = {
        versions: [
          {
            id: "v1",
            version: "1.0.0",
            documentCount: 100,
            storagePrefix: "datasets/dataset-123/version-123/",
            createdAt: new Date(),
          },
        ],
      };

      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });
      mockDatasetService.listVersions.mockResolvedValue(mockResponse);

      const result = await controller.listVersions("dataset-123", mockReq);

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
        name: null,
        storagePrefix: "datasets/dataset-123/version-123/",
        manifestPath: "manifest.json",
        documentCount: 100,
        groundTruthSchema: { type: "object" },
        frozen: false,
        createdAt: new Date(),
        splits: [],
      };

      mockDatasetService.getVersionById.mockResolvedValue(mockResponse);

      const result = await controller.getVersionById(
        "dataset-123",
        "version-123",
        mockReq,
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
        controller.getVersionById("dataset-123", "nonexistent", mockReq),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("POST /api/benchmark/datasets/:id/versions/:versionId/upload", () => {
    const mockFiles: Array<{
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    }> = [
      {
        fieldname: "files",
        originalname: "test.jpg",
        encoding: "7bit",
        mimetype: "image/jpeg",
        buffer: Buffer.from("image data"),
        size: 1024,
      },
    ];

    it("uploads files to a version successfully", async () => {
      const mockResponse = {
        datasetId: "dataset-123",
        uploadedFiles: [
          {
            filename: "test.jpg",
            path: "inputs/test.jpg",
            size: 1024,
            mimeType: "image/jpeg",
          },
        ],
        manifestUpdated: true,
        totalFiles: 1,
      };

      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });
      mockDatasetService.uploadFilesToVersion.mockResolvedValue(mockResponse);

      const result = await controller.uploadFilesToVersion(
        "dataset-123",
        "version-123",
        mockFiles,
        mockReq,
      );

      expect(mockDatasetService.uploadFilesToVersion).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
        mockFiles,
        "user-123",
      );
      expect(result).toEqual(mockResponse);
    });

    it("throws BadRequestException when no files provided", async () => {
      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });

      await expect(
        controller.uploadFilesToVersion("dataset-123", "version-123", [], mockReq),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.uploadFilesToVersion("dataset-123", "version-123", [], mockReq),
      ).rejects.toThrow("No files provided for upload");
    });

    it("throws BadRequestException when files is undefined", async () => {
      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });

      await expect(
        controller.uploadFilesToVersion("dataset-123", "version-123", undefined as never, mockReq),
      ).rejects.toThrow(BadRequestException);
    });

    it("uses anonymous user ID when user ID is missing", async () => {
      const mockRequestNoUser = { user: undefined, resolvedIdentity: { userId: undefined } } as unknown as Request;
      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });

      await controller.uploadFilesToVersion("dataset-123", "version-123", mockFiles, mockRequestNoUser);

      expect(mockDatasetService.uploadFilesToVersion).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
        mockFiles,
        "anonymous",
      );
    });
  });

  describe("PATCH /api/benchmark/datasets/:id/versions/:versionId", () => {
    it("updates version name successfully", async () => {
      const mockResponse: VersionResponseDto = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        name: "Updated Name",
        storagePrefix: "datasets/dataset-123/version-123/",
        manifestPath: "manifest.json",
        documentCount: 100,
        groundTruthSchema: null,
        frozen: false,
        createdAt: new Date(),
      };

      mockDatasetService.updateVersionName.mockResolvedValue(mockResponse);

      const result = await controller.updateVersion(
        "dataset-123",
        "version-123",
        { name: "Updated Name" },
        mockReq,
      );

      expect(mockDatasetService.updateVersionName).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
        "Updated Name",
      );
      expect(result).toEqual(mockResponse);
    });

    it("clears version name when empty string provided", async () => {
      const mockResponse: VersionResponseDto = {
        id: "version-123",
        datasetId: "dataset-123",
        version: "1.0.0",
        name: null,
        storagePrefix: "datasets/dataset-123/version-123/",
        manifestPath: "manifest.json",
        documentCount: 100,
        groundTruthSchema: null,
        frozen: false,
        createdAt: new Date(),
      };

      mockDatasetService.updateVersionName.mockResolvedValue(mockResponse);

      const result = await controller.updateVersion(
        "dataset-123",
        "version-123",
        { name: "" },
        mockReq,
      );

      expect(mockDatasetService.updateVersionName).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
        "",
      );
      expect(result).toEqual(mockResponse);
    });

    it("propagates NotFoundException from service", async () => {
      mockDatasetService.updateVersionName.mockRejectedValue(
        new NotFoundException("Version not found"),
      );

      await expect(
        controller.updateVersion("dataset-123", "nonexistent", { name: "test" }, mockReq),
      ).rejects.toThrow(NotFoundException);
    });

    it("propagates BadRequestException for frozen versions", async () => {
      mockDatasetService.updateVersionName.mockRejectedValue(
        new BadRequestException("Cannot update a frozen dataset version"),
      );

      await expect(
        controller.updateVersion("dataset-123", "version-123", { name: "test" }, mockReq),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("DELETE /api/benchmark/datasets/:id/versions/:versionId", () => {
    it("deletes a version successfully", async () => {
      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });
      mockDatasetService.deleteVersion.mockResolvedValue(undefined);

      await controller.deleteVersion("dataset-123", "version-123", mockReq);

      expect(mockDatasetService.deleteVersion).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
      );
    });
  });

  describe("DELETE /api/benchmark/datasets/:id/versions/:versionId/samples/:sampleId", () => {
    it("deletes a sample successfully", async () => {
      mockDatasetService.getDatasetById.mockResolvedValue({ id: "dataset-123", groupId: "test-group" });
      mockDatasetService.deleteSample.mockResolvedValue(undefined);

      await controller.deleteSample("dataset-123", "version-123", "sample-1", mockReq);

      expect(mockDatasetService.deleteSample).toHaveBeenCalledWith(
        "dataset-123",
        "version-123",
        "sample-1",
      );
    });
  });
});
