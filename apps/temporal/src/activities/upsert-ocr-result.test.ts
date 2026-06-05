import { Prisma } from "@generated/client";
import type { OCRResult } from "../types";
import { getPrismaClient } from "./database-client";
import { upsertOcrResult } from "./upsert-ocr-result";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const getPrismaClientMock = getPrismaClient as jest.Mock;

describe("upsertOcrResult activity", () => {
  let prismaMock: {
    ocrResult: {
      upsert: jest.Mock;
    };
    document: {
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(() => {
    prismaMock = {
      ocrResult: {
        upsert: jest.fn(),
      },
      document: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: "doc-1" }),
      },
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
    prismaMock.document.update.mockResolvedValue({
      id: "doc-1",
      status: "extracted",
    });

    await upsertOcrResult({ documentId: "doc-1", ocrResult });

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

    expect(prismaMock.document.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
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
    prismaMock.document.update.mockResolvedValue({
      id: "doc-2",
      status: "completed_ocr",
    });

    await upsertOcrResult({ documentId: "doc-2", ocrResult });

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
    prismaMock.document.update.mockResolvedValue({
      id: "doc-3",
      status: "completed_ocr",
    });

    await upsertOcrResult({ documentId: "doc-3", ocrResult });

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
    prismaMock.document.update.mockResolvedValue({
      id: "doc-5",
      status: "completed_ocr",
    });

    await upsertOcrResult({ documentId: "doc-5", ocrResult });

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

  it("captures markdown content and stamps format=markdown when markdown is set", async () => {
    const ocrResult: OCRResult = {
      success: true,
      status: "succeeded",
      apimRequestId: "md-apim-id",
      fileName: "md.pdf",
      fileType: "pdf",
      modelId: "prebuilt-read",
      extractedText: "",
      markdown: "# Title\n\nSome **bold** body.",
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
    prismaMock.document.update.mockResolvedValue({
      id: "doc-6",
      status: "completed_ocr",
    });

    await upsertOcrResult({ documentId: "doc-6", ocrResult });

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
    prismaMock.document.update.mockResolvedValue({
      id: "doc-4",
      status: "completed_ocr",
    });

    await upsertOcrResult({ documentId: "doc-4", ocrResult });

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

  it("skips gracefully on FK constraint violation (P2003 - benchmark mode)", async () => {
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

    // Document not found — early exit before Prisma upsert
    prismaMock.document.findUnique.mockResolvedValue(null);

    // Should NOT throw — just log and return
    await expect(
      upsertOcrResult({ documentId: "benchmark-Receipt", ocrResult }),
    ).resolves.toBeUndefined();

    // Should NOT have attempted the upsert at all
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

    // Document exists in DB
    prismaMock.document.findUnique.mockResolvedValue({
      id: "benchmark-Receipt",
    });
    prismaMock.ocrResult.upsert.mockResolvedValue({
      id: 1,
      document_id: "benchmark-Receipt",
    });
    prismaMock.document.update.mockResolvedValue({
      id: "benchmark-Receipt",
      status: "completed_ocr",
    });

    await upsertOcrResult({ documentId: "benchmark-Receipt", ocrResult });

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
      upsertOcrResult({ documentId: "doc-5", ocrResult }),
    ).rejects.toThrow("Database connection failed");
  });
});
