import { Prisma } from "@generated/client";
import type { OCRResult } from "../types";
import { getPrismaClient } from "./database-client";
import { upsertOcrResult } from "./upsert-ocr-result";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

const GROUP_ID = "group-1";

describe("upsertOcrResult activity", () => {
  let prismaMock: {
    ocrResult: {
      upsert: jest.Mock;
    };
    document: {
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prismaMock = {
      ocrResult: {
        upsert: jest.fn(),
      },
      document: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prismaMock),
      ),
    };
    getPrismaClientMock.mockReturnValue(prismaMock);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("upserts OCR result with custom model fields", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "invoice.pdf",
      fileType: "pdf",
      modelId: "custom-invoice-model",
      extractedText: "Invoice content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [
        {
          docType: "invoice",
          fields: {
            InvoiceNumber: { content: "INV-001", confidence: 0.99 },
            TotalAmount: { content: "1500.00", confidence: 0.98 },
          },
          confidence: 0.98,
          spans: [{ offset: 0, length: 100 }],
        },
      ],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 1,
      document_id: "doc-1",
    });

    await upsertOcrResult({
      documentId: "doc-1",
      groupId: GROUP_ID,
      ocrResult,
    });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalledWith({
      where: { document_id: "doc-1" },
      update: {
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          InvoiceNumber: expect.any(Object),
          TotalAmount: expect.any(Object),
        }),
        content: expect.objectContaining({
          format: "text",
          text: "Invoice content",
          pages: [],
        }),
      },
      create: {
        document_id: "doc-1",
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          InvoiceNumber: expect.any(Object),
          TotalAmount: expect.any(Object),
        }),
        content: expect.objectContaining({
          format: "text",
          text: "Invoice content",
          pages: [],
        }),
      },
    });

    expect(prismaMock.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", group_id: GROUP_ID },
      data: { status: "extracted" },
    });
  });

  it("upserts OCR result with prebuilt model keyValuePairs", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "document.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Document content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [
        {
          key: {
            content: "Name",
            spans: [{ offset: 0, length: 4 }],
            boundingRegions: [],
          },
          value: {
            content: "John Doe",
            spans: [{ offset: 5, length: 8 }],
            boundingRegions: [],
          },
          confidence: 0.95,
        },
        {
          key: {
            content: "Email",
            spans: [{ offset: 14, length: 5 }],
            boundingRegions: [],
          },
          value: {
            content: "john@example.com",
            spans: [{ offset: 20, length: 16 }],
            boundingRegions: [],
          },
          confidence: 0.92,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 2,
      document_id: "doc-2",
    });

    await upsertOcrResult({
      documentId: "doc-2",
      groupId: GROUP_ID,
      ocrResult,
    });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalledWith({
      where: { document_id: "doc-2" },
      update: {
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          Name: expect.objectContaining({ content: "John Doe" }),
          Email: expect.objectContaining({ content: "john@example.com" }),
        }),
        content: expect.objectContaining({
          format: "text",
          text: "Document content",
          pages: [],
        }),
      },
      create: {
        document_id: "doc-2",
        processed_at: expect.any(Date),
        keyValuePairs: expect.objectContaining({
          Name: expect.objectContaining({ content: "John Doe" }),
          Email: expect.objectContaining({ content: "john@example.com" }),
        }),
        content: expect.objectContaining({
          format: "text",
          text: "Document content",
          pages: [],
        }),
      },
    });
  });

  it("handles duplicate key names in keyValuePairs", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "document.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Document content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [
        {
          key: {
            content: "Date",
            spans: [{ offset: 0, length: 4 }],
            boundingRegions: [],
          },
          value: {
            content: "2024-01-01",
            spans: [{ offset: 5, length: 10 }],
            boundingRegions: [],
          },
          confidence: 0.95,
        },
        {
          key: {
            content: "Date",
            spans: [{ offset: 16, length: 4 }],
            boundingRegions: [],
          },
          value: {
            content: "2024-01-02",
            spans: [{ offset: 21, length: 10 }],
            boundingRegions: [],
          },
          confidence: 0.93,
        },
      ],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 3,
      document_id: "doc-3",
    });

    await upsertOcrResult({
      documentId: "doc-3",
      groupId: GROUP_ID,
      ocrResult,
    });

    const upsertCall = prismaMock.ocrResult.upsert.mock.calls[0][0];
    const keyValuePairs = upsertCall.update.keyValuePairs;

    expect("Date" in keyValuePairs).toBe(true);
    expect("Date_1" in keyValuePairs).toBe(true);
  });

  it("persists raw text and per-page content for prebuilt-read OCR results", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "read-apim-id",
      fileName: "scan.pdf",
      fileType: "pdf",
      modelId: "prebuilt-read",
      extractedText: "Hello world\nLine two\f\nPage two line",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [],
          spans: [],
          lines: [
            {
              content: "Hello world",
              polygon: [],
              spans: [{ offset: 0, length: 11 }],
            },
            {
              content: "Line two",
              polygon: [],
              spans: [{ offset: 12, length: 8 }],
            },
          ],
        },
        {
          pageNumber: 2,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [],
          spans: [],
          lines: [
            {
              content: "Page two line",
              polygon: [],
              spans: [{ offset: 21, length: 13 }],
            },
          ],
        },
      ],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 5,
      document_id: "doc-5",
    });

    await upsertOcrResult({
      documentId: "doc-5",
      groupId: GROUP_ID,
      ocrResult,
    });

    const upsertCall = prismaMock.ocrResult.upsert.mock.calls[0][0];
    expect(upsertCall.update.keyValuePairs).toBe(Prisma.JsonNull);
    expect(upsertCall.update.content).toMatchObject({
      format: "text",
      text: "Hello world\nLine two\f\nPage two line",
    });
    expect(upsertCall.update.content.pages).toHaveLength(2);
    expect(upsertCall.update.content.pages[0]).toMatchObject({
      pageNumber: 1,
      content: "Hello world\nLine two",
    });
    expect(upsertCall.update.content.pages[1]).toMatchObject({
      pageNumber: 2,
      content: "Page two line",
    });
    expect(upsertCall.update.content.markdown).toBeUndefined();
  });

  it("captures markdown content when contentFormat is markdown", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "md-apim-id",
      fileName: "md.pdf",
      fileType: "pdf",
      modelId: "prebuilt-read",
      extractedText: "",
      markdown: "# Title\n\nSome **bold** body.",
      contentFormat: "markdown",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [],
          spans: [],
          lines: [
            {
              content: "Title",
              polygon: [],
              spans: [{ offset: 0, length: 5 }],
            },
          ],
        },
      ],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 6,
      document_id: "doc-6",
    });

    await upsertOcrResult({
      documentId: "doc-6",
      groupId: GROUP_ID,
      ocrResult,
    });

    const upsertCall = prismaMock.ocrResult.upsert.mock.calls[0][0];
    expect(upsertCall.update.content).toMatchObject({
      format: "markdown",
      markdown: "# Title\n\nSome **bold** body.",
    });
    expect(upsertCall.update.content.pages).toHaveLength(1);
    expect(upsertCall.update.content.pages[0].content).toBe("Title");
  });

  it("stores null for extractedFields when no documents or keyValuePairs", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "empty.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Some text",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 4,
      document_id: "doc-4",
    });

    await upsertOcrResult({
      documentId: "doc-4",
      groupId: GROUP_ID,
      ocrResult,
    });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalledWith({
      where: { document_id: "doc-4" },
      update: {
        processed_at: expect.any(Date),
        keyValuePairs: Prisma.JsonNull,
        content: expect.objectContaining({
          format: "text",
          text: "Some text",
          pages: [],
        }),
      },
      create: {
        document_id: "doc-4",
        processed_at: expect.any(Date),
        keyValuePairs: Prisma.JsonNull,
        content: expect.objectContaining({
          format: "text",
          text: "Some text",
          pages: [],
        }),
      },
    });
  });

  it("skips without error for a benchmark document id that has no row", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "receipt.jpg",
      fileType: "image",
      modelId: "prebuilt-layout",
      extractedText: "Content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      upsertOcrResult({
        documentId: "benchmark-Receipt",
        groupId: GROUP_ID,
        ocrResult,
      }),
    ).resolves.toBeUndefined();

    expect(prismaMock.ocrResult.upsert).not.toHaveBeenCalled();
  });

  it("proceeds normally for benchmark- prefixed docs that DO exist in DB", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "receipt.jpg",
      fileType: "image",
      modelId: "prebuilt-layout",
      extractedText: "Content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 1,
      document_id: "benchmark-Receipt",
    });

    await upsertOcrResult({
      documentId: "benchmark-Receipt",
      groupId: GROUP_ID,
      ocrResult,
    });

    expect(prismaMock.ocrResult.upsert).toHaveBeenCalled();
  });

  it("throws error when database operation fails", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    const dbError = new Error("Database connection failed");
    prismaMock.ocrResult.upsert.mockRejectedValue(dbError);

    await expect(
      upsertOcrResult({ documentId: "doc-5", groupId: GROUP_ID, ocrResult }),
    ).rejects.toThrow("Database connection failed");
  });
  describe("group scope", () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "test-apim-id",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      extractedText: "Content",
      pages: [],
      tables: [],
      paragraphs: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
      processedAt: "2024-01-01T00:00:00Z",
    };

    it("writes the OCR result only when the document is in the run's group", async () => {
      await upsertOcrResult({
        documentId: "doc-1",
        groupId: "group-2",
        ocrResult,
      });

      expect(prismaMock.document.updateMany).toHaveBeenCalledTimes(1);
      expect(prismaMock.document.updateMany.mock.calls[0][0].where).toEqual({
        id: "doc-1",
        group_id: "group-2",
      });
      expect(prismaMock.ocrResult.upsert).toHaveBeenCalledTimes(1);
    });

    it("skips the OCR result write when the document is not in the run's group", async () => {
      prismaMock.document.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        upsertOcrResult({
          documentId: "doc-in-group-2",
          groupId: GROUP_ID,
          ocrResult,
        }),
      ).resolves.toBeUndefined();

      expect(prismaMock.ocrResult.upsert).not.toHaveBeenCalled();
    });

    it("throws when groupId is missing and does not touch the database", async () => {
      await expect(
        upsertOcrResult({ documentId: "doc-1", ocrResult }),
      ).rejects.toThrow("groupId is required");

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(prismaMock.document.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.ocrResult.upsert).not.toHaveBeenCalled();
    });
  });
});
