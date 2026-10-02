import { DocumentStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { BLOB_STORAGE } from "@/blob-storage/blob-storage.interface";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";
import { DocumentDbService } from "../document/document-db.service";
import {
  AUDIT_EVENT_RETENTION_ENV_VAR,
  BENCHMARK_AUDIT_LOG_RETENTION_ENV_VAR,
  DOCUMENT_RETENTION_ENV_VAR,
  DocumentRetentionService,
  REVIEW_SESSION_RETENTION_ENV_VAR,
} from "./retention.service";
import { RetentionDbService } from "./retention-db.service";

const mockDocumentDb = {
  findExpiredDocuments: jest.fn(),
  deleteDocument: jest.fn(),
};

const mockBlobStorage = {
  deleteByPrefix: jest.fn(),
};

/** Stand-in for the lock-holding transaction client passed to job bodies. */
const LOCK_TX = { lockTx: true };

const mockRetentionDb = {
  deleteAuditEventsOlderThan: jest.fn(),
  deleteBenchmarkAuditLogsOlderThan: jest.fn(),
  deleteCompletedReviewSessionsOlderThan: jest.fn(),
  runWithDatabaseLock: jest
    .fn()
    .mockImplementation(
      async (_label: string, fn: (tx: object) => Promise<void>) => {
        await fn(LOCK_TX);
      },
    ),
};

const mockAuditService = {
  recordEvent: jest.fn(),
};

const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
};

// A cuid-like group id used for blob-path construction.
const GROUP_A = "clh7z2xk00000356u8e3h1234";
const GROUP_B = "clh7z2xk00000356u8e3h5678";

let service: DocumentRetentionService;

