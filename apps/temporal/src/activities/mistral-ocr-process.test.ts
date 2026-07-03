jest.mock("../logger", () => ({
  createActivityLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(),
  }),
}));

import axios from "axios";
import type { OcrPayloadRef } from "../ocr-payload-ref";
import * as ocrPayloadRef from "../ocr-payload-ref";
import type { OCRResult, PreparedFileData } from "../types";
import {
  mistralOcrProcess,
  resolveMistralOcrModelId,
} from "./mistral-ocr-process";

const DOC_ID = "doc-mistral-test";
const ocrBodies = new Map<string, OCRResult>();

function ocrFromRef(ref: OcrPayloadRef): OCRResult {
  const body = ocrBodies.get(ref.blobPath);
  if (!body) {
    throw new Error(`missing OCR body for ${ref.blobPath}`);
  }
  return body;
}

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
    ocrBodies.clear();
    process.env = { ...originalEnv, MOCK_MISTRAL_OCR: "true" };
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4"));
    jest
      .spyOn(ocrPayloadRef, "resolveGroupIdForOcr")
      .mockResolvedValue("gtestgroupidfortests01");
    jest
      .spyOn(ocrPayloadRef, "persistOcrArtifactRef")
      .mockImplementation(async (_groupId, documentId, _file, body) => {
        const ref: OcrPayloadRef = {
          documentId,
          blobPath: `gtestgroupidfortests01/ocr/${documentId}/ocr-result.json`,
          storage: "blob",
          status: "succeeded",
        };
        ocrBodies.set(ref.blobPath, body as OCRResult);
        return ref;
      });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("returns mock OCRResult when MOCK_MISTRAL_OCR is true", async () => {
    const { ocrResult: ref } = await mistralOcrProcess({
      fileData: baseFile,
      documentId: DOC_ID,
    });
    const ocrResult = ocrFromRef(ref);
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

    const { ocrResult: ref } = await mistralOcrProcess({
      fileData: baseFile,
      documentId: DOC_ID,
      templateModelId: "tm-1",
    });

    expect(axiosPost).toHaveBeenCalled();
    const callBody = axiosPost.mock.calls[0][1] as Record<string, unknown>;
    expect(callBody.document_annotation_format).toBeDefined();
    expect(ocrFromRef(ref).pages.length).toBeGreaterThan(0);
  });

  it("throws when API key missing and not mock", async () => {
    process.env = { ...originalEnv, MOCK_MISTRAL_OCR: "false" };
    delete process.env.MISTRAL_API_KEY;

    await expect(
      mistralOcrProcess({ fileData: baseFile, documentId: DOC_ID }),
    ).rejects.toThrow("MISTRAL_API_KEY");
  });
});
