jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

const mockBlobRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

import axios from "axios";
import * as ocrPayloadRef from "../ocr-payload-ref";
import type { OCRResponse } from "../types";
import { extractOCRResults } from "./extract-ocr-results";

jest.mock("axios");

const axiosMock = axios as jest.Mocked<typeof axios>;

const TEST_DOCUMENT_ID = "doc-extract-test";
const TEST_GROUP_ID = "gtestgroupidfortests01";

describe("extractOCRResults activity", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:
        "https://test.cognitiveservices.azure.com",
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
    };
    jest
      .spyOn(ocrPayloadRef, "resolveGroupIdForOcr")
      .mockResolvedValue(TEST_GROUP_ID);
    jest.spyOn(ocrPayloadRef, "writeOcrPayloadBlob").mockResolvedValue({
      blobPath: `${TEST_GROUP_ID}/ocr/${TEST_DOCUMENT_ID}/ocr-result.json`,
      byteLength: 128,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  const sampleResponse = (): OCRResponse => ({
    status: "succeeded",
    createdDateTime: "2024-01-01T00:00:00Z",
    lastUpdatedDateTime: "2024-01-01T00:01:00Z",
    analyzeResult: {
      apiVersion: "2024-11-30",
      modelId: "prebuilt-layout",
      content: "Test content from document",
      pages: [
        {
          pageNumber: 1,
          width: 8.5,
          height: 11,
          unit: "inch",
          words: [],
          lines: [],
          spans: [{ offset: 0, length: 4 }],
        },
      ],
      paragraphs: [],
      tables: [],
      keyValuePairs: [],
      sections: [],
      figures: [],
      documents: [],
    },
  });

  it("extracts OCR results from provided response and returns ref", async () => {
    const mockOCRResponse = sampleResponse();

    const result = await extractOCRResults({
      apimRequestId: "test-request-id",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
      groupId: TEST_GROUP_ID,
      ocrResponse: mockOCRResponse,
    });

    expect(result.ocrResult.storage).toBe("blob");
    expect(result.ocrResult.documentId).toBe(TEST_DOCUMENT_ID);
    expect(ocrPayloadRef.writeOcrPayloadBlob).toHaveBeenCalledWith(
      TEST_GROUP_ID,
      TEST_DOCUMENT_ID,
      "ocr-result.json",
      expect.objectContaining({
        success: true,
        extractedText: "Test content from document",
      }),
    );
  });

  it("fetches OCR results from API when response not provided", async () => {
    axiosMock.get.mockResolvedValue({
      data: sampleResponse(),
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as never,
    });

    const result = await extractOCRResults({
      apimRequestId: "test-request-id",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "prebuilt-layout",
      documentId: TEST_DOCUMENT_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(result.ocrResult.blobPath).toContain("ocr-result.json");
    expect(axiosMock.get).toHaveBeenCalled();
  });

  it("encodes modelId and apimRequestId as single URL path segments", async () => {
    axiosMock.get.mockResolvedValue({
      data: sampleResponse(),
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as never,
    });

    await extractOCRResults({
      apimRequestId: "request/id?x=1",
      fileName: "test.pdf",
      fileType: "pdf",
      modelId: "custom/model#1",
      documentId: TEST_DOCUMENT_ID,
      groupId: TEST_GROUP_ID,
    });

    expect(axiosMock.get).toHaveBeenCalledWith(
      "https://test.cognitiveservices.azure.com/documentintelligence/documentModels/custom%2Fmodel%231/analyzeResults/request%2Fid%3Fx%3D1?api-version=2024-11-30",
      expect.anything(),
    );
  });

  describe("OCR response ref limited to the run's group", () => {
    const OTHER_GROUP = "clh7z2xk00000356u8e3h5678";

    beforeEach(() => {
      mockBlobRead.mockResolvedValue(
        Buffer.from(JSON.stringify(sampleResponse()), "utf8"),
      );
    });

    it("loads a ref whose blob path is in the run's group", async () => {
      const ref = ocrPayloadRef.makeOcrPayloadRef(
        TEST_DOCUMENT_ID,
        `${TEST_GROUP_ID}/ocr/${TEST_DOCUMENT_ID}/azure-response.json`,
        "succeeded",
      );

      await extractOCRResults({
        apimRequestId: "test-request-id",
        fileName: "test.pdf",
        fileType: "pdf",
        modelId: "prebuilt-layout",
        documentId: TEST_DOCUMENT_ID,
        groupId: TEST_GROUP_ID,
        ocrResponse: ref,
      });

      expect(mockBlobRead).toHaveBeenCalledWith(ref.blobPath);
      expect(axiosMock.get).not.toHaveBeenCalled();
    });

    it("refuses a ref whose blob path is in another group", async () => {
      const ref = ocrPayloadRef.makeOcrPayloadRef(
        TEST_DOCUMENT_ID,
        `${OTHER_GROUP}/ocr/${TEST_DOCUMENT_ID}/azure-response.json`,
        "succeeded",
      );

      await expect(
        extractOCRResults({
          apimRequestId: "test-request-id",
          fileName: "test.pdf",
          fileType: "pdf",
          modelId: "prebuilt-layout",
          documentId: TEST_DOCUMENT_ID,
          groupId: TEST_GROUP_ID,
          ocrResponse: ref,
        }),
      ).rejects.toThrow();

      expect(mockBlobRead).not.toHaveBeenCalled();
      expect(ocrPayloadRef.writeOcrPayloadBlob).not.toHaveBeenCalled();
    });

    it("refuses to load a ref when the run has no groupId", async () => {
      const ref = ocrPayloadRef.makeOcrPayloadRef(
        TEST_DOCUMENT_ID,
        `${TEST_GROUP_ID}/ocr/${TEST_DOCUMENT_ID}/azure-response.json`,
        "succeeded",
      );

      await expect(
        extractOCRResults({
          apimRequestId: "test-request-id",
          fileName: "test.pdf",
          fileType: "pdf",
          modelId: "prebuilt-layout",
          documentId: TEST_DOCUMENT_ID,
          ocrResponse: ref,
        }),
      ).rejects.toThrow();

      expect(mockBlobRead).not.toHaveBeenCalled();
    });
  });
});
