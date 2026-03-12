// Jest test file

import type { OCRResult } from "../types";
import {
  type KeywordPattern,
  type SplitAndClassifyInput,
  splitAndClassifyDocument,
} from "./split-and-classify-document";
import * as splitDocumentModule from "./split-document";

// Mock the splitDocument function
jest.mock("./split-document");

const mockSplitDocument =
  splitDocumentModule.splitDocument as jest.MockedFunction<
    typeof splitDocumentModule.splitDocument
  >;

describe("splitAndClassifyDocument", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createMockOcrResult(
    text: string,
    pageCount: number,
    pageLines: string[][] = [],
  ): OCRResult {
    return {
      success: true,
      status: "succeeded",
      apimRequestId: "req-1",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: text,
      pages: Array.from({ length: pageCount }, (_, i) => ({
        pageNumber: i + 1,
        width: 8.5,
        height: 11,
        unit: "inch",
        spans: [],
        words: [],
        lines: (pageLines[i] ?? []).map((content) => ({
          content,
          polygon: [],
          spans: [],
        })),
        selectionMarks: [],
      })),
      paragraphs: [],
      sections: [],
      keyValuePairs: [],
      tables: [],
      figures: [],
      processedAt: new Date().toISOString(),
    };
  }

  const defaultKeywordPatterns: KeywordPattern[] = [
    {
      pattern: "Page\\s+(\\d+)\\s*—\\s*Monthly Report",
      segmentType: "monthly-report",
    },
    {
      pattern: "Page\\s+(\\d+)\\s*—\\s*Supporting Document #1.*Pay Stub",
      segmentType: "pay-stub",
    },
    {
      pattern: "Page\\s+(\\d+)\\s*—\\s*Supporting Document #2.*Bank",
      segmentType: "bank-record",
    },
  ];

  describe("successful classification", () => {
    it("should split and classify document with 3 segments", async () => {
      const ocrText = `Page 1 — Monthly Report (Financial Assistance Request)
Some content here
Page 4 — Supporting Document #1 (Pay Stub)
Pay stub content
Page 5 — Supporting Document #2 (Bank Deposit Record)
Bank record content`;

      const ocrResult = createMockOcrResult(ocrText, 5, [
        ["Page 1 — Monthly Report (Financial Assistance Request)"],
        [],
        [],
        ["Page 4 — Supporting Document #1 (Pay Stub)"],
        ["Page 5 — Supporting Document #2 (Bank Deposit Record)"],
      ]);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 3 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-3.pdf",
            pageCount: 3,
          },
          {
            segmentIndex: 2,
            pageRange: { start: 4, end: 4 },
            blobKey: "documents/doc1/segments/segment-002-pages-4-4.pdf",
            pageCount: 1,
          },
          {
            segmentIndex: 3,
            pageRange: { start: 5, end: 5 },
            blobKey: "documents/doc1/segments/segment-003-pages-5-5.pdf",
            pageCount: 1,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      // Verify splitDocument was called with correct ranges
      expect(mockSplitDocument).toHaveBeenCalledWith({
        blobKey: "documents/doc1/original.pdf",
        strategy: "custom-ranges",
        customRanges: [
          { start: 1, end: 3 },
          { start: 4, end: 4 },
          { start: 5, end: 5 },
        ],
        documentId: "doc1",
      });

      // Verify results
      expect(result.segments).toHaveLength(3);

      expect(result.segments[0]).toMatchObject({
        segmentIndex: 1,
        pageRange: { start: 1, end: 3 },
        segmentType: "monthly-report",
        confidence: 0.9,
      });
      expect(result.segments[0].keywordMatch).toContain(
        "Page 1 — Monthly Report",
      );

      expect(result.segments[1]).toMatchObject({
        segmentIndex: 2,
        pageRange: { start: 4, end: 4 },
        segmentType: "pay-stub",
        confidence: 0.9,
      });
      expect(result.segments[1].keywordMatch).toContain(
        "Page 4 — Supporting Document #1",
      );

      expect(result.segments[2]).toMatchObject({
        segmentIndex: 3,
        pageRange: { start: 5, end: 5 },
        segmentType: "bank-record",
        confidence: 0.9,
      });
      expect(result.segments[2].keywordMatch).toContain(
        "Page 5 — Supporting Document #2",
      );
    });

    it("should use OCR page positions when page numbers are internal", async () => {
      const ocrText = `Page 1 — Monthly Report (Financial Assistance Request)
Some content here
Page 2 — Supporting Document #1 (Pay Stub)
Pay stub content
Page 3 — Supporting Document #2 (Bank Deposit Record)
Bank record content`;

      const ocrResult = createMockOcrResult(ocrText, 5, [
        ["Page 1 — Monthly Report (Financial Assistance Request)"],
        [],
        [],
        ["Page 2 — Supporting Document #1 (Pay Stub)"],
        ["Page 3 — Supporting Document #2 (Bank Deposit Record)"],
      ]);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 3 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-3.pdf",
            pageCount: 3,
          },
          {
            segmentIndex: 2,
            pageRange: { start: 4, end: 4 },
            blobKey: "documents/doc1/segments/segment-002-pages-4-4.pdf",
            pageCount: 1,
          },
          {
            segmentIndex: 3,
            pageRange: { start: 5, end: 5 },
            blobKey: "documents/doc1/segments/segment-003-pages-5-5.pdf",
            pageCount: 1,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      expect(mockSplitDocument).toHaveBeenCalledWith({
        blobKey: "documents/doc1/original.pdf",
        strategy: "custom-ranges",
        customRanges: [
          { start: 1, end: 3 },
          { start: 4, end: 4 },
          { start: 5, end: 5 },
        ],
        documentId: "doc1",
      });

      expect(result.segments[0].pageRange).toEqual({ start: 1, end: 3 });
      expect(result.segments[1].pageRange).toEqual({ start: 4, end: 4 });
      expect(result.segments[2].pageRange).toEqual({ start: 5, end: 5 });
    });

    it("should handle single-page document with one marker", async () => {
      const ocrText = "Page 1 — Monthly Report\nSome content";
      const ocrResult = createMockOcrResult(ocrText, 1);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 1 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-1.pdf",
            pageCount: 1,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].segmentType).toBe("monthly-report");
      expect(result.segments[0].confidence).toBe(0.9);
    });

    it("should handle case-insensitive pattern matching", async () => {
      const ocrText = "page 1 — monthly report\nContent";
      const ocrResult = createMockOcrResult(ocrText, 1);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 1 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-1.pdf",
            pageCount: 1,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      expect(result.segments[0].segmentType).toBe("monthly-report");
    });

    it("should not create duplicate markers for the same page", async () => {
      const ocrText = `Page 1 — Monthly Report
Page 1 — Monthly Report (duplicate)
Some content`;
      const ocrResult = createMockOcrResult(ocrText, 2);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 2 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-2.pdf",
            pageCount: 2,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      // Should only create one segment even though marker appears twice
      expect(mockSplitDocument).toHaveBeenCalledWith({
        blobKey: "documents/doc1/original.pdf",
        strategy: "custom-ranges",
        customRanges: [{ start: 1, end: 2 }],
        documentId: "doc1",
      });

      expect(result.segments).toHaveLength(1);
    });
  });

  describe("fallback behavior", () => {
    it("should treat entire document as unknown when no markers found", async () => {
      const ocrText = "Some document content with no keywords";
      const ocrResult = createMockOcrResult(ocrText, 3);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 3 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-3.pdf",
            pageCount: 3,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      expect(mockSplitDocument).toHaveBeenCalledWith({
        blobKey: "documents/doc1/original.pdf",
        strategy: "custom-ranges",
        customRanges: [{ start: 1, end: 3 }],
        documentId: "doc1",
      });

      expect(result.segments).toHaveLength(1);
      expect(result.segments[0].segmentType).toBe("unknown");
      expect(result.segments[0].confidence).toBe(0.2);
      expect(result.segments[0].keywordMatch).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should throw error when OCR text is empty", async () => {
      const ocrResult = createMockOcrResult("", 1);

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      await expect(splitAndClassifyDocument(input)).rejects.toThrow(
        "OCR result extractedText is empty",
      );
    });

    it("should throw error when no keyword patterns provided", async () => {
      const ocrResult = createMockOcrResult("Some text", 1);

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: [],
      };

      await expect(splitAndClassifyDocument(input)).rejects.toThrow(
        "No keyword patterns provided",
      );
    });

    it("should throw error when OCR result has no pages", async () => {
      const ocrResult: OCRResult = {
        success: true,
        status: "succeeded",
        apimRequestId: "req-1",
        fileName: "test.pdf",
        fileType: "pdf",
        modelId: "prebuilt-layout",
        extractedText: "Some text",
        pages: [],
        paragraphs: [],
        sections: [],
        keyValuePairs: [],
        tables: [],
        figures: [],
        processedAt: new Date().toISOString(),
      };

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      await expect(splitAndClassifyDocument(input)).rejects.toThrow(
        "OCR result contains no pages",
      );
    });

    it("should throw error when regex pattern is invalid", async () => {
      const ocrText = "Some content";
      const ocrResult = createMockOcrResult(ocrText, 1);

      const invalidPattern: KeywordPattern = {
        pattern: "Page\\s+([invalid(regex",
        segmentType: "test",
      };

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: [invalidPattern],
      };

      await expect(splitAndClassifyDocument(input)).rejects.toThrow(
        /Invalid regex pattern/,
      );
    });

    it("should throw error when marker references page beyond document length", async () => {
      const ocrText = "Page 10 — Monthly Report";
      const ocrResult = createMockOcrResult(ocrText, 3);

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      await expect(splitAndClassifyDocument(input)).rejects.toThrow(
        "Keyword marker references page 10 but document only has 3 pages",
      );
    });
  });

  describe("page range building", () => {
    it("should handle markers on consecutive pages", async () => {
      const ocrText = `Page 1 — Monthly Report
Page 2 — Pay Stub
Page 3 — Bank Record`;
      const ocrResult = createMockOcrResult(ocrText, 3);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 1 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-1.pdf",
            pageCount: 1,
          },
          {
            segmentIndex: 2,
            pageRange: { start: 2, end: 2 },
            blobKey: "documents/doc1/segments/segment-002-pages-2-2.pdf",
            pageCount: 1,
          },
          {
            segmentIndex: 3,
            pageRange: { start: 3, end: 3 },
            blobKey: "documents/doc1/segments/segment-003-pages-3-3.pdf",
            pageCount: 1,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      expect(result.segments).toHaveLength(3);
      expect(result.segments[0].pageRange).toEqual({ start: 1, end: 1 });
      expect(result.segments[1].pageRange).toEqual({ start: 2, end: 2 });
      expect(result.segments[2].pageRange).toEqual({ start: 3, end: 3 });
    });

    it("should handle non-sequential page markers", async () => {
      const ocrText = `Page 1 — Monthly Report
Page 5 — Pay Stub`;
      const ocrResult = createMockOcrResult(ocrText, 10);

      mockSplitDocument.mockResolvedValue({
        segments: [
          {
            segmentIndex: 1,
            pageRange: { start: 1, end: 4 },
            blobKey: "documents/doc1/segments/segment-001-pages-1-4.pdf",
            pageCount: 4,
          },
          {
            segmentIndex: 2,
            pageRange: { start: 5, end: 10 },
            blobKey: "documents/doc1/segments/segment-002-pages-5-10.pdf",
            pageCount: 6,
          },
        ],
      });

      const input: SplitAndClassifyInput = {
        blobKey: "documents/doc1/original.pdf",
        ocrResult,
        documentId: "doc1",
        keywordPatterns: defaultKeywordPatterns,
      };

      const result = await splitAndClassifyDocument(input);

      expect(result.segments).toHaveLength(2);
      expect(result.segments[0].pageRange).toEqual({ start: 1, end: 4 });
      expect(result.segments[1].pageRange).toEqual({ start: 5, end: 10 });
    });
  });
});
