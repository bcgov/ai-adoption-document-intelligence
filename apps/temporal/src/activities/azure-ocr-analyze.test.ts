import { analyzeWithAzureOcr } from "./azure-ocr-analyze";
import { extractOCRResults } from "./extract-ocr-results";
import { pollOCRResults } from "./poll-ocr-results";
import { prepareFileData } from "./prepare-file-data";
import { submitToAzureOCR } from "./submit-to-azure-ocr";
import { updateDocumentStatus } from "./update-document-status";

jest.mock("./prepare-file-data");
jest.mock("./submit-to-azure-ocr");
jest.mock("./poll-ocr-results");
jest.mock("./extract-ocr-results");
jest.mock("./update-document-status");

const prepare = prepareFileData as jest.MockedFunction<typeof prepareFileData>;
const submit = submitToAzureOCR as jest.MockedFunction<typeof submitToAzureOCR>;
const poll = pollOCRResults as jest.MockedFunction<typeof pollOCRResults>;
const extract = extractOCRResults as jest.MockedFunction<
  typeof extractOCRResults
>;
const updateStatus = updateDocumentStatus as jest.MockedFunction<
  typeof updateDocumentStatus
>;

const params = {
  documentId: "doc-1",
  groupId: "group-1",
  blobKey: "blob/key.pdf",
  pollIntervalSeconds: 0.001,
};

describe("analyzeWithAzureOcr", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    prepare.mockResolvedValue({
      preparedData: {
        modelId: "prebuilt-layout",
        fileName: "a.pdf",
        fileType: "pdf",
      },
    } as never);
    submit.mockResolvedValue({ apimRequestId: "req-1" } as never);
    extract.mockResolvedValue({
      ocrResult: { ref: "r" },
      _metered_quantity: 3,
    } as never);
  });

  it("chains prepare, submit, poll and extract and returns the OCR result", async () => {
    poll
      .mockResolvedValueOnce({ status: "running" } as never)
      .mockResolvedValueOnce({
        status: "succeeded",
        ocrResponse: { x: 1 },
      } as never);

    const result = await analyzeWithAzureOcr(params);

    expect(poll).toHaveBeenCalledTimes(2);
    expect(updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ongoing_ocr",
        apimRequestId: "req-1",
      }),
    );
    expect(extract).toHaveBeenCalledWith(
      expect.objectContaining({
        apimRequestId: "req-1",
        ocrResponse: { x: 1 },
      }),
    );
    expect(result).toEqual({
      ocrResult: { ref: "r" },
      apimRequestId: "req-1",
      _metered_quantity: 3,
    });
  });

  it("skips the status update for benchmark replays", async () => {
    submit.mockResolvedValue({ apimRequestId: "benchmark-ocr-cache" } as never);
    poll.mockResolvedValue({ status: "succeeded", ocrResponse: {} } as never);

    await analyzeWithAzureOcr(params);

    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("does not extract when polling fails", async () => {
    poll.mockRejectedValue(new Error("azure failed"));
    await expect(analyzeWithAzureOcr(params)).rejects.toThrow("azure failed");
    expect(extract).not.toHaveBeenCalled();
  });
});
