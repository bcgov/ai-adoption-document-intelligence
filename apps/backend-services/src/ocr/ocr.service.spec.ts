import { HttpService } from "@nestjs/axios";
import { NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { of, throwError } from "rxjs";
import { DatabaseService } from "@/database/database.service";
import { DocumentStatus } from "@/generated/enums";
import { OcrService } from "./ocr.service";

// Mock fs/promises
jest.mock("fs/promises", () => ({
  readFile: jest.fn(),
}));

import { readFile } from "fs/promises";

describe("OcrService", () => {
  let service: OcrService;
  let databaseService: DatabaseService;
  let httpService: HttpService;

  const mockDocument = {
    id: "doc-123",
    file_path: "test/file.pdf",
    status: DocumentStatus.pre_ocr,
    apim_request_id: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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
            findDocument: jest.fn(),
            updateDocument: jest.fn(),
            upsertOcrResult: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OcrService>(OcrService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    httpService = module.get<HttpService>(HttpService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("constructor", () => {
    it("should throw error when Azure credentials are not configured", () => {
      expect(() => {
        Test.createTestingModule({
          providers: [
            OcrService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => undefined),
              },
            },
            {
              provide: DatabaseService,
              useValue: {},
            },
            {
              provide: HttpService,
              useValue: {},
            },
          ],
        }).compile();
      }).rejects.toThrow();
    });
  });

  describe("requestOcr", () => {
    it("should successfully request OCR processing", async () => {
      const mockFileBuffer = Buffer.from("test file content");
      const mockApimRequestId = "apim-123";

      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);
      readFile.mockResolvedValue(mockFileBuffer);
      jest.spyOn(httpService, "post").mockReturnValue(
        of({
          status: 202,
          headers: { "apim-request-id": mockApimRequestId },
          data: {},
          statusText: "Accepted",
          config: {} as any,
        }) as any,
      );
      jest.spyOn(databaseService, "updateDocument").mockResolvedValue({
        ...mockDocument,
        apim_request_id: mockApimRequestId,
        status: DocumentStatus.ongoing_ocr,
      } as any);

      const result = await service.requestOcr("doc-123");

      expect(result.apimRequestId).toBe(mockApimRequestId);
      expect(result.status).toBe(DocumentStatus.ongoing_ocr);
      expect(databaseService.findDocument).toHaveBeenCalledWith("doc-123");
      expect(databaseService.updateDocument).toHaveBeenCalledWith("doc-123", {
        apim_request_id: mockApimRequestId,
        status: DocumentStatus.ongoing_ocr,
      });
    });

    it("should throw NotFoundException when document not found", async () => {
      jest.spyOn(databaseService, "findDocument").mockResolvedValue(null);

      await expect(service.requestOcr("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should handle file read error", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);
      readFile.mockRejectedValue(new Error("File not found"));
      jest.spyOn(databaseService, "updateDocument").mockResolvedValue({
        ...mockDocument,
        status: DocumentStatus.failed,
      } as any);

      const result = await service.requestOcr("doc-123");

      expect(result.status).toBe(DocumentStatus.failed);
      expect(result.error).toBeDefined();
    });

    it("should handle Azure API error", async () => {
      const mockFileBuffer = Buffer.from("test file content");

      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);
      readFile.mockResolvedValue(mockFileBuffer);
      jest
        .spyOn(httpService, "post")
        .mockReturnValue(throwError(() => new Error("Azure API error")) as any);
      jest.spyOn(databaseService, "updateDocument").mockResolvedValue({
        ...mockDocument,
        status: DocumentStatus.failed,
      } as any);

      const result = await service.requestOcr("doc-123");

      expect(result.status).toBe(DocumentStatus.failed);
      expect(result.error).toBeDefined();
    });

    it("should handle non-202 response from Azure", async () => {
      const mockFileBuffer = Buffer.from("test file content");

      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);
      readFile.mockResolvedValue(mockFileBuffer);
      jest.spyOn(httpService, "post").mockReturnValue(
        of({
          status: 500,
          headers: {},
          data: {},
          statusText: "Internal Server Error",
          config: {} as any,
        }) as any,
      );
      jest.spyOn(databaseService, "updateDocument").mockResolvedValue({
        ...mockDocument,
        status: DocumentStatus.failed,
      } as any);

      const result = await service.requestOcr("doc-123");

      expect(result.status).toBe(DocumentStatus.failed);
    });
  });

  describe("retrieveOcrResults", () => {
    const mockDocumentWithApim = {
      ...mockDocument,
      apim_request_id: "apim-123",
      status: DocumentStatus.ongoing_ocr,
    };

    const mockAnalysisResponse = {
      status: "succeeded",
      analyzeResult: {
        content: "Test content",
        pages: [],
        tables: [],
        keyValuePairs: [],
      },
    };

    it("should successfully retrieve OCR results", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocumentWithApim as any);
      jest.spyOn(httpService, "get").mockReturnValue(
        of({
          status: 200,
          data: mockAnalysisResponse,
          headers: {},
          statusText: "OK",
          config: {} as any,
        }) as any,
      );
      jest
        .spyOn(databaseService, "upsertOcrResult")
        .mockResolvedValue(undefined);

      const result = await service.retrieveOcrResults("doc-123");

      expect(result).toEqual(mockAnalysisResponse.analyzeResult);
      expect(databaseService.upsertOcrResult).toHaveBeenCalledWith({
        documentId: "doc-123",
        analysisResponse: mockAnalysisResponse,
      });
    });

    it("should throw NotFoundException when document not found", async () => {
      jest.spyOn(databaseService, "findDocument").mockResolvedValue(null);

      await expect(service.retrieveOcrResults("non-existent")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw error when document has not been sent for OCR", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocument as any);

      await expect(service.retrieveOcrResults("doc-123")).rejects.toThrow(
        "Document ID doc-123 has not yet been sent for OCR.",
      );
    });

    it("should throw error when document status is failed", async () => {
      const failedDocument = {
        ...mockDocument,
        status: DocumentStatus.failed,
        apim_request_id: null,
      };
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(failedDocument as any);

      await expect(service.retrieveOcrResults("doc-123")).rejects.toThrow(
        "Document ID doc-123 has not yet been sent for OCR.",
      );
    });

    it("should handle non-200 response from Azure", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocumentWithApim as any);
      jest.spyOn(httpService, "get").mockReturnValue(
        of({
          status: 404,
          data: {},
          headers: {},
          statusText: "Not Found",
          config: {} as any,
        }) as any,
      );

      await expect(service.retrieveOcrResults("doc-123")).rejects.toThrow(
        "Failed to retrieve OCR results for document ID doc-123",
      );
    });

    it("should handle Azure API error", async () => {
      jest
        .spyOn(databaseService, "findDocument")
        .mockResolvedValue(mockDocumentWithApim as any);
      jest
        .spyOn(httpService, "get")
        .mockReturnValue(throwError(() => new Error("Network error")) as any);

      await expect(service.retrieveOcrResults("doc-123")).rejects.toThrow();
    });
  });
});
