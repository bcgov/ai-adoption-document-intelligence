// This needs to be above imports
const readFile = jest.fn().mockResolvedValue({
  toString: (s: String) => s,
  length: 100,
});
jest.mock("fs/promises", () => ({ readFile }));

import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs/promises";
import { of } from "rxjs";
import { DatabaseService, DocumentData } from "../database/database.service";
import { DocumentStatus } from "../generated/enums";
import { AnalysisResponse, AnalysisResult } from "./azure-types";
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

const analysisResult: AnalysisResult = {
  apiVersion: "v1",
  modelId: "layout",
  stringIndexType: "",
  content: "a bunch of content",
  pages: [],
  tables: [],
  paragraphs: [],
  styles: [],
  contentFormat: "json",
  sections: [],
  figures: [],
};
const analysisResponse: AnalysisResponse = {
  status: "complete",
  analyzeResult: analysisResult,
  lastUpdatedDateTime: Date.now().toString(),
  createdDateTime: Date.now().toString(),
};

describe("OcrService", () => {
  let service: OcrService;
  let databaseService: DatabaseService;
  let httpService: HttpService;
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
            }),
            upsertOcrResult: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn().mockReturnValue(
              of({
                status: 202,
                headers: {
                  "apim-request-id": "123",
                },
              }),
            ),
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get<OcrService>(OcrService);
    databaseService = moduleRef.get<DatabaseService>(DatabaseService);
    httpService = moduleRef.get<HttpService>(HttpService);
  });

  describe("OcrService constructor", () => {
    it("throws if Azure config is missing", () => {
      const mockConfigService = {
        get: jest.fn().mockReturnValueOnce(undefined), // Always returns undefined
      };
      expect(
        () =>
          new OcrService(
            mockConfigService as any,
            {} as DatabaseService,
            {} as HttpService,
          ),
      ).toThrow("Azure Document Intelligence credentials not configured.");
    });
  });

  describe("requestOcr", () => {
    it("should return an apim id and ongoing status upon success", async () => {
      const result = await service.requestOcr("0000");
      expect(result.status).toEqual(DocumentStatus.ongoing_ocr);
      expect(result.apimRequestId).toEqual(defaultDocument.apim_request_id);
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

    it("should return a failed status with error if Azure does not return 202", async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(of({ status: 400 }));
      await expect(service.requestOcr("123")).resolves.toEqual({
        status: DocumentStatus.failed,
        error: "Error sending document to Azure",
      });
    });
  });

  describe("retrieveOcrResults", () => {
    it("should return OCR results", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.completed_ocr,
      });
      (httpService.get as jest.Mock).mockReturnValueOnce(
        of({ status: 200, data: analysisResponse }),
      );
      const result = await service.retrieveOcrResults("123");
      expect(result).toEqual(analysisResult);
    });

    it("should throw a NotFoundException if document not found", async () => {
      (databaseService.findDocument as jest.Mock).mockReturnValueOnce(null);
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Entry for document with ID 123 not found.",
      );
    });

    it("should return null if the analysis is still running", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.completed_ocr,
      });
      (httpService.get as jest.Mock).mockReturnValueOnce(
        of({ status: 200, data: { ...analysisResponse, status: "running" } }),
      );
      const result = await service.retrieveOcrResults("123");
      expect(result).toBeNull();
    });

    it("should throw an Error if the Azure response has no attached result", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.completed_ocr,
      });
      (httpService.get as jest.Mock).mockReturnValueOnce(
        of({
          status: 200,
          data: { ...analysisResponse, analyzeResult: null, status: "failed" },
        }),
      );
      expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "No analyzeResult in Azure response for document 123 (status: failed)",
      );
    });

    it("should throw an Error if document was never sent for OCR", async () => {
      // if pre-ocr
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.pre_ocr,
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Document ID 123 has not yet been sent for OCR.",
      );

      // if failed
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.pre_ocr,
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Document ID 123 has not yet been sent for OCR.",
      );

      // if no apim
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.completed_ocr,
        apim_request_id: null,
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Document ID 123 has not yet been sent for OCR.",
      );
    });

    it("should throw an Error if document cannot be retrieved from Azure", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.completed_ocr,
      });
      (httpService.get as jest.Mock).mockReturnValueOnce(of({ status: 400 }));
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Failed to retrieve OCR results for document ID 123",
      );
    });
  });
});
