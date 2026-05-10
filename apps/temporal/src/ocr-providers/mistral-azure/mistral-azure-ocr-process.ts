import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage } from "@ai-di/shared-logging";
import type { FieldType } from "@generated/client";
import axios from "axios";
import { getPrismaClient } from "../../activities/database-client";
import { getBlobStorageClient } from "../../blob-storage/blob-storage-client";
import { createActivityLogger } from "../../logger";
import type { OCRResult, PreparedFileData } from "../../types";
import {
  fieldDefinitionsToMistralDocumentAnnotationFormat,
  type MistralDocumentAnnotationFormat,
  type TemplateFieldDefinitionInput,
} from "../mistral/field-definitions-to-mistral-annotation-format";
import type { MistralOcrApiResponse } from "../mistral/mistral-ocr-types";
import { mistralOcrResponseToOcrResult } from "../mistral/mistral-to-ocr-result";

/**
 * Path appended to the Foundry resource's services endpoint to call Mistral
 * Document AI. Confirmed via the LiteLLM Azure-AI provider transformation
 * (`/providers/mistral/azure/ocr`).
 */
const MISTRAL_AZURE_OCR_PATH = "/providers/mistral/azure/ocr";

const DEFAULT_MISTRAL_AZURE_DEPLOYMENT_ID = "mistral-document-ai-2512";

/**
 * `document.model_id` from upload is an Azure DI / trained id (e.g. `prebuilt-layout`,
 * `km-2`). The Foundry Mistral Document AI deployment only accepts its own
 * deployment id (e.g. `mistral-document-ai-2512`). If the stored id is not a
 * Mistral Document AI deployment id, fall back to the default.
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

function buildOcrUrl(endpoint: string): string {
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

interface MistralAzureTemplateLoadResult {
  format: MistralDocumentAnnotationFormat | null;
  fieldDefs: Array<{
    field_key: string;
    field_type: FieldType;
    field_format: string | null;
  }>;
}

async function loadTemplateForAnnotation(
  templateModelId: string,
  log: ReturnType<typeof createActivityLogger>,
  options: {
    fieldDescriptions?: Record<string, string>;
    numericFieldsNullable?: boolean;
  } = {},
): Promise<MistralAzureTemplateLoadResult | null> {
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
      log.info("Mistral Azure OCR: skipping document annotation", {
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
      log.info(
        "Mistral Azure OCR: skipping document annotation format on request",
        {
          event: "annotation_skip",
          templateModelId,
          reason: "no_valid_field_keys_after_filter",
        },
      );
    }
    return { format, fieldDefs };
  } catch (error) {
    log.error(
      "Mistral Azure OCR: failed to load template schema; continuing without annotation",
      {
        event: "annotation_skip",
        templateModelId,
        error: getErrorMessage(error),
      },
    );
    return null;
  }
}

function buildMockOcrResponse(
  fileData: PreparedFileData,
): MistralOcrApiResponse {
  const resolvedModel = resolveMistralAzureDeploymentId(fileData.modelId);
  const text = `mock foundry ocr for ${fileData.fileName}`;
  return {
    model: resolvedModel,
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

export interface MistralAzureOcrProcessParams {
  fileData: PreparedFileData;
  /** Labeling template model id; loads `field_schema` for `document_annotation_format`. */
  templateModelId?: string;
  /** Optional prompt forwarded to Mistral `document_annotation_prompt`. */
  documentAnnotationPrompt?: string;
  /**
   * Optional per-field description overlay (keyed by `field_key`) attached
   * to the JSON Schema's `description` properties to disambiguate ambiguous
   * fields. Empty/missing entries skip the description for that field.
   */
  fieldDescriptions?: Record<string, string>;
  /**
   * When true, every numeric field in the JSON Schema becomes nullable
   * (`["number", "null"]`). Lets Mistral return `null` for blank cells,
   * distinct from `0` for cells that explicitly show `0`.
   */
  numericFieldsNullable?: boolean;
  /**
   * Mistral OCR-3 feature opt-ins. Each one is a knob on the OCR request
   * body documented by the public Mistral OCR API; the Foundry deployment
   * (`mistral-document-ai-2512`) is stricter than the public API on body
   * shape so each one is gated behind smoke-testing. Pass through verbatim
   * when set; omit otherwise. See
   * [iteration/CHANGELOG.md round-3 entry](../../../../../experiments/results/02-mistral-doc-ai-azure/iteration/CHANGELOG.md)
   * for per-feature acceptance + impact notes.
   */
  ocr3Features?: {
    /**
     * `"html"` renders tables in the OCR markdown as `<table><tr><td>...`
     * with explicit cell boundaries (preserves colspan/rowspan). The income
     * table on the SDPR form is the obvious beneficiary: each cell is its
     * own `<td>` so the model sees applicant-column vs spouse-column
     * unambiguously, and blank cells render as `<td></td>` distinct from
     * `<td>$0</td>`.
     */
    tableFormat?: "html";
    /**
     * Wrapping JSON Schema for the per-bbox annotation pass. Foundry's OCR
     * layer picks up to 8 bbox crops from the page and runs a vision LMM
     * on each; supplying a typed `{kind, value}` schema gives those crops
     * a stronger prior. Most relevant for checkbox / signature recall.
     */
    bboxAnnotationFormat?: MistralDocumentAnnotationFormat;
    /** Min crop dimension (px) for the bbox / image preprocessor. */
    imageMinSize?: number;
    /** Max number of bbox crops the LMM sees on each call. */
    imageLimit?: number;
  };
  requestId?: string;
}

