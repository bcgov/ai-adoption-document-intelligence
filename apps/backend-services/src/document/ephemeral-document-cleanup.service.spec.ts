import { DocumentStatus } from "@generated/client";
import { Test, TestingModule } from "@nestjs/testing";
import { BLOB_STORAGE } from "@/blob-storage/blob-storage.interface";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { DocumentDbService } from "./document-db.service";
import { EphemeralDocumentCleanupService } from "./ephemeral-document-cleanup.service";

const mockDocumentDb = {
  findPurgeableEphemeralDocuments: jest.fn(),
  markDocumentPurged: jest.fn(),
};

const mockTemporalClient = {
  deleteWorkflowExecution: jest.fn(),
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

describe("EphemeralDocumentCleanupService", () => {
  let service: EphemeralDocumentCleanupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EphemeralDocumentCleanupService,
        { provide: DocumentDbService, useValue: mockDocumentDb },
        { provide: TemporalClientService, useValue: mockTemporalClient },
        { provide: BLOB_STORAGE, useValue: mockBlobStorage },
        { provide: AppLoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<EphemeralDocumentCleanupService>(
      EphemeralDocumentCleanupService,
    );
    jest.clearAllMocks();
  });

  it("queries terminal statuses with the batch size and does nothing when empty", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockResolvedValue([]);

    await service.purgeEphemeralDocuments();

    expect(mockDocumentDb.findPurgeableEphemeralDocuments).toHaveBeenCalledWith(
      [
        DocumentStatus.complete,
        DocumentStatus.failed,
        DocumentStatus.conversion_failed,
      ],
      100,
    );
    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
  });

  it("ephemeral=true purges blobs, Temporal record, then marks the document", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockResolvedValue([
      {
        id: "docaaaaaaaaaaaaaaaaaaaaaaa",
        group_id: GROUP_A,
        workflow_execution_id: "wf-123",
        ephemeral: true,
      },
    ]);

    await service.purgeEphemeralDocuments();

    const expectedPrefix = buildBlobPrefixPath(GROUP_A, OperationCategory.OCR, [
      "docaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledWith(expectedPrefix);
    expect(mockTemporalClient.deleteWorkflowExecution).toHaveBeenCalledWith(
      "wf-123",
    );
    expect(mockDocumentDb.markDocumentPurged).toHaveBeenCalledWith(
      "docaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });

  it("policy files-only: deletes blobs, KEEPS Temporal record, still marks purged", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockResolvedValue([
      {
        id: "doceeeeeeeeeeeeeeeeeeeeeee",
        group_id: GROUP_A,
        workflow_execution_id: "wf-e",
        ephemeral: { files: true, temporalRecord: false },
      },
    ]);

    await service.purgeEphemeralDocuments();

    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledTimes(1);
    expect(mockTemporalClient.deleteWorkflowExecution).not.toHaveBeenCalled();
    expect(mockDocumentDb.markDocumentPurged).toHaveBeenCalledWith(
      "doceeeeeeeeeeeeeeeeeeeeeee",
    );
  });

  it("policy temporal-only: KEEPS blobs, deletes Temporal record, still marks purged", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockResolvedValue([
      {
        id: "docfffffffffffffffffffffff",
        group_id: GROUP_A,
        workflow_execution_id: "wf-f",
        ephemeral: { files: false, temporalRecord: true },
      },
    ]);

    await service.purgeEphemeralDocuments();

    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    expect(mockTemporalClient.deleteWorkflowExecution).toHaveBeenCalledWith(
      "wf-f",
    );
    expect(mockDocumentDb.markDocumentPurged).toHaveBeenCalledWith(
      "docfffffffffffffffffffffff",
    );
  });

  it("skips Temporal deletion when there is no execution id", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockResolvedValue([
      {
        id: "docbbbbbbbbbbbbbbbbbbbbbbb",
        group_id: GROUP_A,
        workflow_execution_id: null,
        ephemeral: true,
      },
    ]);

    await service.purgeEphemeralDocuments();

    expect(mockBlobStorage.deleteByPrefix).toHaveBeenCalledTimes(1);
    expect(mockTemporalClient.deleteWorkflowExecution).not.toHaveBeenCalled();
    expect(mockDocumentDb.markDocumentPurged).toHaveBeenCalledWith(
      "docbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });

  it("isolates failures: one bad document does not block others or mark it purged", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockResolvedValue([
      {
        id: "docccccccccccccccccccccccc",
        group_id: GROUP_A,
        workflow_execution_id: "wf-1",
        ephemeral: true,
      },
      {
        id: "docddddddddddddddddddddddd",
        group_id: GROUP_A,
        workflow_execution_id: "wf-2",
        ephemeral: true,
      },
    ]);
    mockBlobStorage.deleteByPrefix
      .mockRejectedValueOnce(new Error("blob boom"))
      .mockResolvedValueOnce(undefined);

    await service.purgeEphemeralDocuments();

    // First doc failed before marking; second doc fully purged.
    expect(mockDocumentDb.markDocumentPurged).toHaveBeenCalledTimes(1);
    expect(mockDocumentDb.markDocumentPurged).toHaveBeenCalledWith(
      "docddddddddddddddddddddddd",
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("docccccccccccccccccccccccc"),
      expect.objectContaining({ documentId: "docccccccccccccccccccccccc" }),
    );
  });

  it("aborts the run if the query fails", async () => {
    mockDocumentDb.findPurgeableEphemeralDocuments.mockRejectedValue(
      new Error("db down"),
    );

    await service.purgeEphemeralDocuments();

    expect(mockBlobStorage.deleteByPrefix).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("aborting run"),
      expect.objectContaining({ stack: expect.anything() }),
    );
  });
});
