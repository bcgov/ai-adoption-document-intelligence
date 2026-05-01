import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage } from "@ai-di/shared-logging";
import type { FieldType } from "@generated/client";
import axios from "axios";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import { createActivityLogger } from "../logger";
import {
  fieldDefinitionsToMistralDocumentAnnotationFormat,
  type MistralDocumentAnnotationFormat,
  type TemplateFieldDefinitionInput,
} from "../ocr-providers/mistral/field-definitions-to-mistral-annotation-format";
import type { MistralOcrApiResponse } from "../ocr-providers/mistral/mistral-ocr-types";
import { mistralOcrResponseToOcrResult } from "../ocr-providers/mistral/mistral-to-ocr-result";
import type { OCRResult, PreparedFileData } from "../types";
import { getPrismaClient } from "./database-client";

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";

const DEFAULT_MISTRAL_MODEL = "mistral-ocr-latest";

/**
 * `document.model_id` from upload is an Azure/trained id (e.g. prebuilt-layout, km-2).
 * Mistral OCR only accepts Mistral model names (e.g. mistral-ocr-latest). If the stored
 * id is not a Mistral OCR model, use the default.
 */
export function resolveMistralOcrModelId(raw: string | undefined): string {
  const t = raw?.trim() ?? "";
  if (t.length > 0 && t.toLowerCase().startsWith("mistral-ocr")) {
    return t;
  }
  return DEFAULT_MISTRAL_MODEL;
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
    const format = fieldDefinitionsToMistralDocumentAnnotationFormat(fields);
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

function mockOcrResult(
  fileData: PreparedFileData,
  requestId: string,
): OCRResult {
  const resolvedModel = resolveMistralOcrModelId(fileData.modelId);
  const text = `mock ocr for ${fileData.fileName}`;
  return mistralOcrResponseToOcrResult(
    {
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
              },
              {
                text: "ocr",
                confidence: 0.98,
                start_index: 5,
              },
            ],
          },
        },
      ],
      usage_info: { pages_processed: 1 },
    },
    {
      fileName: fileData.fileName,
      fileType: fileData.fileType,
      requestId,
      modelId: resolvedModel,
    },
    undefined,
  );
}

export interface MistralOcrProcessParams {
  fileData: PreparedFileData;
  /** Labeling template model id; loads `field_schema` for `document_annotation_format`. */
  templateModelId?: string;
  /** Optional prompt forwarded to Mistral `document_annotation_prompt`. */
  documentAnnotationPrompt?: string;
  requestId?: string;
}

/**
 * Activity: Run Mistral Document AI OCR (synchronous) and return canonical {@link OCRResult}.
 */
export async function mistralOcrProcess(
  params: MistralOcrProcessParams,
): Promise<{ ocrResult: OCRResult }> {
  const activityName = "mistralOcrProcess";
  const { fileData, documentAnnotationPrompt } = params;
  const templateModelIdRaw = params.templateModelId?.trim();
  const log = createActivityLogger(activityName, {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const apiKey = process.env.MISTRAL_API_KEY;
  const useMock = process.env.MOCK_MISTRAL_OCR === "true";
  const requestId = `mistral-${randomUUID()}`;

  const resolvedModelId = resolveMistralOcrModelId(fileData.modelId);
  if (resolvedModelId !== fileData.modelId?.trim()) {
    log.info(
      "Mistral OCR: document model_id is not a Mistral OCR name; using default",
      {
        event: "model_fallback",
        documentModelId: fileData.modelId,
        resolvedModelId,
      },
    );
  }

  log.info("Mistral OCR process start", {
    event: "start",
    fileName: fileData.fileName,
    fileType: fileData.fileType,
    modelId: resolvedModelId,
    blobKey: fileData.blobKey,
    useMock,
  });

  if (useMock) {
    const ocrResult = mockOcrResult(fileData, requestId);
    log.info("Mistral OCR process complete (mock)", {
      event: "complete_mock",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { ocrResult };
  }

  if (!apiKey) {
    log.error("Mistral OCR: missing API key", {
      event: "error",
      error: "missing_credentials",
      durationMs: Date.now() - startTime,
    });
    throw new Error(
      "Mistral API key not configured. Set MISTRAL_API_KEY environment variable.",
    );
  }

  const modelId = resolvedModelId;
  const buffer = await readBlobData(fileData.blobKey);
  const documentUrl = buildDataUrl(fileData.contentType, buffer);

  let documentAnnotationFormat: MistralDocumentAnnotationFormat | null = null;
  let mistralFieldDefs: MistralTemplateLoadResult["fieldDefs"] = [];
  if (templateModelIdRaw) {
    const loaded = await loadMistralTemplateForAnnotation(
      templateModelIdRaw,
      log,
    );
    if (loaded) {
      documentAnnotationFormat = loaded.format;
      mistralFieldDefs = loaded.fieldDefs;
    }
  }

  const annotationPrompt = documentAnnotationPrompt?.trim();

  try {
    const requestBody: Record<string, unknown> = {
      model: modelId,
      document: {
        type: "document_url",
        document_url: documentUrl,
      },
      confidence_scores_granularity: "word",
    };
    if (documentAnnotationFormat) {
      requestBody.document_annotation_format = documentAnnotationFormat;
    }
    if (annotationPrompt) {
      requestBody.document_annotation_prompt = annotationPrompt;
    }

    const { data } = await axios.post<MistralOcrApiResponse>(
      MISTRAL_OCR_URL,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 600_000,
        validateStatus: (status) => status === 200,
      },
    );

    const ocrResult = mistralOcrResponseToOcrResult(
      data,
      {
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        requestId,
        modelId,
      },
      mistralFieldDefs.length > 0 ? { fieldDefs: mistralFieldDefs } : undefined,
    );

    log.info("Mistral OCR process complete", {
      event: "complete",
      requestId,
      pageCount: ocrResult.pages.length,
      durationMs: Date.now() - startTime,
    });

    return { ocrResult };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const body = error.response?.data;
      log.error("Mistral OCR API error", {
        event: "error",
        httpStatus: status !== undefined ? String(status) : undefined,
        body: typeof body === "object" ? body : String(body),
      });
      throw new Error(
        `Mistral OCR request failed${status ? ` (${status})` : ""}: ${error.message}`,
      );
    }
    log.error("Mistral OCR process error", {
      event: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}
