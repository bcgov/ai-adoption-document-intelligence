/**
 * Tests for ConfusionMatrixController.
 */

jest.mock("@/auth/identity.helpers", () => ({
  identityCanAccessGroup: jest.fn().mockResolvedValue(undefined),
}));

import { Test, TestingModule } from "@nestjs/testing";
import { Request } from "express";
import { DatabaseService } from "@/database/database.service";
import { BenchmarkProjectService } from "./benchmark-project.service";
import { ConfusionMatrixController } from "./confusion-matrix.controller";
import { ConfusionMatrixService } from "./confusion-matrix.service";

describe("ConfusionMatrixController", () => {
  let controller: ConfusionMatrixController;

  const mockProjectService = {
    getProjectById: jest.fn().mockResolvedValue({
      id: "project-1",
      groupId: "g1",
    }),
  };

  const mockConfusionMatrixService = {
    deriveFromHitlCorrections: jest.fn().mockResolvedValue({
      schemaVersion: "1.0",
      type: "character",
      metadata: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        sampleCount: 1,
        fieldCount: 1,
        filters: {},
      },
      matrix: {},
      totals: {
        totalConfusions: 0,
        uniquePairs: 0,
        topConfusions: [],
      },
    }),
  };

  const mockDatabaseService = {
    isUserSystemAdmin: jest.fn().mockResolvedValue(false),
  };

  const mockReq = {
    resolvedIdentity: { userId: "user-1" },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfusionMatrixController],
      providers: [
        { provide: BenchmarkProjectService, useValue: mockProjectService },
        {
          provide: ConfusionMatrixService,
          useValue: mockConfusionMatrixService,
        },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    controller = module.get<ConfusionMatrixController>(
      ConfusionMatrixController,
    );
  });

  it("derives confusion matrix with default group from project", async () => {
    const result = await controller.derive("project-1", {}, mockReq);

    expect(
      mockConfusionMatrixService.deriveFromHitlCorrections,
    ).toHaveBeenCalledWith(expect.objectContaining({ groupIds: ["g1"] }));
    expect(result.schemaVersion).toBe("1.0");
  });

  it("passes explicit groupIds when provided", async () => {
    await controller.derive("project-1", { groupIds: ["other"] }, mockReq);

    expect(
      mockConfusionMatrixService.deriveFromHitlCorrections,
    ).toHaveBeenCalledWith(expect.objectContaining({ groupIds: ["other"] }));
  });
});
