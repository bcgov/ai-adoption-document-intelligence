import { PDFDocument } from "pdf-lib";
import type { SplitDocumentInput } from "./split-document";
import { splitDocument } from "./split-document";

jest.mock("pdf-lib", () => ({
  PDFDocument: {
    load: jest.fn(),
    create: jest.fn(),
  },
}));

const mockBlobRead = jest.fn();
const mockBlobWrite = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    write: mockBlobWrite,
  }),
}));

const PDFDocumentMock = PDFDocument as unknown as {
  load: jest.Mock;
  create: jest.Mock;
};

/**
 * Sets up pdf-lib mocks for a document with `totalPages` pages.
 * PDFDocument.load returns a doc with getPageCount().
 * PDFDocument.create returns a doc with copyPages/addPage/save.
 */
function setupPdfLibMocks(totalPages: number) {
  const mockSrcDoc = {
    getPageCount: jest.fn().mockReturnValue(totalPages),
  };
  const mockNewDoc = {
    copyPages: jest.fn().mockResolvedValue([{}]),
    addPage: jest.fn(),
    save: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70])),
  };
  PDFDocumentMock.load.mockResolvedValue(mockSrcDoc);
  PDFDocumentMock.create.mockResolvedValue(mockNewDoc);
  return { mockSrcDoc, mockNewDoc };
}

describe("splitDocument activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4 test content"));
    mockBlobWrite.mockResolvedValue(undefined);
  });

  it("splits per-page", async () => {
    setupPdfLibMocks(3);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-1",
      strategy: "per-page",
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 1 });
    expect(result.segments[2].pageRange).toEqual({ start: 3, end: 3 });
    expect(result.segments[0].blobKey).toContain(
      "atestgroup/ocr/doc-1/segments/segment-001-pages-1-1.pdf",
    );
  });

  it("splits fixed range", async () => {
    setupPdfLibMocks(23);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-2",
      strategy: "fixed-range",
      fixedRangeSize: 5,
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(5);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 5 });
    expect(result.segments[4].pageRange).toEqual({ start: 21, end: 23 });
  });

  it("handles large documents up to 2000 pages", async () => {
    setupPdfLibMocks(2000);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-4",
      strategy: "per-page",
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(2000);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 1 });
    expect(result.segments[1999].pageRange).toEqual({
      start: 2000,
      end: 2000,
    });
  });

  it("splits using custom ranges", async () => {
    setupPdfLibMocks(5);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-5",
      strategy: "custom-ranges",
      customRanges: [
        { start: 1, end: 3 },
        { start: 4, end: 4 },
        { start: 5, end: 5 },
      ],
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 3 });
    expect(result.segments[0].pageCount).toBe(3);
    expect(result.segments[1].pageRange).toEqual({ start: 4, end: 4 });
    expect(result.segments[1].pageCount).toBe(1);
    expect(result.segments[2].pageRange).toEqual({ start: 5, end: 5 });
    expect(result.segments[2].pageCount).toBe(1);
    expect(result.segments[0].blobKey).toContain(
      "atestgroup/ocr/doc-5/segments/segment-001-pages-1-3.pdf",
    );
  });

  it("validates custom ranges - rejects overlapping ranges", async () => {
    setupPdfLibMocks(10);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-6",
      strategy: "custom-ranges",
      customRanges: [
        { start: 1, end: 5 },
        { start: 4, end: 8 },
      ],
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "Range [4-8] overlaps with range [1-5]",
    );
  });

  it("validates custom ranges - rejects out of bounds ranges", async () => {
    setupPdfLibMocks(5);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-7",
      strategy: "custom-ranges",
      customRanges: [
        { start: 1, end: 3 },
        { start: 4, end: 10 },
      ],
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "Range [4-10] is out of bounds (document has 5 pages)",
    );
  });

  it("validates custom ranges - rejects invalid ranges (start > end)", async () => {
    setupPdfLibMocks(10);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-8",
      strategy: "custom-ranges",
      customRanges: [{ start: 5, end: 3 }],
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "Invalid range [5-3]: start must be <= end",
    );
  });

  it("validates custom ranges - requires customRanges parameter", async () => {
    setupPdfLibMocks(10);

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-9",
      strategy: "custom-ranges",
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "customRanges is required for custom-ranges strategy",
    );
  });
});
