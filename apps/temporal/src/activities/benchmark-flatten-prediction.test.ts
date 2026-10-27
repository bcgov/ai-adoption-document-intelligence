import { benchmarkFlattenPredictionFromRefs } from "./benchmark-flatten-prediction";

const mockRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({ read: mockRead }),
}));

const GROUP = "clh7z2xk00000356u8e3h1234";
const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

describe("benchmarkFlattenPredictionFromRefs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns empty maps when no ref is given", async () => {
    const result = await benchmarkFlattenPredictionFromRefs({
      groupId: GROUP,
    });

    expect(result).toEqual({ predictionData: {}, confidenceData: {} });
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("reads the cleaned result ref from the run's group", async () => {
    mockRead.mockResolvedValue(Buffer.from(JSON.stringify({})));

    await benchmarkFlattenPredictionFromRefs({
      groupId: GROUP,
      cleanedResultRef: {
        documentId: "benchmark-s1",
        blobPath: `${GROUP}/ocr/benchmark-s1/cleaned-result.json`,
        storage: "blob",
        status: "succeeded",
      },
    });

    expect(mockRead).toHaveBeenCalledWith(
      `${GROUP}/ocr/benchmark-s1/cleaned-result.json`,
    );
  });

  it("refuses a ref from another group", async () => {
    await expect(
      benchmarkFlattenPredictionFromRefs({
        groupId: GROUP,
        ocrResultRef: {
          documentId: "benchmark-s1",
          blobPath: `${OTHER_GROUP}/ocr/benchmark-s1/ocr-result.json`,
          storage: "blob",
          status: "succeeded",
        },
      }),
    ).rejects.toThrow(/does not belong to group/);
    expect(mockRead).not.toHaveBeenCalled();
  });
});
