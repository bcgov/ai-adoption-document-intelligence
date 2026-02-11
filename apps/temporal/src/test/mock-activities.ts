/**
 * Mock activities for testing the OCR workflow (fixture generation and integration tests).
 * Return minimal valid shapes so the workflow completes the happy path without human review.
 */

import type {
  OCRWorkflowInput,
  PreparedFileData,
  SubmissionResult,
  PollResult,
  OCRResult,
  OCRResponse,
  AnalyzeResult,
  Page,
  Word,
  Span,
} from '../types';

const MINIMAL_SPAN: Span = { offset: 0, length: 1 };
const MINIMAL_WORD: Word = {
  content: 'test',
  polygon: [],
  confidence: 0.99,
  span: MINIMAL_SPAN,
};
const MINIMAL_PAGE: Page = {
  pageNumber: 1,
  width: 612,
  height: 792,
  unit: 'inch',
  words: [MINIMAL_WORD],
  lines: [],
  spans: [MINIMAL_SPAN],
};

function createMinimalOCRResult(apimRequestId: string, fileName: string, fileType: string): OCRResult {
  return {
    success: true,
    status: 'succeeded',
    apimRequestId,
    fileName,
    fileType,
    modelId: 'prebuilt-document',
    extractedText: 'test',
    pages: [MINIMAL_PAGE],
    tables: [],
    paragraphs: [],
    keyValuePairs: [],
    sections: [],
    figures: [],
    processedAt: new Date().toISOString(),
  };
}

export const mockActivities = {
  async updateDocumentStatus(
    _documentId: string,
    _status: string,
    _apimRequestId?: string
  ): Promise<void> {},

  async prepareFileData(input: OCRWorkflowInput): Promise<PreparedFileData> {
    return {
      fileName: input.fileName || 'document.pdf',
      fileType: input.fileType || 'pdf',
      contentType: input.contentType || 'application/pdf',
      binaryData: input.binaryData || '',
      modelId: input.modelId || 'prebuilt-layout',
    };
  },

  async submitToAzureOCR(_fileData: PreparedFileData): Promise<SubmissionResult> {
    return {
      statusCode: 202,
      apimRequestId: 'mock-apim-request-id',
      headers: {},
    };
  },

  async pollOCRResults(_apimRequestId: string, _modelId: string): Promise<PollResult> {
    const analyzeResult: AnalyzeResult = {
      apiVersion: '1.0',
      modelId: 'prebuilt-layout',
      content: 'test',
      pages: [MINIMAL_PAGE],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
    };
    const response: OCRResponse = {
      status: 'succeeded',
      analyzeResult,
    };
    return {
      status: 'succeeded',
      response,
    };
  },

  async extractOCRResults(
    apimRequestId: string,
    fileName: string,
    fileType: string,
    _modelId: string,
    _ocrResponse?: OCRResponse
  ): Promise<OCRResult> {
    return createMinimalOCRResult(apimRequestId, fileName, fileType);
  },

  async postOcrCleanup(ocrResult: OCRResult): Promise<OCRResult> {
    return ocrResult;
  },

  async checkOcrConfidence(
    _documentId: string,
    _ocrResult: OCRResult,
    _confidenceThreshold: number
  ): Promise<{ averageConfidence: number; requiresReview: boolean }> {
    return {
      averageConfidence: 0.99,
      requiresReview: false,
    };
  },

  async upsertOcrResult(_documentId: string, _ocrResult: OCRResult): Promise<void> {},

  async storeDocumentRejection(
    _documentId: string,
    _reason: string,
    _reviewer?: string,
    _annotations?: string
  ): Promise<void> {},
};
