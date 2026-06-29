/**
 * VLM-direct extraction activity (E04).
 *
 * Sends a document image plus a strict JSON-Schema response_format to an
 * Azure OpenAI chat-completions deployment (vision-capable; gpt-5.4 by
 * default for E04). Returns the canonical {@link OCRResult} alongside the
 * raw response so the benchmark sample workflow's `persistOcrCache` step
 * can write a row to `benchmark_ocr_cache`.
 *
 * Skipped path — PDF input. Per the E04 SUMMARY ("Gaps"), this activity
 * supports image inputs only; PDF rendering is deferred to a follow-up
 * experiment (E04 had no PDF samples in the canonical 40-sample dataset,
 * and the production-PDF path will be added once a workload requires it
 * or E05's hybrid pulls it in).
 *
 * Auth/endpoint env vars:
 *   - AZURE_OPENAI_ENDPOINT   resource hostname (e.g.
 *                             `https://strukalex-8338-resource.cognitiveservices.azure.com`)
 *   - AZURE_OPENAI_API_KEY        API key for the resource
 *   - AZURE_OPENAI_DEPLOYMENT default deployment name (overridable per
 *                             call via `params.azureOpenAiDeployment`)
 *   - AZURE_OPENAI_API_VERSION default `2024-12-01-preview`
 *
 * For E04, AZURE_OPENAI_ENDPOINT must point at the resource hosting
 * gpt-5.4 (the eastus2 `strukalex-8338-resource`, same one CU uses).
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
import type { OCRResult, PreparedFileData } from "../../types";
import {
  buildVlmExtractionRequest,
  type TemplateFieldType,
  type VlmExtractionRequest,
} from "./vlm-prompt-builder";
import { parseVlmStructuredJson } from "./vlm-response-parser";
import {
  type VlmFieldDefRow,
  vlmExtractionToOcrResult,
} from "./vlm-to-ocr-result";
import type { VlmDirectRawResponse } from "./vlm-types";

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
  fieldDefs: VlmFieldDefRow[];
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
      log.info("VLM-direct: skipping schema build", {
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
    const fieldDefs: VlmFieldDefRow[] = tm.field_schema.map(
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
    log.error("VLM-direct: failed to load template", {
      event: "schema_load_error",
      templateModelId,
      error: getErrorMessage(error),
    });
    return null;
  }
}

function buildMockResponse(
  fileData: PreparedFileData,
  fieldDefs: VlmFieldDefRow[],
  deployment: string,
  apiVersion: string,
): VlmDirectRawResponse {
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
    parsed: { fields, source_quotes: sourceQuotes },
    raw: { mock: true, fileName: fileData.fileName },
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

async function callAzureOpenAiVlm(
  opts: CallVlmOptions,
): Promise<VlmDirectRawResponse> {
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
      // The chat-completions call can run multiple minutes on a 1-page form
      // image at gpt-5.4 capacity 100. Allow plenty of headroom.
      timeout: 600_000,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const body = err.response.data;
      const detail =
        typeof body === "object" ? JSON.stringify(body) : String(body ?? "");
      log.error("VLM chat completions HTTP error", {
        event: "http_error",
        deployment,
        httpStatus: String(status),
        body: detail,
      });
      throw new Error(
        `Azure OpenAI VLM call failed (status ${status}): ${detail}`,
      );
    }
    throw err;
  }
  const durationMs = Date.now() - t0;

  const content = response.data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      "Azure OpenAI VLM response missing choices[0].message.content",
    );
  }
  const parsed = parseVlmStructuredJson(content);
  return {
    deployment,
    apiVersion,
    durationMs,
    usage: response.data?.usage,
    parsed,
    raw: response.data as unknown as Record<string, unknown>,
  };
}

export interface VlmDirectExtractParams {
  fileData: PreparedFileData;
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
   * E04 wires `gpt-5.4` per the SUMMARY.md.
   */
  azureOpenAiDeployment?: string;
  /** Override max completion tokens (default 8192). */
  maxCompletionTokens?: number;
  requestId?: string;
}

export interface VlmDirectExtractResult {
  /** Canonical mapped OCR result for downstream activities. */
  ocrResult: OCRResult;
  /**
   * Raw VLM response — emitted on `ctx.ocrResponse` so the benchmark
   * sample workflow's `persistOcrCache` step writes it to
   * `benchmark_ocr_cache` (sync-provider cache emission convention).
   */
  ocrResponse: VlmDirectRawResponse;
}

