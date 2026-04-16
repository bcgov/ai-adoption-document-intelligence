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
jest.mock("fs", () => {
  const actual = jest.requireActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: jest.fn(),
    },
  };
});

import * as fs from "fs";

const readFileMock = fs.promises.readFile as jest.Mock;

describe("prepareFileData activity", () => {
  beforeEach(() => {
    mockRead.mockReset();
    readFileMock.mockReset();
    mockWarn.mockClear();
  });

  it("prepares PDF file data with defaults", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\ntest content");
    mockRead.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-1",
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
      blobKey: "atestgroup/ocr/photo.jpg",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.fileType).toBe("image");
    expect(result.preparedData.contentType).toBe("image/jpeg");
  });

  it("throws error for missing blobKey", async () => {
    const input: PrepareFileDataInput = {
      documentId: "doc-5",
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
      blobKey: "atestgroup/ocr/missing.pdf",
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'Blob not found: "atestgroup/ocr/missing.pdf"',
    );
  });

  it("reads from local filesystem when blobKey is an absolute path", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\nbenchmark file");
    readFileMock.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "benchmark-sample-1",
      blobKey: "/tmp/benchmark-cache/dataset-123/inputs/invoice.pdf",
    };

    const result = await prepareFileData(input);

    expect(readFileMock).toHaveBeenCalledWith(
      "/tmp/benchmark-cache/dataset-123/inputs/invoice.pdf",
    );
    expect(mockRead).not.toHaveBeenCalled();
    expect(result.preparedData.fileName).toBe("invoice.pdf");
    expect(result.preparedData.fileType).toBe("pdf");
    expect(result.preparedData.blobKey).toBe(
      "/tmp/benchmark-cache/dataset-123/inputs/invoice.pdf",
    );
  });

  it("throws error when local file not found", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT: no such file"));

    const input: PrepareFileDataInput = {
      documentId: "benchmark-sample-2",
      blobKey: "/tmp/benchmark-cache/dataset-123/inputs/missing.pdf",
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'File not found on disk: "/tmp/benchmark-cache/dataset-123/inputs/missing.pdf"',
    );
  });

  it("warns for invalid PDF signature", async () => {
    const invalidPdfBuffer = Buffer.from("not a pdf file content");
    mockRead.mockResolvedValue(invalidPdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-8",
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
