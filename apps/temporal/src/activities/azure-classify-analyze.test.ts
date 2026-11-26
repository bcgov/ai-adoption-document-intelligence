import { analyzeWithAzureClassifier } from "./azure-classify-analyze";
import {
  AzureClassifyInProgressError,
  azureClassifyPoll,
} from "./azure-classify-poll";
import { azureClassifySubmit } from "./azure-classify-submit";

jest.mock("./azure-classify-submit");
jest.mock("./azure-classify-poll", () => {
  const actual = jest.requireActual("./azure-classify-poll");
  return { ...actual, azureClassifyPoll: jest.fn() };
});

const submit = azureClassifySubmit as jest.MockedFunction<
  typeof azureClassifySubmit
>;
const poll = azureClassifyPoll as jest.MockedFunction<typeof azureClassifyPoll>;

const input = {
  blobKey: "k",
  groupId: "g",
  documentId: "d",
  classifierName: "c",
  pollIntervalSeconds: 0.001,
};

describe("analyzeWithAzureClassifier", () => {
  beforeEach(() => jest.resetAllMocks());

  it("polls past in-progress errors and returns the labeled documents", async () => {
    const submitted = { operationId: "op" };
    const output = { labeledDocuments: [] };
    submit.mockResolvedValue(submitted as never);
    poll
      .mockRejectedValueOnce(new AzureClassifyInProgressError("running"))
      .mockResolvedValueOnce(output as never);

    await expect(analyzeWithAzureClassifier(input)).resolves.toBe(output);
    expect(submit).toHaveBeenCalledWith({
      blobKey: "k",
      groupId: "g",
      documentId: "d",
      classifierName: "c",
    });
    expect(poll).toHaveBeenCalledWith(submitted);
  });

  it("propagates other poll errors", async () => {
    submit.mockResolvedValue({} as never);
    poll.mockRejectedValue(new Error("bad"));
    await expect(analyzeWithAzureClassifier(input)).rejects.toThrow("bad");
  });
});
