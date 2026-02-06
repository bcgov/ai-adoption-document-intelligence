// This needs to be above imports
const readFile = jest.fn().mockResolvedValue({
  toString: (s: String) => s,
  length: 100,
});
jest.mock("fs/promises", () => ({ readFile }));

import { DocumentStatus } from "@generated/client";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs/promises";
import { DatabaseService, DocumentData } from "../database/database.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { OcrService } from "./ocr.service";

const defaultDocument = {
  id: "id",
  title: "hi",
  file_path: "path/goes/here",
  file_size: 1223,
  file_type: "image/png",
  original_filename: "test-file.png",
  source: "test",
  status: DocumentStatus.pre_ocr,
  updated_at: new Date(),
  created_at: new Date(),
  apim_request_id: "uuidHere",
  model_id: "prebuilt-layout",
} as DocumentData;

describe("OcrService", () => {
  let service: OcrService;
  let databaseService: DatabaseService;
  let temporalClientService: TemporalClientService;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        OcrService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://test.azure.com",
                AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
                STORAGE_PATH: "/tmp/storage",
              };
              return config[key];
            }),
          },
        },
        {
          provide: DatabaseService,
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
            startOCRWorkflow: jest.fn().mockResolvedValue("workflow-123"),
            getWorkflowStatus: jest.fn(),
            queryWorkflowStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<OcrService>(OcrService);
    databaseService = moduleRef.get<DatabaseService>(DatabaseService);
    temporalClientService = moduleRef.get<TemporalClientService>(
      TemporalClientService,
    );
  });

  describe("OcrService constructor", () => {
    it("should initialize successfully", () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValue("/tmp/storage"),
      };
      expect(
        () =>
          new OcrService(
            mockConfigService as any,
            {} as DatabaseService,
            {} as TemporalClientService,
          ),
      ).not.toThrow();
    });
  });

  describe("requestOcr", () => {
    it("should return workflow id and ongoing status upon success", async () => {
      const result = await service.requestOcr("0000");
      expect(result.status).toEqual(DocumentStatus.ongoing_ocr);
      expect(result.workflowId).toEqual("workflow-123");
      expect(temporalClientService.startOCRWorkflow).toHaveBeenCalled();
    });

    it("should throw a NotFoundException if no document matches that id", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue(null);
      await expect(service.requestOcr("123")).rejects.toThrow(
        "Entry for document with ID 123 not found.",
      );
    });

    it("should return a failed status with error if the file is not loaded properly", async () => {
      (fs.readFile as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.requestOcr("123")).resolves.toEqual({
        status: DocumentStatus.failed,
        error: "File not found.",
      });
    });

    it("should return a failed status with error if Temporal workflow fails to start", async () => {
      (
        temporalClientService.startOCRWorkflow as jest.Mock
      ).mockRejectedValueOnce(new Error("Temporal connection failed"));
      await expect(service.requestOcr("123")).resolves.toEqual({
        status: DocumentStatus.failed,
        error: "Temporal connection failed",
      });
    });
  });
});
