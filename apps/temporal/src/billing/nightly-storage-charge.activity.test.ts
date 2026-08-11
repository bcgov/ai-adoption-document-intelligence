import type { GroupStorageLedger, RateVersion } from "@generated/client";
import {
  runMonthEndArchival,
  runNightlyStorageCharge,
} from "./nightly-storage-charge.activity";

// Mock database client
jest.mock("../activities/database-client", () => ({
  getPrismaClient: jest.fn(),
}));

import { getPrismaClient } from "../activities/database-client";

const MS_PER_HOUR = 3_600_000;
const BYTES_PER_GB = 1_073_741_824;

function makeMockRateVersion(
  overrides: Partial<RateVersion> = {},
): RateVersion {
  return {
    id: "rv-1",
    version: "v1",
    effective_from: new Date("2026-01-01T00:00:00Z"),
    unit_cost_dollars: 0.001 as unknown as RateVersion["unit_cost_dollars"],
    units_per_gb_per_month:
      300 as unknown as RateVersion["units_per_gb_per_month"],
    max_pages_assumption: 100,
    max_array_items_assumption: 100,
    created_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeLedgerRow(
  overrides: Partial<GroupStorageLedger> = {},
): Pick<
  GroupStorageLedger,
  "group_id" | "size_bytes" | "written_at" | "deleted_at"
> {
  return {
    group_id: "group-abc",
    size_bytes: BigInt(BYTES_PER_GB * 2), // 2 GB
    written_at: new Date("2026-07-02T00:00:00Z"),
    deleted_at: null,
    ...overrides,
  };
}

function makeMockPrisma(
  rateVersion: RateVersion | null,
  ledgerRows: ReturnType<typeof makeLedgerRow>[],
) {
  return {
    rateVersion: {
      findFirst: jest.fn().mockResolvedValue(rateVersion),
    },
    groupStorageLedger: {
      findMany: jest.fn().mockResolvedValue(ledgerRows),
      deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
    },
    usageEvent: {
      deleteMany: jest.fn().mockResolvedValue({ count: 10 }),
    },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        usageEvent: { create: jest.fn().mockResolvedValue({ id: "evt-1" }) },
        usagePeriodSummary: { upsert: jest.fn().mockResolvedValue({}) },
      }),
    ),
  };
}

