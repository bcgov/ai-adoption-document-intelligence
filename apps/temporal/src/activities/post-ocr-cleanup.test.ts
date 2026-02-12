import { postOcrCleanup } from './post-ocr-cleanup';
import type { OCRResult } from '../types';

describe('postOcrCleanup activity', () => {
  it('cleans unicode and encoding artifacts', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Hello\u00A0World\u2013test\u201CHello\u201D',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await postOcrCleanup({ ocrResult });

    expect(result.cleanedResult.extractedText).toBe('Hello World-test"Hello"');
  });

  it('removes hyphenation at line breaks', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'This is a docu- \nment with hyphen-\nation.',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await postOcrCleanup({ ocrResult });

    expect(result.cleanedResult.extractedText).toContain('document');
    expect(result.cleanedResult.extractedText).toContain('hyphenation');
  });

  it('normalizes date separators', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Date: 12 . 31 . 2024',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await postOcrCleanup({ ocrResult });

    expect(result.cleanedResult.extractedText).toContain('12/31/2024');
  });

  it('fixes common OCR number errors', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Total: 1O5.O0',
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await postOcrCleanup({ ocrResult });

    expect(result.cleanedResult.extractedText).toContain('105.00');
  });

  it('cleans text in pages, paragraphs, and tables', async () => {
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
          width: 8.5,
          height: 11,
          unit: 'inch',
          words: [
            { content: 'Hello\u00A0World', confidence: 0.99, polygon: [], span: { offset: 0, length: 11 } },
          ],
          lines: [
            { content: 'Hello\u00A0World', polygon: [], spans: [{ offset: 0, length: 11 }] },
          ],
          spans: [{ offset: 0, length: 11 }],
        },
      ],
      paragraphs: [
        { content: 'Para\u2013graph', role: 'text', boundingRegions: [], spans: [{ offset: 0, length: 9 }] },
      ],
      tables: [
        {
          rowCount: 1,
          columnCount: 1,
          cells: [
            { rowIndex: 0, columnIndex: 0, content: '1O5', boundingRegions: [], spans: [{ offset: 0, length: 3 }] },
          ],
          boundingRegions: [],
          spans: [{ offset: 0, length: 3 }],
        },
      ],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await postOcrCleanup({ ocrResult });

    expect(result.cleanedResult.pages[0].words[0].content).toBe('Hello World');
    expect(result.cleanedResult.pages[0].lines[0].content).toBe('Hello World');
    expect(result.cleanedResult.paragraphs[0].content).toBe('Para-graph');
    expect(result.cleanedResult.tables[0].cells[0].content).toBe('105');
  });

  it('cleans text in key-value pairs', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [
        {
          key: { content: 'Name\u00A0Key', boundingRegions: [], spans: [{ offset: 0, length: 8 }] },
          value: { content: 'Value\u2013Text', boundingRegions: [], spans: [{ offset: 9, length: 10 }] },
          confidence: 0.95,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    const result = await postOcrCleanup({ ocrResult });

    expect(result.cleanedResult.keyValuePairs[0].key.content).toBe('Name Key');
    expect(result.cleanedResult.keyValuePairs[0].value?.content).toBe('Value-Text');
  });

  it('returns original result if cleanup fails', async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: 'Test',
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    // Simulate an error by making pages array non-mappable
    const brokenResult = {
      ...ocrResult,
      pages: null as unknown as typeof ocrResult.pages,
    };

    const result = await postOcrCleanup({ ocrResult: brokenResult });

    expect(result.cleanedResult).toBe(brokenResult);
  });

  it('does not modify original ocrResult object', async () => {
    const originalText = 'Hello\u00A0World';
    const ocrResult: OCRResult = {
      success: true,
      status: 'succeeded',
      apimRequestId: 'test',
      fileName: 'test.pdf',
      fileType: 'pdf',
      modelId: 'prebuilt-layout',
      extractedText: originalText,
      pages: [],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: '2024-01-01T00:00:00Z',
    };

    await postOcrCleanup({ ocrResult });

    expect(ocrResult.extractedText).toBe(originalText);
  });
});
