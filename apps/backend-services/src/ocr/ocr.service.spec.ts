import { DocumentStatus } from "@generated/client";
import { ConflictException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@generated/client";
import { AuditService } from "@/audit/audit.service";
import { PrismaService } from "@/database/prisma.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DocumentService } from "../document/document.service";
import { DocumentData } from "../document/document-db.types";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { OcrService } from "./ocr.service";

const defaultDocument = {
  id: "id",
  title: "hi",
  file_path: "testgroup1/ocr/test-file.pdf",
  normalized_file_path: "testgroup1/ocr/testid/normalized.pdf",
  file_size: 1223,
  file_type: "cuid/ocr/test-file.png",
  original_filename: "test-file.png",
  source: "test",
  status: DocumentStatus.pre_ocr,
  updated_at: new Date(),
  created_at: new Date(),
  apim_request_id: "uuidHere",
  model_id: "prebuilt-layout",
  workflow_config_id: "workflow-config-123",
  group_id: "group-1",
} as DocumentData;

describe("OcrService", () => {
  let service: OcrService;
  let documentService: DocumentService;
  let temporalClientService: TemporalClientService;
  let blobStorage: BlobStorageInterface;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        OcrService,
        { provide: AppLoggerService, useValue: mockAppLogger },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.azure.com",
                AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
              };
              return config[key];
            }),
          },
        },
        {
          provide: DocumentService,
          useValue: {
            findDocument: jest
              .fn()
              .mockImplementation(async (_id: string) => defaultDocument),
            updateDocument: jest.fn().mockResolvedValue({
              ...defaultDocument,
              status: DocumentStatus.ongoing_ocr,
              workflow_id: "workflow-123",
            }),
            upsertOcrResult: jest.fn(),
            findOcrResult: jest.fn(),
          },
        },
        {
          provide: TemporalClientService,
          useValue: {
            startGraphWorkflow: jest.fn().mockResolvedValue("workflow-123"),
            getWorkflowStatus: jest.fn(),
            queryWorkflowStatus: jest.fn(),
            isWorkflowRunning: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: BLOB_STORAGE,
          useValue: {
            read: jest.fn().mockResolvedValue(Buffer.from("test")),
            write: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(true),
            delete: jest.fn().mockResolvedValue(undefined),
            list: jest.fn().mockResolvedValue([]),
            deleteByPrefix: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditService,
          useValue: { recordEvent: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: PrismaService,
          useValue: {
            transaction: jest.fn(
              async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
                fn({} as Prisma.TransactionClient),
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<OcrService>(OcrService);
    documentService = moduleRef.get<DocumentService>(DocumentService);
    temporalClientService = moduleRef.get<TemporalClientService>(
      TemporalClientService,
    );
    blobStorage = moduleRef.get<BlobStorageInterface>(BLOB_STORAGE);
  });

  describe("OcrService constructor", () => {
    it("should initialize successfully", () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue("/tmp/storage"),
      };
      const mockBlobStorage = {
        read: jest.fn(),
        write: jest.fn(),
        exists: jest.fn(),
        delete: jest.fn(),
      };
      expect(
        () =>
          new OcrService(
            mockConfigService as any,
            {} as DocumentService,
            {} as TemporalClientService,
            mockBlobStorage as any,
            mockAppLogger,
            { recordEvent: jest.fn() } as unknown as AuditService,
            {
              transaction: jest.fn(async (fn) => fn({})),
            } as unknown as PrismaService,
          ),
      ).not.toThrow();
    });
  });

  describe("requestOcr", () => {
    it("should return workflow id and ongoing status upon success", async () => {
      const result = await service.requestOcr("0000");
      expect(result.status).toEqual(DocumentStatus.ongoing_ocr);
      expect(result.workflowId).toEqual("workflow-123");
      expect(temporalClientService.startGraphWorkflow).toHaveBeenCalledWith(
        "0000",
        expect.any(String),
        expect.any(Object),
        defaultDocument.group_id,
        undefined,
      );
    });

    it("populates initialCtx.documentMetadata.receivedAt from document.created_at (used by `doc.*` ref namespace)", async () => {
      const fixedDate = new Date("2026-01-15T12:34:56.000Z");
      (documentService.findDocument as jest.Mock).mockResolvedValueOnce({
        ...defaultDocument,
        created_at: fixedDate,
      });

      await service.requestOcr("0000");

      const initialCtx = (temporalClientService.startGraphWorkflow as jest.Mock)
        .mock.calls[0][2] as Record<string, unknown>;
      expect(initialCtx.documentMetadata).toEqual({
        receivedAt: fixedDate.toISOString(),
      });
    });

    it("should merge templateModelId from document metadata into initialCtx", async () => {
      (documentService.findDocument as jest.Mock).mockResolvedValueOnce({
        ...defaultDocument,
        metadata: { templateModelId: "tm-from-meta" },
      });
      await service.requestOcr("doc-1");
      expect(temporalClientService.startGraphWorkflow).toHaveBeenCalledWith(
        "doc-1",
        "workflow-config-123",
        expect.objectContaining({ templateModelId: "tm-from-meta" }),
        defaultDocument.group_id,
        undefined,
      );
    });

    it("should let ctxOverrides override templateModelId from metadata", async () => {
      (documentService.findDocument as jest.Mock).mockResolvedValueOnce({
        ...defaultDocument,
        metadata: { templateModelId: "tm-a" },
      });
      await service.requestOcr("doc-2", { templateModelId: "tm-b" });
      expect(temporalClientService.startGraphWorkflow).toHaveBeenCalledWith(
        "doc-2",
        "workflow-config-123",
        expect.objectContaining({ templateModelId: "tm-b" }),
        defaultDocument.group_id,
        undefined,
      );
    });

    it("should throw a NotFoundException if no document matches that id", async () => {
      (documentService.findDocument as jest.Mock).mockResolvedValue(null);
      await expect(service.requestOcr("123")).rejects.toThrow(
        "Entry for document with ID 123 not found.",
      );
    });

    it("should return a failed status with error if the file is not loaded properly", async () => {
      (blobStorage.read as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.requestOcr("123")).resolves.toEqual({
        status: DocumentStatus.failed,
        error: "File not found.",
      });
    });

    it("should return a failed status with error if Temporal workflow fails to start", async () => {
      (
        temporalClientService.startGraphWorkflow as jest.Mock
      ).mockRejectedValueOnce(new Error("Temporal connection failed"));
      await expect(service.requestOcr("123")).resolves.toEqual({
        status: DocumentStatus.failed,
        error: "Temporal connection failed",
      });
    });
  });

  describe("reprocessDocument", () => {
    const runnableDoc = {
      ...defaultDocument,
      id: "doc-1",
      status: DocumentStatus.failed,
      workflow_config_id: "workflow-config-123",
      normalized_file_path: "testgroup1/ocr/doc-1/normalized.pdf",
      purged_at: null,
    } as DocumentData;

    it("starts a new run for a failed document and returns the workflow id", async () => {
      const result = await service.reprocessDocument(runnableDoc);
      expect(result).toEqual({
        workflowExecutionId: "workflow-123",
        status: DocumentStatus.ongoing_ocr,
      });
      expect(temporalClientService.startGraphWorkflow).toHaveBeenCalled();
    });

    it("allows a stuck ongoing_ocr document", async () => {
      const result = await service.reprocessDocument({
        ...runnableDoc,
        status: DocumentStatus.ongoing_ocr,
      } as DocumentData);
      expect(result.status).toEqual(DocumentStatus.ongoing_ocr);
    });

    it("rejects a non-runnable status (e.g. complete)", async () => {
      await expect(
        service.reprocessDocument({
          ...runnableDoc,
          status: DocumentStatus.complete,
        } as DocumentData),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(temporalClientService.startGraphWorkflow).not.toHaveBeenCalled();
    });

    it("rejects a document with no workflow configuration", async () => {
      await expect(
        service.reprocessDocument({
          ...runnableDoc,
          workflow_config_id: null,
        } as DocumentData),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a purged document (source reclaimed)", async () => {
      await expect(
        service.reprocessDocument({
          ...runnableDoc,
          purged_at: new Date(),
        } as DocumentData),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects when the normalized source file is missing from storage", async () => {
      (blobStorage.exists as jest.Mock).mockResolvedValueOnce(false);
      await expect(
        service.reprocessDocument(runnableDoc),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(temporalClientService.startGraphWorkflow).not.toHaveBeenCalled();
    });

    it("rejects when a run is already in flight", async () => {
      (
        temporalClientService.isWorkflowRunning as jest.Mock
      ).mockResolvedValueOnce(true);
      await expect(
        service.reprocessDocument(runnableDoc),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(temporalClientService.startGraphWorkflow).not.toHaveBeenCalled();
    });
  });
});