describe("DocumentRetentionService", () => {
  beforeEach(async () => {
    process.env[DOCUMENT_RETENTION_ENV_VAR] = "90";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentRetentionService,
        { provide: DocumentDbService, useValue: mockDocumentDb },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
        { provide: RetentionDbService, useValue: mockRetentionDb },
        { provide: AppLoggerService, useValue: mockLogger },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<DocumentRetentionService>(DocumentRetentionService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env[DOCUMENT_RETENTION_ENV_VAR];
  });

  it("skips and warns when DOCUMENT_RETENTION_DAYS is not set", async () => {
    delete process.env[DOCUMENT_RETENTION_ENV_VAR];

    await service.deleteExpiredDocuments();

    expect(mockDocumentDb.findExpiredDocuments).not.toHaveBeenCalled();
    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(DOCUMENT_RETENTION_ENV_VAR),
      expect.objectContaining({ value: undefined }),
    );
  });

  it.each([
    "0",
    "-1",
    "abc",
    "",
  ])("skips and warns when DOCUMENT_RETENTION_DAYS is invalid (%s)", async (value) => {
    process.env[DOCUMENT_RETENTION_ENV_VAR] = value;

    await service.deleteExpiredDocuments();

    expect(mockDocumentDb.findExpiredDocuments).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(DOCUMENT_RETENTION_ENV_VAR),
      expect.any(Object),
    );
  });

  it("queries expired documents with terminal statuses and batch size and does nothing when empty", async () => {
    mockDocumentDb.findExpiredDocuments.mockResolvedValue([]);

    await service.deleteExpiredDocuments();

    expect(mockDocumentDb.findExpiredDocuments).toHaveBeenCalledWith(
      expect.any(Date),
      expect.arrayContaining([
        DocumentStatus.complete,
        DocumentStatus.failed,
        DocumentStatus.conversion_failed,
      ]),
      500,
    );
    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    expect(mockDocumentDb.deleteDocument).not.toHaveBeenCalled();
    expect(mockLogger.log).not.toHaveBeenCalled();
  });

  it("passes a cutoff date based on the DOCUMENT_RETENTION_DAYS env var", async () => {
    process.env[DOCUMENT_RETENTION_ENV_VAR] = "90";
    mockDocumentDb.findExpiredDocuments.mockResolvedValue([]);
    const before = Date.now();

    await service.deleteExpiredDocuments();

    const after = Date.now();
    const [cutoff] = mockDocumentDb.findExpiredDocuments.mock.calls[0] as [
      Date,
      ...unknown[],
    ];
    const cutoffMs = cutoff.getTime();
    const expectedMs = 90 * 24 * 60 * 60 * 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(before - expectedMs - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - expectedMs + 1000);
  });

  it("deletes blobs then the DB row for a single expired document", async () => {
    const doc = { id: "docaaaaaaaaaaaaaaaaaaaaaaa", group_id: GROUP_A };
    mockDocumentDb.findExpiredDocuments.mockResolvedValue([doc]);
    mockDocumentDb.deleteDocument.mockResolvedValue(true);

    await service.deleteExpiredDocuments();

    const expectedPrefix = buildBlobPrefixPath(GROUP_A, OperationCategory.OCR, [
      doc.id,
    ]);
    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledWith(expectedPrefix);
    // Exact arguments: the row delete must not run in the lock transaction,
    // or a rollback would keep rows whose blobs are already gone.
    expect(mockDocumentDb.deleteDocument).toHaveBeenCalledWith(doc.id);
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Document retention cleanup run complete",
      expect.objectContaining({ deleted: 1, errors: 0 }),
    );
  });

  it("deletes blobs before the DB row (blob first ordering)", async () => {
    const callOrder: string[] = [];
    const doc = { id: "docaaaaaaaaaaaaaaaaaaaaaaa", group_id: GROUP_A };
    mockDocumentDb.findExpiredDocuments.mockResolvedValue([doc]);
    mockBlobStorage.deleteByPrefix.mockImplementation(() => {
      callOrder.push("blob");
      return Promise.resolve();
    });
    mockDocumentDb.deleteDocument.mockImplementation(() => {
      callOrder.push("db");
      return Promise.resolve(true);
    });

    await service.deleteExpiredDocuments();

    expect(callOrder).toEqual(["blob", "db"]);
  });

  it("processes multiple documents, each with its own group prefix", async () => {
    const docs = [
      { id: "docaaaaaaaaaaaaaaaaaaaaaaa", group_id: GROUP_A },
      { id: "docbbbbbbbbbbbbbbbbbbbbbbb", group_id: GROUP_B },
    ];
    mockDocumentDb.findExpiredDocuments.mockResolvedValue(docs);
    mockDocumentDb.deleteDocument.mockResolvedValue(true);

    await service.deleteExpiredDocuments();

    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledTimes(2);
    expect(mockDocumentDb.deleteDocument).toHaveBeenCalledTimes(2);
    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledWith(
      buildBlobPrefixPath(GROUP_A, OperationCategory.OCR, [docs[0].id]),
    );
    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledWith(
      buildBlobPrefixPath(GROUP_B, OperationCategory.OCR, [docs[1].id]),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Document retention cleanup run complete",
      expect.objectContaining({ deleted: 2, errors: 0 }),
    );
  });

  it("continues processing remaining documents when one fails, and reports the error count", async () => {
    const docs = [
      { id: "docccccccccccccccccccccccc", group_id: GROUP_A },
      { id: "docdddddddddddddddddddddddd", group_id: GROUP_B },
    ];
    mockDocumentDb.findExpiredDocuments.mockResolvedValue(docs);
    mockBlobStorage.deleteByPrefix
      .mockRejectedValueOnce(new Error("blob unavailable"))
      .mockResolvedValueOnce(undefined);
    mockDocumentDb.deleteDocument.mockResolvedValue(true);

    await service.deleteExpiredDocuments();

    // First doc errored before DB delete; second doc fully deleted.
    expect(mockDocumentDb.deleteDocument).toHaveBeenCalledTimes(1);
    expect(mockDocumentDb.deleteDocument).toHaveBeenCalledWith(docs[1].id);
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(docs[0].id),
      expect.objectContaining({ documentId: docs[0].id }),
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      "Document retention cleanup run complete",
      expect.objectContaining({ deleted: 1, errors: 1 }),
    );
  });

  it("runs under the deleteExpiredDocuments lock", async () => {
    mockDocumentDb.findExpiredDocuments.mockResolvedValue([]);

    await service.deleteExpiredDocuments();

    expect(mockRetentionDb.runWithDatabaseLock).toHaveBeenCalledWith(
      "deleteExpiredDocuments",
      expect.any(Function),
    );
  });

  it("does nothing when another container holds the lock", async () => {
    mockRetentionDb.runWithDatabaseLock.mockImplementationOnce(async () => {});

    await service.deleteExpiredDocuments();

    expect(mockDocumentDb.findExpiredDocuments).not.toHaveBeenCalled();
    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    expect(mockAuditService.recordEvent).not.toHaveBeenCalled();
  });

  it("records a document_retention_run audit event outside the lock transaction", async () => {
    const docs = [
      { id: "doceeeeeeeeeeeeeeeeeeeeeee", group_id: GROUP_A },
      { id: "docffffffffffffffffffffffff", group_id: GROUP_B },
    ];
    mockDocumentDb.findExpiredDocuments.mockResolvedValue(docs);
    mockDocumentDb.deleteDocument.mockResolvedValue(true);

    await service.deleteExpiredDocuments();

    expect(mockAuditService.recordEvent).toHaveBeenCalledTimes(1);
    expect(mockAuditService.recordEvent).toHaveBeenCalledWith({
      event_type: "document_retention_run",
      resource_type: "document",
      resource_id: "",
      actor_id: "retention_system",
      payload: {
        documentIds: docs.map((d) => d.id),
        daysRemoved: "90",
        quantity: 2,
      },
    });
  });

  it("aborts the run and logs an error when the DB query fails", async () => {
    mockDocumentDb.findExpiredDocuments.mockRejectedValue(
      new Error("db offline"),
    );

    await service.deleteExpiredDocuments();

    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    expect(mockDocumentDb.deleteDocument).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("aborting run"),
      expect.objectContaining({ stack: expect.anything() }),
    );
  });
});