export interface MistralAzureOcrProcessResult {
  /** Canonical mapped OCR result for downstream activities. */
  ocrResult: OCRResult;
  /**
   * Raw Foundry OCR response — emitted so the benchmark sample workflow's
   * `persistOcrCache` step can write it to `benchmark_ocr_cache`. The
   * benchmark workflow checks `ctx.ocrResponse` specifically; sync providers
   * that only emit `ocrResult` produce no cache rows. The Foundry path emits
   * both so cache capture works for the experiment fixture.
   */
  ocrResponse: MistralOcrApiResponse;
}

/**
 * Activity: Run Mistral Document AI on Azure AI Foundry (synchronous) and
 * return a canonical {@link OCRResult} alongside the raw Foundry response.
 * Single HTTP call mirroring the public-API `mistralOcrProcess` activity —
 * `document_annotation_format` and `document_annotation_prompt` are passed
 * in the request body and Mistral runs the OCR-then-annotation chain
 * server-side. There is no client-side orchestration of the two stages.
 */
export async function mistralAzureOcrProcess(
  params: MistralAzureOcrProcessParams,
): Promise<MistralAzureOcrProcessResult> {
  const activityName = "mistralAzureOcrProcess";
  const {
    fileData,
    documentAnnotationPrompt,
    fieldDescriptions,
    numericFieldsNullable,
    ocr3Features,
  } = params;
  const templateModelIdRaw = params.templateModelId?.trim();
  const log = createActivityLogger(activityName, {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const endpoint = process.env.MISTRAL_DOC_AI_AZURE_ENDPOINT?.trim();
  const apiKey = process.env.MISTRAL_DOC_AI_AZURE_KEY;
  const useMock = process.env.MOCK_MISTRAL_AZURE_OCR === "true";
  const requestId = `mistral-azure-${randomUUID()}`;

  const resolvedDeploymentId = resolveMistralAzureDeploymentId(
    fileData.modelId,
  );
  if (resolvedDeploymentId !== fileData.modelId?.trim()) {
    log.info(
      "Mistral Azure OCR: document model_id is not a Mistral Foundry deployment id; using default",
      {
        event: "model_fallback",
        documentModelId: fileData.modelId,
        resolvedDeploymentId,
      },
    );
  }

  log.info("Mistral Azure OCR process start", {
    event: "start",
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    deploymentId: resolvedDeploymentId,
    blobKey: fileData.blobKey,
    useMock,
  });

  if (useMock) {
    const ocrResponse = buildMockOcrResponse(fileData);
    const ocrResult = mistralOcrResponseToOcrResult(
      ocrResponse,
      {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        requestId,
        modelId: resolvedDeploymentId,
      },
      undefined,
    );
    log.info("Mistral Azure OCR process complete (mock)", {
      event: "complete_mock",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { ocrResult, ocrResponse };
  }

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
  if (!apiKey) {
    log.error("Mistral Azure OCR: missing API key", {
      event: "error",
      error: "missing_credentials",
      durationMs: Date.now() - startTime,
    });
    throw new Error(
      "Mistral Azure Foundry API key not configured. Set MISTRAL_DOC_AI_AZURE_KEY environment variable.",
    );
  }

  const buffer = await readBlobData(fileData.blobKey);
  const documentUrl = buildDataUrl(fileData.contentType, buffer);

  let documentAnnotationFormat: MistralDocumentAnnotationFormat | null = null;
  let mistralFieldDefs: MistralAzureTemplateLoadResult["fieldDefs"] = [];
  if (templateModelIdRaw) {
    const loaded = await loadTemplateForAnnotation(templateModelIdRaw, log, {
      fieldDescriptions,
      numericFieldsNullable,
    });
    if (loaded) {
      documentAnnotationFormat = loaded.format;
      mistralFieldDefs = loaded.fieldDefs;
    }
  }

  const annotationPrompt = documentAnnotationPrompt?.trim();
  const url = buildOcrUrl(endpoint);

  try {
    // Foundry's request schema is stricter than the public Mistral API:
    // `confidence_scores_granularity` is rejected with HTTP 422
    // (`extra_forbidden`), so we omit it on the Foundry path. The mapper
    // already handles responses both with and without `word_confidence_scores`.
    const requestBody: Record<string, unknown> = {
      model: resolvedDeploymentId,
      document: {
        type: "document_url",
        document_url: documentUrl,
      },
    };
    if (documentAnnotationFormat) {
      requestBody.document_annotation_format = documentAnnotationFormat;
    }
    if (annotationPrompt) {
      requestBody.document_annotation_prompt = annotationPrompt;
    }
    if (ocr3Features) {
      if (ocr3Features.tableFormat !== undefined) {
        requestBody.table_format = ocr3Features.tableFormat;
      }
      if (ocr3Features.bboxAnnotationFormat !== undefined) {
        requestBody.bbox_annotation_format = ocr3Features.bboxAnnotationFormat;
      }
      if (ocr3Features.imageMinSize !== undefined) {
        requestBody.image_min_size = ocr3Features.imageMinSize;
      }
      if (ocr3Features.imageLimit !== undefined) {
        requestBody.image_limit = ocr3Features.imageLimit;
      }
    }

    const { data } = await axios.post<MistralOcrApiResponse>(url, requestBody, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 900_000,
      validateStatus: (status) => status === 200,
    });

    const ocrResult = mistralOcrResponseToOcrResult(
      data,
      {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        requestId,
        modelId: resolvedDeploymentId,
      },
      mistralFieldDefs.length > 0 ? { fieldDefs: mistralFieldDefs } : undefined,
    );

    log.info("Mistral Azure OCR process complete", {
      event: "complete",
      requestId,
      pageCount: ocrResult.pages.length,
      durationMs: Date.now() - startTime,
    });

    return { ocrResult, ocrResponse: data };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response?.data;
      log.error("Mistral Azure OCR API error", {
        event: "error",
        httpStatus: status !== undefined ? String(status) : undefined,
        body: typeof body === "object" ? body : String(body),
      });
      throw new Error(
        `Mistral Azure OCR request failed${status ? ` (${status})` : ""}: ${error.message}`,
      );
    }
    log.error("Mistral Azure OCR process error", {
      event: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

export const __testInternals = { buildOcrUrl };
