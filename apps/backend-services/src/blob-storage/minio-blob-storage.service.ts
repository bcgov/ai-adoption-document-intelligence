/**
 * MinIO Blob Storage Service
 *
 * Implements blob storage using MinIO (S3-compatible object storage).
 * Provides read/write/exists/delete/list/deleteByPrefix operations with key-based access.
 * Keys map to object keys within a configured bucket.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  BlobStorageInterface,
  MinioBlobStorageConfig,
} from "./blob-storage.interface";

/**
 * Creates a configured S3Client for MinIO.
 * Extracted for reuse by non-NestJS consumers (e.g. Temporal workers).
 * @param config - MinIO connection configuration
 * @returns A configured S3Client instance
 */
export function createMinioS3Client(config: MinioBlobStorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });
}

@Injectable()
export class MinioBlobStorageService implements BlobStorageInterface {
  private readonly logger = new Logger(MinioBlobStorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    const config: MinioBlobStorageConfig = {
      provider: "minio",
      endpoint: this.configService.get<string>(
        "MINIO_ENDPOINT",
        "http://localhost:9000",
      ),
      accessKey: this.configService.get<string>(
        "MINIO_ACCESS_KEY",
        "minioadmin",
      ),
      secretKey: this.configService.get<string>(
        "MINIO_SECRET_KEY",
        "minioadmin",
      ),
      bucket: this.configService.get<string>(
        "MINIO_DOCUMENT_BUCKET",
        "document-blobs",
      ),
    };

    this.bucket = config.bucket;
    this.s3Client = createMinioS3Client(config);

    this.logger.log(
      `MinIO blob storage initialized: endpoint=${config.endpoint}, bucket=${this.bucket}`,
    );
  }

  /**
   * Write data to a blob key.
   * @param key - The object key within the bucket
   * @param data - The content to store
   */
  async write(key: string, data: Buffer): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: data,
        }),
      );

      this.logger.debug(`Wrote blob: ${key} (${data.length} bytes)`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to write blob: ${key}`, err.stack);
      throw new Error(`Failed to write blob "${key}": ${err.message}`);
    }
  }

  /**
   * Read data from a blob key.
   * @param key - The object key
   * @returns The stored content as a Buffer
   * @throws Error if the key does not exist
   */
  async read(key: string): Promise<Buffer> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      this.logger.debug(`Read blob: ${key} (${data.length} bytes)`);
      return data;
    } catch (error: unknown) {
      const err = error as Error & {
        name: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        err.name === "NoSuchKey" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        throw new Error(
          `Blob not found: "${key}" does not exist in bucket "${this.bucket}"`,
        );
      }
      this.logger.error(`Failed to read blob: ${key}`, err.stack);
      throw new Error(`Failed to read blob "${key}": ${err.message}`);
    }
  }

  /**
   * Check whether a blob key exists.
   * @param key - The object key
   * @returns true if the key exists in the bucket
   */
  async exists(key: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error: unknown) {
      const err = error as Error & {
        name: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        err.name === "NotFound" ||
        err.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      this.logger.error(`Failed to check blob existence: ${key}`, err.stack);
      throw new Error(
        `Failed to check blob existence "${key}": ${err.message}`,
      );
    }
  }

  /**
   * Delete a blob key. No error if the key does not exist.
   * @param key - The object key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      this.logger.debug(`Deleted blob: ${key}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to delete blob: ${key}`, err.stack);
      throw new Error(`Failed to delete blob "${key}": ${err.message}`);
    }
  }

  /**
   * List all blob keys matching a given prefix.
   * @param prefix - The key prefix to filter by
   * @returns Array of matching blob keys
   */
  async list(prefix: string): Promise<string[]> {
    try {
      const keys: string[] = [];
      let continuationToken: string | undefined;

      do {
        const response = await this.s3Client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );

        if (response.Contents) {
          for (const obj of response.Contents) {
            if (obj.Key) {
              keys.push(obj.Key);
            }
          }
        }

        continuationToken = response.IsTruncated
          ? response.NextContinuationToken
          : undefined;
      } while (continuationToken);

      this.logger.debug(
        `Listed ${keys.length} blobs with prefix "${prefix}"`,
      );
      return keys;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to list blobs with prefix "${prefix}"`,
        err.stack,
      );
      throw new Error(
        `Failed to list blobs with prefix "${prefix}": ${err.message}`,
      );
    }
  }

  /**
   * Delete all blobs matching a given prefix.
   * @param prefix - The key prefix to match for deletion
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    const keys = await this.list(prefix);

    for (const key of keys) {
      await this.delete(key);
    }

    this.logger.debug(
      `Deleted ${keys.length} blobs with prefix "${prefix}"`,
    );
  }
}
