import { PDFDocument } from "pdf-lib";
import type { ExtractPagesBase64Input } from "./extract-pages-base64";
import { extractPagesBase64 } from "./extract-pages-base64";

const mockBlobRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

/**
 * Build a minimal real PDF with the given number of pages using pdf-lib.
 * This ensures PDFDocument.load and copyPages work correctly in tests.
 */
async function buildPdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([595, 842]);
  }
  return Buffer.from(await doc.save());
}

describe("extractPagesBase64 activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Scenario 1: returns a valid base64-encoded PDF
  it("returns the extracted pages as a base64 string", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(3));

    const input: ExtractPagesBase64Input = {
      blobKey: "atestgroup/ocr/doc-1/original.pdf",
      startPage: 1,
      endPage: 3,
    };

    const result = await extractPagesBase64(input);

    expect(typeof result.base64).toBe("string");
    expect(result.base64.length).toBeGreaterThan(0);

    // verify it decodes back to a valid PDF
    const decoded = Buffer.from(result.base64, "base64");
    const decoded_doc = await PDFDocument.load(new Uint8Array(decoded));
    expect(decoded_doc.getPageCount()).toBe(3);
  });

  // Scenario 2: pageCount equals endPage - startPage + 1
  it("reports the correct page count", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(5));

    const input: ExtractPagesBase64Input = {
      blobKey: "atestgroup/ocr/doc-1/original.pdf",
      startPage: 2,
      endPage: 5,
    };

    const result = await extractPagesBase64(input);

    expect(result.pageCount).toBe(4);
  });

  // Scenario 3: single page extraction
  it("handles single-page extraction (startPage === endPage)", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(5));

    const input: ExtractPagesBase64Input = {
      blobKey: "atestgroup/ocr/doc-1/original.pdf",
      startPage: 3,
      endPage: 3,
    };

    const result = await extractPagesBase64(input);

    expect(result.pageCount).toBe(1);
    const decoded = Buffer.from(result.base64, "base64");
    const decodedDoc = await PDFDocument.load(new Uint8Array(decoded));
    expect(decodedDoc.getPageCount()).toBe(1);
  });

  // Scenario 4: extracted PDF contains only the requested pages
  it("output PDF contains exactly the requested number of pages", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(10));

    const input: ExtractPagesBase64Input = {
      blobKey: "atestgroup/ocr/doc-1/original.pdf",
      startPage: 3,
      endPage: 6,
    };

    const result = await extractPagesBase64(input);

    const decoded = Buffer.from(result.base64, "base64");
    const decodedDoc = await PDFDocument.load(new Uint8Array(decoded));
    expect(decodedDoc.getPageCount()).toBe(4);
  });

  // Scenario 5: propagates blob storage errors
  it("propagates errors from blob storage", async () => {
    mockBlobRead.mockRejectedValue(new Error("blob not found"));

    const input: ExtractPagesBase64Input = {
      blobKey: "atestgroup/ocr/doc-1/missing.pdf",
      startPage: 1,
      endPage: 1,
    };

    await expect(extractPagesBase64(input)).rejects.toThrow("blob not found");
  });

  // Scenario 6: propagates pdf-lib errors for invalid PDF bytes
  it("propagates errors when the blob is not a valid PDF", async () => {
    mockBlobRead.mockResolvedValue(Buffer.from("this is not a pdf"));

    const input: ExtractPagesBase64Input = {
      blobKey: "atestgroup/ocr/doc-1/bad.pdf",
      startPage: 1,
      endPage: 1,
    };

    await expect(extractPagesBase64(input)).rejects.toThrow();
  });
});
