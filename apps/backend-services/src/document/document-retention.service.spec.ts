import { DocumentStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { BLOB_STORAGE } from "@/blob-storage/blob-storage.interface";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";
import { DocumentDbService } from "./document-db.service";
import {
  DOCUMENT_RETENTION_ENV_VAR,
  DocumentRetentionService,
} from "./document-retention.service";

const mockDocumentDb = {
  findExpiredDocuments: jest.fn(),
  deleteDocument: jest.fn(),
};

const mockBlobStorage = {
  deleteByPrefix: jest.fn(),
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

describe("DocumentRetentionService", () => {
  let service: DocumentRetentionService;

  beforeEach(async () => {
    process.env[DOCUMENT_RETENTION_ENV_VAR] = "90";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentRetentionService,
        { provide: DocumentDbService, useValue: mockDocumentDb },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
        { provide: AppLoggerService, useValue: mockLogger },
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
      100,
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
