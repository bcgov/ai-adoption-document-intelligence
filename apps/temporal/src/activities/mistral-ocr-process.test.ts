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
  __testInternals,
  mistralOcrProcess,
  resolveMistralAzureDeploymentId,
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

describe("resolveMistralAzureDeploymentId", () => {
  it("returns stored id when it is a Foundry Mistral Document AI deployment id", () => {
    expect(resolveMistralAzureDeploymentId("mistral-document-ai-2512")).toBe(
      "mistral-document-ai-2512",
    );
    expect(resolveMistralAzureDeploymentId("Mistral-Document-AI-2505")).toBe(
      "Mistral-Document-AI-2505",
    );
  });

  it("accepts mistral-ocr-* ids (shared lineage with public deployment)", () => {
    expect(resolveMistralAzureDeploymentId("mistral-ocr-latest")).toBe(
      "mistral-ocr-latest",
    );
  });

  it("falls back to default for Azure DI / template ids", () => {
    expect(resolveMistralAzureDeploymentId("prebuilt-layout")).toBe(
      "mistral-document-ai-2512",
    );
    expect(resolveMistralAzureDeploymentId(undefined)).toBe(
      "mistral-document-ai-2512",
    );
    expect(resolveMistralAzureDeploymentId("sdpr_synth_test")).toBe(
      "mistral-document-ai-2512",
    );
  });
});

