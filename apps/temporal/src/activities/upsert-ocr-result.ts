import { getPrismaClient } from './database-client';
import { Prisma } from '@generated/client';
import type { OCRResult } from '../types';

/**
 * Activity: Upsert OCR result in database
 * Determines extracted fields based on model type:
 * - Custom models: use fields directly from documents[0].fields
 * - Prebuilt models: convert keyValuePairs to fields format
 */
export async function upsertOcrResult(params: {
  documentId: string;
  ocrResult: OCRResult;
}): Promise<void> {
  const activityName = 'upsertOcrResult';
  const { documentId, ocrResult } = params;
  const startTime = Date.now();

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    fileName: ocrResult.fileName,
    modelId: ocrResult.modelId,
    status: ocrResult.status,
    keyValuePairsCount: ocrResult.keyValuePairs?.length || 0,
    documentsCount: ocrResult.documents?.length || 0,
    timestamp: new Date().toISOString()
  }));

  try {
    const prisma = getPrismaClient();

    // Convert to JSON format for database
    const asJson = (obj: unknown): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull => {
      if (obj === null) {
        return Prisma.JsonNull;
      }
      return obj as Prisma.InputJsonValue;
    };

    // Determine extracted fields based on model type (matches database.service.ts logic)
    let extractedFields: Record<string, unknown> | null = null;

    if (ocrResult.documents && ocrResult.documents.length > 0) {
      // Custom model: use fields directly from documents[0].fields
      extractedFields = ocrResult.documents[0].fields;
      console.log(JSON.stringify({
        activity: activityName,
        event: 'fields_extracted',
        source: 'custom_model_documents',
        fieldCount: Object.keys(extractedFields).length,
        timestamp: new Date().toISOString()
      }));
    } else if (ocrResult.keyValuePairs && ocrResult.keyValuePairs.length > 0) {
      // Prebuilt model: convert keyValuePairs to fields format
      const fields: Record<string, unknown> = {};

      for (const pair of ocrResult.keyValuePairs) {
        const fieldName = pair.key?.content || "unknown";
        const field = {
          type: "string",
          content: pair.value?.content || null,
          confidence: pair.confidence,
          boundingRegions: pair.value?.boundingRegions || pair.key?.boundingRegions,
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
      console.log(JSON.stringify({
        activity: activityName,
        event: 'fields_extracted',
        source: 'prebuilt_model_keyValuePairs',
        keyValuePairsCount: ocrResult.keyValuePairs.length,
        fieldCount: Object.keys(extractedFields).length,
        timestamp: new Date().toISOString()
      }));
    }

    // Ensure processedAt is a valid date, fallback to current time if invalid
    const processedDate = new Date(ocrResult.processedAt);
    const validProcessedDate = isNaN(processedDate.getTime()) ? new Date() : processedDate;

    const updateObject = {
      processed_at: validProcessedDate,
      keyValuePairs: asJson(extractedFields),
    };

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
      data: { status: 'completed_ocr' as 'completed_ocr' },
    });

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      fileName: ocrResult.fileName,
      modelId: ocrResult.modelId,
      fieldCount: extractedFields ? Object.keys(extractedFields).length : 0,
      dataSize: extractedFields ? JSON.stringify(extractedFields).length : 0,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      error: errorMessage,
      durationMs: duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    throw error;
  }
}
