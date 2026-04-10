/**
 * Ground Truth Generation Controller Tests
 *
 * Tests for ground truth generation REST API endpoints.
 */

jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockReturnValue(undefined),
  getIdentityGroupIds: jest.fn().mockReturnValue(["test-group"]),
}));

import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DatasetService } from "./dataset.service";
import { GroundTruthGenerationController } from "./ground-truth-generation.controller";
import { GroundTruthGenerationService } from "./ground-truth-generation.service";

describe("GroundTruthGenerationController", () => {
  let controller: GroundTruthGenerationController;

  const mockGroundTruthService = {
    startGeneration: jest.fn(),
    getJobs: jest.fn(),
    getReviewQueue: jest.fn(),
    getReviewStats: jest.fn(),
  };

  const mockDatasetService = {
    getDatasetById: jest
      .fn()
      .mockResolvedValue({ id: "ds-1", groupId: "test-group" }),
  };

  const mockReq = {
    user: { sub: "user-1" },
    resolvedIdentity: { userId: "user-1" },
  } as unknown as Request;

  const datasetId = "ds-1";
  const versionId = "ver-1";

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroundTruthGenerationController],
      providers: [
        {
          provide: GroundTruthGenerationService,
          useValue: mockGroundTruthService,
        },
        { provide: DatasetService, useValue: mockDatasetService },
      ],
    }).compile();

    controller = module.get<GroundTruthGenerationController>(
      GroundTruthGenerationController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /ground-truth-generation", () => {
    it("starts generation successfully", async () => {
      const dto = { workflowVersionId: "wf-config-1" };
      const expected = {
        jobsCreated: 5,
        samplesWithoutGroundTruth: 5,
      };

      mockGroundTruthService.startGeneration.mockResolvedValue(expected);

      const result = await controller.startGeneration(
        datasetId,
        versionId,
        dto,
        mockReq,
      );

      expect(mockGroundTruthService.startGeneration).toHaveBeenCalledWith(
        datasetId,
        versionId,
        "wf-config-1",
      );
      expect(result).toEqual(expected);
    });
  });

  describe("GET /ground-truth-generation/jobs", () => {
    it("returns paginated jobs with defaults", async () => {
      const expected = {
        items: [{ id: "job-1", status: "completed" }],
        total: 1,
        page: 1,
        limit: 50,
      };

      mockGroundTruthService.getJobs.mockResolvedValue(expected);

      const result = await controller.getJobs(datasetId, versionId, mockReq);

      expect(mockGroundTruthService.getJobs).toHaveBeenCalledWith(
        datasetId,
        versionId,
        1,
        50,
      );
      expect(result).toEqual(expected);
    });

    it("passes pagination params when provided", async () => {
      mockGroundTruthService.getJobs.mockResolvedValue({
        items: [],
        total: 0,
      });

      await controller.getJobs(datasetId, versionId, mockReq, 3, 25);

      expect(mockGroundTruthService.getJobs).toHaveBeenCalledWith(
        datasetId,
        versionId,
        3,
        25,
      );
    });
  });

  describe("GET /ground-truth-generation/review/queue", () => {
    it("returns review queue with defaults", async () => {
      const expected = {
        items: [],
        total: 0,
      };

      mockGroundTruthService.getReviewQueue.mockResolvedValue(expected);

      const result = await controller.getReviewQueue(
        datasetId,
        versionId,
        mockReq,
      );

      expect(mockGroundTruthService.getReviewQueue).toHaveBeenCalledWith(
        datasetId,
        versionId,
        {
          limit: undefined,
          offset: undefined,
          reviewStatus: undefined,
        },
      );
      expect(result).toEqual(expected);
    });

    it("passes filter params when provided", async () => {
      mockGroundTruthService.getReviewQueue.mockResolvedValue({
        items: [],
        total: 0,
      });

      await controller.getReviewQueue(
        datasetId,
        versionId,
        mockReq,
        10,
        5,
        "pending",
      );

      expect(mockGroundTruthService.getReviewQueue).toHaveBeenCalledWith(
        datasetId,
        versionId,
        {
          limit: 10,
          offset: 5,
          reviewStatus: "pending",
        },
      );
    });
  });

  describe("GET /ground-truth-generation/review/stats", () => {
    it("returns review stats", async () => {
      const expected = {
        totalSamples: 20,
        pendingReview: 5,
        reviewed: 15,
      };

      mockGroundTruthService.getReviewStats.mockResolvedValue(expected);

      const result = await controller.getReviewStats(
        datasetId,
        versionId,
        mockReq,
      );

      expect(mockGroundTruthService.getReviewStats).toHaveBeenCalledWith(
        datasetId,
        versionId,
      );
      expect(result).toEqual(expected);
    });
  });
});
