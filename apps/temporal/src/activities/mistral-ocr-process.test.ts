import axios from "axios";
import type { PreparedFileData } from "../types";
import {
  mistralOcrProcess,
  resolveMistralOcrModelId,
} from "./mistral-ocr-process";

jest.mock("axios");
const axiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

const mockBlobRead = jest.fn();
jest.mock("../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

const mockFindUnique = jest.fn();
jest.mock("./database-client", () => ({
  getPrismaClient: () => ({
    templateModel: {
      findUnique: mockFindUnique,
    },
  }),
}));

describe("resolveMistralOcrModelId", () => {
  it("returns stored id when it is a Mistral OCR model", () => {
    expect(resolveMistralOcrModelId("mistral-ocr-latest")).toBe(
      "mistral-ocr-latest",
    );
    expect(resolveMistralOcrModelId("Mistral-OCR-2505")).toBe(
      "Mistral-OCR-2505",
    );
  });

  it("falls back to default for Azure-style ids", () => {
    expect(resolveMistralOcrModelId("prebuilt-layout")).toBe(
      "mistral-ocr-latest",
    );
    expect(resolveMistralOcrModelId(undefined)).toBe("mistral-ocr-latest");
  });
});

describe("mistralOcrProcess", () => {
  const originalEnv = process.env;

  const baseFile: PreparedFileData = {
    fileName: "doc.pdf",
    fileType: "pdf",
    contentType: "application/pdf",
    blobKey: "cjld0cudp0000qzrmn0i2o72/ocr/doc.pdf",
    modelId: "prebuilt-layout",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv, MOCK_MISTRAL_OCR: "true" };
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns mock OCRResult when MOCK_MISTRAL_OCR is true", async () => {
    const { ocrResult } = await mistralOcrProcess({ fileData: baseFile });
    expect(ocrResult.success).toBe(true);
    expect(ocrResult.extractedText).toContain("mock ocr");
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("calls Mistral API when not mock and sends annotation format when template resolves", async () => {
    process.env = {
      ...originalEnv,
      MOCK_MISTRAL_OCR: "false",
      MISTRAL_API_KEY: "test-key",
    };

    mockFindUnique.mockResolvedValue({
      id: "tm-1",
      field_schema: [
        {
          field_key: "amount",
          field_type: "number",
          field_format: null,
          display_order: 0,
        },
      ],
    });

    axiosPost.mockResolvedValue({
      data: {
        model: "mistral-ocr-latest",
        pages: [
          {
            index: 0,
            markdown: "ok",
            dimensions: { width: 10, height: 10, dpi: 72 },
          },
        ],
        usage_info: { pages_processed: 1 },
      },
    });

    const { ocrResult } = await mistralOcrProcess({
      fileData: baseFile,
      templateModelId: "tm-1",
    });

    expect(axiosPost).toHaveBeenCalled();
    const callBody = axiosPost.mock.calls[0][1] as Record<string, unknown>;
    expect(callBody.document_annotation_format).toBeDefined();
    expect(ocrResult.pages.length).toBeGreaterThan(0);
  });

  it("throws when API key missing and not mock", async () => {
    process.env = { ...originalEnv, MOCK_MISTRAL_OCR: "false" };
    delete process.env.MISTRAL_API_KEY;

    await expect(mistralOcrProcess({ fileData: baseFile })).rejects.toThrow(
      "MISTRAL_API_KEY",
    );
  });
});
