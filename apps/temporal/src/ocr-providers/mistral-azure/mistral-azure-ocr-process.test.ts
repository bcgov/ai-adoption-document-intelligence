import axios from "axios";
import type { PreparedFileData } from "../../types";
import {
  __testInternals,
  mistralAzureOcrProcess,
  resolveMistralAzureDeploymentId,
} from "./mistral-azure-ocr-process";

jest.mock("axios");
const axiosPost = axios.post as jest.MockedFunction<typeof axios.post>;

const mockBlobRead = jest.fn();
jest.mock("../../blob-storage/blob-storage-client", () => ({
  getBlobStorageClient: () => ({
    read: mockBlobRead,
  }),
}));

const mockFindUnique = jest.fn();
jest.mock("../../activities/database-client", () => ({
  getPrismaClient: () => ({
    templateModel: {
      findUnique: mockFindUnique,
    },
  }),
}));

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

describe("buildOcrUrl", () => {
  const { buildOcrUrl } = __testInternals;

  it("appends the canonical Foundry path for Mistral Document AI", () => {
    expect(
      buildOcrUrl("https://strukalex-8338-resource.services.ai.azure.com"),
    ).toBe(
      "https://strukalex-8338-resource.services.ai.azure.com/providers/mistral/azure/ocr",
    );
  });

  it("strips a trailing slash from the configured endpoint", () => {
    expect(buildOcrUrl("https://example.services.ai.azure.com/")).toBe(
      "https://example.services.ai.azure.com/providers/mistral/azure/ocr",
    );
  });
});

describe("mistralAzureOcrProcess", () => {
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
    process.env = { ...originalEnv, MOCK_MISTRAL_AZURE_OCR: "true" };
    mockBlobRead.mockResolvedValue(Buffer.from("%PDF-1.4"));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns mock OCRResult when MOCK_MISTRAL_AZURE_OCR is true", async () => {
    const { ocrResult, ocrResponse } = await mistralAzureOcrProcess({
      fileData: baseFile,
    });
    expect(ocrResult.success).toBe(true);
    expect(ocrResult.extractedText).toContain("mock foundry ocr");
    expect(ocrResult.modelId).toBe("mistral-document-ai-2512");
    // Mock fixture exercises the bbox population path so polygons are non-empty.
    expect(ocrResult.pages[0].words[0].polygon.length).toBe(8);
    // Raw response is also returned so the benchmark sample workflow can
    // persist it to `benchmark_ocr_cache` (sync providers that only emit
    // `ocrResult` produce no cache rows otherwise).
    expect(ocrResponse).toBeDefined();
    expect(ocrResponse.model).toBe("mistral-document-ai-2512");
    expect(axiosPost).not.toHaveBeenCalled();
  });

  it("calls Foundry endpoint with Bearer auth and Mistral request body", async () => {
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

    const { ocrResult, ocrResponse } = await mistralAzureOcrProcess({
      fileData: baseFile,
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
    // Foundry rejects `confidence_scores_granularity` with HTTP 422 — must
    // not be in the request body even though the public-API path sends it.
    expect(body.confidence_scores_granularity).toBeUndefined();
    const opts = calledOptions as { headers?: Record<string, string> };
    expect(opts.headers?.Authorization).toBe("Bearer test-foundry-key");
    expect(opts.headers?.["Content-Type"]).toBe("application/json");
    expect(ocrResult.modelId).toBe("mistral-document-ai-2512");
    expect(ocrResult.pages.length).toBeGreaterThan(0);
    // Raw response surfaced to ctx so persistOcrCache can write to benchmark_ocr_cache.
    expect(ocrResponse).toBeDefined();
    expect(ocrResponse.pages?.length).toBeGreaterThan(0);
    // The activity must forward documentAnnotationPrompt + fieldDescriptions
    // + numericFieldsNullable through to the schema sent to Foundry.
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
    // ocr3Features omitted -> none of the OCR-3 fields are emitted (default
    // behaviour matches the Foundry-supported request body).
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

    // Build a tiny bbox annotation schema inline to avoid coupling the test
    // to the converter — we only need to verify it gets forwarded verbatim.
    const bboxFmt = {
      type: "json_schema" as const,
      json_schema: {
        name: "bbox_annotation",
        strict: true as const,
        schema: {
          type: "object" as const,
          title: "BboxAnnotation",
          properties: {
            kind: { type: "string", enum: ["signature", "checkbox", "figure"] },
          },
          required: ["kind"],
          additionalProperties: false as const,
        },
      },
    };

    await mistralAzureOcrProcess({
      fileData: baseFile,
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

  it("throws when endpoint is missing and not mock", async () => {
    process.env = { ...originalEnv, MOCK_MISTRAL_AZURE_OCR: "false" };
    delete process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT;
    delete process.env.MISTRAL_DOC_AI_AZURE_KEY;

    await expect(
      mistralAzureOcrProcess({ fileData: baseFile }),
    ).rejects.toThrow("MISTRAL_DOC_AI_AZURE_ENDPOINT");
  });

  it("throws when API key is missing and not mock", async () => {
    process.env = {
      ...originalEnv,
      MOCK_MISTRAL_AZURE_OCR: "false",
      MISTRAL_DOC_AI_AZURE_ENDPOINT:
        "https://strukalex-8338-resource.services.ai.azure.com",
    };
    delete process.env.MISTRAL_DOC_AI_AZURE_KEY;

    await expect(
      mistralAzureOcrProcess({ fileData: baseFile }),
    ).rejects.toThrow("MISTRAL_DOC_AI_AZURE_KEY");
  });
});
