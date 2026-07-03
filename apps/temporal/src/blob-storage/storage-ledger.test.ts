import type { PrismaClient } from "@generated/client";
import {
  recordLedgerDelete,
  recordLedgerDeleteByPrefix,
  recordLedgerRead,
  recordLedgerWrite,
} from "./storage-ledger";

function makeMockPrisma() {
  const groupStorageLedger = {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const usageEvent = { create: jest.fn().mockResolvedValue({}) };
  const usagePeriodSummary = { upsert: jest.fn().mockResolvedValue({}) };
  const rateVersion = {
    findFirst: jest.fn().mockResolvedValue({
      id: "rate-v1",
      unit_cost_dollars: "0.001",
      effective_from: new Date("2024-01-01"),
      units_per_gb_per_month: "10",
      activity_costs: [
        { activity_name: "blob.read", cost_type: "flat", units: "1" },
      ],
    }),
  };
  const $transaction = jest
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ usageEvent, usagePeriodSummary }),
    );
  return {
    groupStorageLedger,
    rateVersion,
    usageEvent,
    usagePeriodSummary,
    $transaction,
  } as unknown as PrismaClient;
}

describe("recordLedgerWrite", () => {
  it("inserts a GroupStorageLedger row with correct fields", async () => {
    const prisma = makeMockPrisma();
    await recordLedgerWrite(prisma, "group-abc/docs/file.pdf", 2048);

    expect(prisma.groupStorageLedger.create as jest.Mock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        group_id: "group-abc",
        blob_key: "group-abc/docs/file.pdf",
        size_bytes: BigInt(2048),
        deleted_at: null,
      }),
    });
  });

  it("skips ledger insert for _shared/ prefix blobs", async () => {
    const prisma = makeMockPrisma();
    await recordLedgerWrite(prisma, "_shared/template.pdf", 1024);

    expect(
      prisma.groupStorageLedger.create as jest.Mock,
    ).not.toHaveBeenCalled();
  });

  it("does not throw if ledger insert fails", async () => {
    const prisma = makeMockPrisma();
    (prisma.groupStorageLedger.create as jest.Mock).mockRejectedValueOnce(
      new Error("DB error"),
    );

    await expect(
      recordLedgerWrite(prisma, "group-abc/file.pdf", 100),
    ).resolves.not.toThrow();
  });
});

describe("recordLedgerDelete", () => {
  it("sets deleted_at on the matching ledger row", async () => {
    const prisma = makeMockPrisma();
    await recordLedgerDelete(prisma, "group-abc/docs/file.pdf");

    expect(
      prisma.groupStorageLedger.updateMany as jest.Mock,
    ).toHaveBeenCalledWith({
      where: { blob_key: "group-abc/docs/file.pdf", deleted_at: null },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("does not throw if ledger update fails", async () => {
    const prisma = makeMockPrisma();
    (prisma.groupStorageLedger.updateMany as jest.Mock).mockRejectedValueOnce(
      new Error("DB error"),
    );

    await expect(
      recordLedgerDelete(prisma, "group-abc/file.pdf"),
    ).resolves.not.toThrow();
  });
});

describe("recordLedgerDeleteByPrefix", () => {
  it("performs a single bulk updateMany with startsWith filter", async () => {
    const prisma = makeMockPrisma();
    await recordLedgerDeleteByPrefix(prisma, "group-abc/docs/");

    expect(
      prisma.groupStorageLedger.updateMany as jest.Mock,
    ).toHaveBeenCalledWith({
      where: {
        blob_key: { startsWith: "group-abc/docs/" },
        deleted_at: null,
      },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it("does not throw if bulk update fails", async () => {
    const prisma = makeMockPrisma();
    (prisma.groupStorageLedger.updateMany as jest.Mock).mockRejectedValueOnce(
      new Error("DB error"),
    );

    await expect(
      recordLedgerDeleteByPrefix(prisma, "group-abc/"),
    ).resolves.not.toThrow();
  });
});

describe("recordLedgerRead", () => {
  it("skips _shared/ prefix keys without querying DB", async () => {
    const prisma = makeMockPrisma();
    await recordLedgerRead(prisma, "_shared/template.pdf");

    expect(prisma.rateVersion.findFirst as jest.Mock).not.toHaveBeenCalled();
    expect(prisma.$transaction as jest.Mock).not.toHaveBeenCalled();
  });

  it("creates a UsageEvent for a non-shared key", async () => {
    const prisma = makeMockPrisma();
    await recordLedgerRead(prisma, "group-abc/docs/file.pdf");

    expect(prisma.rateVersion.findFirst as jest.Mock).toHaveBeenCalled();
    expect(prisma.$transaction as jest.Mock).toHaveBeenCalled();
  });

  it("does not create UsageEvent when rateVersion is not found", async () => {
    const prisma = makeMockPrisma();
    (prisma.rateVersion.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await recordLedgerRead(prisma, "group-abc/file.pdf");

    expect(prisma.$transaction as jest.Mock).not.toHaveBeenCalled();
  });

  it("does not create UsageEvent when blob.read cost is zero", async () => {
    const prisma = makeMockPrisma();
    (prisma.rateVersion.findFirst as jest.Mock).mockResolvedValueOnce({
      id: "rate-v1",
      unit_cost_dollars: "0.001",
      effective_from: new Date("2024-01-01"),
      units_per_gb_per_month: "10",
      activity_costs: [
        { activity_name: "blob.read", cost_type: "flat", units: "0" },
      ],
    });

    await recordLedgerRead(prisma, "group-abc/file.pdf");

    expect(prisma.$transaction as jest.Mock).not.toHaveBeenCalled();
  });

  it("does not throw if transaction fails", async () => {
    const prisma = makeMockPrisma();
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error("DB error"),
    );

    await expect(
      recordLedgerRead(prisma, "group-abc/file.pdf"),
    ).resolves.not.toThrow();
  });
});
