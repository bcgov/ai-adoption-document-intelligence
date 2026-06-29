/**
 * Azure Content Understanding analyze activity.
 *
 * CU analyze is async (POST returns 202 + Operation-Location header). The
 * activity submits one document, polls every `pollIntervalMs` until the
 * operation reports terminal status, then returns the canonical
 * {@link OCRResult} alongside the raw CU response so the benchmark sample
 * workflow's `persistOcrCache` step can write a row to
 * `benchmark_ocr_cache`.
 *
 * The activity also takes care of analyzer deployment: when the workflow
 * supplies a `documentAnnotationPrompt` / `fieldDescriptions` /
 * `numericFieldsNullable` set of parameters, the activity builds the
 * analyzer definition from the supplied template and calls the deploy
 * helper before submitting. Repeated invocations within the worker process
 * short-circuit via the deploy in-memory cache.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage } from "@ai-di/shared-logging";
import type { FieldType } from "@generated/client";
import type { AxiosResponse } from "axios";
import { getPrismaClient } from "../../activities/database-client";
import { getBlobStorageClient } from "../../blob-storage/blob-storage-client";
import { createActivityLogger } from "../../logger";
import type { OCRResult, PreparedFileData } from "../../types";
import {
  buildCuAnalyzerDefinition,
  type CuAnalyzerDefinition,
} from "./analyzer-schema-builder";
import {
  type CuAuthMode,
  createCuAxiosInstance,
  cuAnalyzeResultUrlFromOperation,
  cuAnalyzeUrl,
  describeAxiosFailure,
  readEnv,
  sleep,
} from "./azure-cu-client";
import { azureCuDeployAnalyzer } from "./azure-cu-deploy-analyzer";
import {
  type CuFieldDefRow,
  cuAnalyzeResultToOcrResult,
} from "./cu-to-ocr-result";
import type { CuAnalyzeOperation, CuAnalyzeResult } from "./cu-types";

const DEFAULT_ANALYZER_PREFIX = "di-experiment";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_POLL_MAX_ATTEMPTS = 240; // ~6 min at 1.5 s/poll, well under the activity's 20 m timeout.

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

function buildInlineInput(
  contentType: string,
  buffer: Buffer,
): { data: string; mimeType: string } {
  const mime =
    contentType && contentType.trim().length > 0
      ? contentType
      : "application/octet-stream";
  return { data: buffer.toString("base64"), mimeType: mime };
}

interface CuTemplateLoadResult {
  analyzer: CuAnalyzerDefinition | null;
  fieldDefs: CuFieldDefRow[];
}

async function loadTemplateForAnalyzer(
  templateModelId: string,
  log: ReturnType<typeof createActivityLogger>,
  options: {
    fieldDescriptions?: Record<string, string>;
    documentAnnotationPrompt?: string;
    numericFieldsNullable?: boolean;
    baseAnalyzerId?: string;
  } = {},
): Promise<CuTemplateLoadResult | null> {
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
      log.info("Azure CU analyze: skipping analyzer build", {
        event: "analyzer_skip",
        templateModelId,
        reason: "template_not_found_or_empty_schema",
      });
      return null;
    }

    const fields = templateModel.field_schema.map(
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

    const analyzer = buildCuAnalyzerDefinition(fields, {
      descriptions: options.fieldDescriptions,
      documentAnnotationPrompt: options.documentAnnotationPrompt,
      numericFieldsNullable: options.numericFieldsNullable,
      baseAnalyzerId: options.baseAnalyzerId,
    });

    const fieldDefs: CuFieldDefRow[] = templateModel.field_schema.map(
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

    if (!analyzer) {
      log.info("Azure CU analyze: skipping analyzer (no valid field keys)", {
        event: "analyzer_skip",
        templateModelId,
        reason: "no_valid_field_keys_after_filter",
      });
    }

    return { analyzer, fieldDefs };
  } catch (error) {
    log.error(
      "Azure CU analyze: failed to load template schema; continuing without analyzer",
      {
        event: "analyzer_skip",
        templateModelId,
        error: getErrorMessage(error),
      },
    );
    return null;
  }
}

function buildMockAnalyzeOperation(
  fileData: PreparedFileData,
): CuAnalyzeOperation {
  const text = `mock cu analyzer markdown for ${fileData.fileName}`;
  return {
    id: `mock-cu-${randomUUID()}`,
    status: "Succeeded",
    result: {
      analyzerId: "mock-cu-analyzer",
      apiVersion: "2025-11-01",
      contents: [
        {
          path: "input1",
          markdown: text,
          pages: [{ pageNumber: 1, width: 612, height: 792, unit: "pixel" }],
          fields: {},
        },
      ],
    },
  };
}

/**
 * CU rejects analyzer IDs that contain `-` (HTTP 400 "InvalidAnalyzerId" /
 * "The 'analyzerId' cannot contain '-'"). Collapse the prefix + template
 * id to lowercase alphanumeric.
 */
