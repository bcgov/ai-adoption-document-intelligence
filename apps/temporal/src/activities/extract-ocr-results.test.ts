import { extractOCRResults } from './extract-ocr-results';
import type { OCRResponse } from '../types';
import axios from 'axios';

jest.mock('axios');

const axiosMock = axios as jest.Mocked<typeof axios>;

describe('extractOCRResults activity', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: 'https://test.cognitiveservices.azure.com',
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: 'test-api-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('extracts OCR results from provided response', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
      analyzeResult: {
        apiVersion: '2024-11-30',
        modelId: 'prebuilt-layout',
        content: 'Test content from document',
        pages: [
          {
            pageNumber: 1,
            angle: 0,
            width: 8.5,
            height: 11,
            unit: 'inch',
            words: [{ content: 'Test', confidence: 0.99, polygon: [], span: { offset: 0, length: 4 } }],
            lines: [{ content: 'Test', polygon: [], spans: [{ offset: 0, length: 4 }] }],
            spans: [{ offset: 0, length: 4 }],
          },
        ],
        paragraphs: [{ content: 'Test', role: 'text', spans: [{ offset: 0, length: 4 }] }],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
        documents: [],
      },
    };

    const result = await extractOCRResults({
      apimRequestId: 'test-request-id',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      ocrResponse: mockOCRResponse
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('succeeded');
    expect(result.apimRequestId).toBe('test-request-id');
    expect(result.fileName).toBe('test.pdf');
    expect(result.fileType).toBe('pdf');
    expect(result.modelId).toBe('prebuilt-layout');
    expect(result.extractedText).toBe('Test content from document');
    expect(result.pages).toHaveLength(1);
    expect(result.paragraphs).toHaveLength(1);
  });

  it('fetches OCR results from API when response not provided', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
      analyzeResult: {
        apiVersion: '2024-11-30',
        modelId: 'prebuilt-layout',
        content: 'Fetched content',
        pages: [],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
        documents: [],
      },
    };

    axiosMock.get.mockResolvedValue({ data: mockOCRResponse });

    const result = await extractOCRResults({
      apimRequestId: 'test-request-id',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout'
    });

    expect(result.extractedText).toBe('Fetched content');
    expect(axiosMock.get).toHaveBeenCalledWith(
      expect.stringContaining('/analyzeResults/test-request-id'),
      expect.objectContaining({
        headers: { 'api-key': 'test-api-key' },
      })
    );
  });

  it('handles response with empty analyzeResult', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
    };

    const result = await extractOCRResults({
      apimRequestId: 'test-request-id',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      ocrResponse: mockOCRResponse
    });

    expect(result.success).toBe(true);
    expect(result.extractedText).toBe('');
    expect(result.pages).toEqual([]);
    expect(result.tables).toEqual([]);
  });

  it('sets success to false for failed status', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'failed',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
    };

    const result = await extractOCRResults({
      apimRequestId: 'test-request-id',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      ocrResponse: mockOCRResponse
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('throws error when credentials are missing and response not provided', async () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

    await expect(
      extractOCRResults({
        apimRequestId: 'test-request-id',
        fileName: 'test.pdf',
        fileType: 'pdf',
        modelId: 'prebuilt-layout'
      })
    ).rejects.toThrow('Azure Document Intelligence credentials not configured');
  });

  it('throws error when OCR response is null', async () => {
    await expect(
      extractOCRResults({
        apimRequestId: 'test-request-id',
        fileName: 'test.pdf',
        fileType: 'pdf',
        modelId: 'prebuilt-layout',
        ocrResponse: undefined
      })
    ).rejects.toThrow();
  });

  it('includes tables and key-value pairs when present', async () => {
    const mockOCRResponse: OCRResponse = {
      status: 'succeeded',
      createdDateTime: '2024-01-01T00:00:00Z',
      lastUpdatedDateTime: '2024-01-01T00:01:00Z',
      analyzeResult: {
        apiVersion: '2024-11-30',
        modelId: 'prebuilt-layout',
        content: 'Content with tables',
        pages: [],
        paragraphs: [],
        tables: [
          {
            rowCount: 2,
            columnCount: 2,
            cells: [
              { rowIndex: 0, columnIndex: 0, content: 'Header1', spans: [{ offset: 0, length: 7 }], boundingRegions: [] },
              { rowIndex: 0, columnIndex: 1, content: 'Header2', spans: [{ offset: 8, length: 7 }], boundingRegions: [] },
            ],
            spans: [{ offset: 0, length: 15 }],
          },
        ],
        keyValuePairs: [
          {
            key: { content: 'Name', spans: [{ offset: 0, length: 4 }], boundingRegions: [] },
            value: { content: 'John', spans: [{ offset: 5, length: 4 }], boundingRegions: [] },
            confidence: 0.95,
          },
        ],
        sections: [],
        figures: [],
        documents: [],
      },
    };

    const result = await extractOCRResults({
      apimRequestId: 'test-request-id',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      ocrResponse: mockOCRResponse
    });

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].rowCount).toBe(2);
    expect(result.keyValuePairs).toHaveLength(1);
    expect(result.keyValuePairs[0].key.content).toBe('Name');
  });
});