// ---------------------------------------------------------------------------
// Shared helpers for the simple (DB-only) retention jobs
// ---------------------------------------------------------------------------

/** Builds shared test cases for any of the three simple retention cron jobs. */
function describeSimpleRetentionJob(params: {
  envVar: string;
  label: string;
  methodName:
    | "deleteExpiredAuditEvents"
    | "deleteExpiredBenchmarkAuditLogs"
    | "deleteExpiredReviewSessions";
  dbMethodName:
    | "deleteAuditEventsOlderThan"
    | "deleteBenchmarkAuditLogsOlderThan"
    | "deleteCompletedReviewSessionsOlderThan";
  logLabel: string;
  auditEventType: string;
  auditResourceType: string;
  getService: () => DocumentRetentionService;
}): void {
  describe(params.methodName, () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // Ensure the document-retention env var does not cause noise in these tests.
      delete process.env[DOCUMENT_RETENTION_ENV_VAR];
      process.env[params.envVar] = "90";
    });

    afterEach(() => {
      delete process.env[params.envVar];
    });

    it("skips and warns when the env var is not set", async () => {
      delete process.env[params.envVar];

      await params.getService()[params.methodName]();

      expect(mockRetentionDb[params.dbMethodName]).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(params.envVar),
        expect.objectContaining({ value: undefined }),
      );
    });

    it.each([
      "0",
      "-1",
      "abc",
      "",
    ])("skips and warns when the env var is invalid (%s)", async (value) => {
      process.env[params.envVar] = value;

      await params.getService()[params.methodName]();

      expect(mockRetentionDb[params.dbMethodName]).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(params.envVar),
        expect.any(Object),
      );
    });

    it("calls the DB method with the correct cutoff date and batch size", async () => {
      mockRetentionDb[params.dbMethodName].mockResolvedValue(0);
      const before = Date.now();

      await params.getService()[params.methodName]();

      const after = Date.now();
      expect(mockRetentionDb[params.dbMethodName]).toHaveBeenCalledWith(
        expect.any(Date),
        2000,
        LOCK_TX,
      );
      const [cutoff] = mockRetentionDb[params.dbMethodName].mock.calls[0] as [
        Date,
        ...unknown[],
      ];
      const expectedMs = 90 * 24 * 60 * 60 * 1000;
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(
        before - expectedMs - 1000,
      );
      expect(cutoff.getTime()).toBeLessThanOrEqual(after - expectedMs + 1000);
    });

    it("runs under a lock named after the job", async () => {
      mockRetentionDb[params.dbMethodName].mockResolvedValue(0);

      await params.getService()[params.methodName]();

      expect(mockRetentionDb.runWithDatabaseLock).toHaveBeenCalledWith(
        params.methodName,
        expect.any(Function),
      );
    });

    it("does nothing when another container holds the lock", async () => {
      mockRetentionDb.runWithDatabaseLock.mockImplementationOnce(
        async () => {},
      );

      await params.getService()[params.methodName]();

      expect(mockRetentionDb[params.dbMethodName]).not.toHaveBeenCalled();
      expect(mockAuditService.recordEvent).not.toHaveBeenCalled();
    });

    it("records its run audit event in the lock transaction", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0);

      await params.getService()[params.methodName]();

      expect(mockAuditService.recordEvent).toHaveBeenCalledWith(
        {
          event_type: params.auditEventType,
          resource_type: params.auditResourceType,
          resource_id: "",
          actor_id: "retention_system",
          payload: { daysRemoved: "90" },
        },
        LOCK_TX,
      );
    });

    it("logs the deleted count when rows were removed", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(42)
        .mockResolvedValueOnce(0);

      await params.getService()[params.methodName]();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(params.logLabel),
        expect.objectContaining({ deleted: 42, olderThanDays: 90 }),
      );
    });

    it("does not log when no rows were eligible", async () => {
      mockRetentionDb[params.dbMethodName].mockResolvedValue(0);

      await params.getService()[params.methodName]();

      expect(mockLogger.log).not.toHaveBeenCalled();
    });

    it("catches and logs DB errors without rethrowing", async () => {
      mockRetentionDb[params.dbMethodName].mockRejectedValue(
        new Error("db offline"),
      );

      await expect(
        params.getService()[params.methodName](),
      ).resolves.toBeUndefined();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(params.logLabel),
        expect.objectContaining({ stack: expect.anything() }),
      );
    });

    it("keeps deleting until a batch deletes nothing", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(2000)
        .mockResolvedValueOnce(2000)
        .mockResolvedValueOnce(150)
        .mockResolvedValueOnce(0);

      await params.getService()[params.methodName]();

      expect(mockRetentionDb[params.dbMethodName]).toHaveBeenCalledTimes(4);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(params.logLabel),
        expect.objectContaining({
          deleted: 4150,
          batches: 4,
          timeBudgetReached: false,
        }),
      );
    });

    it("runs every batch in the lock transaction", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(2000)
        .mockResolvedValueOnce(0);

      await params.getService()[params.methodName]();

      const calls = mockRetentionDb[params.dbMethodName].mock.calls as [
        Date,
        number,
        unknown,
      ][];
      expect(calls).toHaveLength(2);
      expect(calls.map((c) => c[2])).toEqual([LOCK_TX, LOCK_TX]);
    });

    it("does not stop on a short batch; only an empty batch ends the run", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(1400)
        .mockResolvedValueOnce(2000)
        .mockResolvedValueOnce(0);

      await params.getService()[params.methodName]();

      expect(mockRetentionDb[params.dbMethodName]).toHaveBeenCalledTimes(3);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(params.logLabel),
        expect.objectContaining({ deleted: 3400, batches: 3 }),
      );
    });

    it("reuses the same cutoff for every batch in a run", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(2000)
        .mockResolvedValueOnce(0);

      await params.getService()[params.methodName]();

      const calls = mockRetentionDb[params.dbMethodName].mock.calls as [
        Date,
        number,
      ][];
      expect(calls).toHaveLength(2);
      expect(calls[1][0].getTime()).toBe(calls[0][0].getTime());
    });

    it("stops after the 5-minute time budget even when batches are still full", async () => {
      let now = 1_000_000_000_000;
      const nowSpy = jest.spyOn(Date, "now").mockImplementation(() => now);
      mockRetentionDb[params.dbMethodName].mockImplementation(async () => {
        now += 60 * 1000;
        return 2000;
      });

      try {
        await params.getService()[params.methodName]();
      } finally {
        nowSpy.mockRestore();
      }

      expect(mockRetentionDb[params.dbMethodName]).toHaveBeenCalledTimes(5);
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining(params.logLabel),
        expect.objectContaining({
          deleted: 10000,
          batches: 5,
          timeBudgetReached: true,
        }),
      );
    });

    it("logs the count deleted before an error partway through a run", async () => {
      mockRetentionDb[params.dbMethodName]
        .mockResolvedValueOnce(2000)
        .mockRejectedValueOnce(new Error("db offline"));

      await expect(
        params.getService()[params.methodName](),
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining(params.logLabel),
        expect.objectContaining({ deletedBeforeError: 2000, batches: 1 }),
      );
      expect(mockLogger.log).not.toHaveBeenCalled();
    });
  });
}