function sanitizeAnalyzerId(raw: string): string {
  const sanitized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return sanitized || "default";
}

function defaultAnalyzerIdForTemplate(templateModelId: string): string {
  const prefix = readEnv("AZURE_CU_ANALYZER_PREFIX") ?? DEFAULT_ANALYZER_PREFIX;
  return sanitizeAnalyzerId(`${prefix}-${templateModelId}`);
}

export interface AzureCuAnalyzeParams {
  fileData: PreparedFileData;
  /** Labeling template model id; loads `field_schema` to build the CU analyzer. */
  templateModelId?: string;
  /** Optional global instruction string set as the CU analyzer's `description`. */
  documentAnnotationPrompt?: string;
  /**
   * Optional per-field description overlay (keyed by `field_key`) attached
   * to each CU field. Empty/missing entries skip the description.
   */
  fieldDescriptions?: Record<string, string>;
  /**
   * When true, every numeric field's description carries a normative
   * sentence telling the model to return null on blank cells. Reproduces
   * the blank-vs-zero distinction without relying on JSON-Schema-level
   * nullability (CU's analyzer schema does not expose that surface).
   */
  numericFieldsNullable?: boolean;
  /**
   * Override the analyzer id (defaults to
   * `${AZURE_CU_ANALYZER_PREFIX}-${templateModelId-sanitized}`).
   */
  analyzerId?: string;
  /** Override the base analyzer (defaults to `prebuilt-document`). */
  baseAnalyzerId?: string;
  /** Auth mode (subscription-key | bearer); defaults to subscription-key. */
  authMode?: CuAuthMode;
  /** Polling interval in milliseconds. Defaults to 1500 ms. */
  pollIntervalMs?: number;
  /** Max poll attempts before giving up. Defaults to 240 (~6 minutes). */
  pollMaxAttempts?: number;
  requestId?: string;
}

export interface AzureCuAnalyzeResult {
  /** Canonical mapped OCR result for downstream activities. */
  ocrResult: OCRResult;
  /** Raw CU response — sync-provider cache emission on `ctx.ocrResponse`. */
  ocrResponse: CuAnalyzeOperation;
}

/**
 * Activity: Run an Azure Content Understanding analyzer on one document.
 * Returns a canonical {@link OCRResult} + the raw CU operation response.
 */
