import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { Prisma } from "@generated/client";
import { createActivityLogger } from "../logger";
import {
  isOcrPayloadRef,
  loadOcrResultFromPort,
  type OcrPayloadRef,
} from "../ocr-payload-ref";
import type { EnrichmentSummary, OCRResult } from "../types";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Upsert OCR result in database
 * Writes only for a document owned by `groupId`.
 * Determines extracted fields based on model type:
 * - Custom models: use fields directly from documents[0].fields
 * - Prebuilt models: convert keyValuePairs to fields format
 */
export async function upsertOcrResult(params: {
  documentId: string;
  ocrResult: OCRResult | OcrPayloadRef;
  groupId?: string | null;
  enrichmentSummary?: EnrichmentSummary | null;
}): Promise<void> {
  const activityName = "upsertOcrResult";
  const { documentId, groupId, enrichmentSummary } = params;
  if (!groupId) {
    throw new Error(
      `groupId is required to store the OCR result for document ${documentId}`,
    );
  }
  const ocrResult = isOcrPayloadRef(params.ocrResult)
    ? await loadOcrResultFromPort(params.ocrResult, groupId)
    : params.ocrResult;
  const log = createActivityLogger(activityName, { documentId });
  const startTime = Date.now();

  log.info("Upsert OCR result start", {
    event: "start",
    fileName: ocrResult.fileName,
    modelId: ocrResult.modelId,
    status: ocrResult.status,
    keyValuePairsCount: ocrResult.keyValuePairs?.length || 0,
    documentsCount: ocrResult.documents?.length || 0,
    hasEnrichmentSummary: !!enrichmentSummary,
  });

  try {
    const prisma = getPrismaClient();

    // Convert to JSON format for database
    const asJson = (
      obj: unknown,
    ): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull => {
      if (obj === null) {
        return Prisma.JsonNull;
      }
      return obj as Prisma.InputJsonValue;
    };

    // Ensure each stored field has valueString from content so the UI can display it
    const withValueString = (
      fields: Record<string, unknown>,
    ): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        const obj = (v && typeof v === "object" ? v : {}) as Record<
          string,
          unknown
        >;
        const content = typeof obj.content === "string" ? obj.content : "";
        out[k] = { ...obj, valueString: obj.valueString ?? content };
      }
      return out;
    };

    // Determine extracted fields based on model type (matches database.service.ts logic)
    let extractedFields: Record<string, unknown> | null = null;

    if (ocrResult.documents && ocrResult.documents.length > 0) {
      // Custom model: use fields directly from documents[0].fields, ensure valueString set
      const raw = ocrResult.documents[0].fields as Record<string, unknown>;
      extractedFields = withValueString(raw);
      log.info("Upsert OCR result: fields extracted", {
        event: "fields_extracted",
        source: "custom_model_documents",
        fieldCount: Object.keys(extractedFields).length,
      });
    } else if (ocrResult.keyValuePairs && ocrResult.keyValuePairs.length > 0) {
      // Prebuilt model: convert keyValuePairs to fields format with valueString for UI
      const fields: Record<string, unknown> = {};

      for (const pair of ocrResult.keyValuePairs) {
        const fieldName = pair.key?.content || "unknown";
        const content = pair.value?.content || null;
        const field = {
          type: "string",
          content,
          valueString: content,
          confidence: pair.confidence,
          boundingRegions:
            pair.value?.boundingRegions || pair.key?.boundingRegions,
          spans: pair.value?.spans || pair.key?.spans,
        };

        // Handle duplicate field names by appending a suffix
        let uniqueName = fieldName;
        let counter = 1;
        while (fields[uniqueName]) {
          uniqueName = `${fieldName}_${counter}`;
          counter++;
        }

        fields[uniqueName] = field;
      }

      extractedFields = fields;
      log.info("Upsert OCR result: fields extracted", {
        event: "fields_extracted",
        source: "prebuilt_model_keyValuePairs",
        keyValuePairsCount: ocrResult.keyValuePairs.length,
        fieldCount: Object.keys(extractedFields).length,
      });
    }

    // Ensure processedAt is a valid date, fallback to current time if invalid
    const processedDate = new Date(ocrResult.processedAt);
    const validProcessedDate = Number.isNaN(processedDate.getTime())
      ? new Date()
      : processedDate;

    // Structured OCR output: { format, text, markdown?, pages }. Populated for
    // prebuilt read/layout/document models, where there are no fields to
    // extract but the caller still wants the underlying content.
    const pagesPayload = (ocrResult.pages ?? []).map((p) => ({
      pageNumber: p.pageNumber,
      content:
        Array.isArray(p.lines) && p.lines.length > 0
          ? p.lines.map((l) => l.content).join("\n")
          : "",
      lines: p.lines ?? [],
    }));
    const text =
      ocrResult.extractedText && ocrResult.extractedText.length > 0
        ? ocrResult.extractedText
        : pagesPayload.map((p) => p.content).join("\n\n");
    const format = ocrResult.contentFormat ?? "text";
    const hasAnyContent =
      text.length > 0 || pagesPayload.length > 0 || !!ocrResult.markdown;
    const contentBlob = hasAnyContent
      ? {
          format,
          text,
          ...(ocrResult.markdown ? { markdown: ocrResult.markdown } : {}),
          pages: pagesPayload,
        }
      : null;

    const updateObject: Record<string, unknown> = {
      processed_at: validProcessedDate,
      keyValuePairs: asJson(extractedFields),
      content: contentBlob == null ? Prisma.JsonNull : asJson(contentBlob),
    };
    if (enrichmentSummary !== undefined) {
      updateObject.enrichment_summary =
        enrichmentSummary != null ? enrichmentSummary : null;
    }

    // Mark document extracted and upsert OCR result atomically.
    // OcrResult has no group column, so the document is marked first, scoped
    // to the run's group, and the OCR result is written only when it matched.
    // Note: The workflow status "awaiting_review" is used by the frontend to determine if review is needed
    const stored = await prisma.$transaction(async (tx) => {
      const { count } = await tx.document.updateMany({
        where: { id: documentId, group_id: groupId },
        data: { status: "extracted" as const },
      });
      if (count === 0) {
        return false;
      }

      await tx.ocrResult.upsert({
        where: {
          document_id: documentId,
        },
        update: updateObject,
        create: {
          document_id: documentId,
          ...updateObject,
        },
      });
      return true;
    });

    // No row matches in this group. Benchmark runs use synthetic
    // "benchmark-" document ids with no document record, so this is expected
    // there. Log and move on.
    if (!stored) {
      const duration = Date.now() - startTime;
      log.info("Upsert OCR result skipped", {
        event: "skipped",
        reason: "document_not_found",
        durationMs: duration,
      });
      return;
    }

    log.info("Upsert OCR result complete", {
      event: "complete",
      fileName: ocrResult.fileName,
      modelId: ocrResult.modelId,
      fieldCount: extractedFields ? Object.keys(extractedFields).length : 0,
      dataSize: extractedFields ? JSON.stringify(extractedFields).length : 0,
      alertType: "upsert_ocr_result",
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error("Upsert OCR result error", {
      event: "error",
      error: getErrorMessage(error),
      durationMs: duration,
      stack: getErrorStack(error),
      alertType: "upsert_ocr_result",
    });
    throw error;
  }
}
