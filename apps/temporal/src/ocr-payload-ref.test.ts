const mockBlobRead = jest.fn();
const mockBlobWrite = jest.fn();
jest.mock("./blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    write: mockBlobWrite,
  }),
}));

const mockDocumentFindUnique = jest.fn();
jest.mock("./activities/database-client", () => ({
  getPrismaClient: () => ({
    document: { findUnique: mockDocumentFindUnique },
  }),
}));

import {
  isOcrPayloadRef,
  loadOcrResultFromPort,
  makeOcrPayloadRef,
  resolveGroupIdForOcr,
  writeOcrPayloadBlob,
} from "./ocr-payload-ref";
import type { OCRResult } from "./types";

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

describe("ocr-payload-ref", () => {
  beforeEach(() => {
    mockBlobRead.mockReset();
    mockBlobWrite.mockReset();
  });

  it("isOcrPayloadRef identifies blob refs", () => {
    expect(
      isOcrPayloadRef(
        makeOcrPayloadRef("doc-1", "g1/ocr/doc-1/ocr-result.json", "succeeded"),
      ),
    ).toBe(true);
    expect(isOcrPayloadRef({ foo: "bar" })).toBe(false);
  });

  describe("resolveGroupIdForOcr", () => {
    it("returns the run's groupId", async () => {
      await expect(resolveGroupIdForOcr("doc-1", GROUP)).resolves.toBe(GROUP);
    });

    it("refuses without a groupId and does not look the document up", async () => {
      await expect(resolveGroupIdForOcr("doc-1", null)).rejects.toThrow(
        /groupId is required/,
      );
      expect(mockDocumentFindUnique).not.toHaveBeenCalled();
    });
  });

  describe("loadOcrResultFromPort", () => {
    const storedResult = { fileName: "doc.pdf", extractedText: "text" };

    it("loads a ref whose blob path is in the run's group", async () => {
      mockBlobRead.mockResolvedValue(
        Buffer.from(JSON.stringify(storedResult), "utf8"),
      );
      const ref = makeOcrPayloadRef(
        "doc-1",
        `${GROUP}/ocr/doc-1/ocr-result.json`,
        "succeeded",
      );

      const result = await loadOcrResultFromPort(ref, GROUP);

      expect(result).toEqual(storedResult);
      expect(mockBlobRead).toHaveBeenCalledWith(
        `${GROUP}/ocr/doc-1/ocr-result.json`,
      );
    });

    it("refuses a ref whose blob path is in another group", async () => {
      mockBlobRead.mockResolvedValue(
        Buffer.from(JSON.stringify(storedResult), "utf8"),
      );
      const ref = makeOcrPayloadRef(
        "doc-1",
        `${OTHER_GROUP}/ocr/doc-1/ocr-result.json`,
        "succeeded",
      );

      await expect(loadOcrResultFromPort(ref, GROUP)).rejects.toThrow();
      expect(mockBlobRead).not.toHaveBeenCalled();
    });

    it("refuses to load a ref when the run has no groupId", async () => {
      mockBlobRead.mockResolvedValue(
        Buffer.from(JSON.stringify(storedResult), "utf8"),
      );
      const ref = makeOcrPayloadRef(
        "doc-1",
        `${GROUP}/ocr/doc-1/ocr-result.json`,
        "succeeded",
      );

      await expect(loadOcrResultFromPort(ref, null)).rejects.toThrow();
      expect(mockBlobRead).not.toHaveBeenCalled();
    });

    it("returns an inline result without reading blob storage", async () => {
      const inline = storedResult as unknown as OCRResult;

      await expect(loadOcrResultFromPort(inline, GROUP)).resolves.toBe(inline);
      expect(mockBlobRead).not.toHaveBeenCalled();
    });
  });

  describe("writeOcrPayloadBlob", () => {
    it("writes under the group's OCR folder for the document", async () => {
      const { blobPath } = await writeOcrPayloadBlob(
        GROUP,
        "doc-1",
        "ocr-result.json",
        { ok: true },
      );

      expect(blobPath).toBe(`${GROUP}/ocr/doc-1/ocr-result.json`);
      expect(mockBlobWrite).toHaveBeenCalledWith(blobPath, expect.any(Buffer));
    });

    it("refuses a documentId containing a dot segment", async () => {
      await expect(
        writeOcrPayloadBlob(
          GROUP,
          `../../${OTHER_GROUP}/ocr/doc-2`,
          "ocr-result.json",
          { ok: true },
        ),
      ).rejects.toThrow();
      expect(mockBlobWrite).not.toHaveBeenCalled();
    });
  });
});
