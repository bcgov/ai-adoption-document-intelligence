import { Test, TestingModule } from "@nestjs/testing";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { StorageLedgerService } from "./storage-ledger.service";
import type { BlobReadRateInfo } from "./storage-ledger-db.service";
import { StorageLedgerDbService } from "./storage-ledger-db.service";

function makeMockDbService() {
  return {
    createLedgerEntry: jest.fn().mockResolvedValue(undefined),
    markDeleted: jest.fn().mockResolvedValue(undefined),
    markDeletedByPrefix: jest.fn().mockResolvedValue(undefined),
    findActiveRateVersionWithBlobReadCost: jest.fn().mockResolvedValue({
      rateVersionId: "rate-v1",
      unitCostDollars: 0.001,
      units: 1,
    } satisfies BlobReadRateInfo),
    createBlobReadEvent: jest.fn().mockResolvedValue(undefined),
    findActiveRateVersionWithBlobWriteCost: jest.fn().mockResolvedValue({
      rateVersionId: "rate-v1",
      unitCostDollars: 0.001,
      units: 5,
    } satisfies BlobReadRateInfo),
    createBlobWriteEvent: jest.fn().mockResolvedValue(undefined),
  };
}

describe("StorageLedgerService", () => {
  let service: StorageLedgerService;
  let mockDb: ReturnType<typeof makeMockDbService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDb = makeMockDbService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageLedgerService,
        { provide: StorageLedgerDbService, useValue: mockDb },
        { provide: AppLoggerService, useValue: mockAppLogger },
      ],
    }).compile();

    service = module.get<StorageLedgerService>(StorageLedgerService);
  });

  // ---------------------------------------------------------------------------
  // recordWrite
  // ---------------------------------------------------------------------------
  describe("recordWrite", () => {
    it("calls createLedgerEntry with extracted group_id and correct args", async () => {
      await service.recordWrite("group-abc/documents/doc-1/original.pdf", 1024);

      expect(mockDb.createLedgerEntry).toHaveBeenCalledWith(
        "group-abc",
        "group-abc/documents/doc-1/original.pdf",
        1024,
      );
    });

    it("extracts group_id from the first path segment", async () => {
      await service.recordWrite("my-group/subfolder/nested/file.pdf", 2048);

      expect(mockDb.createLedgerEntry).toHaveBeenCalledWith(
        "my-group",
        "my-group/subfolder/nested/file.pdf",
        2048,
      );
    });

    it("does not call createLedgerEntry for _shared/ prefix keys", async () => {
      await service.recordWrite("_shared/some-template.pdf", 512);

      expect(mockDb.createLedgerEntry).not.toHaveBeenCalled();
    });

    it("logs error and does not throw when createLedgerEntry fails", async () => {
      mockDb.createLedgerEntry.mockRejectedValueOnce(new Error("DB error"));

      await expect(
        service.recordWrite("group-abc/file.pdf", 100),
      ).resolves.not.toThrow();

      expect(mockAppLogger.error).toHaveBeenCalled();
    });

    it("creates a blob_write usage event for a non-shared key", async () => {
      await service.recordWrite("group-abc/documents/doc-1/original.pdf", 1024);

      expect(mockDb.findActiveRateVersionWithBlobWriteCost).toHaveBeenCalled();
      expect(mockDb.createBlobWriteEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "blob_write",
          group_id: "group-abc",
          rate_version_id: "rate-v1",
        }),
      );
    });

    it("does not create blob_write event for _shared/ prefix keys", async () => {
      await service.recordWrite("_shared/template.pdf", 512);

      expect(
        mockDb.findActiveRateVersionWithBlobWriteCost,
      ).not.toHaveBeenCalled();
      expect(mockDb.createBlobWriteEvent).not.toHaveBeenCalled();
    });

    it("does not create blob_write event when rateInfo is null", async () => {
      mockDb.findActiveRateVersionWithBlobWriteCost.mockResolvedValueOnce(null);

      await service.recordWrite("group-abc/file.pdf", 100);

      expect(mockDb.createBlobWriteEvent).not.toHaveBeenCalled();
    });

    it("does not create blob_write event when blob.write units is zero", async () => {
      mockDb.findActiveRateVersionWithBlobWriteCost.mockResolvedValueOnce({
        rateVersionId: "rate-v1",
        unitCostDollars: 0.001,
        units: 0,
      } satisfies BlobReadRateInfo);

      await service.recordWrite("group-abc/file.pdf", 100);

      expect(mockDb.createBlobWriteEvent).not.toHaveBeenCalled();
    });

    it("logs error and does not throw when createBlobWriteEvent fails", async () => {
      mockDb.createBlobWriteEvent.mockRejectedValueOnce(new Error("DB error"));

      await expect(
        service.recordWrite("group-abc/file.pdf", 100),
      ).resolves.not.toThrow();

      expect(mockAppLogger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // recordDelete
  // ---------------------------------------------------------------------------
  describe("recordDelete", () => {
    it("calls markDeleted with the correct key", async () => {
      await service.recordDelete("group-abc/documents/doc-1/original.pdf");

      expect(mockDb.markDeleted).toHaveBeenCalledWith(
        "group-abc/documents/doc-1/original.pdf",
      );
    });

    it("logs error and does not throw when markDeleted fails", async () => {
      mockDb.markDeleted.mockRejectedValueOnce(new Error("DB error"));

      await expect(
        service.recordDelete("group-abc/file.pdf"),
      ).resolves.not.toThrow();

      expect(mockAppLogger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // recordDeleteByPrefix
  // ---------------------------------------------------------------------------
  describe("recordDeleteByPrefix", () => {
    it("calls markDeletedByPrefix with the correct prefix", async () => {
      await service.recordDeleteByPrefix("group-abc/documents/doc-1/");

      expect(mockDb.markDeletedByPrefix).toHaveBeenCalledWith(
        "group-abc/documents/doc-1/",
      );
    });

    it("logs error and does not throw when markDeletedByPrefix fails", async () => {
      mockDb.markDeletedByPrefix.mockRejectedValueOnce(new Error("DB error"));

      await expect(
        service.recordDeleteByPrefix("group-abc/"),
      ).resolves.not.toThrow();

      expect(mockAppLogger.error).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // recordRead
  // ---------------------------------------------------------------------------
  describe("recordRead", () => {
    it("skips _shared/ prefix keys without touching the DB", async () => {
      await service.recordRead("_shared/template.pdf");

      expect(
        mockDb.findActiveRateVersionWithBlobReadCost,
      ).not.toHaveBeenCalled();
      expect(mockDb.createBlobReadEvent).not.toHaveBeenCalled();
    });

    it("creates a blob_read event for a non-shared key", async () => {
      await service.recordRead("group-abc/documents/doc-1/original.pdf");

      expect(mockDb.findActiveRateVersionWithBlobReadCost).toHaveBeenCalled();
      expect(mockDb.createBlobReadEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: "blob_read",
          group_id: "group-abc",
          rate_version_id: "rate-v1",
        }),
      );
    });

    it("does not create event when rateInfo is null", async () => {
      mockDb.findActiveRateVersionWithBlobReadCost.mockResolvedValueOnce(null);

      await service.recordRead("group-abc/file.pdf");

      expect(mockDb.createBlobReadEvent).not.toHaveBeenCalled();
    });

    it("does not create event when blob.read units is zero", async () => {
      mockDb.findActiveRateVersionWithBlobReadCost.mockResolvedValueOnce({
        rateVersionId: "rate-v1",
        unitCostDollars: 0.001,
        units: 0,
      } satisfies BlobReadRateInfo);

      await service.recordRead("group-abc/file.pdf");

      expect(mockDb.createBlobReadEvent).not.toHaveBeenCalled();
    });

    it("logs error and does not throw when createBlobReadEvent fails", async () => {
      mockDb.createBlobReadEvent.mockRejectedValueOnce(new Error("DB error"));

      await expect(
        service.recordRead("group-abc/file.pdf"),
      ).resolves.not.toThrow();

      expect(mockAppLogger.error).toHaveBeenCalled();
    });
  });
});
