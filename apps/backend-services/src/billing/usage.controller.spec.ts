import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { UsageController } from "./usage.controller";
import { UsageQueryService } from "./usage-query.service";

const mockUsageQueryService = {
  getGroupCurrentSummary: jest.fn(),
  getGroupHistory: jest.fn(),
  getGroupActivityHistory: jest.fn(),
  getRunDetail: jest.fn(),
  getAllGroupsSummary: jest.fn(),
  getRateVersions: jest.fn(),
  getRateVersionActivityCosts: jest.fn(),
};

describe("UsageController", () => {
  let controller: UsageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsageController],
      providers: [
        { provide: UsageQueryService, useValue: mockUsageQueryService },
      ],
    }).compile();
    controller = module.get<UsageController>(UsageController);
    jest.clearAllMocks();
  });

  describe("getAllGroupsUsageSummary", () => {
    it("delegates to usageQueryService.getAllGroupsSummary", async () => {
      const summary = [{ group_id: "g-1", group_name: "Alpha" }];
      mockUsageQueryService.getAllGroupsSummary.mockResolvedValue(summary);

      const result = await controller.getAllGroupsUsageSummary();
      expect(result).toEqual(summary);
      expect(mockUsageQueryService.getAllGroupsSummary).toHaveBeenCalled();
    });
  });

  describe("getGroupUsageSummary", () => {
    it("delegates to usageQueryService.getGroupCurrentSummary", async () => {
      const summary = { group_id: "g-1", total_dollars_spent: 100 };
      mockUsageQueryService.getGroupCurrentSummary.mockResolvedValue(summary);

      const result = await controller.getGroupUsageSummary("g-1");
      expect(result).toEqual(summary);
      expect(mockUsageQueryService.getGroupCurrentSummary).toHaveBeenCalledWith(
        "g-1",
      );
    });
  });

  describe("getGroupUsageHistory", () => {
    it("delegates to usageQueryService.getGroupHistory", async () => {
      const history = [{ period_year: 2026, period_month: 5 }];
      mockUsageQueryService.getGroupHistory.mockResolvedValue(history);

      const result = await controller.getGroupUsageHistory("g-1");
      expect(result).toEqual(history);
      expect(mockUsageQueryService.getGroupHistory).toHaveBeenCalledWith("g-1");
    });
  });

  describe("getGroupActivityHistory", () => {
    it("delegates to usageQueryService.getGroupActivityHistory", async () => {
      const breakdown = [
        {
          period_year: 2026,
          period_month: 5,
          activity_name: "ocr.page_extraction",
          units_consumed: 100,
          dollars_spent: 0.05,
        },
      ];
      mockUsageQueryService.getGroupActivityHistory.mockResolvedValue(
        breakdown,
      );

      const result = await controller.getGroupActivityHistory("g-1");
      expect(result).toEqual(breakdown);
      expect(
        mockUsageQueryService.getGroupActivityHistory,
      ).toHaveBeenCalledWith("g-1", undefined, undefined);
    });
  });

  describe("getRunDetail", () => {
    it("delegates to usageQueryService.getRunDetail", async () => {
      const detail = { workflow_execution_id: "exec-1", events: [] };
      mockUsageQueryService.getRunDetail.mockResolvedValue(detail);

      const result = await controller.getRunDetail("g-1", "exec-1");
      expect(result).toEqual(detail);
      expect(mockUsageQueryService.getRunDetail).toHaveBeenCalledWith(
        "g-1",
        "exec-1",
      );
    });

    it("propagates NotFoundException from service", async () => {
      mockUsageQueryService.getRunDetail.mockRejectedValue(
        new NotFoundException("not found"),
      );
      await expect(controller.getRunDetail("g-1", "exec-x")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("propagates ForbiddenException from service", async () => {
      mockUsageQueryService.getRunDetail.mockRejectedValue(
        new ForbiddenException("wrong group"),
      );
      await expect(controller.getRunDetail("g-1", "exec-x")).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe("getRateVersions", () => {
    it("delegates to usageQueryService.getRateVersions", async () => {
      const versions = [{ id: "rv-1", version: "1.0.0" }];
      mockUsageQueryService.getRateVersions.mockResolvedValue(versions);

      const result = await controller.getRateVersions();
      expect(result).toEqual(versions);
    });
  });

  describe("getRateVersionActivityCosts", () => {
    it("delegates to usageQueryService.getRateVersionActivityCosts", async () => {
      const costs = [{ id: "ac-1", activity_name: "azureOcr.extract" }];
      mockUsageQueryService.getRateVersionActivityCosts.mockResolvedValue(
        costs,
      );

      const result = await controller.getRateVersionActivityCosts("rv-1");
      expect(result).toEqual(costs);
      expect(
        mockUsageQueryService.getRateVersionActivityCosts,
      ).toHaveBeenCalledWith("rv-1");
    });

    it("propagates NotFoundException from service", async () => {
      mockUsageQueryService.getRateVersionActivityCosts.mockRejectedValue(
        new NotFoundException("not found"),
      );
      await expect(
        controller.getRateVersionActivityCosts("nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
