import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { HitlDatasetController } from "./hitl-dataset.controller";
import { HitlDatasetService } from "./hitl-dataset.service";

describe("HitlDatasetController", () => {
  let controller: HitlDatasetController;
  let mockService: jest.Mocked<Partial<HitlDatasetService>>;

  const mockRequest = {
    user: { sub: "user-1" },
  } as unknown as import("express").Request;

  const mockRequestNoUser = {
    user: {},
  } as unknown as import("express").Request;

  beforeEach(async () => {
    mockService = {
      listEligibleDocuments: jest.fn().mockResolvedValue({
        documents: [],
        total: 0,
        page: 1,
        limit: 20,
      }),
      createDatasetFromHitl: jest.fn().mockResolvedValue({
        dataset: { id: "dataset-1", name: "Test" },
        version: { id: "version-1" },
        skipped: [],
      }),
      addVersionFromHitl: jest.fn().mockResolvedValue({
        version: { id: "version-1" },
        skipped: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HitlDatasetController],
      providers: [
        { provide: HitlDatasetService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<HitlDatasetController>(HitlDatasetController);
  });

  describe("listEligibleDocuments", () => {
    it("should return eligible documents", async () => {
      const result = await controller.listEligibleDocuments({});
      expect(result.documents).toEqual([]);
      expect(mockService.listEligibleDocuments).toHaveBeenCalledWith({});
    });

    it("should pass filter parameters", async () => {
      await controller.listEligibleDocuments({
        page: 2,
        limit: 10,
        search: "invoice",
      });

      expect(mockService.listEligibleDocuments).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        search: "invoice",
      });
    });
  });

  describe("createDatasetFromHitl", () => {
    it("should create dataset from HITL documents", async () => {
      const dto = {
        name: "Test Dataset",
        documentIds: ["doc-1"],
      };

      const result = await controller.createDatasetFromHitl(dto, mockRequest);
      expect(result.dataset.id).toBe("dataset-1");
      expect(mockService.createDatasetFromHitl).toHaveBeenCalledWith(
        dto,
        "user-1",
      );
    });

    it("should throw when user ID is missing", async () => {
      await expect(
        controller.createDatasetFromHitl(
          { name: "Test", documentIds: ["doc-1"] },
          mockRequestNoUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("addVersionFromHitl", () => {
    it("should add version to existing dataset", async () => {
      const dto = { documentIds: ["doc-1"] };

      const result = await controller.addVersionFromHitl(
        "dataset-1",
        dto,
        mockRequest,
      );

      expect(result.version.id).toBe("version-1");
      expect(mockService.addVersionFromHitl).toHaveBeenCalledWith(
        "dataset-1",
        dto,
        "user-1",
      );
    });

    it("should throw when user ID is missing", async () => {
      await expect(
        controller.addVersionFromHitl(
          "dataset-1",
          { documentIds: ["doc-1"] },
          mockRequestNoUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
