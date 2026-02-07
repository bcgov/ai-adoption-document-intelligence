import { getPrismaClient } from './database-client';
import type { OCRResult } from '../types';

/**
 * Activity: Calculate OCR confidence and prepare for human review if needed
 * Returns average confidence and whether human review is required
 */
export async function checkOcrConfidence(
  documentId: string,
  ocrResult: OCRResult,
  confidenceThreshold: number = 0.95
): Promise<{ averageConfidence: number; requiresReview: boolean }> {
  const activityName = 'checkOcrConfidence';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId,
    fileName: ocrResult.fileName,
    confidenceThreshold,
    timestamp: new Date().toISOString()
  }));

  try {
    // Calculate average confidence from words
    let totalConfidence = 0;
    let wordCount = 0;

    for (const page of ocrResult.pages) {
      for (const word of page.words) {
        if (word.confidence !== undefined && word.confidence !== null) {
          totalConfidence += word.confidence;
          wordCount++;
        }
      }
    }

    // Also consider key-value pair confidence
    for (const kvp of ocrResult.keyValuePairs) {
      if (kvp.confidence !== undefined && kvp.confidence !== null) {
        totalConfidence += kvp.confidence;
        wordCount++;
      }
    }

    // Calculate average (confidence is typically 0-1, but Azure might return 0-100)
    const averageConfidence = wordCount > 0 ? totalConfidence / wordCount : 1.0;

    // Normalize to 0-1 range if it appears to be in 0-100 range
    const normalizedConfidence = averageConfidence > 1 ? averageConfidence / 100 : averageConfidence;

    const requiresReview = normalizedConfidence < confidenceThreshold;

    console.log(JSON.stringify({
      activity: activityName,
      event: 'complete',
      documentId,
      fileName: ocrResult.fileName,
      averageConfidence: normalizedConfidence,
      requiresReview,
      wordCount,
      timestamp: new Date().toISOString()
    }));

    // Update document status if review is required
    // Note: We keep status as 'ongoing_ocr' since the workflow is still in progress
    // The workflow itself tracks the 'awaiting_review' state separately
    if (requiresReview) {
      const prisma = getPrismaClient();
      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: 'ongoing_ocr',
        },
      });

      console.log(JSON.stringify({
        activity: activityName,
        event: 'status_updated',
        documentId,
        status: 'ongoing_ocr',
        requiresReview: true,
        timestamp: new Date().toISOString()
      }));
    }

    return {
      averageConfidence: normalizedConfidence,
      requiresReview
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(JSON.stringify({
      activity: activityName,
      event: 'error',
      documentId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }));
    // Default to requiring review if we can't calculate confidence
    return {
      averageConfidence: 0,
      requiresReview: true
    };
  }
}