export async function azureCuAnalyze(
  params: AzureCuAnalyzeParams,
): Promise<AzureCuAnalyzeResult> {
  const activityName = "azureCuAnalyze";
  const log = createActivityLogger(activityName, {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const useMock = process.env.MOCK_AZURE_CU === "true";
  const requestId = `azure-cu-${randomUUID()}`;
  const templateModelId = params.templateModelId?.trim();
  const analyzerId =
    params.analyzerId?.trim() ??
    (templateModelId
      ? defaultAnalyzerIdForTemplate(templateModelId)
      : sanitizeAnalyzerId(
          `${readEnv("AZURE_CU_ANALYZER_PREFIX") ?? DEFAULT_ANALYZER_PREFIX}-default`,
        ));

  log.info("Azure CU analyze start", {
    event: "start",
    fileName: params.fileData.fileName,
    fileType: params.fileData.fileType,
    blobKey: params.fileData.blobKey,
    analyzerId,
    templateModelId,
    useMock,
  });

  if (useMock) {
    const ocrResponse = buildMockAnalyzeOperation(params.fileData);
    const ocrResult = cuAnalyzeResultToOcrResult(
      ocrResponse.result ?? {},
      {
        fileName: params.fileData.fileName,
        fileType: params.fileData.fileType,
        requestId,
        modelId: analyzerId,
      },
      undefined,
    );
    log.info("Azure CU analyze complete (mock)", {
      event: "complete_mock",
      requestId,
      durationMs: Date.now() - startTime,
    });
    return { ocrResult, ocrResponse };
  }

  const endpoint = readEnv("AZURE_CU_ENDPOINT");
  const apiKey = readEnv("AZURE_CU_KEY");
  if (!endpoint) {
    throw new Error(
      "Azure Content Understanding endpoint not configured. Set AZURE_CU_ENDPOINT environment variable.",
    );
  }
  if (!apiKey) {
    throw new Error(
      "Azure Content Understanding API key not configured. Set AZURE_CU_KEY environment variable.",
    );
  }

  // 1. Resolve the analyzer (build from template if available, else fall
  //    back to the base analyzer with no schema — CU still returns OCR
  //    markdown).
  let analyzer: CuAnalyzerDefinition | null = null;
  let fieldDefs: CuFieldDefRow[] = [];
  if (templateModelId) {
    const loaded = await loadTemplateForAnalyzer(templateModelId, log, {
      fieldDescriptions: params.fieldDescriptions,
      documentAnnotationPrompt: params.documentAnnotationPrompt,
      numericFieldsNullable: params.numericFieldsNullable,
      baseAnalyzerId: params.baseAnalyzerId,
    });
    if (loaded) {
      analyzer = loaded.analyzer;
      fieldDefs = loaded.fieldDefs;
    }
  }

  if (analyzer) {
    await azureCuDeployAnalyzer({
      analyzerId,
      analyzer,
      endpoint,
      apiKey,
      authMode: params.authMode,
      requestId: params.requestId,
    });
  }

  const client = createCuAxiosInstance({
    endpoint,
    apiKey,
    authMode: params.authMode,
  });

  // 2. POST analyze with the document inlined as base64. CU's
  //    AnalysisInput accepts either `{ url: <public url> }` or
  //    `{ data: <base64>, mimeType: <type> }` — we use the latter so we
  //    don't have to upload to a public URL first.
  const buffer = await readBlobData(params.fileData.blobKey);
  const inline = buildInlineInput(params.fileData.contentType, buffer);
  const submitUrl = cuAnalyzeUrl(analyzerId);

  let operationLocation: string | undefined;
  try {
    const submitResp = await client.post(submitUrl, {
      inputs: [{ data: inline.data, mimeType: inline.mimeType }],
    });
    if (submitResp.status !== 202 && submitResp.status !== 200) {
      log.error("Azure CU analyze submit non-2xx", {
        event: "submit_error",
        analyzerId,
        httpStatus: String(submitResp.status),
        body:
          typeof submitResp.data === "object"
            ? submitResp.data
            : String(submitResp.data),
      });
      throw new Error(
        `Azure CU analyze submit failed: HTTP ${submitResp.status}`,
      );
    }
    const headers = submitResp.headers ?? {};
    operationLocation =
      (headers["operation-location"] as string | undefined) ??
      (headers["Operation-Location"] as string | undefined);
    if (submitResp.status === 200 && submitResp.data) {
      // Some CU rollouts return the result inline on 200. It can arrive
      // either as the long-running-operation envelope (`{ status, result }`)
      // or as a bare `CuAnalyzeResult` (`{ contents }`) — handle both rather
      // than assuming the envelope (the latter shape was silently dropped).
      const body = submitResp.data as CuAnalyzeOperation & CuAnalyzeResult;
      const inlineResult: CuAnalyzeResult | undefined =
        body.status === "Succeeded" && body.result
          ? body.result
          : body.contents !== undefined
            ? (submitResp.data as CuAnalyzeResult)
            : undefined;
      if (inlineResult) {
        const ocrResult = cuAnalyzeResultToOcrResult(
          inlineResult,
          {
            fileName: params.fileData.fileName,
            fileType: params.fileData.fileType,
            requestId,
            modelId: analyzerId,
          },
          fieldDefs.length > 0 ? { fieldDefs } : undefined,
        );
        log.info("Azure CU analyze complete (inline)", {
          event: "complete_inline",
          requestId,
          analyzerId,
          durationMs: Date.now() - startTime,
        });
        return {
          ocrResult,
          ocrResponse:
            body.status === "Succeeded"
              ? body
              : { status: "Succeeded", result: inlineResult },
        };
      }
    }
  } catch (err) {
    const { status, message } = describeAxiosFailure(err);
    log.error("Azure CU analyze submit error", {
      event: "submit_error",
      analyzerId,
      httpStatus: status !== undefined ? String(status) : undefined,
      error: getErrorMessage(err),
    });
    throw new Error(
      `Azure CU analyze submit failed${status ? ` (${status})` : ""}: ${message}`,
    );
  }

  // 3. Poll until terminal. A 202 must carry an `operation-location` header
  //    pointing at the server-assigned result. Without it (and with no inline
  //    result handled above) there is nothing valid to poll — fail fast
  //    rather than GET a fabricated client-generated id, which CU never knew
  //    about and which always 404s.
  if (!operationLocation) {
    throw new Error(
      "Azure CU analyze: response provided neither an inline result nor an 'operation-location' header; cannot retrieve the analysis result.",
    );
  }
  const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollMaxAttempts = params.pollMaxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS;
  const pollUrl = cuAnalyzeResultUrlFromOperation(operationLocation);

  let lastBody: CuAnalyzeOperation | undefined;
  for (let attempt = 0; attempt < pollMaxAttempts; attempt++) {
    if (attempt > 0) await sleep(pollIntervalMs);
    let resp: AxiosResponse;
    try {
      resp = await client.get(pollUrl);
    } catch (err) {
      const { status, message } = describeAxiosFailure(err);
      log.warn("Azure CU analyze poll error (will retry)", {
        event: "poll_error",
        analyzerId,
        attempt: String(attempt),
        httpStatus: status !== undefined ? String(status) : undefined,
        error: message,
      });
      continue;
    }
    if (resp.status >= 500 || resp.status === 429) {
      log.warn("Azure CU analyze poll transient", {
        event: "poll_transient",
        analyzerId,
        attempt: String(attempt),
        httpStatus: String(resp.status),
      });
      continue;
    }
    if (resp.status !== 200) {
      log.error("Azure CU analyze poll non-2xx", {
        event: "poll_error",
        analyzerId,
        attempt: String(attempt),
        httpStatus: String(resp.status),
        body: typeof resp.data === "object" ? resp.data : String(resp.data),
      });
      throw new Error(`Azure CU analyze poll failed: HTTP ${resp.status}`);
    }
    const body = resp.data as CuAnalyzeOperation;
    lastBody = body;
    const status = body.status;
    if (status === "Succeeded") {
      const result: CuAnalyzeResult = body.result ?? {};
      const ocrResult = cuAnalyzeResultToOcrResult(
        result,
        {
          fileName: params.fileData.fileName,
          fileType: params.fileData.fileType,
          requestId,
          modelId: analyzerId,
        },
        fieldDefs.length > 0 ? { fieldDefs } : undefined,
      );
      log.info("Azure CU analyze complete", {
        event: "complete",
        requestId,
        analyzerId,
        attempts: attempt + 1,
        pageCount: ocrResult.pages.length,
        durationMs: Date.now() - startTime,
      });
      return { ocrResult, ocrResponse: body };
    }
    if (status === "Failed") {
      const errMsg = body.error?.message ?? "unknown";
      log.error("Azure CU analyze terminal failure", {
        event: "analyze_failed",
        analyzerId,
        errorCode: body.error?.code,
        errorMessage: errMsg,
      });
      throw new Error(`Azure CU analyze failed: ${errMsg}`);
    }
    // Else: Running / Queued — continue.
  }

  log.error("Azure CU analyze poll exhausted attempts", {
    event: "poll_exhausted",
    analyzerId,
    attempts: String(pollMaxAttempts),
    lastStatus: lastBody?.status,
  });
  throw new Error(
    `Azure CU analyze timed out after ${pollMaxAttempts} polls (${(pollMaxAttempts * pollIntervalMs) / 1000}s).`,
  );
}

export const __testInternals = {
  defaultAnalyzerIdForTemplate,
};
