import { Context } from '@temporalio/activity';
import { createActivityLogger } from '../logger';
import { getPrismaClient } from './database-client';
import type { OCRResult } from '../types';

/**
 * Activity: Calculate OCR confidence and prepare for human review if needed
 * Returns average confidence and whether human review is required
 */
export async function checkOcrConfidence(params: {
  documentId: string;
  ocrResult: OCRResult;
  threshold?: number;
  requestId?: string;
}): Promise<{ averageConfidence: number; requiresReview: boolean }> {
  const activityName = 'checkOcrConfidence';
  const { documentId, ocrResult, threshold = 0.95, requestId } = params;
  const workflowExecutionId = Context.current().info.workflowExecution?.workflowId;
  const log = createActivityLogger(activityName, { workflowExecutionId, requestId, documentId });
  const confidenceThreshold = threshold;

  log.info('Check OCR confidence start', {
    event: 'start',
    fileName: ocrResult.fileName,
    confidenceThreshold,
  });

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

    log.info('Check OCR confidence complete', {
      event: 'complete',
      fileName: ocrResult.fileName,
      averageConfidence: normalizedConfidence,
      requiresReview,
      wordCount,
    });

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

      log.info('Check OCR confidence status updated', {
        event: 'status_updated',
        status: 'ongoing_ocr',
        requiresReview: true,
      });
    }

    return {
      averageConfidence: normalizedConfidence,
      requiresReview
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;
    log.error('Check OCR confidence error', {
      event: 'error',
      error: errorMessage,
      stack,
    });
    // Default to requiring review if we can't calculate confidence
    return {
      averageConfidence: 0,
      requiresReview: true
    };
  }
}
