import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { UsageEventType } from "@/generated";
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
    findFirst: jest.fn().mockResolvedValue({
      rate_version: {
        id: "123",
        created_at: new Date(),
        version: "1.0.0",
        effective_from: new Date(),
        unit_cost_dollars: 0.001,
        units_per_gb_per_month: 0.1,
        max_pages_assumption: 10,
        max_array_items_assumption: 3,
      },
      id: "abc",
      group_id: "group-1",
      created_at: new Date(),
      event_type: UsageEventType.activity_completed,
      workflow_execution_id: "abc-123",
      workflow_version_id: "1.0.0",
      activity_name: "azureOcr.submit",
      metered_quantity: 3,
      units_consumed: 2,
      unit_cost_dollars: 3,
      rate_version_id: "132112",
    }),
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
  return { toNumber: () => n, equals: (v: number) => n === v };
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
  describe("getRunDetail", () => {
    it("throws NotFoundException when no events exist for the execution", async () => {
      mockPrisma.usageEvent.findFirst.mockResolvedValue(null);
      await expect(service.getRunDetail("group-1", "exec-abc")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when execution belongs to a different group", async () => {
      const createdAt = new Date("2026-06-01T10:00:00Z");
      mockPrisma.usageEvent.findFirst.mockResolvedValue({
        id: "evt-1",
        group_id: "group-other",
        event_type: "workflow_cost",
        activity_name: null,
        units_consumed: makeDecimal(10),
        estimated_units: null,
        metered_quantity: null,
        created_at: createdAt,
        workflow_version_id: "v1",
        rate_version: { unit_cost_dollars: makeDecimal(0.001) },
      });

      await expect(service.getRunDetail("group-1", "exec-abc")).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("returns correct run detail with dollar values computed", async () => {
      const createdAt = new Date("2026-06-01T10:00:00Z");
      mockPrisma.usageEvent.findFirst.mockResolvedValue({
        id: "evt-2",
        group_id: "group-1",
        event_type: "workflow_cost",
        activity_name: null,
        units_consumed: makeDecimal(40),
        estimated_units: makeDecimal(50),
        metered_quantity: 4,
        created_at: createdAt,
        workflow_version_id: "v-1",
        rate_version: { unit_cost_dollars: makeDecimal(0.001) },
      });

      const result = await service.getRunDetail("group-1", "exec-abc");

      expect(result.workflow_execution_id).toBe("exec-abc");
      expect(result.group_id).toBe("group-1");
      expect(result.estimated_units).toBe(50);
      expect(result.total_units_consumed).toBe(40);
      expect(result.units_consumed).toBe(40);
      expect(result.dollar_value).toBeCloseTo(0.04);
      expect(result.workflow_version_id).toBe("v-1");
    });

    it("returns null estimated_units when event has no estimated_units", async () => {
      const createdAt = new Date("2026-06-01T10:00:00Z");
      mockPrisma.usageEvent.findFirst.mockResolvedValue({
        id: "evt-3",
        group_id: "group-1",
        event_type: "workflow_cost",
        activity_name: null,
        units_consumed: makeDecimal(5),
        estimated_units: null,
        metered_quantity: null,
        created_at: createdAt,
        workflow_version_id: "v-2",
        rate_version: { unit_cost_dollars: makeDecimal(0.01) },
      });

      const result = await service.getRunDetail("group-1", "exec-abc");
      expect(result.estimated_units).toBeNull();
      expect(result.workflow_version_id).toBe("v-2");
    });
  });

  // ---------------------------------------------------------------------------
  // getGroupActivityHistory
  // ---------------------------------------------------------------------------
  describe("getGroupActivityHistory", () => {
    it("returns empty array when no events exist", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([]);
      const result = await service.getGroupActivityHistory("group-1");
      expect(result).toEqual([]);
    });

    it("skips events with zero units_consumed", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(0),
          created_at: new Date("2026-06-15T00:00:00Z"),
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      expect(result).toEqual([]);
    });

    it("groups a single activity_completed event by activity_name", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(10),
          created_at: new Date("2026-06-15T00:00:00Z"),
          rate_version: { unit_cost_dollars: makeDecimal(0.002) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      expect(result).toHaveLength(1);
      expect(result[0].period_year).toBe(2026);
      expect(result[0].period_month).toBe(6);
      expect(result[0].event_type).toBe("activity_completed");
      expect(result[0].units_consumed).toBe(10);
      expect(result[0].dollars_spent).toBeCloseTo(0.02);
      expect(result[0].activities["azureOcr.extract"]).toEqual({
        units_consumed: 10,
        dollars_spent: expect.closeTo(0.02),
      });
    });

    it("uses workflow_version_id as activity key for workflow_cost events", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: null,
          units_consumed: makeDecimal(20),
          created_at: new Date("2026-06-15T00:00:00Z"),
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "workflow_cost",
          workflow_version_id: "workflow-v2",
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe("workflow_cost");
      expect(result[0].activities["workflow-v2"]).toBeDefined();
      expect(result[0].activities["workflow-v2"].units_consumed).toBe(20);
    });

    it("falls back to 'other' when activity_name is null for non-workflow_cost events", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: null,
          units_consumed: makeDecimal(5),
          created_at: new Date("2026-06-15T00:00:00Z"),
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: null,
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      expect(result[0].activities["other"]).toBeDefined();
      expect(result[0].activities["other"].units_consumed).toBe(5);
    });

    it("aggregates multiple events in the same bucket", async () => {
      const date = new Date("2026-06-15T00:00:00Z");
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(10),
          created_at: date,
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(5),
          created_at: date,
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      expect(result).toHaveLength(1);
      expect(result[0].units_consumed).toBe(15);
      expect(result[0].activities["azureOcr.extract"].units_consumed).toBe(15);
    });

    it("produces separate buckets for different activity types in same month", async () => {
      const date = new Date("2026-06-15T00:00:00Z");
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(10),
          created_at: date,
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
        {
          activity_name: "formRecognizer.analyze",
          units_consumed: makeDecimal(8),
          created_at: date,
          rate_version: { unit_cost_dollars: makeDecimal(0.002) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      // Same event_type + workflow_version_id → same bucket
      expect(result).toHaveLength(1);
      expect(result[0].units_consumed).toBe(18);
      expect(result[0].activities["azureOcr.extract"]).toBeDefined();
      expect(result[0].activities["formRecognizer.analyze"]).toBeDefined();
    });

    it("produces separate results for different months, sorted ascending", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(10),
          created_at: new Date("2026-07-10T00:00:00Z"),
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
        {
          activity_name: "azureOcr.extract",
          units_consumed: makeDecimal(5),
          created_at: new Date("2026-06-10T00:00:00Z"),
          rate_version: { unit_cost_dollars: makeDecimal(0.001) },
          event_type: "activity_completed",
          workflow_version_id: "v1",
        },
      ]);

      const result = await service.getGroupActivityHistory("group-1");
      expect(result).toHaveLength(2);
      expect(result[0].period_month).toBe(6);
      expect(result[1].period_month).toBe(7);
    });

    it("passes date filters through to the Prisma query", async () => {
      mockPrisma.usageEvent.findMany.mockResolvedValue([]);
      const start = new Date("2026-01-01");
      const end = new Date("2026-06-30");

      await service.getGroupActivityHistory("group-1", start, end);

      expect(mockPrisma.usageEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            group_id: "group-1",
            created_at: { gte: start, lte: end },
          }),
        }),
      );
    });
  });

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
