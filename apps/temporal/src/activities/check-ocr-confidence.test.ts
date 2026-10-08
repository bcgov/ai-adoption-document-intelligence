import type { OCRResult } from "../types";
import { checkOcrConfidence } from "./check-ocr-confidence";
import { getPrismaClient } from "./database-client";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe("checkOcrConfidence activity", () => {
  let prismaMock: {
    document: {
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("calculates average confidence from word confidences", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 0.95,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
            {
              content: "Word2",
              confidence: 0.99,
              polygon: [],
              span: { offset: 6, length: 5 },
            },
            {
              content: "Word3",
              confidence: 0.97,
              polygon: [],
              span: { offset: 12, length: 5 },
            },
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-1",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    expect(result.averageConfidence).toBeCloseTo(0.97, 2);
    expect(result.requiresReview).toBe(false);
  });

  it("requires review when confidence is below threshold", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 0.85,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
            {
              content: "Word2",
              confidence: 0.9,
              polygon: [],
              span: { offset: 6, length: 5 },
            },
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-2",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    expect(result.averageConfidence).toBeCloseTo(0.875, 3);
    expect(result.requiresReview).toBe(true);
    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-2", group_id: "gtestgroupidfortests01" },
      data: { status: "ongoing_ocr" },
    });
  });

  it("includes key-value pair confidence in calculation", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 0.98,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
          ],
          lines: [],
          spans: [],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [
        {
          key: { content: "Name", boundingRegions: [], spans: [] },
          value: { content: "John", boundingRegions: [], spans: [] },
          confidence: 0.96,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-3",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    expect(result.averageConfidence).toBeCloseTo(0.97, 2);
    expect(result.requiresReview).toBe(false);
  });

  it("normalizes confidence from 0-100 range to 0-1 range", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 95,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
            {
              content: "Word2",
              confidence: 99,
              polygon: [],
              span: { offset: 6, length: 5 },
            },
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-4",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    expect(result.averageConfidence).toBeCloseTo(0.97, 2);
    expect(result.requiresReview).toBe(false);
  });

  it("returns default confidence of 1.0 when no words have confidence", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-5",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    expect(result.averageConfidence).toBe(1.0);
    expect(result.requiresReview).toBe(false);
  });

  it("returns requiresReview true on error", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: null as unknown as typeof ocrResult.pages,
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-6",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    expect(result.averageConfidence).toBe(0);
    expect(result.requiresReview).toBe(true);
  });

  it("uses custom confidence threshold", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 0.88,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "doc-7",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.85,
    });

    expect(result.averageConfidence).toBeCloseTo(0.88, 2);
    expect(result.requiresReview).toBe(false);
  });

  it("forces requiresReview=false and skips DB update for benchmark documents", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "form_image_1.jpg",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 0.85,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
            {
              content: "Word2",
              confidence: 0.9,
              polygon: [],
              span: { offset: 6, length: 5 },
            },
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    const result = await checkOcrConfidence({
      documentId: "benchmark-form_image_1",
      groupId: "gtestgroupidfortests01",
      ocrResult,
      threshold: 0.95,
    });

    // Confidence is well below threshold but the documentId starts with
    // "benchmark-", so the activity must short-circuit requiresReview to
    // false (avoiding the 24h humanGate park) and never touch the DB.
    expect(result.requiresReview).toBe(false);
    expect(prismaMock.document.updateMany).not.toHaveBeenCalled();
  });

  describe("document status update scope", () => {
    const lowConfidenceOcrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Test",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [
            {
              content: "Word1",
              confidence: 0.5,
              polygon: [],
              span: { offset: 0, length: 5 },
            },
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
      processedAt: "2024-01-01T00:00:00Z",
    };

    it("updates the document only within the run's group", async () => {
      await checkOcrConfidence({
        documentId: "doc-1",
        groupId: "group-2",
        ocrResult: lowConfidenceOcrResult,
      });

      expect(prismaMock.document.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.document.updateMany.mock.calls[0][0].where).toEqual({
        id: "doc-1",
        group_id: "group-2",
      });
    });

    it("returns the error result when the document is not in the run's group", async () => {
      prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

      const result = await checkOcrConfidence({
        documentId: "doc-in-group-2",
        groupId: "group-1",
        ocrResult: lowConfidenceOcrResult,
      });

      expect(result).toEqual({ averageConfidence: 0, requiresReview: true });
    });

    it("throws when groupId is missing and does not touch the database", async () => {
      await expect(
        checkOcrConfidence({
          documentId: "doc-1",
          ocrResult: lowConfidenceOcrResult,
        }),
      ).rejects.toThrow("groupId is required");

      expect(prismaMock.document.updateMany).not.toHaveBeenCalled();
    });
  });
});
