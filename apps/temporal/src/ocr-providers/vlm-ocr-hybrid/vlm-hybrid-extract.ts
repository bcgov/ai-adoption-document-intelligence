/**
 * VLM + OCR hybrid extraction activity (E05).
 *
 * Stitches together the two legs of the hybrid pattern:
 *   1. **OCR pre-pass**: takes the raw layout response from the upstream
 *      `azureOcr.readPlain` activity (passed in via `params.layoutResponse`)
 *      and renders it as markdown for the VLM prompt.
 *   2. **VLM call**: sends the document image AND the OCR markdown to
 *      the chosen Azure OpenAI vision-capable chat-completions deployment
 *      with a strict JSON Schema response_format. The system prompt
 *      explicitly tells the model to prefer the image when it disagrees
 *      with the OCR markdown.
 *
 * Returns the canonical `OCRResult` (with bbox-populated pages from the
 * upstream layout response — a genuine improvement over E04's
 * synthesised single-page summary) alongside the wrapped raw response
 * so the benchmark sample workflow's `persistOcrCache` step writes to
 * `benchmark_ocr_cache`.
 *
 * PDF guard: same as E04, throws on `fileType === "pdf"`. The canonical
 * 40-sample dataset is JPEG-only; PDF rendering (`pdf.renderToImages`)
 * is deferred per the SCOPE REDUCTION at session start.
 */

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
import type { OCRResponse, OCRResult, PreparedFileData } from "../../types";
import {
  type TemplateFieldType,
  type VlmExtractionRequest,
} from "../vlm-direct/vlm-prompt-builder";
import { parseVlmStructuredJson } from "../vlm-direct/vlm-response-parser";
import type {
  VlmDirectRawResponse,
  VlmExtractionResponse,
} from "../vlm-direct/vlm-types";
import { ocrLayoutToMarkdown } from "./ocr-to-markdown";
import { buildVlmHybridExtractionRequest } from "./vlm-hybrid-prompt-builder";
import {
  type VlmHybridFieldDefRow,
  vlmHybridExtractionToOcrResult,
} from "./vlm-hybrid-to-ocr-result";
import type { VlmHybridRawResponse } from "./vlm-hybrid-types";

const DEFAULT_API_VERSION = "2024-12-01-preview";
const DEFAULT_MAX_COMPLETION_TOKENS = 8192;

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
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

interface TemplateLoad {
  fieldDefs: VlmHybridFieldDefRow[];
  builderInput: Array<{
    field_key: string;
    field_type: TemplateFieldType;
    field_format: string | null;
  }>;
}

async function loadTemplate(
  templateModelId: string,
  log: ReturnType<typeof createActivityLogger>,
): Promise<TemplateLoad | null> {
  try {
    const prisma = getPrismaClient();
    const tm = await prisma.templateModel.findUnique({
      where: { id: templateModelId },
      include: { field_schema: { orderBy: { display_order: "asc" } } },
    });
    if (!tm || !tm.field_schema || tm.field_schema.length === 0) {
      log.info("VLM-hybrid: skipping schema build", {
        event: "schema_skip",
        templateModelId,
        reason: "template_not_found_or_empty_schema",
      });
      return null;
    }
    const builderInput = tm.field_schema.map(
      (f: {
        field_key: string;
        field_type: FieldType;
        field_format: string | null;
      }) => ({
        field_key: f.field_key,
        field_type: f.field_type as TemplateFieldType,
        field_format: f.field_format,
      }),
    );
    const fieldDefs: VlmHybridFieldDefRow[] = tm.field_schema.map(
      (f: {
        field_key: string;
        field_type: FieldType;
        field_format: string | null;
      }) => ({
        field_key: f.field_key,
        field_type: f.field_type as string,
        field_format: f.field_format,
      }),
    );
    return { fieldDefs, builderInput };
  } catch (error) {
    log.error("VLM-hybrid: failed to load template", {
      event: "schema_load_error",
      templateModelId,
      error: getErrorMessage(error),
    });
    return null;
  }
}

function buildMockOcrResponse(
  fileData: PreparedFileData,
  fieldDefs: VlmHybridFieldDefRow[],
  deployment: string,
  apiVersion: string,
  layoutResponse: OCRResponse,
  ocrMarkdown: string,
): VlmHybridRawResponse {
  const fields: Record<string, string | number | null> = {};
  const sourceQuotes: Record<string, string> = {};
  for (const def of fieldDefs) {
    if (def.field_type === "number") {
      fields[def.field_key] = null;
    } else if (def.field_type === "selectionMark") {
      fields[def.field_key] = "unselected";
    } else {
      fields[def.field_key] = "";
    }
    sourceQuotes[def.field_key] = "";
  }
  return {
    deployment,
    apiVersion,
    durationMs: 0,
    ocrDurationMs: 0,
    vlmDurationMs: 0,
    parsed: { fields, source_quotes: sourceQuotes },
    raw: { mock: true, fileName: fileData.fileName },
    layoutResponse,
    ocrMarkdown,
  };
}

