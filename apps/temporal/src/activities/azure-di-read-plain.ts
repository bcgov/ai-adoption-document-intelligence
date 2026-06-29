/**
 * Azure DI plain-OCR activity (E05).
 *
 * Sync wrapper around Azure Document Intelligence `prebuilt-layout` that
 * returns text + per-line/per-word polygons + a markdown rendering of the
 * page. **No template/neural extraction** — this is the "OCR pre-pass"
 * leg of the hybrid VLM + OCR pattern.
 *
 * The activity:
 *   1. POSTs the document to `prebuilt-layout` with
 *      `outputContentFormat=markdown`.
 *   2. Polls the operation until terminal (per the `2024-11-30` API).
 *   3. Returns the raw `analyzeResult` body so the provider's
 *      `ocr-to-markdown.ts` can derive the layout-aware prompt input.
 *
 * Wallclock: ~1–3 s/page on a single-page form image. The wrapper is
 * synchronous (submit + poll inline) because callers compose this with a
 * VLM call in a single workflow node sequence — there's no benefit from
 * Temporal-level pollUntil between the two.
 *
 * Auth/endpoint env vars (already used by submit-to-azure-ocr.ts):
 *   - AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
 *   - AZURE_DOCUMENT_INTELLIGENCE_API_KEY
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import DocumentIntelligence, {
  type DocumentIntelligenceClient,
  isUnexpected,
} from "@azure-rest/ai-document-intelligence";
import { ApplicationFailure } from "@temporalio/activity";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import { createActivityLogger } from "../logger";
import type { AnalyzeResult, OCRResponse, PreparedFileData } from "../types";

const DEFAULT_MODEL_ID = "prebuilt-layout";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_POLL_MAX_ATTEMPTS = 240; // ~6 min @ 1.5s

function normalizeEndpoint(url: string | undefined): string {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Minimal subset of the operation poll body we actually depend on. */
interface AnalyzeOperationBody {
  status?: string;
  analyzeResult?: AnalyzeResult;
  createdDateTime?: string;
  lastUpdatedDateTime?: string;
  error?: { code: string; message: string };
}

export interface AzureOcrReadPlainParams {
  fileData: PreparedFileData;
  /** Optional override (defaults to "prebuilt-layout"). */
  modelId?: string;
  /** Locale hint forwarded to DI (defaults to en-US). */
  locale?: string;
  /** Polling interval in ms (default 1500). */
  pollIntervalMs?: number;
  /** Max poll attempts (default 240 → ~6 min). */
  pollMaxAttempts?: number;
  requestId?: string;
}

export interface AzureOcrReadPlainResult {
  /**
   * Raw layout response from prebuilt-layout. Carries the full
   * `analyzeResult` (markdown content + pages with per-line/per-word
   * polygons + paragraphs), so the provider's `ocr-to-markdown.ts` can
   * derive both a markdown rendering and bbox annotations.
   */
  layoutResponse: OCRResponse;
  /** Wallclock submission + poll duration in ms. */
  durationMs: number;
  /** apim-request-id from the submit response (audit only). */
  apimRequestId: string;
}

/**
 * Activity: read plain layout (markdown + bboxes) via Azure DI
 * prebuilt-layout. Sync wrapper (submit + poll inline).
 */
