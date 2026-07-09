import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { UsageQueryService } from "./usage-query.service";

const mockPrisma = {
  usagePeriodSummary: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  groupBillingConfig: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  usageEvent: {
    findMany: jest.fn(),
  },
  group: {
    findMany: jest.fn(),
  },
  rateVersion: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  activityCost: {
    findMany: jest.fn(),
  },
};

const mockPrismaService = { prisma: mockPrisma };

function makeDecimal(n: number) {
  return { toNumber: () => n };
}

describe("UsageQueryService", () => {
  let service: UsageQueryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageQueryService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();
    service = module.get<UsageQueryService>(UsageQueryService);
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // getGroupCurrentSummary
  // ---------------------------------------------------------------------------
  describe("getGroupCurrentSummary", () => {
    it("returns zeros when no summary row and no billing config exist", async () => {
      mockPrisma.usagePeriodSummary.findUnique.mockResolvedValue(null);
      mockPrisma.groupBillingConfig.findUnique.mockResolvedValue(null);

      const result = await service.getGroupCurrentSummary("group-1");

      expect(result.total_dollars_spent).toBe(0);
      expect(result.total_units_consumed).toBe(0);
      expect(result.monthly_cap_dollars).toBeNull();
      expect(result.remaining_dollars).toBeNull();
      expect(result.group_id).toBe("group-1");
    });

    it("returns spend from summary and cap from billing config", async () => {
      mockPrisma.usagePeriodSummary.findUnique.mockResolvedValue({
        total_dollars_spent: makeDecimal(100),
        total_units_consumed: makeDecimal(500),
      });
      mockPrisma.groupBillingConfig.findUnique.mockResolvedValue({
        monthly_cap_dollars: makeDecimal(300),
      });

      const result = await service.getGroupCurrentSummary("group-1");

      expect(result.total_dollars_spent).toBe(100);
      expect(result.monthly_cap_dollars).toBe(300);
      expect(result.remaining_dollars).toBe(200);
    });

    it("clamps remaining_dollars to 0 when spend exceeds cap", async () => {
      mockPrisma.usagePeriodSummary.findUnique.mockResolvedValue({
        total_dollars_spent: makeDecimal(400),
        total_units_consumed: makeDecimal(800),
      });
      mockPrisma.groupBillingConfig.findUnique.mockResolvedValue({
        monthly_cap_dollars: makeDecimal(300),
      });

      const result = await service.getGroupCurrentSummary("group-1");

      expect(result.remaining_dollars).toBe(0);
    });

    it("returns null remaining_dollars when no cap is configured", async () => {
      mockPrisma.usagePeriodSummary.findUnique.mockResolvedValue({
        total_dollars_spent: makeDecimal(50),
        total_units_consumed: makeDecimal(100),
      });
      mockPrisma.groupBillingConfig.findUnique.mockResolvedValue(null);

      const result = await service.getGroupCurrentSummary("group-1");
      expect(result.remaining_dollars).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getGroupHistory
  // ---------------------------------------------------------------------------
  describe("getGroupHistory", () => {
    it("returns empty array when no history exists", async () => {
      mockPrisma.usagePeriodSummary.findMany.mockResolvedValue([]);
      const result = await service.getGroupHistory("group-1");
      expect(result).toEqual([]);
    });

    it("maps Prisma records to DTO format", async () => {
      mockPrisma.usagePeriodSummary.findMany.mockResolvedValue([
        {
          period_year: 2026,
          period_month: 6,
          total_units_consumed: makeDecimal(200),
          total_dollars_spent: makeDecimal(0.5),
        },
        {
          period_year: 2026,
          period_month: 5,
          total_units_consumed: makeDecimal(100),
          total_dollars_spent: makeDecimal(0.25),
        },
      ]);

      const result = await service.getGroupHistory("group-1");
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        period_year: 2026,
        period_month: 6,
        total_units_consumed: 200,
        total_dollars_spent: 0.5,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // getRunDetail
  // ---------------------------------------------------------------------------
  // describe("getRunDetail", () => {
  //   it("throws NotFoundException when no events exist for the execution", async () => {
  //     mockPrisma.usageEvent.findMany.mockResolvedValue([]);
  //     await expect(service.getRunDetail("group-1", "exec-abc")).rejects.toThrow(
  //       NotFoundException,
  //     );
  //   });

  //   it("throws ForbiddenException when execution belongs to a different group", async () => {
  //     mockPrisma.usageEvent.findMany.mockResolvedValue([
  //       {
  //         id: "evt-1",
  //         group_id: "group-other",
  //         event_type: "workflow_started",
  //         activity_name: null,
  //         units_consumed: makeDecimal(0),
  //         estimated_units: null,
  //         metered_quantity: null,
  //         created_at: new Date(),
  //         rate_version: { unit_cost_dollars: makeDecimal(0.001) },
  //       },
  //     ]);

  //     await expect(service.getRunDetail("group-1", "exec-abc")).rejects.toThrow(
  //       ForbiddenException,
  //     );
  //   });

  //   it("returns correct run detail with dollar values computed", async () => {
  //     const createdAt = new Date("2026-06-01T10:00:00Z");
  //     mockPrisma.usageEvent.findMany.mockResolvedValue([
  //       {
  //         id: "evt-1",
  //         group_id: "group-1",
  //         event_type: "workflow_started",
  //         activity_name: null,
  //         units_consumed: makeDecimal(0),
  //         estimated_units: makeDecimal(50),
  //         metered_quantity: null,
  //         created_at: createdAt,
  //         rate_version: { unit_cost_dollars: makeDecimal(0.001) },
  //       },
  //       {
  //         id: "evt-2",
  //         group_id: "group-1",
  //         event_type: "activity_completed",
  //         activity_name: "azureOcr.extract",
  //         units_consumed: makeDecimal(40),
  //         estimated_units: null,
  //         metered_quantity: 4,
  //         created_at: createdAt,
  //         rate_version: { unit_cost_dollars: makeDecimal(0.001) },
  //       },
  //       {
  //         id: "evt-3",
  //         group_id: "group-1",
  //         event_type: "workflow_completed",
  //         activity_name: null,
  //         units_consumed: makeDecimal(40),
  //         estimated_units: null,
  //         metered_quantity: null,
  //         created_at: createdAt,
  //         rate_version: { unit_cost_dollars: makeDecimal(0.001) },
  //       },
  //     ]);

  //     const result = await service.getRunDetail("group-1", "exec-abc");

  //     expect(result.workflow_execution_id).toBe("exec-abc");
  //     expect(result.estimated_units).toBe(50);
  //     expect(result.total_units_consumed).toBe(40);
  //     expect(result.events).toHaveLength(3);
  //     expect(result.events[1].dollar_value).toBe(0.04); // 40 * 0.001
  //     expect(result.events[1].metered_quantity).toBe(4);
  //   });
  // });

  // ---------------------------------------------------------------------------
  // getAllGroupsSummary
  // ---------------------------------------------------------------------------
  describe("getAllGroupsSummary", () => {
    it("includes groups with zero spend when no summary row exists", async () => {
      mockPrisma.group.findMany.mockResolvedValue([
        { id: "g-1", name: "Alpha" },
        { id: "g-2", name: "Beta" },
      ]);
      mockPrisma.usagePeriodSummary.findMany.mockResolvedValue([]);
      mockPrisma.groupBillingConfig.findMany.mockResolvedValue([]);

      const result = await service.getAllGroupsSummary();
      expect(result).toHaveLength(2);
      expect(result[0].total_dollars_spent).toBe(0);
      expect(result[0].usage_percentage).toBeNull();
    });

    it("computes usage_percentage when cap exists", async () => {
      mockPrisma.group.findMany.mockResolvedValue([
        { id: "g-1", name: "Alpha" },
      ]);
      mockPrisma.usagePeriodSummary.findMany.mockResolvedValue([
        {
          group_id: "g-1",
          total_dollars_spent: makeDecimal(150),
          total_units_consumed: makeDecimal(300),
        },
      ]);
      mockPrisma.groupBillingConfig.findMany.mockResolvedValue([
        { group_id: "g-1", monthly_cap_dollars: makeDecimal(500) },
      ]);

      const result = await service.getAllGroupsSummary();
      expect(result[0].usage_percentage).toBe(30); // 150/500 * 100
      expect(result[0].monthly_cap_dollars).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // getRateVersions
  // ---------------------------------------------------------------------------
  describe("getRateVersions", () => {
    it("maps Prisma Decimal fields to numbers", async () => {
      mockPrisma.rateVersion.findMany.mockResolvedValue([
        {
          id: "rv-1",
          version: "1.0.0",
          effective_from: new Date("2026-01-01"),
          unit_cost_dollars: makeDecimal(0.001),
          units_per_gb_per_month: makeDecimal(10),
          max_pages_assumption: 100,
          max_array_items_assumption: 50,
          created_at: new Date(),
        },
      ]);

      const result = await service.getRateVersions();
      expect(result[0].unit_cost_dollars).toBe(0.001);
      expect(result[0].units_per_gb_per_month).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // getRateVersionActivityCosts
  // ---------------------------------------------------------------------------
  describe("getRateVersionActivityCosts", () => {
    it("throws NotFoundException when rate version does not exist", async () => {
      mockPrisma.rateVersion.findUnique.mockResolvedValue(null);
      mockPrisma.activityCost.findMany.mockResolvedValue([]);
      await expect(
        service.getRateVersionActivityCosts("nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("returns activity costs for a valid version", async () => {
      mockPrisma.rateVersion.findUnique.mockResolvedValue({ id: "rv-1" });
      mockPrisma.activityCost.findMany.mockResolvedValue([
        {
          id: "ac-1",
          activity_name: "azureOcr.extract",
          cost_type: "per_page",
          units: makeDecimal(5),
        },
      ]);

      const result = await service.getRateVersionActivityCosts("rv-1");
      expect(result).toHaveLength(1);
      expect(result[0].units).toBe(5);
      expect(result[0].cost_type).toBe("per_page");
    });
  });
});
