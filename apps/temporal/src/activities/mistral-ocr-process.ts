import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage } from "@ai-di/shared-logging";
import type { FieldType } from "@generated/client";
import axios from "axios";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import { createActivityLogger } from "../logger";
import type { OcrPayloadRef } from "../ocr-payload-ref";
import {
  persistOcrArtifactRef,
  requireDocumentId,
  resolveGroupIdForOcr,
} from "../ocr-payload-ref";
import {
  fieldDefinitionsToMistralDocumentAnnotationFormat,
  type MistralDocumentAnnotationFormat,
  type TemplateFieldDefinitionInput,
} from "../ocr-providers/mistral/field-definitions-to-mistral-annotation-format";
import type { MistralOcrApiResponse } from "../ocr-providers/mistral/mistral-ocr-types";
import { mistralOcrResponseToOcrResult } from "../ocr-providers/mistral/mistral-to-ocr-result";
import type { PreparedFileData } from "../types";
import { getPrismaClient } from "./database-client";

/**
 * Mistral Document AI has two transports with an identical request/response
 * contract: the public API (`native`) and the Azure AI Foundry serverless
 * deployment (`azure`). This single activity serves both, keyed by `variant`.
 */
export type MistralOcrVariant = "native" | "azure";

/** Public Mistral Document AI OCR endpoint (native variant). */
const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
/**
 * Path appended to the Foundry resource's services endpoint to call Mistral
 * Document AI (azure variant). Confirmed via the LiteLLM Azure-AI provider
 * transformation (`/providers/mistral/azure/ocr`).
 */
const MISTRAL_AZURE_OCR_PATH = "/providers/mistral/azure/ocr";

const DEFAULT_MISTRAL_MODEL = "mistral-ocr-latest";
const DEFAULT_MISTRAL_AZURE_DEPLOYMENT_ID = "mistral-document-ai-2512";

/**
 * `document.model_id` from upload is an Azure/trained id (e.g. prebuilt-layout, km-2).
 * The public Mistral OCR API only accepts Mistral model names (e.g. mistral-ocr-latest).
 * If the stored id is not a Mistral OCR model, use the default.
 */
export function resolveMistralOcrModelId(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if (t.length > 0 && t.toLowerCase().startsWith("mistral-ocr")) {
    return t;
  }
  return DEFAULT_MISTRAL_MODEL;
}

/**
 * The Foundry Mistral Document AI deployment only accepts its own deployment id
 * (e.g. `mistral-document-ai-2512`). If the stored id is not a Mistral Document
 * AI deployment id (or a shared-lineage `mistral-ocr-*`), fall back to default.
 */
export function resolveMistralAzureDeploymentId(
  raw: string | undefined,
): string {
  const t = raw?.trim() ?? "";
  if (
    t.length > 0 &&
    (t.toLowerCase().startsWith("mistral-document-ai") ||
      t.toLowerCase().startsWith("mistral-ocr"))
  ) {
    return t;
  }
  return DEFAULT_MISTRAL_AZURE_DEPLOYMENT_ID;
}

function buildAzureOcrUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}${MISTRAL_AZURE_OCR_PATH}`;
}

async function readBlobData(blobKey: string): Promise<Buffer> {
  if (path.isAbsolute(blobKey)) {
    try {
      return await fs.promises.readFile(blobKey);
    } catch (_error) {
      throw new Error(`File not found on disk: "${blobKey}"`);
    }
  }

  const client = getBlobStorageClient();
  try {
    return await client.read(validateBlobFilePath(blobKey));
  } catch (_error) {
    throw new Error(`Blob not found: "${blobKey}"`);
  }
}

function buildDataUrl(contentType: string, buffer: Buffer): string {
  const mime =
    contentType && contentType.trim().length > 0
      ? contentType
      : "application/octet-stream";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function prismaFieldToAnnotationInput(field: {
  field_key: string;
  field_type: FieldType;
  field_format: string | null;
}): TemplateFieldDefinitionInput {
  return {
    field_key: field.field_key,
    field_type: field.field_type,
    field_format: field.field_format,
  };
}

export interface MistralTemplateLoadResult {
  format: MistralDocumentAnnotationFormat | null;
  fieldDefs: Array<{
    field_key: string;
    field_type: FieldType;
    field_format: string | null;
  }>;
}

async function loadMistralTemplateForAnnotation(
  templateModelId: string,
  log: ReturnType<typeof createActivityLogger>,
  options: {
    fieldDescriptions?: Record<string, string>;
    numericFieldsNullable?: boolean;
  } = {},
): Promise<MistralTemplateLoadResult | null> {
  try {
    const prisma = getPrismaClient();
    const templateModel = await prisma.templateModel.findUnique({
      where: { id: templateModelId },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });

    if (
      !templateModel ||
      !templateModel.field_schema ||
      templateModel.field_schema.length === 0
    ) {
      log.info("Mistral OCR: skipping document annotation", {
        event: "annotation_skip",
        templateModelId,
        reason: "template_not_found_or_empty_schema",
      });
      return null;
    }

    const fields = templateModel.field_schema.map(prismaFieldToAnnotationInput);
    const format = fieldDefinitionsToMistralDocumentAnnotationFormat(fields, {
      descriptions: options.fieldDescriptions,
      numericFieldsNullable: options.numericFieldsNullable,
    });
    const fieldDefs = templateModel.field_schema.map(
      (f: {
        field_key: string;
        field_type: FieldType;
        field_format: string | null;
      }) => ({
        field_key: f.field_key,
        field_type: f.field_type,
        field_format: f.field_format,
      }),
    );
    if (!format) {
      log.info("Mistral OCR: skipping document annotation format on request", {
        event: "annotation_skip",
        templateModelId,
        reason: "no_valid_field_keys_after_filter",
      });
    }
    return { format, fieldDefs };
  } catch (error) {
    log.error(
      "Mistral OCR: failed to load template schema; continuing without annotation",
      {
        event: "annotation_skip",
        templateModelId,
        error: getErrorMessage(error),
      },
    );
    return null;
  }
}

function buildMockResponse(
  variant: MistralOcrVariant,
  fileData: PreparedFileData,
  resolvedModelId: string,
): MistralOcrApiResponse {
  if (variant === "azure") {
    const text = `mock foundry ocr for ${fileData.fileName}`;
    return {
      model: resolvedModelId,
      pages: [
        {
          index: 0,
          markdown: text,
          dimensions: { width: 612, height: 792, dpi: 72 },
          confidence_scores: {
            average_page_confidence_score: 0.99,
            minimum_page_confidence_score: 0.95,
            word_confidence_scores: [
              {
                text: "mock",
                confidence: 0.99,
                start_index: 0,
                bbox: {
                  top_left_x: 0,
                  top_left_y: 0,
                  bottom_right_x: 40,
                  bottom_right_y: 20,
                },
              },
              {
                text: "foundry",
                confidence: 0.98,
                start_index: 5,
                bbox: {
                  top_left_x: 45,
                  top_left_y: 0,
                  bottom_right_x: 110,
                  bottom_right_y: 20,
                },
              },
            ],
          },
        },
      ],
      usage_info: { pages_processed: 1 },
    };
  }

  const text = `mock ocr for ${fileData.fileName}`;
  return {
    model: resolvedModelId,
    pages: [
      {
        index: 0,
        markdown: text,
        dimensions: { width: 612, height: 792, dpi: 72 },
        confidence_scores: {
          average_page_confidence_score: 0.99,
          minimum_page_confidence_score: 0.95,
          word_confidence_scores: [
            { text: "mock", confidence: 0.99, start_index: 0 },
            { text: "ocr", confidence: 0.98, start_index: 5 },
          ],
        },
      },
    ],
    usage_info: { pages_processed: 1 },
  };
}

export interface MistralOcrProcessParams {
  fileData: PreparedFileData;
  documentId: string;
  groupId?: string | null;
  /** Transport: `native` (public API) or `azure` (Foundry). Default `native`. */
  variant?: MistralOcrVariant;
  /** Labeling template model id; loads `field_schema` for `document_annotation_format`. */
  templateModelId?: string;
  /** Optional prompt forwarded to Mistral `document_annotation_prompt`. */
  documentAnnotationPrompt?: string;
  /**
   * Optional per-field description overlay (keyed by `field_key`) attached to
   * the annotation JSON Schema's `description` properties. `azure` only.
   */
  fieldDescriptions?: Record<string, string>;
  /**
   * When true, every numeric field in the JSON Schema becomes nullable
   * (`["number", "null"]`), letting Mistral return `null` for blank cells
   * distinct from `0`. `azure` only.
   */
  numericFieldsNullable?: boolean;
  /**
   * Mistral OCR-3 feature opt-ins, passed through to the Foundry request body
   * verbatim when set. `azure` only — the public API does not accept them.
   */
  ocr3Features?: {
    /** `"html"` renders markdown tables with explicit `<td>` cell boundaries. */
    tableFormat?: "html";
    /** Wrapping JSON Schema for the per-bbox annotation pass. */
    bboxAnnotationFormat?: MistralDocumentAnnotationFormat;
    /** Min crop dimension (px) for the bbox / image preprocessor. */
    imageMinSize?: number;
    /** Max number of bbox crops the LMM sees on each call. */
    imageLimit?: number;
  };
  requestId?: string;
}

export interface MistralOcrProcessResult {
  /**
   * Canonical mapped OCR result, persisted to blob storage and returned as a
   * lightweight {@link OcrPayloadRef} so the full payload stays out of Temporal
   * history (resolved by downstream `ocr.cleanup` / `ocr.checkConfidence`).
   */
  ocrResult: OcrPayloadRef;
  /**
   * Raw Mistral OCR response — emitted so the benchmark sample workflow's
   * `persistOcrCache` step can write it to `benchmark_ocr_cache` (sync providers
   * that only emit `ocrResult` produce no cache rows otherwise).
   */
  ocrResponse: MistralOcrApiResponse;
}

/**
 * Activity: Run Mistral Document AI OCR (synchronous) and return a canonical
 * OCR result as an {@link OcrPayloadRef} plus the raw response. A single HTTP
 * call performs OCR + `document_annotation` server-side for both transports;
 * `variant` selects the public API or the Azure Foundry deployment.
 */
export async function mistralOcrProcess(
  params: MistralOcrProcessParams,
): Promise<MistralOcrProcessResult> {
  const variant: MistralOcrVariant = params.variant ?? "native";
  const isAzure = variant === "azure";
  const activityName = isAzure ? "mistralAzureOcrProcess" : "mistralOcrProcess";
  const documentId = requireDocumentId(params);
  const { fileData, documentAnnotationPrompt } = params;
  const templateModelIdRaw = params.templateModelId?.trim();
  const log = createActivityLogger(activityName, {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const useMock =
    process.env[isAzure ? "MOCK_MISTRAL_AZURE_OCR" : "MOCK_MISTRAL_OCR"] ===
    "true";
  const requestId = `${isAzure ? "mistral-azure" : "mistral"}-${randomUUID()}`;

  const resolvedModelId = isAzure
    ? resolveMistralAzureDeploymentId(fileData.modelId)
    : resolveMistralOcrModelId(fileData.modelId);
  if (resolvedModelId !== fileData.modelId?.trim()) {
    log.info(
      "Mistral OCR: document model_id not accepted by transport; using default",
      {
        event: "model_fallback",
        variant,
        documentModelId: fileData.modelId,
        resolvedModelId,
      },
    );
  }

  log.info("Mistral OCR process start", {
    event: "start",
    variant,
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    modelId: resolvedModelId,
    blobKey: fileData.blobKey,
    useMock,
  });

  const persist = async (
    ocrResult: Awaited<ReturnType<typeof mistralOcrResponseToOcrResult>>,
  ): Promise<OcrPayloadRef> => {
    const groupId = await resolveGroupIdForOcr(documentId, params.groupId);
    return persistOcrArtifactRef(
      groupId,
      documentId,
      "ocr-result.json",
      ocrResult,
    );
  };

  if (useMock) {
    const ocrResponse = buildMockResponse(variant, fileData, resolvedModelId);
    const ocrResult = mistralOcrResponseToOcrResult(
      ocrResponse,
      {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        requestId,
        modelId: resolvedModelId,
      },
      undefined,
    );
    const ref = await persist(ocrResult);
    log.info("Mistral OCR process complete (mock)", {
      event: "complete_mock",
      variant,
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { ocrResult: ref, ocrResponse };
  }

  // Resolve transport credentials + URL.
  let url: string;
  let apiKey: string;
  let timeoutMs: number;
  if (isAzure) {
    const endpoint = process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT?.trim();
    const key = process.env.MISTRAL_DOC_AI_AZURE_KEY;
    if (!endpoint) {
      log.error("Mistral Azure OCR: missing endpoint", {
        event: "error",
        error: "missing_endpoint",
        durationMs: Date.now() - startTime,
      });
      throw new Error(
        "Mistral Azure Foundry endpoint not configured. Set MISTRAL_DOC_AI_AZURE_ENDPOINT environment variable.",
      );
    }
    if (!key) {
      log.error("Mistral Azure OCR: missing API key", {
        event: "error",
        error: "missing_credentials",
        durationMs: Date.now() - startTime,
      });
      throw new Error(
        "Mistral Azure Foundry API key not configured. Set MISTRAL_DOC_AI_AZURE_KEY environment variable.",
      );
    }
    url = buildAzureOcrUrl(endpoint);
    apiKey = key;
    timeoutMs = 900_000;
  } else {
    const key = process.env.MISTRAL_API_KEY;
    if (!key) {
      log.error("Mistral OCR: missing API key", {
        event: "error",
        error: "missing_credentials",
        durationMs: Date.now() - startTime,
      });
      throw new Error(
        "Mistral API key not configured. Set MISTRAL_API_KEY environment variable.",
      );
    }
    url = MISTRAL_OCR_URL;
    apiKey = key;
    timeoutMs = 600_000;
  }

  const buffer = await readBlobData(fileData.blobKey);
  const documentUrl = buildDataUrl(fileData.contentType, buffer);

  let documentAnnotationFormat: MistralDocumentAnnotationFormat | null = null;
  let mistralFieldDefs: MistralTemplateLoadResult["fieldDefs"] = [];
  if (templateModelIdRaw) {
    const loaded = await loadMistralTemplateForAnnotation(
      templateModelIdRaw,
      log,
      isAzure
        ? {
            fieldDescriptions: params.fieldDescriptions,
            numericFieldsNullable: params.numericFieldsNullable,
          }
        : {},
    );
    if (loaded) {
      documentAnnotationFormat = loaded.format;
      mistralFieldDefs = loaded.fieldDefs;
    }
  }

  const annotationPrompt = documentAnnotationPrompt?.trim();

  try {
    const requestBody: Record<string, unknown> = {
      model: resolvedModelId,
      document: {
        type: "document_url",
        document_url: documentUrl,
      },
      // Foundry rejects `confidence_scores_granularity` with HTTP 422
      // (`extra_forbidden`); only the public API accepts it.
      ...(isAzure ? {} : { confidence_scores_granularity: "word" }),
    };
    if (documentAnnotationFormat) {
      requestBody.document_annotation_format = documentAnnotationFormat;
    }
    if (annotationPrompt) {
      requestBody.document_annotation_prompt = annotationPrompt;
    }
    if (isAzure && params.ocr3Features) {
      const f = params.ocr3Features;
      if (f.tableFormat !== undefined) requestBody.table_format = f.tableFormat;
      if (f.bboxAnnotationFormat !== undefined)
        requestBody.bbox_annotation_format = f.bboxAnnotationFormat;
      if (f.imageMinSize !== undefined)
        requestBody.image_min_size = f.imageMinSize;
      if (f.imageLimit !== undefined) requestBody.image_limit = f.imageLimit;
    }

    const { data } = await axios.post<MistralOcrApiResponse>(url, requestBody, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: timeoutMs,
      validateStatus: (status) => status === 200,
    });

    const ocrResult = mistralOcrResponseToOcrResult(
      data,
      {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        requestId,
        modelId: resolvedModelId,
      },
      mistralFieldDefs.length > 0 ? { fieldDefs: mistralFieldDefs } : undefined,
    );

    const ref = await persist(ocrResult);

    log.info("Mistral OCR process complete", {
      event: "complete",
      variant,
      requestId,
      pageCount: ocrResult.pages.length,
      durationMs: Date.now() - startTime,
      alertType: "mistral_ocr",
    });

    return { ocrResult: ref, ocrResponse: data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response?.data;
      log.error("Mistral OCR API error", {
        event: "error",
        variant,
        httpStatus: status !== undefined ? String(status) : undefined,
        body: typeof body === "object" ? body : String(body),
        alertType: "mistral_ocr",
      });
      throw new Error(
        `Mistral OCR request failed${status ? ` (${status})` : ""}: ${error.message}`,
      );
    }
    log.error("Mistral OCR process error", {
      event: "error",
      variant,
      error: error instanceof Error ? error.message : "Unknown error",
      alertType: "mistral_ocr",
    });
    throw error;
  }
}

export const __testInternals = { buildAzureOcrUrl };
