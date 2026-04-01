jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockReturnValue(undefined),
  getIdentityGroupIds: jest.fn().mockReturnValue(["test-group"]),
}));

import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DatasetService } from "./dataset.service";
import { HitlDatasetController } from "./hitl-dataset.controller";
import { HitlDatasetService } from "./hitl-dataset.service";

describe("HitlDatasetController", () => {
  let controller: HitlDatasetController;
  let mockService: jest.Mocked<Partial<HitlDatasetService>>;

  const mockReq = {
    user: { sub: "user-1" },
    resolvedIdentity: {
      userId: "user-1",
      actorId: "actor-1",
      groupRoles: {},
      isSystemAdmin: false,
    },
  } as unknown as Request;

  const mockDatasetService = {
    getDatasetById: jest
      .fn()
      .mockResolvedValue({ id: "dataset-1", groupId: "test-group" }),
  };

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
        { provide: DatasetService, useValue: mockDatasetService },
      ],
    }).compile();

    controller = module.get<HitlDatasetController>(HitlDatasetController);
  });

  describe("listEligibleDocuments", () => {
    it("should return eligible documents", async () => {
      const result = await controller.listEligibleDocuments({}, mockReq);
      expect(result.documents).toEqual([]);
      expect(mockService.listEligibleDocuments).toHaveBeenCalledWith({}, [
        "test-group",
      ]);
    });

    it("should pass filter parameters", async () => {
      await controller.listEligibleDocuments(
        {
          page: 2,
          limit: 10,
          search: "invoice",
        },
        mockReq,
      );

      expect(mockService.listEligibleDocuments).toHaveBeenCalledWith(
        {
          page: 2,
          limit: 10,
          search: "invoice",
        },
        ["test-group"],
      );
    });

    it("should scope to specific group_id when provided", async () => {
      await controller.listEligibleDocuments(
        {
          group_id: "specific-group",
        },
        mockReq,
      );

      expect(mockService.listEligibleDocuments).toHaveBeenCalledWith(
        {
          group_id: "specific-group",
        },
        ["specific-group"],
      );
    });
  });

  describe("createDatasetFromHitl", () => {
    it("should create dataset from HITL documents", async () => {
      const dto = {
        name: "Test Dataset",
        documentIds: ["doc-1"],
        groupId: "test-group",
      };

      const result = await controller.createDatasetFromHitl(dto, mockReq);
      expect(result.dataset.id).toBe("dataset-1");
      expect(mockService.createDatasetFromHitl).toHaveBeenCalledWith(
        dto,
        "actor-1",
      );
    });
  });

  describe("addVersionFromHitl", () => {
    it("should add version to existing dataset", async () => {
      const dto = { documentIds: ["doc-1"] };

      const result = await controller.addVersionFromHitl(
        "dataset-1",
        dto,
        mockReq,
      );

      expect(result.version.id).toBe("version-1");
      expect(mockService.addVersionFromHitl).toHaveBeenCalledWith(
        "dataset-1",
        dto,
        "actor-1",
        "test-group"
      );
    });
  });
});
