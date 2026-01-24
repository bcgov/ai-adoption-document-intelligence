// This needs to be above imports
const readFile = jest.fn().mockResolvedValue({
  toString: (s: String) => s,
  length: 100,
});
jest.mock("fs/promises", () => ({ readFile }));

import { DocumentStatus } from "@generated/enums";
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as fs from "fs/promises";
import { DatabaseService, DocumentData } from "../database/database.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
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
const _analysisResponse: AnalysisResponse = {
  status: "complete",
  analyzeResult: analysisResult,
  lastUpdatedDateTime: Date.now().toString(),
  createdDateTime: Date.now().toString(),
};

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

  describe("retrieveOcrResults", () => {
    it("should return OCR results from database", async () => {
      const mockOcrResult = {
        document_id: "123",
        extracted_text: "a bunch of content",
        pages: [],
        tables: [],
        paragraphs: [],
        styles: [],
        sections: [],
        figures: [],
        keyValuePairs: null,
        processed_at: new Date().toISOString(),
      };
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.completed_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockResolvedValue(
        mockOcrResult,
      );
      const result = await service.retrieveOcrResults("123");
      expect(result.content).toEqual("a bunch of content");
    });

    it("should throw a NotFoundException if document not found", async () => {
      (databaseService.findDocument as jest.Mock).mockReturnValueOnce(null);
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Entry for document with ID 123 not found.",
      );
    });

    it("should throw ServiceUnavailableException if workflow is still running", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "RUNNING",
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "OCR processing is still in progress",
      );
    });

    it("should throw BadRequestException if document was never sent for OCR", async () => {
      // if pre-ocr
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.pre_ocr,
        workflow_id: null,
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Document ID 123 has not yet been sent for OCR",
      );

      // if failed
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.failed,
        workflow_id: null,
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Document ID 123 has not yet been sent for OCR",
      );

      // if no workflow_id
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: null,
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Document ID 123 does not have an associated workflow",
      );
    });

    it("should throw ServiceUnavailableException if workflow failed", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "FAILED",
      });
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "OCR processing failed",
      );
    });

    it("should throw ServiceUnavailableException if workflow completed but results not in database", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "COMPLETED",
      });

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Workflow workflow-123 completed but OCR results not found in database",
      );
    }, 10000);

    it("should return results after waiting for database when workflow completed", async () => {
      jest.useFakeTimers();
      const mockOcrResult = {
        document_id: "123",
        extracted_text: "content",
        pages: [],
        tables: [],
        paragraphs: [],
        styles: [],
        sections: [],
        figures: [],
        keyValuePairs: null,
        processed_at: new Date().toISOString(),
      };

      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock)
        .mockImplementationOnce(() => {
          throw new NotFoundException("No OCR result found");
        })
        .mockResolvedValueOnce(mockOcrResult);
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "COMPLETED",
      });

      const resultPromise = service.retrieveOcrResults("123");

      // Fast-forward timers to skip the delay
      jest.advanceTimersByTime(1000);

      const result = await resultPromise;
      expect(result.content).toEqual("content");

      jest.useRealTimers();
    });

    it("should provide detailed status message when workflow is running with query status", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "RUNNING",
      });
      (
        temporalClientService.queryWorkflowStatus as jest.Mock
      ).mockResolvedValue({
        currentStep: "polling",
        status: "running",
        retryCount: 2,
        maxRetries: 5,
      });

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Current step: polling",
      );
    });

    it("should handle query error gracefully when workflow is running", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "RUNNING",
      });
      (
        temporalClientService.queryWorkflowStatus as jest.Mock
      ).mockRejectedValue(new Error("Query failed"));

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should update document status to failed if workflow failed and document status is not failed", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "FAILED",
      });
      (
        temporalClientService.queryWorkflowStatus as jest.Mock
      ).mockResolvedValue({
        error: "Workflow error",
      });

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(databaseService.updateDocument).toHaveBeenCalledWith("123", {
        status: DocumentStatus.failed,
      });
    });

    it("should not update document status if already failed", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.failed,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "FAILED",
      });

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(databaseService.updateDocument).not.toHaveBeenCalled();
    });

    it("should throw ServiceUnavailableException for unknown workflow status", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockResolvedValue({
        status: "UNKNOWN_STATUS",
      });

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "OCR processing has unknown status",
      );
    });

    it("should handle Temporal unavailable error and fallback to database", async () => {
      const mockOcrResult = {
        document_id: "123",
        extracted_text: "content",
        pages: [],
        tables: [],
        paragraphs: [],
        styles: [],
        sections: [],
        figures: [],
        keyValuePairs: null,
        processed_at: new Date().toISOString(),
      };

      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock)
        .mockImplementationOnce(() => {
          throw new NotFoundException("No OCR result found");
        })
        .mockResolvedValueOnce(mockOcrResult);
      (temporalClientService.getWorkflowStatus as jest.Mock).mockRejectedValue(
        new Error("Temporal client not initialized"),
      );

      const result = await service.retrieveOcrResults("123");
      expect(result.content).toEqual("content");
    });

    it("should handle Temporal unavailable error and throw if database also fails", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockRejectedValue(
        new Error("Temporal client not initialized"),
      );

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should wrap non-NestJS errors in ServiceUnavailableException", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        "Failed to retrieve OCR results for document 123",
      );
    });

    it("should handle non-Error objects in error handling", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockRejectedValue(
        "String error",
      );

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it("should re-throw NestJS exceptions without wrapping", async () => {
      (databaseService.findDocument as jest.Mock).mockResolvedValue({
        ...defaultDocument,
        status: DocumentStatus.ongoing_ocr,
        workflow_id: "workflow-123",
      });
      (databaseService.findOcrResult as jest.Mock).mockImplementation(() => {
        throw new NotFoundException("No OCR result found");
      });
      (temporalClientService.getWorkflowStatus as jest.Mock).mockRejectedValue(
        new BadRequestException("Bad request"),
      );

      await expect(service.retrieveOcrResults("123")).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
