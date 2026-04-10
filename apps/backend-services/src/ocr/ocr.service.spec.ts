import { DocumentStatus } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "@/audit/audit.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DocumentService } from "../document/document.service";
import type { DocumentData } from "../document/document-db.types";
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
              .mockImplementation(async (id: String) => defaultDocument),
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
          ),
      ).not.toThrow();
    });
  });

  describe("requestOcr", () => {
    it("should return workflow id and ongoing status upon success", async () => {
      const result = await service.requestOcr("0000");
      expect(result.status).toEqual(DocumentStatus.ongoing_ocr);
      expect(result.workflowId).toEqual("workflow-123");
      expect(temporalClientService.startGraphWorkflow).toHaveBeenCalled();
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
});
