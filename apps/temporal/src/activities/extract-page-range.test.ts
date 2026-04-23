import type { ExtractPageRangeInput } from "./extract-page-range";
import { extractPageRange } from "./extract-page-range";

const mockSplitDocument = jest.fn();
const mockExtractDocumentId = jest.fn();

jest.mock("./split-document", () => ({
  splitDocument: (...args: unknown[]) => mockSplitDocument(...args),
  extractDocumentId: (...args: unknown[]) => mockExtractDocumentId(...args),
}));

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const BASE_INPUT: ExtractPageRangeInput = {
  blobKey: "atestgroup/ocr/doc.pdf",
  groupId: "atestgroup",
  pageRange: { start: 2, end: 4 },
};

const SPLIT_RESULT = {
  segments: [
    {
      blobKey:
        "atestgroup/ocr/documents/docid/segments/segment-001-pages-2-4.pdf",
      pageRange: { start: 2, end: 4 },
      segmentIndex: 1,
      pageCount: 3,
    },
  ],
};

describe("extractPageRange activity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSplitDocument.mockResolvedValue(SPLIT_RESULT);
    mockExtractDocumentId.mockReturnValue("docid");
  });

  describe("Scenario 1: Successful extraction", () => {
    it("calls splitDocument with strategy custom-ranges and the provided page range", async () => {
      await extractPageRange({ ...BASE_INPUT, documentId: "docid" });

      expect(mockSplitDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          blobKey: "atestgroup/ocr/doc.pdf",
          groupId: "atestgroup",
          strategy: "custom-ranges",
          customRanges: [{ start: 2, end: 4 }],
        }),
      );
    });
  });

  describe("Scenario 2: documentId forwarded when provided", () => {
    it("passes the supplied documentId to splitDocument", async () => {
      await extractPageRange({ ...BASE_INPUT, documentId: "explicit-id" });

      expect(mockSplitDocument).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: "explicit-id" }),
      );
    });
  });

  describe("Scenario 3: documentId derived from blobKey when absent", () => {
    it("calls extractDocumentId and passes the result to splitDocument", async () => {
      await extractPageRange(BASE_INPUT);

      expect(mockExtractDocumentId).toHaveBeenCalledWith(
        "atestgroup/ocr/doc.pdf",
      );
      expect(mockSplitDocument).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: "docid" }),
      );
    });

    it("passes undefined documentId to splitDocument when extractDocumentId returns undefined", async () => {
      mockExtractDocumentId.mockReturnValue(undefined);

      await extractPageRange(BASE_INPUT);

      expect(mockSplitDocument).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: undefined }),
      );
    });
  });

  describe("Scenario 4: Output contains segment blob key and page range", () => {
    it("returns segmentBlobKey from the first segment and echoes pageRange", async () => {
      const result = await extractPageRange({
        ...BASE_INPUT,
        documentId: "docid",
      });

      expect(result).toEqual({
        segmentBlobKey:
          "atestgroup/ocr/documents/docid/segments/segment-001-pages-2-4.pdf",
        pageRange: { start: 2, end: 4 },
      });
    });
  });
});
