import { Context } from '@temporalio/activity';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createActivityLogger } from '../logger';
import type { PreparedFileData } from '../types';
import { resolveBlobKeyToPath } from '../blob-storage/blob-path-resolver';

export interface PrepareFileDataInput {
  documentId: string;
  blobKey: string;
  fileName?: string;
  fileType?: 'pdf' | 'image';
  contentType?: string;
  modelId?: string;
  requestId?: string;
}

async function readBlobData(blobKey: string): Promise<Buffer> {
  const filePath = resolveBlobKeyToPath(blobKey);
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    throw new Error(`Blob not found: "${blobKey}"`);
  }
}

/**
 * Activity: Prepare file data for Azure OCR
 * Validates blob key and extracts metadata
 */
export async function prepareFileData(
  input: PrepareFileDataInput,
): Promise<{ preparedData: PreparedFileData }> {
  const activityName = 'prepareFileData';
  const { requestId } = input;
  const workflowExecutionId = Context.current().info.workflowExecution?.workflowId;
  const log = createActivityLogger(activityName, { workflowExecutionId, requestId, documentId: input.documentId });
  const blobKey = input.blobKey;

  log.info('Prepare file data start', {
    event: 'start',
    fileName: input.fileName || 'not provided',
    fileType: input.fileType || 'not provided',
    contentType: input.contentType || 'not provided',
    blobKey,
  });

  if (!blobKey || typeof blobKey !== 'string') {
    throw new Error('No blobKey provided. blobKey is required to read file data.');
  }

  const fileBuffer = await readBlobData(blobKey);
  const fileSize = fileBuffer.length;

  let fileName = input.fileName || path.basename(blobKey) || 'document';
  let fileType: 'pdf' | 'image' = input.fileType || 'pdf';
  let contentType = input.contentType;

  // Determine file type from filename or content type
  const lowerFileName = fileName.toLowerCase();

  // Check for image files first by extension
  if (
    (contentType && contentType.includes('image')) ||
    lowerFileName.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i)
  ) {
    fileType = 'image';
    if (!contentType) {
      if (lowerFileName.endsWith('.png')) {
        contentType = 'image/png';
      } else if (lowerFileName.match(/\.(jpg|jpeg)$/i)) {
        contentType = 'image/jpeg';
      } else if (lowerFileName.endsWith('.gif')) {
        contentType = 'image/gif';
      } else {
        contentType = 'image/jpeg';
      }
    }
  } else if ((contentType && contentType.includes('pdf')) || lowerFileName.endsWith('.pdf')) {
    fileType = 'pdf';
    contentType = 'application/pdf';
  } else {
    // Default to PDF if no specific type detected
    fileType = 'pdf';
    contentType = 'application/pdf';
  }

  // Validate PDF signature if it's supposed to be a PDF
  if (fileType === 'pdf' || contentType.includes('pdf')) {
    const pdfSignature = fileBuffer.slice(0, 4).toString();
    if (pdfSignature !== '%PDF' && fileBuffer.length > 4) {
      log.warn('Prepare file data: invalid PDF signature', {
        event: 'warn',
        fileName,
        warning: 'File does not have valid PDF signature',
        pdfSignature,
      });
    }
  }

  // Get modelId from input, default to "prebuilt-layout"
  const modelId = input.modelId || 'prebuilt-layout';

  const preparedData: PreparedFileData = {
    fileName,
    fileType,
    contentType,
    blobKey,
    modelId
  };

  log.info('Prepare file data complete', {
    event: 'complete',
    fileName,
    fileType,
    contentType,
    modelId,
    fileSize,
  });

  // Return with port name as key for output binding
  return {
    preparedData
  };
}
