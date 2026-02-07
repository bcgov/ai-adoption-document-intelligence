import { checkOcrConfidence } from './check-ocr-confidence';
import { getPrismaClient } from './database-client';
import type { OCRResult } from '../types';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe('checkOcrConfidence activity', () => {
  let prismaMock: {
    document: {
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        update: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('calculates average confidence from word confidences', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [
            { content: 'Word1', confidence: 0.95, polygon: [], span: { offset: 0, length: 5 } },
            { content: 'Word2', confidence: 0.99, polygon: [], span: { offset: 6, length: 5 } },
            { content: 'Word3', confidence: 0.97, polygon: [], span: { offset: 12, length: 5 } },
          ],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await checkOcrConfidence('doc-1', ocrResult, 0.95);

    expect(result.averageConfidence).toBeCloseTo(0.97, 2);
    expect(result.requiresReview).toBe(false);
  });

  it('requires review when confidence is below threshold', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [
            { content: 'Word1', confidence: 0.85, polygon: [], span: { offset: 0, length: 5 } },
            { content: 'Word2', confidence: 0.90, polygon: [], span: { offset: 6, length: 5 } },
          ],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    prismaMock.document.update.mockResolvedValue({ id: 'doc-2', status: 'ongoing_ocr' });

    const result = await checkOcrConfidence('doc-2', ocrResult, 0.95);

    expect(result.averageConfidence).toBeCloseTo(0.875, 3);
    expect(result.requiresReview).toBe(true);
    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-2' },
      data: { status: 'ongoing_ocr' },
    });
  });

  it('includes key-value pair confidence in calculation', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [
            { content: 'Word1', confidence: 0.98, polygon: [], span: { offset: 0, length: 5 } },
          ],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [
        {
          key: { content: 'Name', spans: [] },
          value: { content: 'John', spans: [] },
          confidence: 0.96,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await checkOcrConfidence('doc-3', ocrResult, 0.95);

    expect(result.averageConfidence).toBeCloseTo(0.97, 2);
    expect(result.requiresReview).toBe(false);
  });

  it('normalizes confidence from 0-100 range to 0-1 range', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [
            { content: 'Word1', confidence: 95, polygon: [], span: { offset: 0, length: 5 } },
            { content: 'Word2', confidence: 99, polygon: [], span: { offset: 6, length: 5 } },
          ],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await checkOcrConfidence('doc-4', ocrResult, 0.95);

    expect(result.averageConfidence).toBeCloseTo(0.97, 2);
    expect(result.requiresReview).toBe(false);
  });

  it('returns default confidence of 1.0 when no words have confidence', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await checkOcrConfidence('doc-5', ocrResult, 0.95);

    expect(result.averageConfidence).toBe(1.0);
    expect(result.requiresReview).toBe(false);
  });

  it('returns requiresReview true on error', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: null as unknown as typeof ocrResult.pages,
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await checkOcrConfidence('doc-6', ocrResult, 0.95);

    expect(result.averageConfidence).toBe(0);
    expect(result.requiresReview).toBe(true);
  });

  it('uses custom confidence threshold', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [
            { content: 'Word1', confidence: 0.88, polygon: [], span: { offset: 0, length: 5 } },
          ],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await checkOcrConfidence('doc-7', ocrResult, 0.85);

    expect(result.averageConfidence).toBeCloseTo(0.88, 2);
    expect(result.requiresReview).toBe(false);
  });
});
