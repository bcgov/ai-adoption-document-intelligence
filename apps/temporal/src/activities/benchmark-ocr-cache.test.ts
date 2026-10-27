/**
 * Tests for benchmark OCR cache activities.
 */

import {
  benchmarkLoadOcrCache,
  benchmarkPersistOcrCache,
} from "./benchmark-ocr-cache";
import { getPrismaClient } from "./database-client";

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
}));

const mockRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({ read: mockRead }),
}));

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

describe("benchmark-ocr-cache activities", () => {
  const findUnique = jest.fn();
  const upsert = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue({
      benchmarkOcrCache: { findUnique, upsert },
    });
  });

  it("benchmarkLoadOcrCache returns ocrResponse from row", async () => {
    findUnique.mockResolvedValue({
      ocrResponse: { status: "succeeded" },
    });

    const result = await benchmarkLoadOcrCache({
      sourceRunId: "run-1",
      sampleId: "s1",
    });

    expect(result.ocrResponse).toEqual({ status: "succeeded" });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        sourceRunId_sampleId: { sourceRunId: "run-1", sampleId: "s1" },
      },
    });
  });

  it("benchmarkLoadOcrCache returns null when missing", async () => {
    findUnique.mockResolvedValue(null);

    const result = await benchmarkLoadOcrCache({
      sourceRunId: "run-1",
      sampleId: "s1",
    });

    expect(result.ocrResponse).toBeNull();
  });

  it("benchmarkPersistOcrCache upserts", async () => {
    upsert.mockResolvedValue(undefined);

    await benchmarkPersistOcrCache({
      sourceRunId: "run-1",
      sampleId: "s1",
      ocrResponse: { x: 1 },
    });

    expect(upsert).toHaveBeenCalled();
  });

  it("benchmarkPersistOcrCache reads an ocrResponseRef in the run's group", async () => {
    upsert.mockResolvedValue(undefined);
    mockRead.mockResolvedValue(Buffer.from(JSON.stringify({ x: 2 })));

    await benchmarkPersistOcrCache({
      sourceRunId: "run-1",
      sampleId: "s1",
      groupId: GROUP,
      ocrResponseRef: {
        documentId: "benchmark-s1",
        blobPath: `${GROUP}/ocr/benchmark-s1/azure-response.json`,
        storage: "blob",
        status: "succeeded",
      },
    });

    expect(mockRead).toHaveBeenCalledWith(
      `${GROUP}/ocr/benchmark-s1/azure-response.json`,
    );
    expect(upsert).toHaveBeenCalled();
  });

  it("benchmarkPersistOcrCache refuses an ocrResponseRef from another group", async () => {
    await expect(
      benchmarkPersistOcrCache({
        sourceRunId: "run-1",
        sampleId: "s1",
        groupId: GROUP,
        ocrResponseRef: {
          documentId: "benchmark-s1",
          blobPath: `${OTHER_GROUP}/ocr/benchmark-s1/azure-response.json`,
          storage: "blob",
          status: "succeeded",
        },
      }),
    ).rejects.toThrow(/does not belong to group/);
    expect(mockRead).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
