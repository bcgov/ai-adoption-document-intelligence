import { benchmarkPersistEvaluationDetails } from "./benchmark-persist-evaluation-details";

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const mockWrite = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({ write: mockWrite }),
}));

const mockRunFindUnique = jest.fn();
jest.mock("./database-client", () => ({
  getPrismaClient: () => ({
    benchmarkRun: { findUnique: mockRunFindUnique },
  }),
}));

const GROUP = "clh7z2xk00000356u8e3h1234";

describe("benchmarkPersistEvaluationDetails", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRunFindUnique.mockResolvedValue({ project: { group_id: GROUP } });
  });

  it("writes the details under the run's project group", async () => {
    const result = await benchmarkPersistEvaluationDetails({
      runId: "run-1",
      sampleId: "sample-1",
      details: { prediction: { amount: 1 } },
    });

    expect(result.evaluationBlobPath).toBe(
      `${GROUP}/benchmark/runs/run-1/sample-1.json`,
    );
    expect(mockWrite).toHaveBeenCalledWith(
      `${GROUP}/benchmark/runs/run-1/sample-1.json`,
      expect.any(Buffer),
    );
  });

  it("refuses a sample id with a dot segment", async () => {
    await expect(
      benchmarkPersistEvaluationDetails({
        runId: "run-1",
        sampleId: "../sample-1",
        details: {},
      }),
    ).rejects.toThrow(/dot segment/);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
