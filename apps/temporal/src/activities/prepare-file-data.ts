import * as fs from 'fs/promises';
import * as path from 'path';
import type { PreparedFileData } from '../types';

const DEFAULT_BLOB_BASE_PATH = './data/blobs';

export interface PrepareFileDataInput {
  documentId: string;
  blobKey: string;
  fileName?: string;
  fileType?: 'pdf' | 'image';
  contentType?: string;
  modelId?: string;
}

function resolveBlobKeyToPath(blobKey: string): string {
  const basePath = process.env.LOCAL_BLOB_STORAGE_PATH ?? DEFAULT_BLOB_BASE_PATH;
  const normalized = path.normalize(blobKey);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
    throw new Error(`Invalid blob key: "${blobKey}"`);
  }
  return path.join(basePath, normalized);
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
): Promise<PreparedFileData> {
  const activityName = 'prepareFileData';
  const blobKey = input.blobKey;

  console.log(JSON.stringify({
    activity: activityName,
    event: 'start',
    documentId: input.documentId,
    fileName: input.fileName || 'not provided',
    fileType: input.fileType || 'not provided',
    contentType: input.contentType || 'not provided',
    blobKey,
    timestamp: new Date().toISOString()
  }));

  if (!blobKey || typeof blobKey !== 'string') {
    throw new Error('No blobKey provided. blobKey is required to read file data.');
  }

  const fileBuffer = await readBlobData(blobKey);
  const fileSize = fileBuffer.length;

  let fileName = input.fileName || path.basename(blobKey) || 'document';
  let fileType: 'pdf' | 'image' = input.fileType || 'pdf';
  let contentType = input.contentType || 'application/pdf';

  // Determine file type from filename or content type
  const lowerFileName = fileName.toLowerCase();
  if (contentType.includes('pdf') || lowerFileName.endsWith('.pdf')) {
    fileType = 'pdf';
    contentType = 'application/pdf';
  } else if (
    contentType.includes('image') ||
    lowerFileName.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i)
  ) {
    fileType = 'image';
    if (!contentType || contentType === 'application/pdf') {
      if (lowerFileName.endsWith('.png')) {
        contentType = 'image/png';
      } else if (lowerFileName.match(/\.(jpg|jpeg)$/i)) {
        contentType = 'image/jpeg';
      } else if (lowerFileName.endsWith('.gif')) {
        contentType = 'image/gif';
      } else {
        contentType = contentType || 'image/jpeg';
      }
    }
  }

  // Validate PDF signature if it's supposed to be a PDF
  if (fileType === 'pdf' || contentType.includes('pdf')) {
    const pdfSignature = fileBuffer.slice(0, 4).toString();
    if (pdfSignature !== '%PDF' && fileBuffer.length > 4) {
      console.warn(JSON.stringify({
        activity: activityName,
        event: 'warn',
        documentId: input.documentId,
        fileName,
        warning: 'File does not have valid PDF signature',
        pdfSignature,
        timestamp: new Date().toISOString()
      }));
    }
  }

  // Get modelId from input, default to "prebuilt-layout"
  const modelId = input.modelId || 'prebuilt-layout';

  console.log(JSON.stringify({
    activity: activityName,
    event: 'complete',
    documentId: input.documentId,
    fileName,
    fileType,
    contentType,
    modelId,
    fileSize,
    timestamp: new Date().toISOString()
  }));

  return {
    fileName,
    fileType,
    contentType,
    blobKey,
    modelId
  };
}
