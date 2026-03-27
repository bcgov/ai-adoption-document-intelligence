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
});
