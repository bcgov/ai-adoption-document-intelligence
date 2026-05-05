import { validateBlobFilePath } from "@ai-di/blob-storage-paths";
import { getBlobStorageClient } from "../blob-storage/blob-storage-client";

/**
 * Input parameters for the blobRead activity.
 */
export interface BlobReadInput {
  /** Blob storage key of the file to read. */
  blobKey: string;
}

/**
 * Result returned by the blobRead activity.
 */
export interface BlobReadOutput {
  /** Base64-encoded contents of the blob. */
  base64: string;
}

/**
 * Activity: Read a blob from storage and return its contents as a base64 string.
 *
 * Reads the raw bytes of the file at `blobKey` and returns them as a
 * base64-encoded string suitable for embedding directly in a field-mapping
 * binding (e.g., for inclusion in an XML payload via `data.transform`).
 *
 * @param input - Activity input parameters.
 * @returns The base64-encoded file contents.
 */
export async function blobRead(input: BlobReadInput): Promise<BlobReadOutput> {
  const blobStorage = getBlobStorageClient();
  const data = await blobStorage.read(validateBlobFilePath(input.blobKey));
  return { base64: data.toString("base64") };
}
