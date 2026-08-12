import { buildUsageEventWriteOps } from "./write";
import type { RecordUsageEventInput } from "./types";

const baseInput: RecordUsageEventInput = {
  event_type: "activity_completed",
  group_id: "grp-1",
  rate_version_id: "rv-1",
  unit_cost_dollars: 0.001,
  units_consumed: 500,
};

describe("buildUsageEventWriteOps", () => {
  it("builds createData with all required fields", () => {
    const { createData } = buildUsageEventWriteOps(
      {
        ...baseInput,
        workflow_execution_id: "wf-exec-1",
        activity_name: "azureOcr.extract",
        metered_quantity: 5,
      },
      new Date("2026-07-15T10:00:00Z"),
    );

    expect(createData).toEqual({
      event_type: "activity_completed",
      group_id: "grp-1",
      rate_version_id: "rv-1",
      units_consumed: 500,
      workflow_execution_id: "wf-exec-1",
      activity_name: "azureOcr.extract",
      metered_quantity: 5,
      estimated_units: null,
      storage_gb_hours: null,
      resource_id: null,
      resource_type: null,
    });
  });

  it("sets optional fields to null when not provided", () => {
    const { createData } = buildUsageEventWriteOps(
      baseInput,
      new Date("2026-07-15T10:00:00Z"),
    );

    expect(createData.workflow_execution_id).toBeNull();
    expect(createData.activity_name).toBeNull();
    expect(createData.metered_quantity).toBeNull();
    expect(createData.estimated_units).toBeNull();
    expect(createData.storage_gb_hours).toBeNull();
    expect(createData.resource_id).toBeNull();
    expect(createData.resource_type).toBeNull();
  });

  it("builds upsertArgs with correct period from the provided timestamp", () => {
    const { upsertArgs } = buildUsageEventWriteOps(
      baseInput,
      new Date("2026-07-15T10:00:00Z"),
    );

    expect(upsertArgs.where).toEqual({
      group_id_period_year_period_month: {
        group_id: "grp-1",
        period_year: 2026,
        period_month: 7,
      },
    });
    expect(upsertArgs.create).toMatchObject({
      group_id: "grp-1",
      period_year: 2026,
      period_month: 7,
    });
  });

  it("converts units to dollars in create totals (500 × 0.001 = 0.50)", () => {
    const { upsertArgs } = buildUsageEventWriteOps(
      { ...baseInput, units_consumed: 500, unit_cost_dollars: 0.001 },
      new Date("2026-07-15T10:00:00Z"),
    );

    expect(upsertArgs.create.total_units_consumed).toBe(500);
    expect(upsertArgs.create.total_dollars_spent).toBe(0.5);
  });

  it("builds increment values matching the event totals", () => {
    const { upsertArgs } = buildUsageEventWriteOps(
      { ...baseInput, units_consumed: 200, unit_cost_dollars: 0.001 },
      new Date("2026-07-15T10:00:00Z"),
    );

    expect(upsertArgs.update).toEqual({
      total_units_consumed: { increment: 200 },
      total_dollars_spent: { increment: 0.2 },
    });
  });

  it("uses UTC month boundary correctly (Dec 31 23:59 UTC stays Dec)", () => {
    const { upsertArgs } = buildUsageEventWriteOps(
      baseInput,
      new Date("2026-12-31T23:59:59Z"),
    );
    expect(upsertArgs.where.group_id_period_year_period_month.period_month).toBe(12);
    expect(upsertArgs.where.group_id_period_year_period_month.period_year).toBe(2026);
  });
});
