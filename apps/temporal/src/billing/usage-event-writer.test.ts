import type { UsageEvent, UsagePeriodSummary } from "@generated/client";
import { UsageEventWriter } from "./usage-event-writer";

function createMockPrisma() {
  const event: UsageEvent = {
    id: "evt-1",
    event_type: "activity_completed",
    group_id: "grp-1",
    workflow_execution_id: "wf-exec-1",
    activity_name: "azureOcr.extract",
    metered_quantity: 5,
    units_consumed: 500 as unknown as UsageEvent["units_consumed"],
    estimated_units: null,
    storage_gb_hours: null,
    resource_id: null,
    resource_type: null,
    rate_version_id: "rv-1",
    created_at: new Date("2026-07-15T10:00:00Z"),
  };

  const periodSummary: UsagePeriodSummary = {
    id: "ps-1",
    group_id: "grp-1",
    period_year: 2026,
    period_month: 7,
    total_units_consumed:
      500 as unknown as UsagePeriodSummary["total_units_consumed"],
    total_dollars_spent:
      0.5 as unknown as UsagePeriodSummary["total_dollars_spent"],
    updated_at: new Date(),
  };

  const tx = {
    usageEvent: {
      create: jest.fn().mockResolvedValue(event),
    },
    usagePeriodSummary: {
      upsert: jest.fn().mockResolvedValue(periodSummary),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<UsageEvent>) =>
      cb(tx),
    ),
  };

  return { prisma, tx, event, periodSummary };
}

describe("UsageEventWriter", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("recordUsageEvent", () => {
    it("persists a UsageEvent with all required fields", async () => {
      const { prisma, tx, event } = createMockPrisma();
      const writer = new UsageEventWriter(prisma as never);

      const result = await writer.recordUsageEvent({
        event_type: "activity_completed",
        group_id: "grp-1",
        rate_version_id: "rv-1",
        unit_cost_dollars: 0.001,
        units_consumed: 500,
        workflow_execution_id: "wf-exec-1",
        activity_name: "azureOcr.extract",
        metered_quantity: 5,
      });

      expect(result).toEqual(event);
      expect(tx.usageEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: "activity_completed",
            group_id: "grp-1",
            rate_version_id: "rv-1",
            units_consumed: 500,
            workflow_execution_id: "wf-exec-1",
            activity_name: "azureOcr.extract",
            metered_quantity: 5,
          }),
        }),
      );
    });

    it("creates a new UsagePeriodSummary when none exists for the period", async () => {
      const { prisma, tx } = createMockPrisma();
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-07-15T10:00:00Z"));

      const writer = new UsageEventWriter(prisma as never);

      await writer.recordUsageEvent({
        event_type: "activity_completed",
        group_id: "grp-1",
        rate_version_id: "rv-1",
        unit_cost_dollars: 0.001,
        units_consumed: 500,
      });

      expect(tx.usagePeriodSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            group_id_period_year_period_month: {
              group_id: "grp-1",
              period_year: 2026,
              period_month: 7,
            },
          },
          create: expect.objectContaining({
            group_id: "grp-1",
            period_year: 2026,
            period_month: 7,
            total_units_consumed: 500,
            total_dollars_spent: 0.5,
          }),
        }),
      );

      jest.useRealTimers();
    });

    it("increments an existing UsagePeriodSummary when one already exists", async () => {
      const { prisma, tx } = createMockPrisma();
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-07-20T08:00:00Z"));

      const writer = new UsageEventWriter(prisma as never);

      await writer.recordUsageEvent({
        event_type: "activity_completed",
        group_id: "grp-1",
        rate_version_id: "rv-1",
        unit_cost_dollars: 0.001,
        units_consumed: 200,
      });

      expect(tx.usagePeriodSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            total_units_consumed: { increment: 200 },
            total_dollars_spent: { increment: 0.2 },
          },
        }),
      );

      jest.useRealTimers();
    });

    it("converts units to dollars using unit_cost_dollars", async () => {
      const { prisma, tx } = createMockPrisma();
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-07-15T10:00:00Z"));

      const writer = new UsageEventWriter(prisma as never);

      await writer.recordUsageEvent({
        event_type: "activity_completed",
        group_id: "grp-1",
        rate_version_id: "rv-1",
        unit_cost_dollars: 0.001,
        units_consumed: 500,
      });

      // 500 units × $0.001 = $0.50
      expect(tx.usagePeriodSummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            total_dollars_spent: 0.5,
          }),
          update: expect.objectContaining({
            total_dollars_spent: { increment: 0.5 },
          }),
        }),
      );

      jest.useRealTimers();
    });

    it("wraps both writes in a single transaction", async () => {
      const { prisma } = createMockPrisma();
      const writer = new UsageEventWriter(prisma as never);

      await writer.recordUsageEvent({
        event_type: "workflow_started",
        group_id: "grp-1",
        rate_version_id: "rv-1",
        unit_cost_dollars: 0.001,
        units_consumed: 0,
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("sets optional fields to null when not provided", async () => {
      const { prisma, tx } = createMockPrisma();
      const writer = new UsageEventWriter(prisma as never);

      await writer.recordUsageEvent({
        event_type: "workflow_started",
        group_id: "grp-1",
        rate_version_id: "rv-1",
        unit_cost_dollars: 0.001,
        units_consumed: 0,
      });

      expect(tx.usageEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workflow_execution_id: null,
            activity_name: null,
            metered_quantity: null,
            estimated_units: null,
            storage_gb_hours: null,
            resource_id: null,
            resource_type: null,
          }),
        }),
      );
    });
  });
});
