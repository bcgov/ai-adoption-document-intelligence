/**
 * Mock activities for testing the OCR workflow (fixture generation and integration tests).
 * Return minimal valid shapes so the workflow completes the happy path without human review.
 */

import type { EnrichResultsParams } from "../activities";
import type {
  EnrichmentSummary,
  OCRResult,
  PollResult,
  PreparedFileData,
  SubmissionResult,
} from "../types";

interface OCRWorkflowInput {
  documentId: string;
  binaryData?: string;
  fileName?: string;
  fileType?: string;
  contentType?: string;
  modelId?: string;
}

export const mockActivities = {
  async updateDocumentStatus(
    _documentId: string,
    _status: string,
    _apimRequestId?: string,
  ): Promise<void> {},

  async prepareFileData(input: OCRWorkflowInput): Promise<PreparedFileData> {
    return {
      fileName: input.fileName || "document.pdf",
      fileType: (input.fileType as PreparedFileData["fileType"]) || "pdf",
      contentType: input.contentType || "application/pdf",
      blobKey: `documents/${input.documentId}/mock.pdf`,
      modelId: input.modelId || "prebuilt-layout",
    };
  },

  async submitToAzureOCR(
    _fileData: PreparedFileData,
  ): Promise<SubmissionResult> {
    return {
      statusCode: 202,
      apimRequestId: "mock-apim-request-id",
      headers: {},
    };
  },

  async pollOCRResults(
    _apimRequestId: string,
    _modelId: string,
  ): Promise<PollResult> {
    return {
      status: "succeeded",
      response: {
        documentId: "mock-doc",
        blobPath: "mock/azure-response.json",
        storage: "blob" as const,
        status: "succeeded",
      },
    };
  },

  async extractOCRResults(
    _apimRequestId: string,
    _fileName: string,
    _fileType: string,
    _modelId: string,
    _ocrResponse?: unknown,
  ): Promise<{
    ocrResult: { documentId: string; blobPath: string; storage: "blob" };
  }> {
    return {
      ocrResult: {
        documentId: "mock-doc",
        blobPath: "mock/ocr-result.json",
        storage: "blob",
      },
    };
  },

  async postOcrCleanup(_params: {
    ocrResult: unknown;
    documentId: string;
  }): Promise<{
    cleanedResult: { documentId: string; blobPath: string; storage: "blob" };
  }> {
    return {
      cleanedResult: {
        documentId: "mock-doc",
        blobPath: "mock/cleaned-result.json",
        storage: "blob",
      },
    };
  },

  async enrichResults(params: EnrichResultsParams): Promise<{
    ocrResult: { documentId: string; blobPath: string; storage: "blob" };
    summary: null;
  }> {
    return {
      ocrResult: {
        documentId: params.documentId,
        blobPath: "mock/ocr-result.json",
        storage: "blob",
      },
      summary: null,
    };
  },

  async checkOcrConfidence(
    _documentId: string,
    _ocrResult: OCRResult,
    _confidenceThreshold: number,
  ): Promise<{ averageConfidence: number; requiresReview: boolean }> {
    return {
      averageConfidence: 0.99,
      requiresReview: false,
    };
  },

  async upsertOcrResult(
    _documentId: string,
    _ocrResult: OCRResult,
    _enrichmentSummary?: EnrichmentSummary | null,
  ): Promise<void> {},

  async storeDocumentRejection(
    _documentId: string,
    _reason: string,
    _reviewer?: string,
    _annotations?: string,
  ): Promise<void> {},
};