interface CallVlmOptions {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
  deployment: string;
  request: VlmExtractionRequest;
  imageMimeType: string;
  imageBase64: string;
  maxCompletionTokens?: number;
  log: ReturnType<typeof createActivityLogger>;
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

async function callAzureOpenAiVlm(opts: CallVlmOptions): Promise<{
  parsed: VlmExtractionResponse;
  durationMs: number;
  raw: Record<string, unknown>;
  usage?: VlmDirectRawResponse["usage"];
}> {
  const {
    endpoint,
    apiKey,
    apiVersion,
    deployment,
    request,
    imageMimeType,
    imageBase64,
    maxCompletionTokens,
    log,
  } = opts;
  const base = endpoint.replace(/\/$/, "");
  const url = `${base}/openai/deployments/${encodeURIComponent(
    deployment,
  )}/chat/completions?api-version=${apiVersion}`;

  const payload = {
    messages: [
      { role: "system" as const, content: request.systemPrompt },
      {
        role: "user" as const,
        content: [
          { type: "text" as const, text: request.userPrompt },
          {
            type: "image_url" as const,
            image_url: {
              url: `data:${imageMimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: request.responseFormat.name,
        strict: true,
        schema: request.responseFormat.schema,
      },
    },
    max_completion_tokens: maxCompletionTokens ?? DEFAULT_MAX_COMPLETION_TOKENS,
  };

  const t0 = Date.now();
  let response: { data: ChatCompletionsResponse };
  try {
    response = await axios.post<ChatCompletionsResponse>(url, payload, {
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      timeout: 600_000,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const body = err.response.data;
      const detail =
        typeof body === "object" ? JSON.stringify(body) : String(body ?? "");
      log.error("VLM-hybrid chat completions HTTP error", {
        event: "http_error",
        deployment,
        httpStatus: String(status),
        body: detail,
      });
      throw new Error(
        `Azure OpenAI VLM-hybrid call failed (status ${status}): ${detail}`,
      );
    }
    throw err;
  }
  const durationMs = Date.now() - t0;

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      "Azure OpenAI VLM-hybrid response missing choices[0].message.content",
    );
  }
  const parsed = parseVlmStructuredJson(content);
  return {
    parsed,
    durationMs,
    raw: response.data as unknown as Record<string, unknown>,
    usage: response.data?.usage,
  };
}

export interface VlmHybridExtractParams {
  fileData: PreparedFileData;
  /**
   * Layout response from the upstream `azureOcr.readPlain` activity. The
   * workflow JSON wires this from `ctx.layoutResponse`.
   */
  layoutResponse: OCRResponse;
  /** Labeling template id; loads `field_schema` to build the JSON schema. */
  templateModelId?: string;
  /** Global instruction; sent as the system message preamble. */
  documentAnnotationPrompt?: string;
  /** Per-field description overlay (keyed by `field_key`). */
  fieldDescriptions?: Record<string, string>;
  /** Numeric blank-vs-zero distinction (defaults to true). */
  numericFieldsNullable?: boolean;
  /**
   * Override the deployment name; defaults to `AZURE_OPENAI_DEPLOYMENT`.
   * E05 wires `gpt-5.4` per the SUMMARY.md.
   */
  azureOpenAiDeployment?: string;
  /** Override max completion tokens (default 8192). */
  maxCompletionTokens?: number;
  /**
   * When true, prepend each line of OCR markdown with a normalised bbox
   * tag (variant 3 of the brief). Default: false. The canonical E05 run
   * uses bare markdown.
   */
  includeBboxAnnotations?: boolean;
  requestId?: string;
}

export interface VlmHybridExtractResult {
  /** Canonical mapped OCR result for downstream activities. */
  ocrResult: OCRResult;
  /**
   * Raw VLM-hybrid response — emitted on `ctx.ocrResponse` so the
   * benchmark sample workflow's `persistOcrCache` step writes it to
   * `benchmark_ocr_cache` (sync-provider cache emission convention).
   */
  ocrResponse: VlmHybridRawResponse;
}

/**
 * Activity: VLM + OCR hybrid extraction.
 * Returns a canonical {@link OCRResult} + the wrapped hybrid response
 * (DI layout + VLM payload).
 */
export async function vlmHybridExtract(
  params: VlmHybridExtractParams,
): Promise<VlmHybridExtractResult> {
  const log = createActivityLogger("vlmHybridExtract", {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const useMock = process.env.MOCK_VLM_DIRECT === "true";
  const requestId = `vlm-hybrid-${randomUUID()}`;

  if (params.fileData.fileType === "pdf") {
    throw new Error(
      "VLM-hybrid currently supports image inputs only; PDF rendering deferred to a follow-up experiment. " +
        "See experiments/results/05-vlm-ocr-hybrid/SUMMARY.md ('Gaps') for context.",
    );
  }

  if (!params.layoutResponse) {
    throw new Error(
      "VLM-hybrid: layoutResponse is required (wire it from the upstream azureOcr.readPlain step's `layoutResponse` output port).",
    );
  }

  const apiVersion = readEnv("AZURE_OPENAI_API_VERSION") ?? DEFAULT_API_VERSION;
  const deployment =
    params.azureOpenAiDeployment?.trim() ||
    readEnv("AZURE_OPENAI_DEPLOYMENT") ||
    "";
  if (!deployment) {
    throw new Error(
      "VLM-hybrid: no Azure OpenAI deployment selected. Set params.azureOpenAiDeployment or AZURE_OPENAI_DEPLOYMENT.",
    );
  }

  log.info("VLM-hybrid extract start", {
    event: "start",
    fileName: params.fileData.fileName,
    fileType: params.fileData.fileType,
    blobKey: params.fileData.blobKey,
    deployment,
    apiVersion,
    templateModelId: params.templateModelId,
    includeBboxAnnotations: params.includeBboxAnnotations ?? false,
    useMock,
  });

  const templateModelId = params.templateModelId?.trim();
  let template: TemplateLoad | null = null;
  if (templateModelId) {
    template = await loadTemplate(templateModelId, log);
  }
  if (!template) {
    throw new Error(
      `VLM-hybrid: template field_schema not found for "${templateModelId ?? "(unset)"}". ` +
        `Set params.templateModelId to a labeling template with a populated field_schema (e.g. seed-sdpr-monthly-report-template).`,
    );
  }

  const ocrMarkdown = ocrLayoutToMarkdown(params.layoutResponse, {
    includeBboxAnnotations: params.includeBboxAnnotations ?? false,
  });

  const request = buildVlmHybridExtractionRequest({
    fields: template.builderInput,
    descriptions: params.fieldDescriptions,
    documentAnnotationPrompt: params.documentAnnotationPrompt,
    numericFieldsNullable: params.numericFieldsNullable ?? true,
    ocrMarkdown,
  });
  if (!request) {
    throw new Error(
      "VLM-hybrid: extraction schema is empty (no valid field keys after filtering).",
    );
  }

  if (useMock) {
    const mockResponse = buildMockOcrResponse(
      params.fileData,
      template.fieldDefs,
      deployment,
      apiVersion,
      params.layoutResponse,
      ocrMarkdown,
    );
    const ocrResult = vlmHybridExtractionToOcrResult(
      mockResponse.parsed,
      {
        fileName: params.fileData.fileName,
        fileType: params.fileData.fileType,
        requestId,
        modelId: deployment,
      },
      {
        fieldDefs: template.fieldDefs,
        layoutResponse: params.layoutResponse,
      },
    );
    log.info("VLM-hybrid extract complete (mock)", {
      event: "complete_mock",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { ocrResult, ocrResponse: mockResponse };
  }

  const endpoint = readEnv("AZURE_OPENAI_ENDPOINT");
  const apiKey = readEnv("AZURE_OPENAI_API_KEY");
  if (!endpoint) {
    throw new Error(
      "VLM-hybrid: AZURE_OPENAI_ENDPOINT not configured (must point at the resource hosting the chosen deployment).",
    );
  }
  if (!apiKey) {
    throw new Error("VLM-hybrid: AZURE_OPENAI_API_KEY not configured.");
  }

  const buffer = await readBlobData(params.fileData.blobKey);
  const imageMimeType =
    params.fileData.contentType && params.fileData.contentType.trim().length > 0
      ? params.fileData.contentType
      : "image/jpeg";
  const imageBase64 = buffer.toString("base64");

  const vlm = await callAzureOpenAiVlm({
    endpoint,
    apiKey,
    apiVersion,
    deployment,
    request,
    imageMimeType,
    imageBase64,
    maxCompletionTokens: params.maxCompletionTokens,
    log,
  });

  // The OCR call wallclock is not measured by this activity (the upstream
  // azureOcr.readPlain owns it); we record only the VLM leg here. The
  // workflow can sum the two if it cares.
  const ocrResponse: VlmHybridRawResponse = {
    deployment,
    apiVersion,
    durationMs: Date.now() - startTime,
    ocrDurationMs: 0, // owned by the upstream azureOcr.readPlain activity
    vlmDurationMs: vlm.durationMs,
    parsed: vlm.parsed,
    raw: vlm.raw,
    layoutResponse: params.layoutResponse,
    ocrMarkdown,
    ...(vlm.usage ? { usage: vlm.usage } : {}),
  };

  const ocrResult = vlmHybridExtractionToOcrResult(
    vlm.parsed,
    {
      fileName: params.fileData.fileName,
      fileType: params.fileData.fileType,
      requestId,
      modelId: deployment,
    },
    {
      fieldDefs: template.fieldDefs,
      layoutResponse: params.layoutResponse,
    },
  );

  log.info("VLM-hybrid extract complete", {
    event: "complete",
    requestId,
    deployment,
    durationMs: Date.now() - startTime,
    vlmDurationMs: vlm.durationMs,
    promptTokens: vlm.usage?.prompt_tokens,
    completionTokens: vlm.usage?.completion_tokens,
    fieldsCount: Object.keys(vlm.parsed.fields).length,
    ocrMarkdownChars: ocrMarkdown.length,
  });

  return { ocrResult, ocrResponse };
}