describeSimpleRetentionJob({
  envVar: AUDIT_EVENT_RETENTION_ENV_VAR,
  label: AUDIT_EVENT_RETENTION_ENV_VAR,
  methodName: "deleteExpiredAuditEvents",
  dbMethodName: "deleteAuditEventsOlderThan",
  logLabel: "Audit event",
  auditEventType: "audit_events_retention_run",
  auditResourceType: "audit_event",
  getService: () => service,
});

describeSimpleRetentionJob({
  envVar: BENCHMARK_AUDIT_LOG_RETENTION_ENV_VAR,
  label: BENCHMARK_AUDIT_LOG_RETENTION_ENV_VAR,
  methodName: "deleteExpiredBenchmarkAuditLogs",
  dbMethodName: "deleteBenchmarkAuditLogsOlderThan",
  logLabel: "Benchmark audit log",
  auditEventType: "benchmark_audit_logs_retention_run",
  auditResourceType: "benchmark_audit_log",
  getService: () => service,
});

describeSimpleRetentionJob({
  envVar: REVIEW_SESSION_RETENTION_ENV_VAR,
  label: REVIEW_SESSION_RETENTION_ENV_VAR,
  methodName: "deleteExpiredReviewSessions",
  dbMethodName: "deleteCompletedReviewSessionsOlderThan",
  logLabel: "Review session",
  auditEventType: "review_session_retention_run",
  auditResourceType: "review_session",
  getService: () => service,
});
