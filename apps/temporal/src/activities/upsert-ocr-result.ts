import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { Prisma } from "@generated/client";
import { createActivityLogger } from "../logger";
import type { EnrichmentSummary, OCRResult } from "../types";
import { getPrismaClient } from "./database-client";

/**
 * Activity: Upsert OCR result in database
 * Determines extracted fields based on model type:
 * - Custom models: use fields directly from documents[0].fields
 * - Prebuilt models: convert keyValuePairs to fields format
 */
export async function upsertOcrResult(params: {
  documentId: string;
  ocrResult: OCRResult;
  enrichmentSummary?: EnrichmentSummary | null;
}): Promise<void> {
  const activityName = "upsertOcrResult";
  const { documentId, ocrResult, enrichmentSummary } = params;
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

    // In benchmark mode, the documentId has a "benchmark-" prefix and no
    // corresponding document record exists in the DB.  Detect this early and
    // skip the Prisma operations to avoid noisy FK-constraint error logs.
    if (documentId.startsWith("benchmark-")) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true },
      });
      if (!doc) {
        const duration = Date.now() - startTime;
        log.info("Upsert OCR result skipped", {
          event: "skipped",
          reason: "benchmark_mode_no_document",
          durationMs: duration,
        });
        return;
      }
    }

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

    const updateObject: Record<string, unknown> = {
      processed_at: validProcessedDate,
      keyValuePairs: asJson(extractedFields),
    };
    if (enrichmentSummary !== undefined) {
      updateObject.enrichment_summary =
        enrichmentSummary != null ? enrichmentSummary : null;
    }

    // Upsert OCR result
    await prisma.ocrResult.upsert({
      where: {
        document_id: documentId,
      },
      update: updateObject,
      create: {
        document_id: documentId,
        ...updateObject,
      },
    });

    // Update document status to completed_ocr
    // Note: The workflow status "awaiting_review" is used by the frontend to determine if review is needed
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "completed_ocr" as const },
    });

    log.info("Upsert OCR result complete", {
      event: "complete",
      fileName: ocrResult.fileName,
      modelId: ocrResult.modelId,
      fieldCount: extractedFields ? Object.keys(extractedFields).length : 0,
      dataSize: extractedFields ? JSON.stringify(extractedFields).length : 0,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // P2003 = FK constraint violation, P2025 = record not found.
    // In benchmark mode the document doesn't exist in the DB, so DB writes
    // are expected to fail. Log and move on.
    const prismaCode =
      error instanceof Error && "code" in error
        ? (error as { code: string }).code
        : undefined;
    if (prismaCode === "P2003" || prismaCode === "P2025") {
      log.info("Upsert OCR result skipped", {
        event: "skipped",
        reason: "document_not_found",
        durationMs: duration,
      });
      return;
    }

    log.error("Upsert OCR result error", {
      event: "error",
      error: getErrorMessage(error),
      durationMs: duration,
      stack: getErrorStack(error),
    });
    throw error;
  }
}
