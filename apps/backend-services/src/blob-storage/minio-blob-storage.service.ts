/**
 * MinIO Blob Storage Service
 *
 * Implements blob storage using MinIO (S3-compatible object storage).
 * Provides read/write/exists/delete operations with key-based access.
 * Keys map to object keys within a configured bucket.
 *
 * See feature-docs/003-benchmarking-system/REQUIREMENTS.md Section 8.2
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BlobStorageInterface } from "./local-blob-storage.service";

@Injectable()
export class MinioBlobStorageService implements BlobStorageInterface {
  private readonly logger = new Logger(MinioBlobStorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    const endpoint = this.configService.get<string>(
      "MINIO_ENDPOINT",
      "http://localhost:9000",
    );
    const accessKeyId = this.configService.get<string>(
      "MINIO_ACCESS_KEY",
      "minioadmin",
    );
    const secretAccessKey = this.configService.get<string>(
      "MINIO_SECRET_KEY",
      "minioadmin",
    );
    this.bucket = this.configService.get<string>(
      "MINIO_BUCKET",
      "benchmark-datasets",
    );

    this.s3Client = new S3Client({
      endpoint,
      region: "us-east-1", // MinIO requires a region, but it's not used
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.logger.log(
      `MinIO blob storage initialized: endpoint=${endpoint}, bucket=${this.bucket}`,
    );
  }

  /**
   * Write data to a blob key.
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
    } catch (error) {
      this.logger.error(`Failed to write blob: ${key}`, error.stack);
      throw new Error(`Failed to write blob "${key}": ${error.message}`);
    }
  }

  /**
   * Read data from a blob key.
   * Throws a descriptive error if the key does not exist.
   */
  async read(key: string): Promise<Buffer> {
    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      this.logger.debug(`Read blob: ${key} (${data.length} bytes)`);
      return data;
    } catch (error) {
      if (
        error.name === "NoSuchKey" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        throw new Error(
          `Blob not found: "${key}" does not exist in bucket "${this.bucket}"`,
        );
      }
      this.logger.error(`Failed to read blob: ${key}`, error.stack);
      throw new Error(`Failed to read blob "${key}": ${error.message}`);
    }
  }

  /**
   * Check whether a blob key exists.
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
    } catch (error) {
      if (
        error.name === "NotFound" ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      this.logger.error(`Failed to check blob existence: ${key}`, error.stack);
      throw new Error(
        `Failed to check blob existence "${key}": ${error.message}`,
      );
    }
  }

  /**
   * Delete a blob key. No error if the key does not exist.
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
    } catch (error) {
      // S3 DeleteObject doesn't error on non-existent keys
      this.logger.error(`Failed to delete blob: ${key}`, error.stack);
      throw new Error(`Failed to delete blob "${key}": ${error.message}`);
    }
  }
}
