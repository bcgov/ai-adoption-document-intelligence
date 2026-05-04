/**
 * Blob storage client for the Temporal worker.
 *
 * Supports MinIO/S3 or Azure Blob Storage, selected via the
 * `BLOB_STORAGE_PROVIDER` environment variable (`minio` | `azure`).
 *
 * All operations use a single bucket/container whose name defaults to
 * `document-blobs` and can be overridden with `MINIO_DOCUMENT_BUCKET`
 * (MinIO) or `AZURE_STORAGE_CONTAINER_NAME` (Azure).
 */

import type { BlobFilePath, BlobPrefixPath } from "@ai-di/blob-storage-paths";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  BlobSASPermissions,
  BlobServiceClient,
  type ContainerClient,
} from "@azure/storage-blob";

/** Minimal blob-storage interface used by Temporal activities. */
export interface BlobStorageClient {
  /** Write `data` to `key`. */
  write(key: BlobFilePath, data: Buffer): Promise<void>;
  /** Read full content of `key`. */
  read(key: BlobFilePath): Promise<Buffer>;
  /** Check whether `key` exists. */
  exists(key: BlobFilePath): Promise<boolean>;
  /** Delete a single object. */
  delete(key: BlobFilePath): Promise<void>;
  /** List all object keys matching a prefix. */
  list(prefix: BlobPrefixPath): Promise<string[]>;
  /** Delete all objects matching a prefix. */
  deleteByPrefix(prefix: BlobPrefixPath): Promise<void>;
  /**
   * Generate a short-lived read-only SAS URL for the given blob key.
   * Only supported when `BLOB_STORAGE_PROVIDER=azure`.
   * @throws {Error} When called against the Minio provider.
   */
  generateSasUrl(key: BlobFilePath, expiryMinutes: number): Promise<string>;
}

// ---------------------------------------------------------------------------
// MinIO / S3 implementation
// ---------------------------------------------------------------------------

function createMinioClient(): { s3: S3Client; bucket: string } {
  const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
  const accessKey = process.env.MINIO_ACCESS_KEY ?? "minioadmin";
  const secretKey = process.env.MINIO_SECRET_KEY ?? "minioadmin";
  const bucket = process.env.MINIO_DOCUMENT_BUCKET ?? "document-blobs";

  const s3 = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });

  return { s3, bucket };
}

function buildMinioClient(): BlobStorageClient {
  const { s3, bucket } = createMinioClient();

  return {
    async write(key: BlobFilePath, data: Buffer): Promise<void> {
      await s3.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }),
      );
    },

    async read(key: BlobFilePath): Promise<Buffer> {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      return Buffer.from(await res.Body!.transformToByteArray());
    },

    async exists(key: BlobFilePath): Promise<boolean> {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },

    async delete(key: BlobFilePath): Promise<void> {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async list(prefix: BlobPrefixPath): Promise<string[]> {
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        const res = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        for (const obj of res.Contents ?? []) {
          if (obj.Key) keys.push(obj.Key);
        }
        continuationToken = res.IsTruncated
          ? res.NextContinuationToken
          : undefined;
      } while (continuationToken);
      return keys;
    },

    async deleteByPrefix(prefix: BlobPrefixPath): Promise<void> {
      const keys = await this.list(prefix);
      if (keys.length === 0) return;
      const batches: string[][] = [];
      for (let i = 0; i < keys.length; i += 1000) {
        batches.push(keys.slice(i, i + 1000));
      }
      for (const batch of batches) {
        await s3.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
              Objects: batch.map((k) => ({ Key: k })),
              Quiet: true,
            },
          }),
        );
      }
    },

    async generateSasUrl(
      _key: BlobFilePath,
      _expiryMinutes: number,
    ): Promise<string> {
      throw new Error("SAS URLs not supported for Minio storage");
    },
  };
}

// ---------------------------------------------------------------------------
// Azure Blob Storage implementation
// ---------------------------------------------------------------------------

function createAzureContainerClient(): ContainerClient {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING is required when BLOB_STORAGE_PROVIDER=azure",
    );
  }
  const containerName =
    process.env.AZURE_STORAGE_CONTAINER_NAME ?? "document-blobs";
  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  return blobServiceClient.getContainerClient(containerName);
}

function buildAzureClient(): BlobStorageClient {
  const container = createAzureContainerClient();

  return {
    async write(key: BlobFilePath, data: Buffer): Promise<void> {
      const blockBlob = container.getBlockBlobClient(key);
      await blockBlob.upload(data, data.length);
    },

    async read(key: BlobFilePath): Promise<Buffer> {
      const blobClient = container.getBlobClient(key);
      return blobClient.downloadToBuffer();
    },

    async exists(key: BlobFilePath): Promise<boolean> {
      return container.getBlobClient(key).exists();
    },

    async delete(key: BlobFilePath): Promise<void> {
      await container.getBlobClient(key).deleteIfExists();
    },

    async list(prefix: BlobPrefixPath): Promise<string[]> {
      const keys: string[] = [];
      for await (const blob of container.listBlobsFlat({ prefix })) {
        keys.push(blob.name);
      }
      return keys;
    },

    async deleteByPrefix(prefix: BlobPrefixPath): Promise<void> {
      const keys = await this.list(prefix);
      await Promise.all(
        keys.map((k) => container.getBlobClient(k).deleteIfExists()),
      );
    },

    async generateSasUrl(
      key: BlobFilePath,
      expiryMinutes: number,
    ): Promise<string> {
      const blockBlobClient = container.getBlockBlobClient(key);
      const expiresOn = new Date(Date.now() + expiryMinutes * 60 * 1000);
      return blockBlobClient.generateSasUrl({
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton factory
// ---------------------------------------------------------------------------

let _instance: BlobStorageClient | undefined;

/**
 * Returns a singleton `BlobStorageClient` configured by environment variables.
 *
 * `BLOB_STORAGE_PROVIDER` selects the backend:
 * - `minio` (default) — uses `@aws-sdk/client-s3`
 * - `azure` — uses `@azure/storage-blob`
 */
export function getBlobStorageClient(): BlobStorageClient {
  if (!_instance) {
    const provider = (
      process.env.BLOB_STORAGE_PROVIDER ?? "minio"
    ).toLowerCase();
    if (provider === "azure") {
      _instance = buildAzureClient();
    } else {
      _instance = buildMinioClient();
    }
  }
  return _instance;
}
