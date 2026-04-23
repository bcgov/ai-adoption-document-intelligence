import DocumentIntelligence, {
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { azureClassifyPoll } from "./azure-classify-poll";
import type { AzureClassifySubmitOutput } from "./azure-classify-submit";

jest.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
}));

jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const documentIntelligenceMock = DocumentIntelligence as jest.MockedFunction<
  typeof DocumentIntelligence
>;
const isUnexpectedMock = isUnexpected as jest.MockedFunction<
  typeof isUnexpected
>;

const mockGet = jest.fn();
const mockPath = jest.fn(() => ({ get: mockGet }));

const BASE_INPUT: AzureClassifySubmitOutput = {
  resultId: "result-123",
  constructedClassifierName: "atestgroup__myclassifier",
  blobKey: "atestgroup/ocr/doc.pdf",
  groupId: "atestgroup",
};

function makeSucceededBody(
  documents: Array<{
    docType: string;
    confidence: number;
    boundingRegions: Array<{ pageNumber: number; polygon: number[] }>;
  }> = [],
) {
  return {
    status: "succeeded",
    analyzeResult: { documents },
  };
}

describe("azureClassifyPoll activity", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:
        "https://test.cognitiveservices.azure.com",
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
    };

    documentIntelligenceMock.mockReturnValue({
      path: mockPath,
    } as unknown as ReturnType<typeof DocumentIntelligence>);
    mockPath.mockReturnValue({ get: mockGet });
    isUnexpectedMock.mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Scenario 1: Operation still in progress", () => {
    it.each([
      "running",
      "notStarted",
    ])("throws retryable error when status is %s", async (status) => {
      mockGet.mockResolvedValue({ status: "200", body: { status } });

      await expect(azureClassifyPoll(BASE_INPUT)).rejects.toThrow(
        /still in progress/,
      );
    });
  });

  describe("Scenario 2: Operation failed", () => {
    it("throws with the error message from the response", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: {
          status: "failed",
          error: { message: "training data insufficient" },
        },
      });

      await expect(azureClassifyPoll(BASE_INPUT)).rejects.toThrow(
        /Azure classifier analysis failed: training data insufficient/,
      );
    });
  });

  describe("Scenario 3: Page range derived correctly", () => {
    it("computes min/max pageNumber from boundingRegions", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: makeSucceededBody([
          {
            docType: "invoice",
            confidence: 0.95,
            boundingRegions: [
              { pageNumber: 2, polygon: [] },
              { pageNumber: 3, polygon: [] },
              { pageNumber: 4, polygon: [] },
            ],
          },
        ]),
      });

      const result = await azureClassifyPoll(BASE_INPUT);

      expect(result.labeledDocuments["invoice"][0].pageRange).toEqual({
        start: 2,
        end: 4,
      });
    });
  });

  describe("Scenario 4: Adjacent documents with same label are separate entries", () => {
    it("stores two separate entries for the same docType", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: makeSucceededBody([
          {
            docType: "invoice",
            confidence: 0.9,
            boundingRegions: [{ pageNumber: 1, polygon: [] }],
          },
          {
            docType: "invoice",
            confidence: 0.85,
            boundingRegions: [{ pageNumber: 2, polygon: [] }],
          },
        ]),
      });

      const result = await azureClassifyPoll(BASE_INPUT);

      expect(result.labeledDocuments["invoice"]).toHaveLength(2);
    });
  });

  describe("Scenario 5: Output structure", () => {
    it("returns originalBlobKey, groupId, documentId and labeledDocuments with correct shape", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: makeSucceededBody([
          {
            docType: "invoice",
            confidence: 0.95,
            boundingRegions: [{ pageNumber: 1, polygon: [] }],
          },
        ]),
      });

      const result = await azureClassifyPoll({
        ...BASE_INPUT,
        documentId: "testdoc",
      });

      expect(result.originalBlobKey).toBe("atestgroup/ocr/doc.pdf");
      expect(result.groupId).toBe("atestgroup");
      expect(result.documentId).toBe("testdoc");
      expect(result.labeledDocuments["invoice"]).toEqual([
        {
          confidence: 0.95,
          pageRange: { start: 1, end: 1 },
        },
      ]);
    });
  });

  describe("Scenario 6: Poll URL uses configured endpoint", () => {
    it("passes constructedClassifierName and resultId to .path()", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: makeSucceededBody([]),
      });

      await azureClassifyPoll(BASE_INPUT);

      expect(mockPath).toHaveBeenCalledWith(
        "/documentClassifiers/{classifierId}/analyzeResults/{resultId}",
        "atestgroup__myclassifier",
        "result-123",
      );
    });

    it("strips query parameters from resultId before calling .path()", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: makeSucceededBody([]),
      });

      await azureClassifyPoll({
        ...BASE_INPUT,
        resultId: "result-123?api-version=2024-11-30",
      });

      expect(mockPath).toHaveBeenCalledWith(
        "/documentClassifiers/{classifierId}/analyzeResults/{resultId}",
        "atestgroup__myclassifier",
        "result-123",
      );
    });

    it("builds client from the configured endpoint", async () => {
      mockGet.mockResolvedValue({
        status: "200",
        body: makeSucceededBody([]),
      });

      await azureClassifyPoll(BASE_INPUT);

      expect(documentIntelligenceMock).toHaveBeenCalledWith(
        "https://test.cognitiveservices.azure.com",
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
