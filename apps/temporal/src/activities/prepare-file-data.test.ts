import type { PrepareFileDataInput } from "./prepare-file-data";
import { prepareFileData } from "./prepare-file-data";

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
  });

  it("prepares PDF file data with defaults", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\ntest content");
    mockRead.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-1",
      blobKey: "documents/doc-1/test.pdf",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.fileName).toBe("test.pdf");
    expect(result.preparedData.fileType).toBe("pdf");
    expect(result.preparedData.contentType).toBe("application/pdf");
    expect(result.preparedData.blobKey).toBe("documents/doc-1/test.pdf");
    expect(result.preparedData.modelId).toBe("prebuilt-layout");
    expect(mockRead).toHaveBeenCalledWith("documents/doc-1/test.pdf");
  });

  it("prepares image file data", async () => {
    const imageBuffer = Buffer.from("fake image data");
    mockRead.mockResolvedValue(imageBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-2",
      blobKey: "documents/doc-2/scan.png",
      fileName: "scan.png",
      fileType: "image",
      contentType: "image/png",
    };

    const result = await prepareFileData(input);

    expect(result.preparedData.fileName).toBe("scan.png");
    expect(result.preparedData.fileType).toBe("image");
    expect(result.preparedData.contentType).toBe("image/png");
    expect(result.preparedData.blobKey).toBe("documents/doc-2/scan.png");
  });

  it("accepts custom modelId", async () => {
    const pdfBuffer = Buffer.from("%PDF-1.4\ntest content");
    mockRead.mockResolvedValue(pdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-3",
      blobKey: "documents/doc-3/invoice.pdf",
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
      blobKey: "documents/doc-4/photo.jpg",
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
      blobKey: "documents/doc-6/missing.pdf",
    };

    await expect(prepareFileData(input)).rejects.toThrow(
      'Blob not found: "documents/doc-6/missing.pdf"',
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
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
    const invalidPdfBuffer = Buffer.from("not a pdf file content");
    mockRead.mockResolvedValue(invalidPdfBuffer);

    const input: PrepareFileDataInput = {
      documentId: "doc-8",
      blobKey: "documents/doc-8/fake.pdf",
      fileType: "pdf",
    };

    const result = await prepareFileData(input);

    expect(result).toBeDefined();
    expect(consoleSpy).toHaveBeenCalled();
    const warnCall = consoleSpy.mock.calls.find((call) =>
      call[0].includes("File does not have valid PDF signature"),
    );
    expect(warnCall).toBeDefined();

    consoleSpy.mockRestore();
  });
});