export async function azureDiReadPlain(
  params: AzureOcrReadPlainParams,
): Promise<AzureOcrReadPlainResult> {
  const log = createActivityLogger("azureDiReadPlain", {
    ...(params.requestId && { requestId: params.requestId }),
  });
  const startTime = Date.now();
  const useMock = process.env.MOCK_AZURE_OCR === "true";
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const apiKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_KEY;
  const modelId = params.modelId?.trim() || DEFAULT_MODEL_ID;
  const locale = params.locale ?? "en-US";

  log.info("Azure DI read-plain start", {
    event: "start",
    fileName: params.fileData.fileName,
    fileType: params.fileData.fileType,
    blobKey: params.fileData.blobKey,
    modelId,
    useMock,
  });

  if (useMock) {
    const apimRequestId = `mock-di-read-${randomUUID()}`;
    const text = `mock layout markdown for ${params.fileData.fileName}`;
    const mockResponse: OCRResponse = {
      status: "succeeded",
      createdDateTime: new Date().toISOString(),
      lastUpdatedDateTime: new Date().toISOString(),
      analyzeResult: {
        apiVersion: "2024-11-30",
        modelId,
        content: text,
        pages: [
          {
            pageNumber: 1,
            width: 8.5,
            height: 11,
            unit: "inch",
            words: [],
            lines: [],
            spans: [{ offset: 0, length: text.length }],
          },
        ],
        paragraphs: [],
        tables: [],
        keyValuePairs: [],
        sections: [],
        figures: [],
      },
    };
    log.info("Azure DI read-plain complete (mock)", {
      event: "complete_mock",
      apimRequestId,
      durationMs: Date.now() - startTime,
    });
    return {
      layoutResponse: mockResponse,
      durationMs: Date.now() - startTime,
      apimRequestId,
    };
  }

  if (!endpoint || !apiKey) {
    throw new Error(
      "Azure Document Intelligence credentials not configured. Set AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_API_KEY environment variables.",
    );
  }

  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollMaxAttempts = params.pollMaxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS;

  try {
    const client: DocumentIntelligenceClient = DocumentIntelligence(
      normalizedEndpoint,
      { key: apiKey },
      { credentials: { apiKeyHeaderName: "api-key" } },
    );

    const fileBuffer = await readBlobData(params.fileData.blobKey);

    // 1. Submit. `outputContentFormat: "markdown"` causes
    //    `analyzeResult.content` to come back as Markdown rather than
    //    plain text — which is what the hybrid provider feeds to the VLM.
    const initialResponse = await client
      .path("/documentModels/{modelId}:analyze", modelId)
      .post({
        contentType: "application/json",
        queryParameters: {
          locale,
          outputContentFormat: "markdown",
        },
        body: {
          base64Source: fileBuffer.toString("base64"),
        },
      });

    if (isUnexpected(initialResponse)) {
      log.error("Azure DI read-plain: submit error", {
        event: "submit_error",
        status: initialResponse.status,
        body: initialResponse.body,
      });
      throw new Error(
        `Azure DI read-plain submit failed. Status: ${initialResponse.status}`,
      );
    }

    const apimRequestId =
      (initialResponse.headers["apim-request-id"] as string | undefined) ??
      (initialResponse.headers["Apim-Request-Id"] as string | undefined) ??
      `di-read-${randomUUID()}`;
    const operationLocation =
      (initialResponse.headers["operation-location"] as string | undefined) ??
      (initialResponse.headers["Operation-Location"] as string | undefined);
    if (!operationLocation) {
      throw new Error(
        "Azure DI read-plain: submit response missing operation-location header.",
      );
    }
    // operation-location is a full URL; the result id is the last path
    // segment. The SDK's typed result endpoint takes (modelId, resultId).
    const resultId = operationLocation.split("/").pop()?.split("?")[0] ?? "";
    if (!resultId) {
      throw new Error(
        `Azure DI read-plain: could not extract result id from operation-location: ${operationLocation}`,
      );
    }

    // 2. Poll until terminal.
    let lastBody: AnalyzeOperationBody | undefined;
    for (let attempt = 0; attempt < pollMaxAttempts; attempt++) {
      if (attempt > 0) await sleep(pollIntervalMs);
      const pollResponse = await client
        .path(
          "/documentModels/{modelId}/analyzeResults/{resultId}",
          modelId,
          resultId,
        )
        .get();
      if (isUnexpected(pollResponse)) {
        throw new Error(
          `Azure DI read-plain poll failed. Status: ${pollResponse.status}`,
        );
      }
      const body = pollResponse.body as AnalyzeOperationBody;
      lastBody = body;
      const status = body.status;
      if (status === "succeeded") {
        if (!body.analyzeResult) {
          // Terminal-but-malformed: the analysis reported success yet
          // returned no result. Retrying re-runs the same analysis and
          // won't help, so fail non-retryably.
          throw ApplicationFailure.create({
            message:
              "Azure DI read-plain: succeeded poll missing analyzeResult.",
            nonRetryable: true,
          });
        }
        const layoutResponse: OCRResponse = {
          status: "succeeded",
          analyzeResult: body.analyzeResult,
          createdDateTime: body.createdDateTime,
          lastUpdatedDateTime: body.lastUpdatedDateTime,
        };
        const durationMs = Date.now() - startTime;
        log.info("Azure DI read-plain complete", {
          event: "complete",
          attempts: attempt + 1,
          durationMs,
          pageCount: body.analyzeResult.pages?.length ?? 0,
          contentLength: body.analyzeResult.content?.length ?? 0,
        });
        return { layoutResponse, durationMs, apimRequestId };
      }
      if (status === "failed") {
        const errMsg = body.error?.message ?? "unknown";
        log.error("Azure DI read-plain: terminal failure", {
          event: "analyze_failed",
          errorCode: body.error?.code,
          errorMessage: errMsg,
        });
        // A server-side terminal failure won't be fixed by re-submitting the
        // same document — mirror develop's poll-ocr-results and fail
        // non-retryably so Temporal doesn't burn its retry budget.
        throw ApplicationFailure.create({
          message: `Azure DI read-plain failed: ${errMsg}`,
          nonRetryable: true,
          ...(body.error ? { details: [body.error] } : {}),
        });
      }
      // Else: running / notStarted — continue.
    }

    throw new Error(
      `Azure DI read-plain timed out after ${pollMaxAttempts} polls (last status: ${lastBody?.status ?? "unknown"}).`,
    );
  } catch (error) {
    log.error("Azure DI read-plain error", {
      event: "error",
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
