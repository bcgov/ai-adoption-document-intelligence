import type { PrepareFileDataInput } from "./prepare-file-data";
import { prepareFileData } from "./prepare-file-data";

const mockWarn = jest.fn();
jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: mockWarn,
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

// Mock the blob storage client for non-absolute blob keys
const mockRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockRead,
  }),
}));

// Mock fs for absolute-path reads (benchmark materialized files)
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
    },
  };
});

import * as fs from "node:fs";

const readFileMock = fs.promises.readFile as jest.Mock;

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

describe("prepareFileData activity", () => {
  const ORIGINAL_CACHE_DIR = process.env.BENCHMARK_CACHE_DIR;

  beforeEach(() => {
    mockRead.mockReset();
    readFileMock.mockReset();
    mockWarn.mockClear();
    process.env.BENCHMARK_CACHE_DIR = "/tmp/benchmark-cache";
  });

  afterAll(() => {
    process.env.BENCHMARK_CACHE_DIR = ORIGINAL_CACHE_DIR;
  });

  it("prepares PDF file data with defaults", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\ntest content");
    mockRead.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-1",
      groupId: "atestgroup",
      blobKey: "atestgroup/ocr/test.pdf",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.fileName).toBe("test.pdf");
    expect(result.preparedData.fileType).toBe("pdf");
    expect(result.preparedData.contentType).toBe("application/pdf");
    expect(result.preparedData.blobKey).toBe("atestgroup/ocr/test.pdf");
    expect(result.preparedData.modelId).toBe("prebuilt-layout");
    expect(mockRead).toHaveBeenCalledWith("atestgroup/ocr/test.pdf");
  });

  it("prepares image file data", async () => {
    const imageBuffer = Buffer.from("fake image data");
    mockRead.mockResolvedValue(imageBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-2",
      groupId: "atestgroup",
      blobKey: "atestgroup/ocr/scan.png",
      fileName: "scan.png",
      fileType: "image",
      contentType: "image/png",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.fileName).toBe("scan.png");
    expect(result.preparedData.fileType).toBe("image");
    expect(result.preparedData.contentType).toBe("image/png");
    expect(result.preparedData.blobKey).toBe("atestgroup/ocr/scan.png");
  });

  it("accepts custom modelId", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\ntest content");
    mockRead.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-3",
      groupId: "atestgroup",
      blobKey: "atestgroup/ocr/invoice.pdf",
      modelId: "custom-invoice-model",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.modelId).toBe("custom-invoice-model");
  });

  it("detects file type from filename extension", async () => {
    const imageBuffer = Buffer.from("fake jpeg data");
    mockRead.mockResolvedValue(imageBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-4",
      groupId: "atestgroup",
      blobKey: "atestgroup/ocr/photo.jpg",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.fileType).toBe("image");
    expect(result.preparedData.contentType).toBe("image/jpeg");
  });

  it("throws error for missing blobKey", async () => {
    const input: PrepareFileDataInput = {
      documentId: "doc-5",
      groupId: "atestgroup",
      blobKey: "",
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      "No blobKey provided. blobKey is required to read file data.",
    );
  });

  it("throws error for blob not found", async () => {
    mockRead.mockRejectedValue(new Error("NoSuchKey"));

    const input: PrepareFileDataInput = {
      documentId: "doc-6",
      groupId: "atestgroup",
      blobKey: "atestgroup/ocr/missing.pdf",
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'Blob not found: "atestgroup/ocr/missing.pdf"',
    );
  });

  it("reads from local filesystem when blobKey is an absolute path", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\nbenchmark file");
    readFileMock.mockResolvedValue(pdfBuffer);

    const localPath = `/tmp/benchmark-cache/${GROUP}/dataset-123/inputs/invoice.pdf`;
    const input: PrepareFileDataInput = {
      documentId: "benchmark-sample-1",
      groupId: GROUP,
      blobKey: localPath,
    };

    const result = await prepareFileData(input);

    expect(readFileMock).toHaveBeenCalledWith(localPath);
    expect(mockRead).not.toHaveBeenCalled();
    expect(result.preparedData.fileName).toBe("invoice.pdf");
    expect(result.preparedData.fileType).toBe("pdf");
    expect(result.preparedData.blobKey).toBe(localPath);
  });

  it("throws error when local file not found", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT: no such file"));

    const localPath = `/tmp/benchmark-cache/${GROUP}/dataset-123/inputs/missing.pdf`;
    const input: PrepareFileDataInput = {
      documentId: "benchmark-sample-2",
      groupId: GROUP,
      blobKey: localPath,
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      `File not found on disk: "${localPath}"`,
    );
  });

  it("refuses a blob key that belongs to another group", async () => {
    mockRead.mockResolvedValue(Buffer.from("%PDF-1.4\ntest content"));

    const input: PrepareFileDataInput = {
      documentId: "doc-9",
      groupId: GROUP,
      blobKey: `${OTHER_GROUP}/ocr/doc-9/original.pdf`,
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      /does not belong to group/,
    );
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("refuses a local file outside the run's group benchmark cache", async () => {
    readFileMock.mockResolvedValue(Buffer.from("%PDF-1.4\nbenchmark file"));

    const input: PrepareFileDataInput = {
      documentId: "benchmark-sample-3",
      groupId: GROUP,
      blobKey: `/tmp/benchmark-cache/${OTHER_GROUP}/dataset-123/inputs/invoice.pdf`,
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      /outside the group's benchmark cache/,
    );
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("refuses to read the document without a groupId", async () => {
    mockRead.mockResolvedValue(Buffer.from("%PDF-1.4\ntest content"));

    const input: PrepareFileDataInput = {
      documentId: "doc-10",
      blobKey: `${GROUP}/ocr/doc-10/original.pdf`,
    };

    await expect(prepareFileData(input)).rejects.toThrow(/groupId is required/);
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("warns for invalid PDF signature", async () => {
    const invalidPdfBuffer = Buffer.from("not a pdf file content");
    mockRead.mockResolvedValue(invalidPdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-8",
      groupId: "atestgroup",
      blobKey: "atestgroup/ocr/fake.pdf",
      fileType: "pdf",
    };

    const result = await prepareFileData(input);

    expect(result).toBeDefined();
    expect(mockWarn).toHaveBeenCalledWith(
      "Prepare file data: invalid PDF signature",
      expect.objectContaining({
        event: "warn",
        fileName: "fake.pdf",
        warning: "File does not have valid PDF signature",
        pdfSignature: "not ",
      }),
    );
  });
});
