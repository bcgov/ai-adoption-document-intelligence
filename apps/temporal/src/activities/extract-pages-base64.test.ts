import { PDFDocument } from "pdf-lib";
import type { ExtractPagesBase64Input } from "./extract-pages-base64";
import { extractPagesBase64 } from "./extract-pages-base64";

const mockBlobRead = jest.fn();
const mockBlobWrite = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    write: mockBlobWrite,
  }),
}));

const GROUP_ID = "gtestgroupidfortests01";
const DOCUMENT_ID = "doc-extract-pages";

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
    mockBlobWrite.mockResolvedValue(undefined);
  });

  it("writes extracted pages to blob storage and returns pageBlobPath", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(3));

    const input: ExtractPagesBase64Input = {
      blobKey: `${GROUP_ID}/ocr/${DOCUMENT_ID}/original.pdf`,
      startPage: 1,
      endPage: 3,
      groupId: GROUP_ID,
      documentId: DOCUMENT_ID,
    };

    const result = await extractPagesBase64(input);

    expect(result.pageBlobPath).toBe(
      `${GROUP_ID}/ocr/${DOCUMENT_ID}/page-extracts/page-range-1-3.pdf`,
    );
    expect(result.pageIndex).toBe(1);
    expect(result.pageCount).toBe(3);
    expect(result.byteLength).toBeGreaterThan(0);
    expect(mockBlobWrite).toHaveBeenCalledWith(
      result.pageBlobPath,
      expect.any(Buffer),
    );

    const written = mockBlobWrite.mock.calls[0][1] as Buffer;
    const decodedDoc = await PDFDocument.load(new Uint8Array(written));
    expect(decodedDoc.getPageCount()).toBe(3);
  });

  it("reports the correct page count for a sub-range", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(5));

    const result = await extractPagesBase64({
      blobKey: `${GROUP_ID}/ocr/${DOCUMENT_ID}/original.pdf`,
      startPage: 2,
      endPage: 5,
      groupId: GROUP_ID,
      documentId: DOCUMENT_ID,
    });

    expect(result.pageCount).toBe(4);
    expect(result.pageIndex).toBe(2);
  });

  it("handles single-page extraction (startPage === endPage)", async () => {
    mockBlobRead.mockResolvedValue(await buildPdf(5));

    const result = await extractPagesBase64({
      blobKey: `${GROUP_ID}/ocr/${DOCUMENT_ID}/original.pdf`,
      startPage: 3,
      endPage: 3,
      groupId: GROUP_ID,
      documentId: DOCUMENT_ID,
    });

    expect(result.pageCount).toBe(1);
    const written = mockBlobWrite.mock.calls[0][1] as Buffer;
    const decodedDoc = await PDFDocument.load(new Uint8Array(written));
    expect(decodedDoc.getPageCount()).toBe(1);
  });

  it("propagates errors from blob storage read", async () => {
    mockBlobRead.mockRejectedValue(new Error("blob not found"));

    await expect(
      extractPagesBase64({
        blobKey: `${GROUP_ID}/ocr/${DOCUMENT_ID}/missing.pdf`,
        startPage: 1,
        endPage: 1,
        groupId: GROUP_ID,
        documentId: DOCUMENT_ID,
      }),
    ).rejects.toThrow("blob not found");
  });

  it("propagates errors when the blob is not a valid PDF", async () => {
    mockBlobRead.mockResolvedValue(Buffer.from("this is not a pdf"));

    await expect(
      extractPagesBase64({
        blobKey: `${GROUP_ID}/ocr/${DOCUMENT_ID}/bad.pdf`,
        startPage: 1,
        endPage: 1,
        groupId: GROUP_ID,
        documentId: DOCUMENT_ID,
      }),
    ).rejects.toThrow();
  });
});
