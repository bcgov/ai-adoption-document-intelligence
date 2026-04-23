import DocumentIntelligence, {
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { azureClassifySubmit } from "./azure-classify-submit";
import { getPrismaClient } from "./database-client";

jest.mock("@azure-rest/ai-document-intelligence", () => ({
  __esModule: true,
  default: jest.fn(),
  isUnexpected: jest.fn(),
}));

const mockBlobRead = jest.fn();
const mockGenerateSasUrl = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
    generateSasUrl: mockGenerateSasUrl,
  }),
}));

jest.mock("./database-client", () => ({
  getPrismaClient: jest.fn(),
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

const mockPost = jest.fn();
const mockPath = jest.fn(() => ({ post: mockPost }));

const READY_CLASSIFIER = {
  name: "my-classifier",
  group_id: "atestgroup",
  status: "READY",
};

describe("azureClassifySubmit activity", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT:
        "https://test.cognitiveservices.azure.com",
      AZURE_DOCUMENT_INTELLIGENCE_API_KEY: "test-api-key",
      BLOB_STORAGE_PROVIDER: "minio",
    };

    documentIntelligenceMock.mockReturnValue({
      path: mockPath,
    } as unknown as ReturnType<typeof DocumentIntelligence>);
    mockPath.mockReturnValue({ post: mockPost });
    isUnexpectedMock.mockReturnValue(false);
    mockBlobRead.mockResolvedValue(Buffer.from("pdf-content"));

    (getPrismaClient as jest.Mock).mockReturnValue({
      classifierModel: {
        findFirst: jest.fn().mockResolvedValue(READY_CLASSIFIER),
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Scenario 1: Classifier not found or not READY", () => {
    it("throws when classifier does not exist for the group", async () => {
      (getPrismaClient as jest.Mock).mockReturnValue({
        classifierModel: { findFirst: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        azureClassifySubmit({
          blobKey: "atestgroup/ocr/doc.pdf",
          groupId: "atestgroup",
          classifierName: "missing",
        }),
      ).rejects.toThrow(
        /Classifier "missing" for group "atestgroup" not found or not READY/,
      );

      expect(mockPath).not.toHaveBeenCalled();
    });
  });

  describe("Scenario 2: Azure storage provider uses SAS URL", () => {
    it("calls generateSasUrl and passes urlSource when provider is azure", async () => {
      process.env.BLOB_STORAGE_PROVIDER = "azure";
      const sasUrl =
        "https://test.blob.core.windows.net/container/doc.pdf?sas=1";
      mockGenerateSasUrl.mockResolvedValue(sasUrl);
      mockPost.mockResolvedValue({
        status: "202",
        headers: {
          "operation-location":
            "https://test.cognitiveservices.azure.com/documentClassifiers/atestgroup__my-classifier/analyzeResults/result-abc",
        },
      });

      await azureClassifySubmit({
        blobKey: "atestgroup/ocr/doc.pdf",
        groupId: "atestgroup",
        classifierName: "my-classifier",
      });

      expect(mockGenerateSasUrl).toHaveBeenCalledWith(
        "atestgroup/ocr/doc.pdf",
        15,
      );
      expect(mockBlobRead).not.toHaveBeenCalled();
      const postArgs = mockPost.mock.calls[0][0];
      expect(postArgs.body).toEqual({ urlSource: sasUrl });
    });
  });

  describe("Scenario 3: Minio provider uses base64Source", () => {
    it("reads blob bytes and passes base64Source when provider is minio", async () => {
      process.env.BLOB_STORAGE_PROVIDER = "minio";
      mockPost.mockResolvedValue({
        status: "202",
        headers: {
          "operation-location":
            "https://test.cognitiveservices.azure.com/documentClassifiers/atestgroup__my-classifier/analyzeResults/result-xyz",
        },
      });

      await azureClassifySubmit({
        blobKey: "atestgroup/ocr/doc.pdf",
        groupId: "atestgroup",
        classifierName: "my-classifier",
      });

      expect(mockBlobRead).toHaveBeenCalledWith("atestgroup/ocr/doc.pdf");
      expect(mockGenerateSasUrl).not.toHaveBeenCalled();
      const postArgs = mockPost.mock.calls[0][0];
      expect(postArgs.body).toEqual({
        base64Source: Buffer.from("pdf-content").toString("base64"),
      });
    });
  });

  describe("Scenario 4: Azure returns 202 — resultId and constructedClassifierName", () => {
    it("extracts resultId from the last path segment of operation-location", async () => {
      mockPost.mockResolvedValue({
        status: "202",
        headers: {
          "operation-location":
            "https://endpoint.com/documentClassifiers/atestgroup__myclf/analyzeResults/the-result-id",
        },
      });

      const result = await azureClassifySubmit({
        blobKey: "atestgroup/ocr/doc.pdf",
        groupId: "atestgroup",
        classifierName: "my-classifier",
      });

      expect(result.resultId).toBe("the-result-id");
      expect(result.constructedClassifierName).toBe(
        "atestgroup__my-classifier",
      );
    });
  });

  describe("Scenario 5: Azure returns non-202 status", () => {
    it("throws when Azure returns an unexpected response", async () => {
      mockPost.mockResolvedValue({
        status: "400",
        headers: {},
        body: { error: { message: "bad request" } },
      });
      isUnexpectedMock.mockReturnValue(true);

      await expect(
        azureClassifySubmit({
          blobKey: "atestgroup/ocr/doc.pdf",
          groupId: "atestgroup",
          classifierName: "my-classifier",
        }),
      ).rejects.toThrow(/Azure classifier submit failed/);
    });

    it("throws when response status is not 202 (non-unexpected)", async () => {
      isUnexpectedMock.mockReturnValue(false);
      mockPost.mockResolvedValue({
        status: "500",
        headers: {},
        body: {},
      });

      await expect(
        azureClassifySubmit({
          blobKey: "atestgroup/ocr/doc.pdf",
          groupId: "atestgroup",
          classifierName: "my-classifier",
        }),
      ).rejects.toThrow(/unexpected status 500/);
    });
  });

  describe("Scenario 6: documentId and blobKey are forwarded", () => {
    it("includes blobKey and groupId in the output", async () => {
      mockPost.mockResolvedValue({
        status: "202",
        headers: {
          "operation-location":
            "https://endpoint.com/documentClassifiers/atestgroup__myclf/analyzeResults/rid",
        },
      });

      const result = await azureClassifySubmit({
        blobKey: "atestgroup/ocr/doc.pdf",
        groupId: "atestgroup",
        classifierName: "my-classifier",
      });

      expect(result.blobKey).toBe("atestgroup/ocr/doc.pdf");
      expect(result.groupId).toBe("atestgroup");
      expect(result.documentId).toBeUndefined();
    });

    it("includes documentId in the output when provided", async () => {
      mockPost.mockResolvedValue({
        status: "202",
        headers: {
          "operation-location":
            "https://endpoint.com/documentClassifiers/atestgroup__myclf/analyzeResults/rid",
        },
      });

      const result = await azureClassifySubmit({
        blobKey: "atestgroup/ocr/doc.pdf",
        groupId: "atestgroup",
        classifierName: "my-classifier",
        documentId: "doc42",
      });

      expect(result.documentId).toBe("doc42");
    });
  });
});
