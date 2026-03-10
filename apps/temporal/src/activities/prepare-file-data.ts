import * as fs from "fs";
import * as path from "path";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";
import type { PreparedFileData } from "../types";

export interface PrepareFileDataInput {
  documentId: string;
  blobKey: string;
  fileName?: string;
  fileType?: "pdf" | "image";
  contentType?: string;
  modelId?: string;
}

async function readBlobData(blobKey: string): Promise<Buffer> {
  // If blobKey is an absolute path on disk (e.g. materialized by benchmark),
  // read directly from the filesystem instead of object storage.
  if (path.isAbsolute(blobKey)) {
    try {
      return await fs.promises.readFile(blobKey);
    } catch (_error) {
      throw new Error(`File not found on disk: "${blobKey}"`);
    }
  }

  const client = getBlobStorageClient();
  try {
    return await client.read(blobKey);
  } catch (_error) {
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
  const activityName = "prepareFileData";
  const blobKey = input.blobKey;

  console.log(
    JSON.stringify({
      activity: activityName,
      event: "start",
      documentId: input.documentId,
      fileName: input.fileName || "not provided",
      fileType: input.fileType || "not provided",
      contentType: input.contentType || "not provided",
      blobKey,
      timestamp: new Date().toISOString(),
    }),
  );

  if (!blobKey || typeof blobKey !== "string") {
    throw new Error(
      "No blobKey provided. blobKey is required to read file data.",
    );
  }

  const fileBuffer = await readBlobData(blobKey);
  const fileSize = fileBuffer.length;

  const fileName = input.fileName || path.basename(blobKey) || "document";
  let fileType: "pdf" | "image" = input.fileType || "pdf";
  let contentType = input.contentType;

  // Determine file type from filename or content type
  const lowerFileName = fileName.toLowerCase();

  // Check for image files first by extension
  if (
    (contentType && contentType.includes("image")) ||
    lowerFileName.match(/\.(jpg|jpeg|png|gif|bmp|tiff|webp)$/i)
  ) {
    fileType = "image";
    if (!contentType) {
      if (lowerFileName.endsWith(".png")) {
        contentType = "image/png";
      } else if (lowerFileName.match(/\.(jpg|jpeg)$/i)) {
        contentType = "image/jpeg";
      } else if (lowerFileName.endsWith(".gif")) {
        contentType = "image/gif";
      } else {
        contentType = "image/jpeg";
      }
    }
  } else if (
    (contentType && contentType.includes("pdf")) ||
    lowerFileName.endsWith(".pdf")
  ) {
    fileType = "pdf";
    contentType = "application/pdf";
  } else {
    // Default to PDF if no specific type detected
    fileType = "pdf";
    contentType = "application/pdf";
  }

  // Validate PDF signature if it's supposed to be a PDF
  if (fileType === "pdf" || contentType.includes("pdf")) {
    const pdfSignature = fileBuffer.slice(0, 4).toString();
    if (pdfSignature !== "%PDF" && fileBuffer.length > 4) {
      console.warn(
        JSON.stringify({
          activity: activityName,
          event: "warn",
          documentId: input.documentId,
          fileName,
          warning: "File does not have valid PDF signature",
          pdfSignature,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  // Get modelId from input, default to "prebuilt-layout"
  const modelId = input.modelId || "prebuilt-layout";

  const preparedData: PreparedFileData = {
    fileName,
    fileType,
    contentType,
    blobKey,
    modelId,
  };

  console.log(
    JSON.stringify({
      activity: activityName,
      event: "complete",
      documentId: input.documentId,
      fileName,
      fileType,
      contentType,
      modelId,
      fileSize,
      timestamp: new Date().toISOString(),
    }),
  );

  // Return with port name as key for output binding
  return {
    preparedData,
  };
}