describe("runNightlyStorageCharge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Job queries only rows active during the day window
  // -----------------------------------------------------------------------
  it("queries ledger rows with the correct day window filter", async () => {
    const rateVersion = makeMockRateVersion();
    const mockPrisma = makeMockPrisma(rateVersion, []);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    // July 3, 2026 UTC
    const targetDayStartMs = Date.UTC(2026, 6, 3, 0, 0, 0);
    await runNightlyStorageCharge({ targetDayStartMs });

    expect(mockPrisma.groupStorageLedger.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          written_at: { lt: new Date(targetDayStartMs + 24 * MS_PER_HOUR) },
          OR: [
            { deleted_at: null },
            { deleted_at: { gt: new Date(targetDayStartMs) } },
          ],
        },
      }),
    );
  });

  // -----------------------------------------------------------------------
  // Scenario 2: GB-hours are calculated correctly per blob per group
  // -----------------------------------------------------------------------
  it("correctly computes GB-hours for a blob alive for 8 hours in the day", async () => {
    const rateVersion = makeMockRateVersion();
    // Target day: July 2
    const targetDayStartMs = Date.UTC(2026, 6, 2, 0, 0, 0); // 2026-07-02T00:00Z
    const endOfDay = targetDayStartMs + 24 * MS_PER_HOUR;

    // Blob was written 6 hours before the day started, deleted 8 hours in
    const writtenAt = new Date(targetDayStartMs - 6 * MS_PER_HOUR);
    const deletedAt = new Date(targetDayStartMs + 8 * MS_PER_HOUR);
    const sizeBytes = BigInt(BYTES_PER_GB * 2); // 2 GB

    const ledgerRow = makeLedgerRow({
      written_at: writtenAt,
      deleted_at: deletedAt,
      size_bytes: sizeBytes,
    });
    const mockPrisma = makeMockPrisma(rateVersion, [ledgerRow]);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const result = await runNightlyStorageCharge({ targetDayStartMs });

    // alive_from = max(writtenAt, startOfDay) = startOfDay
    // alive_until = min(deletedAt, endOfDay) = deletedAt = startOfDay + 8h
    // hours_alive = 8; gb_hours = 2 * 8 = 16
    expect(result.groupsCharged).toBe(1);
    expect(result.totalGbHours).toBeCloseTo(16, 5);
    expect(endOfDay).toBeGreaterThan(0); // just to reference the variable
  });

  // -----------------------------------------------------------------------
  // Scenario 3: Groups with non-zero usage receive a storage_daily_charge event
  // -----------------------------------------------------------------------
  it("records a storage_daily_charge UsageEvent for groups with usage", async () => {
    const rateVersion = makeMockRateVersion();
    const targetDayStartMs = Date.UTC(2026, 6, 2, 0, 0, 0);

    const ledgerRow = makeLedgerRow({
      written_at: new Date(targetDayStartMs - MS_PER_HOUR),
      deleted_at: null,
    });
    const mockPrisma = makeMockPrisma(rateVersion, [ledgerRow]);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const result = await runNightlyStorageCharge({ targetDayStartMs });

    expect(result.groupsCharged).toBe(1);
    expect(result.eventsRecorded).toBe(1);
    // Verify transaction was called (UsageEventWriter uses $transaction)
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Scenario 4: Groups with zero storage activity receive no event
  // -----------------------------------------------------------------------
  it("records no events when there are no active ledger rows", async () => {
    const rateVersion = makeMockRateVersion();
    const mockPrisma = makeMockPrisma(rateVersion, []);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const result = await runNightlyStorageCharge({
      targetDayStartMs: Date.UTC(2026, 6, 2, 0, 0, 0),
    });

    expect(result.groupsCharged).toBe(0);
    expect(result.eventsRecorded).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Scenario 5: Per-GB-hour rate is derived from monthly rate / (days * 24)
  // -----------------------------------------------------------------------
  it("derives the per-GB-hour rate from units_per_gb_per_month and days in month", async () => {
    // July has 31 days; rate = 300 / (31 * 24) ≈ 0.4032
    const rateVersion = makeMockRateVersion({
      units_per_gb_per_month:
        300 as unknown as RateVersion["units_per_gb_per_month"],
      unit_cost_dollars: 0.001 as unknown as RateVersion["unit_cost_dollars"],
    });
    const targetDayStartMs = Date.UTC(2026, 6, 2, 0, 0, 0); // July in a 31-day month

    // 1 GB alive for all 24 hours
    const ledgerRow = makeLedgerRow({
      size_bytes: BigInt(BYTES_PER_GB),
      written_at: new Date(targetDayStartMs - MS_PER_HOUR),
      deleted_at: null,
    });

    let capturedUnitsConsumed: number | undefined;
    const mockPrisma = {
      ...makeMockPrisma(rateVersion, [ledgerRow]),
      $transaction: jest.fn(
        async (
          cb: (tx: {
            usageEvent: { create: jest.Mock };
            usagePeriodSummary: { upsert: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            usageEvent: {
              create: jest.fn(
                ({ data }: { data: { units_consumed: number } }) => {
                  capturedUnitsConsumed = data.units_consumed;
                  return Promise.resolve({ id: "evt-1" });
                },
              ),
            },
            usagePeriodSummary: { upsert: jest.fn().mockResolvedValue({}) },
          };
          return cb(tx);
        },
      ),
    };
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    await runNightlyStorageCharge({ targetDayStartMs });

    // Expected: 24 gb-hours * (300 / (31 * 24)) = 24 * 0.4032... ≈ 9.677
    const expectedCostPerGbHour = 300 / (31 * 24);
    const expectedUnits = 24 * expectedCostPerGbHour;
    expect(capturedUnitsConsumed).toBeCloseTo(expectedUnits, 3);
  });

  it("returns early with zeros when no active rate version exists", async () => {
    const mockPrisma = makeMockPrisma(null, []);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const result = await runNightlyStorageCharge({
      targetDayStartMs: Date.UTC(2026, 6, 2, 0, 0, 0),
    });

    expect(result.groupsCharged).toBe(0);
    expect(result.eventsRecorded).toBe(0);
  });
});

describe("runMonthEndArchival", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Scenario 1: Deleted ledger rows from prior months are purged
  // -----------------------------------------------------------------------
  it("deletes GroupStorageLedger rows deleted before the current month", async () => {
    const mockPrisma = makeMockPrisma(null, []);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const currentMonthStartMs = Date.UTC(2026, 6, 1, 0, 0, 0); // 2026-07-01
    await runMonthEndArchival({ currentMonthStartMs });

    expect(mockPrisma.groupStorageLedger.deleteMany).toHaveBeenCalledWith({
      where: {
        deleted_at: {
          not: null,
          lt: new Date(currentMonthStartMs),
        },
      },
    });
  });

  // -----------------------------------------------------------------------
  // Scenario 3: UsageEvent rows beyond retention window are purged
  // -----------------------------------------------------------------------
  it("deletes UsageEvent rows older than the retention window", async () => {
    const mockPrisma = makeMockPrisma(null, []);
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const originalEnv = process.env.USAGE_EVENT_RETENTION_DAYS;
    process.env.USAGE_EVENT_RETENTION_DAYS = "730";

    const currentMonthStartMs = Date.UTC(2026, 6, 1, 0, 0, 0);
    const beforeCall = Date.now();
    await runMonthEndArchival({ currentMonthStartMs });
    const afterCall = Date.now();

    const callArgs = mockPrisma.usageEvent.deleteMany.mock.calls[0][0];
    const cutoff = callArgs.where.created_at.lt as Date;
    const expectedCutoffMs = beforeCall - 730 * 24 * MS_PER_HOUR;

    // Cutoff should be approximately now - 730 days (within test execution time)
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoffMs - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      afterCall - 730 * 24 * MS_PER_HOUR + 5000,
    );

    if (originalEnv === undefined) {
      delete process.env.USAGE_EVENT_RETENTION_DAYS;
    } else {
      process.env.USAGE_EVENT_RETENTION_DAYS = originalEnv;
    }
  });

  // -----------------------------------------------------------------------
  // Scenario 4: UsagePeriodSummary rows are never touched
  // -----------------------------------------------------------------------
  it("never calls deleteMany on UsagePeriodSummary", async () => {
    const mockPrisma = {
      ...makeMockPrisma(null, []),
      usagePeriodSummary: { deleteMany: jest.fn() },
    };
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    await runMonthEndArchival({ currentMonthStartMs: Date.UTC(2026, 6, 1) });

    expect(mockPrisma.usagePeriodSummary.deleteMany).not.toHaveBeenCalled();
  });

  it("returns counts of archived rows", async () => {
    const mockPrisma = makeMockPrisma(null, []);
    mockPrisma.groupStorageLedger.deleteMany.mockResolvedValue({ count: 42 });
    mockPrisma.usageEvent.deleteMany.mockResolvedValue({ count: 17 });
    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

    const result = await runMonthEndArchival({
      currentMonthStartMs: Date.UTC(2026, 6, 1),
    });

    expect(result.ledgerRowsArchived).toBe(42);
    expect(result.usageEventsArchived).toBe(17);
  });
});
