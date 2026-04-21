import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import type { SplitDocumentInput } from "./split-document";
import { splitDocument } from "./split-document";

jest.mock("node:child_process", () => ({
  execFile: jest.fn(),
}));

jest.mock("node:fs/promises", () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  mkdtemp: jest.fn(),
  rm: jest.fn(),
  open: jest.fn().mockResolvedValue({
    writeFile: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }),
  readFile: jest.fn().mockResolvedValue(Buffer.from("")),
}));

const mockBlobRead = jest.fn();
const mockBlobWrite = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    write: mockBlobWrite,
  }),
}));

const execFileMock = execFile as unknown as jest.Mock;
const accessMock = fs.access as jest.Mock;
const mkdirMock = fs.mkdir as jest.Mock;
const mkdtempMock = fs.mkdtemp as jest.Mock;
const rmMock = fs.rm as jest.Mock;

describe("splitDocument activity", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    accessMock.mockReset();
    mkdirMock.mockReset();
    mkdtempMock.mockReset();
    rmMock.mockReset();
    mockBlobRead.mockReset();
    mockBlobWrite.mockReset();
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4 test content"));
    mockBlobWrite.mockResolvedValue(undefined);
    accessMock.mockResolvedValue(undefined);
    mkdtempMock.mockResolvedValue("/tmp/split-document-test");
    rmMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
  });

  it("splits per-page", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "3\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

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
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "23\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

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

  it("splits using boundary detection", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "4\n", stderr: "" });
        return;
      }
      if (cmd === "pdftotext") {
        const filePath = args[2] as string;
        if (filePath.includes("page-1.pdf")) {
          cb(null, { stdout: "Page 1 of 2\nReport", stderr: "" });
          return;
        }
        if (filePath.includes("page-2.pdf")) {
          cb(null, { stdout: "Continued", stderr: "" });
          return;
        }
        if (filePath.includes("page-3.pdf")) {
          cb(null, { stdout: "Page 1 of 2\nInvoice", stderr: "" });
          return;
        }
        cb(null, { stdout: "More", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-3",
      strategy: "boundary-detection",
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 2 });
    expect(result.segments[1].pageRange).toEqual({ start: 3, end: 4 });
  });

  it("handles large documents up to 2000 pages", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "2000\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-4",
      strategy: "per-page",
    };

    const result = await splitDocument(input);
    expect(result.segments).toHaveLength(2000);
    expect(result.segments[0].pageRange).toEqual({ start: 1, end: 1 });
    expect(result.segments[1999].pageRange).toEqual({ start: 2000, end: 2000 });
  });

  it("splits using custom ranges", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "5\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

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
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "10\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-6",
      strategy: "custom-ranges",
      customRanges: [
        { start: 1, end: 5 },
        { start: 4, end: 8 }, // Overlaps with first range
      ],
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "Range [4-8] overlaps with range [1-5]",
    );
  });

  it("validates custom ranges - rejects out of bounds ranges", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "5\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-7",
      strategy: "custom-ranges",
      customRanges: [
        { start: 1, end: 3 },
        { start: 4, end: 10 }, // Page 10 doesn't exist
      ],
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "Range [4-10] is out of bounds (document has 5 pages)",
    );
  });

  it("validates custom ranges - rejects invalid ranges (start > end)", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "10\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-8",
      strategy: "custom-ranges",
      customRanges: [{ start: 5, end: 3 }], // Invalid: start > end
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "Invalid range [5-3]: start must be <= end",
    );
  });

  it("validates custom ranges - requires customRanges parameter", async () => {
    execFileMock.mockImplementation((cmd, args, cb) => {
      if (cmd === "qpdf" && args[0] === "--show-npages") {
        cb(null, { stdout: "10\n", stderr: "" });
        return;
      }
      cb(null, { stdout: "", stderr: "" });
    });

    const input: SplitDocumentInput = {
      blobKey: "atestgroup/ocr/original.pdf",
      groupId: "atestgroup",
      documentId: "doc-9",
      strategy: "custom-ranges",
      // customRanges not provided
    };

    await expect(splitDocument(input)).rejects.toThrow(
      "customRanges is required for custom-ranges strategy",
    );
  });
});
