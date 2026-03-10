/**
 * Blob Storage Interface
 *
 * Defines the contract for blob storage operations.
 * Implementations target MinIO (S3-compatible) or Azure Blob Storage,
 * selected at runtime via the BLOB_STORAGE_PROVIDER environment variable.
 *
 * All operations use flat string keys (e.g. "documents/{id}/original.pdf").
 */

/**
 * Configuration for MinIO blob storage provider.
 */
export interface MinioBlobStorageConfig {
  provider: "minio";
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
}

/**
 * Configuration for Azure blob storage provider.
 */
export interface AzureBlobStorageConfig {
  provider: "azure";
  connectionString: string;
  containerName: string;
}

/**
 * Union of all supported blob storage configurations.
 */
export type BlobStorageConfig = MinioBlobStorageConfig | AzureBlobStorageConfig;

/**
 * Abstract interface for blob storage operations.
 * Implementations can target MinIO (S3-compatible) or Azure Blob Storage.
 */
export interface BlobStorageInterface {
  /**
   * Write data to a blob key, creating intermediate paths as needed.
   * @param key - The blob key (e.g. "documents/{id}/original.pdf")
   * @param data - The file content as a Buffer
   */
  write(key: string, data: Buffer): Promise<void>;

  /**
   * Read data from a blob key.
   * @param key - The blob key
   * @returns The file content as a Buffer
   * @throws Error if the key does not exist
   */
  read(key: string): Promise<Buffer>;

  /**
   * Check whether a blob key exists.
   * @param key - The blob key
   * @returns true if the key exists, false otherwise
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a blob key. No error if the key does not exist.
   * @param key - The blob key
   */
  delete(key: string): Promise<void>;

  /**
   * List all blob keys matching a given prefix.
   * @param prefix - The key prefix to filter by (e.g. "documents/{id}/")
   * @returns Array of matching blob keys
   */
  list(prefix: string): Promise<string[]>;

  /**
   * Delete all blobs matching a given prefix.
   * @param prefix - The key prefix to match for deletion
   */
  deleteByPrefix(prefix: string): Promise<void>;
}

/**
 * NestJS injection token for the blob storage provider.
 */
export const BLOB_STORAGE = Symbol("BLOB_STORAGE");
