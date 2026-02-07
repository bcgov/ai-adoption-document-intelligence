import { upsertOcrResult } from './upsert-ocr-result';
import { getPrismaClient } from './database-client';
import { Prisma } from '@generated/client';
import type { OCRResult } from '../types';

jest.mock('./database-client', () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe('upsertOcrResult activity', () => {
  let prismaMock: {
    ocrResult: {
      upsert: jest.Mock;
    };
    document: {
      update: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      ocrResult: {
        upsert: jest.fn(),
      },
      document: {
        update: jest.fn(),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('upserts OCR result with custom model fields', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test-apim-id',
      fileName: 'invoice.pdf',
      fileType: 'pdf',
      modelId: 'custom-invoice-model',
      extractedText: 'Invoice content',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [
        {
          docType: 'invoice',
          fields: {
            InvoiceNumber: { type: 'string', content: 'INV-001', confidence: 0.99 },
            TotalAmount: { type: 'number', content: 1500.00, confidence: 0.98 },
          },
          confidence: 0.98,
          spans: [{ offset: 0, length: 100 }],
        },
      ],
      processedAt: '2024-01-01T00:00:00Z',
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({ id: 1, document_id: 'doc-1' });
    prismaMock.document.update.mockResolvedValue({ id: 'doc-1', status: 'completed_ocr' });

    await upsertOcrResult({ documentId: 'doc-1', ocrResult });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalledWith({
      where: { document_id: 'doc-1' },
      update: {
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          InvoiceNumber: expect.any(Object),
          TotalAmount: expect.any(Object),
        }),
      },
      create: {
        document_id: 'doc-1',
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          InvoiceNumber: expect.any(Object),
          TotalAmount: expect.any(Object),
        }),
      },
    });

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: { status: 'completed_ocr' },
    });
  });

  it('upserts OCR result with prebuilt model keyValuePairs', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test-apim-id',
      fileName: 'document.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Document content',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [
        {
          key: { content: 'Name', spans: [{ offset: 0, length: 4 }], boundingRegions: [] },
          value: { content: 'John Doe', spans: [{ offset: 5, length: 8 }], boundingRegions: [] },
          confidence: 0.95,
        },
        {
          key: { content: 'Email', spans: [{ offset: 14, length: 5 }], boundingRegions: [] },
          value: { content: 'john@example.com', spans: [{ offset: 20, length: 16 }], boundingRegions: [] },
          confidence: 0.92,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({ id: 2, document_id: 'doc-2' });
    prismaMock.document.update.mockResolvedValue({ id: 'doc-2', status: 'completed_ocr' });

    await upsertOcrResult({ documentId: 'doc-2', ocrResult });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalledWith({
      where: { document_id: 'doc-2' },
      update: {
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          Name: expect.objectContaining({ content: 'John Doe' }),
          Email: expect.objectContaining({ content: 'john@example.com' }),
        }),
      },
      create: {
        document_id: 'doc-2',
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          Name: expect.objectContaining({ content: 'John Doe' }),
          Email: expect.objectContaining({ content: 'john@example.com' }),
        }),
      },
    });
  });

  it('handles duplicate key names in keyValuePairs', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test-apim-id',
      fileName: 'document.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Document content',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [
        {
          key: { content: 'Date', spans: [{ offset: 0, length: 4 }], boundingRegions: [] },
          value: { content: '2024-01-01', spans: [{ offset: 5, length: 10 }], boundingRegions: [] },
          confidence: 0.95,
        },
        {
          key: { content: 'Date', spans: [{ offset: 16, length: 4 }], boundingRegions: [] },
          value: { content: '2024-01-02', spans: [{ offset: 21, length: 10 }], boundingRegions: [] },
          confidence: 0.93,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({ id: 3, document_id: 'doc-3' });
    prismaMock.document.update.mockResolvedValue({ id: 'doc-3', status: 'completed_ocr' });

    await upsertOcrResult({ documentId: 'doc-3', ocrResult });

    const upsertCall = prismaMock.ocrResult.upsert.mock.calls[0][0];
    const keyValuePairs = upsertCall.update.keyValuePairs;

    expect('Date' in keyValuePairs).toBe(true);
    expect('Date_1' in keyValuePairs).toBe(true);
  });

  it('stores null for extractedFields when no documents or keyValuePairs', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test-apim-id',
      fileName: 'empty.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Some text',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({ id: 4, document_id: 'doc-4' });
    prismaMock.document.update.mockResolvedValue({ id: 'doc-4', status: 'completed_ocr' });

    await upsertOcrResult({ documentId: 'doc-4', ocrResult });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalledWith({
      where: { document_id: 'doc-4' },
      update: {
        processed_at: expect.any(Date),
        keyValuePairs: Prisma.JsonNull,
      },
      create: {
        document_id: 'doc-4',
        processed_at: expect.any(Date),
        keyValuePairs: Prisma.JsonNull,
      },
    });
  });

  it('throws error when database operation fails', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test-apim-id',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Content',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const dbError = new Error('Database connection failed');
    prismaMock.ocrResult.upsert.mockRejectedValue(dbError);

    await expect(upsertOcrResult({ documentId: 'doc-5', ocrResult })).rejects.toThrow(
      'Database connection failed'
    );
  });
});