describe("buildAzureOcrUrl", () => {
  const { buildAzureOcrUrl } = __testInternals;

  it("appends the canonical Foundry path for Mistral Document AI", () => {
    expect(
      buildAzureOcrUrl("https://strukalex-8338-resource.services.ai.azure.com"),
    ).toBe(
      "https://strukalex-8338-resource.services.ai.azure.com/providers/mistral/azure/ocr",
    );
  });

  it("strips a trailing slash from the configured endpoint", () => {
    expect(buildAzureOcrUrl("https://example.services.ai.azure.com/")).toBe(
      "https://example.services.ai.azure.com/providers/mistral/azure/ocr",
    );
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

  describe("variant: azure (Foundry)", () => {
    it("returns mock result when MOCK_MISTRAL_AZURE_OCR is true", async () => {
      process.env = { ...originalEnv, MOCK_MISTRAL_AZURE_OCR: "true" };
      const { ocrResult: ref, ocrResponse } = await mistralOcrProcess({
        fileData: baseFile,
        documentId: DOC_ID,
        variant: "azure",
      });
      const ocrResult = ocrFromRef(ref);
      expect(ocrResult.success).toBe(true);
      expect(ocrResult.extractedText).toContain("mock foundry ocr");
      expect(ocrResult.modelId).toBe("mistral-document-ai-2512");
      // Mock fixture exercises the bbox population path so polygons are non-empty.
      expect(ocrResult.pages[0].words[0].polygon.length).toBe(8);
      expect(ocrResponse).toBeDefined();
      expect(ocrResponse.model).toBe("mistral-document-ai-2512");
      expect(axiosPost).not.toHaveBeenCalled();
    });

    it("calls the Foundry endpoint with Bearer auth and the Mistral body (no confidence_scores_granularity)", async () => {
      process.env = {
        ...originalEnv,
        MOCK_MISTRAL_AZURE_OCR: "false",
        MISTRAL_DOC_AI_AZURE_ENDPOINT:
          "https://strukalex-8338-resource.services.ai.azure.com",
        MISTRAL_DOC_AI_AZURE_KEY: "test-foundry-key",
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
          model: "mistral-document-ai-2512",
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

      const { ocrResult: ref, ocrResponse } = await mistralOcrProcess({
        fileData: baseFile,
        documentId: DOC_ID,
        variant: "azure",
        templateModelId: "tm-1",
        documentAnnotationPrompt: "Extract values from this form.",
        fieldDescriptions: { amount: "The total amount in dollars" },
        numericFieldsNullable: true,
      });

      expect(axiosPost).toHaveBeenCalledTimes(1);
      const [calledUrl, calledBody, calledOptions] = axiosPost.mock.calls[0];
      expect(calledUrl).toBe(
        "https://strukalex-8338-resource.services.ai.azure.com/providers/mistral/azure/ocr",
      );
      const body = calledBody as Record<string, unknown>;
      expect(body.model).toBe("mistral-document-ai-2512");
      expect(body.document_annotation_format).toBeDefined();
      // Foundry rejects `confidence_scores_granularity` with HTTP 422.
      expect(body.confidence_scores_granularity).toBeUndefined();
      const opts = calledOptions as { headers?: Record<string, string> };
      expect(opts.headers?.Authorization).toBe("Bearer test-foundry-key");
      expect(ocrFromRef(ref).modelId).toBe("mistral-document-ai-2512");
      expect(ocrResponse.pages?.length).toBeGreaterThan(0);

      const fmt = body.document_annotation_format as {
        json_schema: {
          schema: {
            properties: Record<string, { type: unknown; description?: string }>;
          };
        };
      };
      expect(body.document_annotation_prompt).toBe(
        "Extract values from this form.",
      );
      expect(fmt.json_schema.schema.properties.amount.description).toBe(
        "The total amount in dollars",
      );
      // numericFieldsNullable=true -> amount type is ["number","null"]
      expect(fmt.json_schema.schema.properties.amount.type).toEqual([
        "number",
        "null",
      ]);
      // ocr3Features omitted -> none of the OCR-3 fields are emitted.
      expect(body.table_format).toBeUndefined();
      expect(body.bbox_annotation_format).toBeUndefined();
      expect(body.image_min_size).toBeUndefined();
      expect(body.image_limit).toBeUndefined();
    });

    it("forwards ocr3Features into the Foundry request body when set", async () => {
      process.env = {
        ...originalEnv,
        MOCK_MISTRAL_AZURE_OCR: "false",
        MISTRAL_DOC_AI_AZURE_ENDPOINT:
          "https://strukalex-8338-resource.services.ai.azure.com",
        MISTRAL_DOC_AI_AZURE_KEY: "test-foundry-key",
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
          model: "mistral-document-ai-2512",
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

      const bboxFmt = {
        type: "json_schema" as const,
        json_schema: {
          name: "bbox_annotation",
          strict: true as const,
          schema: {
            type: "object" as const,
            title: "BboxAnnotation",
            properties: {
              kind: {
                type: "string",
                enum: ["signature", "checkbox", "figure"],
              },
            },
            required: ["kind"],
            additionalProperties: false as const,
          },
        },
      };

      await mistralOcrProcess({
        fileData: baseFile,
        documentId: DOC_ID,
        variant: "azure",
        templateModelId: "tm-1",
        documentAnnotationPrompt: "extract",
        fieldDescriptions: {},
        numericFieldsNullable: true,
        ocr3Features: {
          tableFormat: "html",
          bboxAnnotationFormat: bboxFmt,
          imageMinSize: 64,
          imageLimit: 8,
        },
      });

      const [, calledBody] = axiosPost.mock.calls[0];
      const body = calledBody as Record<string, unknown>;
      expect(body.table_format).toBe("html");
      expect(body.bbox_annotation_format).toBe(bboxFmt);
      expect(body.image_min_size).toBe(64);
      expect(body.image_limit).toBe(8);
    });

    it("throws when the Foundry endpoint is missing and not mock", async () => {
      process.env = { ...originalEnv, MOCK_MISTRAL_AZURE_OCR: "false" };
      delete process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT;
      delete process.env.MISTRAL_DOC_AI_AZURE_KEY;

      await expect(
        mistralOcrProcess({
          fileData: baseFile,
          documentId: DOC_ID,
          variant: "azure",
        }),
      ).rejects.toThrow("MISTRAL_DOC_AI_AZURE_ENDPOINT");
    });

    it("throws when the Foundry API key is missing and not mock", async () => {
      process.env = {
        ...originalEnv,
        MOCK_MISTRAL_AZURE_OCR: "false",
        MISTRAL_DOC_AI_AZURE_ENDPOINT:
          "https://strukalex-8338-resource.services.ai.azure.com",
      };
      delete process.env.MISTRAL_DOC_AI_AZURE_KEY;

      await expect(
        mistralOcrProcess({
          fileData: baseFile,
          documentId: DOC_ID,
          variant: "azure",
        }),
      ).rejects.toThrow("MISTRAL_DOC_AI_AZURE_KEY");
    });
  });
});