/**
 * Activity: VLM-direct extraction.
 * Returns a canonical {@link OCRResult} + the raw chat-completions response.
 */
export async function vlmDirectExtract(
  params: VlmDirectExtractParams,
): Promise<VlmDirectExtractResult> {
  const log = createActivityLogger("vlmDirectExtract", {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const useMock = process.env.MOCK_VLM_DIRECT === "true";
  const requestId = `vlm-direct-${randomUUID()}`;

  if (params.fileData.fileType === "pdf") {
    throw new Error(
      "VLM-direct currently supports image inputs only; PDF rendering deferred to a follow-up experiment. " +
        "See experiments/results/04-vlm-direct/SUMMARY.md ('Gaps') for context.",
    );
  }

  const apiVersion = readEnv("AZURE_OPENAI_API_VERSION") ?? DEFAULT_API_VERSION;
  const deployment =
    params.azureOpenAiDeployment?.trim() ||
    readEnv("AZURE_OPENAI_DEPLOYMENT") ||
    "";
  if (!deployment) {
    throw new Error(
      "VLM-direct: no Azure OpenAI deployment selected. Set params.azureOpenAiDeployment or AZURE_OPENAI_DEPLOYMENT.",
    );
  }

  log.info("VLM-direct extract start", {
    event: "start",
    fileName: params.fileData.fileName,
    fileType: params.fileData.fileType,
    blobKey: params.fileData.blobKey,
    deployment,
    apiVersion,
    templateModelId: params.templateModelId,
    useMock,
  });

  const templateModelId = params.templateModelId?.trim();
  let template: TemplateLoad | null = null;
  if (templateModelId) {
    template = await loadTemplate(templateModelId, log);
  }
  if (!template) {
    throw new Error(
      `VLM-direct: template field_schema not found for "${templateModelId ?? "(unset)"}". ` +
        `Set params.templateModelId to a labeling template with a populated field_schema (e.g. seed-sdpr-monthly-report-template).`,
    );
  }

  const request = buildVlmExtractionRequest({
    fields: template.builderInput,
    descriptions: params.fieldDescriptions,
    documentAnnotationPrompt: params.documentAnnotationPrompt,
    numericFieldsNullable: params.numericFieldsNullable ?? true,
  });
  if (!request) {
    throw new Error(
      "VLM-direct: extraction schema is empty (no valid field keys after filtering).",
    );
  }

  if (useMock) {
    const mockResponse = buildMockResponse(
      params.fileData,
      template.fieldDefs,
      deployment,
      apiVersion,
    );
    const ocrResult = vlmExtractionToOcrResult(
      mockResponse.parsed,
      {
        fileName: params.fileData.fileName,
        fileType: params.fileData.fileType,
        requestId,
        modelId: deployment,
      },
      { fieldDefs: template.fieldDefs },
    );
    log.info("VLM-direct extract complete (mock)", {
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
      "VLM-direct: AZURE_OPENAI_ENDPOINT not configured (must point at the resource hosting the chosen deployment).",
    );
  }
  if (!apiKey) {
    throw new Error("VLM-direct: AZURE_OPENAI_API_KEY not configured.");
  }

  const buffer = await readBlobData(params.fileData.blobKey);
  const imageMimeType =
    params.fileData.contentType && params.fileData.contentType.trim().length > 0
      ? params.fileData.contentType
      : "image/jpeg";
  const imageBase64 = buffer.toString("base64");

  const ocrResponse = await callAzureOpenAiVlm({
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

  const ocrResult = vlmExtractionToOcrResult(
    ocrResponse.parsed,
    {
      fileName: params.fileData.fileName,
      fileType: params.fileData.fileType,
      requestId,
      modelId: deployment,
    },
    { fieldDefs: template.fieldDefs },
  );

  log.info("VLM-direct extract complete", {
    event: "complete",
    requestId,
    deployment,
    durationMs: Date.now() - startTime,
    callDurationMs: ocrResponse.durationMs,
    promptTokens: ocrResponse.usage?.prompt_tokens,
    completionTokens: ocrResponse.usage?.completion_tokens,
    fieldsCount: Object.keys(ocrResponse.parsed.fields).length,
  });

  return { ocrResult, ocrResponse };
}
