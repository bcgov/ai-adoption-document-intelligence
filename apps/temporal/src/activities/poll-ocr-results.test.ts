jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

import DocumentIntelligence, {
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { ApplicationFailure } from "@temporalio/activity";
import * as ocrPayloadRef from "../ocr-payload-ref";
import type { OCRResponse } from "../types";
import { pollOCRResults } from "./poll-ocr-results";

jest.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
}));

const documentIntelligenceMock = DocumentIntelligence as jest.MockedFunction<
  typeof DocumentIntelligence
>;
const isUnexpectedMock = isUnexpected as jest.MockedFunction<
  typeof isUnexpected
>;

type PollResponse = {
  status: string | number;
  body: OCRResponse | null;
  headers?: Record<string, string | string[]>;
};

const mockGet = jest.fn<Promise<PollResponse>, []>();
const mockPath = jest.fn(() => ({ get: mockGet }));

const TEST_DOCUMENT_ID = "doc-poll-test";
const TEST_GROUP_ID = "gtestgroupidfortests01";

describe("pollOCRResults activity", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:
        "https://test.cognitiveservices.azure.com",
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
    };
    isUnexpectedMock.mockReturnValue(false);
    mockGet.mockReset();
    mockPath.mockReset();
    mockPath.mockReturnValue({ get: mockGet });
    documentIntelligenceMock.mockReset();
    documentIntelligenceMock.mockReturnValue({
      path: mockPath,
    } as unknown as ReturnType<typeof DocumentIntelligence>);
    jest
      .spyOn(ocrPayloadRef, "resolveGroupIdForOcr")
      .mockResolvedValue(TEST_GROUP_ID);
    jest.spyOn(ocrPayloadRef, "writeOcrPayloadBlob").mockResolvedValue({
      blobPath: `${TEST_GROUP_ID}/ocr/${TEST_DOCUMENT_ID}/azure-response.json`,
      byteLength: 64,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns cached response when benchmark OCR cache replay payload is present", async () => {
    const mockOCRResponse: OCRResponse = {
      status: "succeeded",
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: "prebuilt-layout",
        content: "cached",
        pages: [],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
        documents: [],
      },
    };

    const result = await pollOCRResults({
      apimRequestId: "any",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
      groupId: TEST_GROUP_ID,
      __benchmarkOcrCache: { ocrResponse: mockOCRResponse },
    });

    expect(result.status).toBe("succeeded");
    expect(result.response?.storage).toBe("blob");
    expect(result.response?.documentId).toBe(TEST_DOCUMENT_ID);
    expect(documentIntelligenceMock).not.toHaveBeenCalled();
  });

  it("throws non-retryable failure when cached benchmark OCR response failed", async () => {
    const mockOCRResponse: OCRResponse = {
      status: "failed",
      error: {
        code: "InvalidContent",
        message: "The document could not be analyzed",
      },
    };

    await expect(
      pollOCRResults({
        apimRequestId: "any",
        modelId: "prebuilt-layout",
        documentId: TEST_DOCUMENT_ID,
        groupId: TEST_GROUP_ID,
        __benchmarkOcrCache: { ocrResponse: mockOCRResponse },
      }),
    ).rejects.toMatchObject({
      message:
        "Azure OCR analysis failed: InvalidContent: The document could not be analyzed",
      nonRetryable: true,
      details: [mockOCRResponse],
    });

    expect(documentIntelligenceMock).not.toHaveBeenCalled();
  });

  it("polls for results and returns succeeded status with ref", async () => {
    const mockOCRResponse: OCRResponse = {
      status: "succeeded",
      createdDateTime: "2024-01-01T00:00:00Z",
      lastUpdatedDateTime: "2024-01-01T00:01:00Z",
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: "prebuilt-layout",
        content: "Test content",
        pages: [],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
        documents: [],
      },
    };

    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    const result = await pollOCRResults({
      apimRequestId: "test-request-id",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(result.status).toBe("succeeded");
    expect(result.response?.blobPath).toContain("azure-response.json");
    expect(documentIntelligenceMock).toHaveBeenCalledWith(
      "https://test.cognitiveservices.azure.com",
      { key: "test-api-key" },
      {
        credentials: {
          apiKeyHeaderName: "api-key",
        },
      },
    );
    expect(mockPath).toHaveBeenCalledWith(
      "/documentModels/{modelId}/analyzeResults/{resultId}",
      "prebuilt-layout",
      "test-request-id",
    );
  });

  it("polls for results and returns running status", async () => {
    const mockOCRResponse: OCRResponse = {
      status: "running",
      createdDateTime: "2024-01-01T00:00:00Z",
      lastUpdatedDateTime: "2024-01-01T00:00:30Z",
    };

    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    const result = await pollOCRResults({
      apimRequestId: "test-request-id",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
    });

    expect(result.status).toBe("running");
    expect(result.response?.status).toBe("running");
    expect(result.response?.blobPath).toBe("");
  });

  it("polls for results and throws non-retryable failure when OCR failed", async () => {
    const mockOCRResponse: OCRResponse = {
      status: "failed",
      createdDateTime: "2024-01-01T00:00:00Z",
      lastUpdatedDateTime: "2024-01-01T00:00:30Z",
      error: {
        code: "InvalidContent",
        message: "The document could not be analyzed",
      },
    };

    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    const promise = pollOCRResults({
      apimRequestId: "test-request-id",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
    });

    await expect(promise).rejects.toBeInstanceOf(ApplicationFailure);
    await expect(promise).rejects.toMatchObject({
      message:
        "Azure OCR analysis failed: InvalidContent: The document could not be analyzed",
      nonRetryable: true,
      details: [mockOCRResponse],
    });
  });

  it("throws error when credentials are missing", async () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;

    await expect(
      pollOCRResults({
        apimRequestId: "test-request-id",
        modelId: "prebuilt-layout",
        documentId: TEST_DOCUMENT_ID,
      }),
    ).rejects.toThrow("Azure Document Intelligence credentials not configured");
  });

  it("throws error when apimRequestId is missing", async () => {
    await expect(
      pollOCRResults({
        apimRequestId: "",
        modelId: "prebuilt-layout",
        documentId: TEST_DOCUMENT_ID,
      }),
    ).rejects.toThrow("APIM Request ID not available for polling");
  });

  it("throws error when response body is empty", async () => {
    mockGet.mockResolvedValue({ status: 200, body: null });

    await expect(
      pollOCRResults({
        apimRequestId: "test-request-id",
        modelId: "prebuilt-layout",
        documentId: TEST_DOCUMENT_ID,
      }),
    ).rejects.toThrow("Empty response from Azure OCR polling endpoint");
  });

  it("rethrows SDK client errors", async () => {
    const sdkError = new Error("Request failed");
    mockGet.mockRejectedValue(sdkError);

    await expect(
      pollOCRResults({
        apimRequestId: "test-request-id",
        modelId: "prebuilt-layout",
        documentId: TEST_DOCUMENT_ID,
      }),
    ).rejects.toThrow("Request failed");
  });

  it("passes endpoint from env to SDK as configured", async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT =
      "https://test.cognitiveservices.azure.com";

    const mockOCRResponse: OCRResponse = {
      status: "succeeded",
      createdDateTime: "2024-01-01T00:00:00Z",
      lastUpdatedDateTime: "2024-01-01T00:01:00Z",
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId: "prebuilt-layout",
        content: "ok",
        pages: [],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
        documents: [],
      },
    };
    mockGet.mockResolvedValue({ status: 200, body: mockOCRResponse });

    await pollOCRResults({
      apimRequestId: "test-request-id",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(documentIntelligenceMock).toHaveBeenCalledWith(
      "https://test.cognitiveservices.azure.com",
      expect.any(Object),
      expect.any(Object),
    );
  });
});
