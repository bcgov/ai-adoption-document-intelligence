import { buildUsageEventWriteOps } from "@ai-di/billing";
import type { Prisma } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { PrismaService } from "@/database/prisma.service";
import { StorageLedgerDbService } from "./storage-ledger-db.service";

jest.mock("@ai-di/billing", () => ({
  buildUsageEventWriteOps: jest.fn().mockReturnValue({
    createData: { id: "event-1" },
    upsertArgs: { where: {}, update: {}, create: {} },
  }),
}));

function makeMockPrisma() {
  const groupStorageLedger = {
    create: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const usageEvent = { create: jest.fn().mockResolvedValue({ id: "event-1" }) };
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
  const transaction = jest
    .fn()
    .mockImplementation(
      async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        fn({
          usageEvent,
          usagePeriodSummary,
        } as unknown as Prisma.TransactionClient),
    );
  return {
    prisma: { groupStorageLedger, rateVersion },
    transaction,
    groupStorageLedger,
    rateVersion,
    usageEvent,
    usagePeriodSummary,
  };
}

describe("StorageLedgerDbService", () => {
  let service: StorageLedgerDbService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma = makeMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageLedgerDbService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StorageLedgerDbService>(StorageLedgerDbService);
  });

  // ---------------------------------------------------------------------------
  // createLedgerEntry
  // ---------------------------------------------------------------------------
  describe("createLedgerEntry", () => {
    it("inserts a GroupStorageLedger row with correct fields", async () => {
      await service.createLedgerEntry(
        "group-abc",
        "group-abc/documents/doc-1/original.pdf",
        1024,
      );

      expect(mockPrisma.groupStorageLedger.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          group_id: "group-abc",
          blob_key: "group-abc/documents/doc-1/original.pdf",
          size_bytes: BigInt(1024),
          deleted_at: null,
        }),
      });
    });

    it("throws when the insert fails", async () => {
      mockPrisma.groupStorageLedger.create.mockRejectedValueOnce(
        new Error("DB error"),
      );

      await expect(
        service.createLedgerEntry("group-abc", "group-abc/file.pdf", 100),
      ).rejects.toThrow("DB error");
    });
  });

  // ---------------------------------------------------------------------------
  // markDeleted
  // ---------------------------------------------------------------------------
  describe("markDeleted", () => {
    it("sets deleted_at on the matching ledger row", async () => {
      await service.markDeleted("group-abc/documents/doc-1/original.pdf");

      expect(mockPrisma.groupStorageLedger.updateMany).toHaveBeenCalledWith({
        where: {
          blob_key: "group-abc/documents/doc-1/original.pdf",
          deleted_at: null,
        },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it("throws when the update fails", async () => {
      mockPrisma.groupStorageLedger.updateMany.mockRejectedValueOnce(
        new Error("DB error"),
      );

      await expect(service.markDeleted("group-abc/file.pdf")).rejects.toThrow(
        "DB error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // markDeletedByPrefix
  // ---------------------------------------------------------------------------
  describe("markDeletedByPrefix", () => {
    it("performs a single bulk updateMany with startsWith filter", async () => {
      await service.markDeletedByPrefix("group-abc/documents/doc-1/");

      expect(mockPrisma.groupStorageLedger.updateMany).toHaveBeenCalledWith({
        where: {
          blob_key: { startsWith: "group-abc/documents/doc-1/" },
          deleted_at: null,
        },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it("throws when the bulk update fails", async () => {
      mockPrisma.groupStorageLedger.updateMany.mockRejectedValueOnce(
        new Error("DB error"),
      );

      await expect(service.markDeletedByPrefix("group-abc/")).rejects.toThrow(
        "DB error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findActiveRateVersionWithBlobReadCost
  // ---------------------------------------------------------------------------
  describe("findActiveRateVersionWithBlobReadCost", () => {
    it("returns rateVersionId, unitCostDollars, and units when a match exists", async () => {
      const result = await service.findActiveRateVersionWithBlobReadCost();

      expect(result).toEqual({
        rateVersionId: "rate-v1",
        unitCostDollars: 0.001,
        units: 1,
      });
    });

    it("returns null when no rate version is found", async () => {
      mockPrisma.rateVersion.findFirst.mockResolvedValueOnce(null);

      const result = await service.findActiveRateVersionWithBlobReadCost();

      expect(result).toBeNull();
    });

    it("returns null when the rate version has no blob.read activity cost", async () => {
      mockPrisma.rateVersion.findFirst.mockResolvedValueOnce({
        id: "rate-v1",
        unit_cost_dollars: "0.001",
        effective_from: new Date("2024-01-01"),
        activity_costs: [],
      });

      const result = await service.findActiveRateVersionWithBlobReadCost();

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // createBlobReadEvent
  // ---------------------------------------------------------------------------
  describe("createBlobReadEvent", () => {
    const input = {
      event_type: "blob_read" as const,
      group_id: "group-abc",
      rate_version_id: "rate-v1",
      unit_cost_dollars: 0.001,
      units_consumed: 1,
      resource_id: "group-abc/file.pdf",
      resource_type: "blob",
    };

    it("calls buildUsageEventWriteOps and runs a transaction", async () => {
      await service.createBlobReadEvent(input);

      expect(buildUsageEventWriteOps).toHaveBeenCalledWith(input);
      expect(mockPrisma.transaction).toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).toHaveBeenCalled();
      expect(mockPrisma.usagePeriodSummary.upsert).toHaveBeenCalled();
    });

    it("uses the provided tx client instead of starting a new transaction", async () => {
      const txUsageEvent = { create: jest.fn().mockResolvedValue({}) };
      const txUsagePeriodSummary = { upsert: jest.fn().mockResolvedValue({}) };
      const tx = {
        usageEvent: txUsageEvent,
        usagePeriodSummary: txUsagePeriodSummary,
      } as unknown as Prisma.TransactionClient;

      await service.createBlobReadEvent(input, tx);

      expect(mockPrisma.transaction).not.toHaveBeenCalled();
      expect(txUsageEvent.create).toHaveBeenCalled();
    });

    it("throws when the transaction fails", async () => {
      mockPrisma.transaction.mockRejectedValueOnce(new Error("DB error"));

      await expect(service.createBlobReadEvent(input)).rejects.toThrow(
        "DB error",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // findActiveRateVersionWithBlobWriteCost
  // ---------------------------------------------------------------------------
  describe("findActiveRateVersionWithBlobWriteCost", () => {
    it("returns rateVersionId, unitCostDollars, and units when a match exists", async () => {
      mockPrisma.rateVersion.findFirst.mockResolvedValueOnce({
        id: "rate-v1",
        unit_cost_dollars: "0.001",
        effective_from: new Date("2024-01-01"),
        activity_costs: [
          { activity_name: "blob.write", cost_type: "flat", units: "5" },
        ],
      });

      const result = await service.findActiveRateVersionWithBlobWriteCost();

      expect(result).toEqual({
        rateVersionId: "rate-v1",
        unitCostDollars: 0.001,
        units: 5,
      });
    });

    it("returns null when no rate version is found", async () => {
      mockPrisma.rateVersion.findFirst.mockResolvedValueOnce(null);

      const result = await service.findActiveRateVersionWithBlobWriteCost();

      expect(result).toBeNull();
    });

    it("returns null when the rate version has no blob.write activity cost", async () => {
      mockPrisma.rateVersion.findFirst.mockResolvedValueOnce({
        id: "rate-v1",
        unit_cost_dollars: "0.001",
        effective_from: new Date("2024-01-01"),
        activity_costs: [],
      });

      const result = await service.findActiveRateVersionWithBlobWriteCost();

      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // createBlobWriteEvent
  // ---------------------------------------------------------------------------
  describe("createBlobWriteEvent", () => {
    const input = {
      event_type: "blob_write" as const,
      group_id: "group-abc",
      rate_version_id: "rate-v1",
      unit_cost_dollars: 0.001,
      units_consumed: 5,
      resource_id: "group-abc/file.pdf",
      resource_type: "blob",
    };

    it("calls buildUsageEventWriteOps and runs a transaction", async () => {
      await service.createBlobWriteEvent(input);

      expect(buildUsageEventWriteOps).toHaveBeenCalledWith(input);
      expect(mockPrisma.transaction).toHaveBeenCalled();
      expect(mockPrisma.usageEvent.create).toHaveBeenCalled();
      expect(mockPrisma.usagePeriodSummary.upsert).toHaveBeenCalled();
    });

    it("uses the provided tx client instead of starting a new transaction", async () => {
      const txUsageEvent = { create: jest.fn().mockResolvedValue({}) };
      const txUsagePeriodSummary = { upsert: jest.fn().mockResolvedValue({}) };
      const tx = {
        usageEvent: txUsageEvent,
        usagePeriodSummary: txUsagePeriodSummary,
      } as unknown as Prisma.TransactionClient;

      await service.createBlobWriteEvent(input, tx);

      expect(mockPrisma.transaction).not.toHaveBeenCalled();
      expect(txUsageEvent.create).toHaveBeenCalled();
    });

    it("throws when the transaction fails", async () => {
      mockPrisma.transaction.mockRejectedValueOnce(new Error("DB error"));

      await expect(service.createBlobWriteEvent(input)).rejects.toThrow(
        "DB error",
      );
    });
  });
});
