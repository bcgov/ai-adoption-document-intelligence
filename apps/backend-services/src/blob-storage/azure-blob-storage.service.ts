/**
 * Azure Blob Storage Service
 *
 * Implements blob storage using Azure Blob Storage as the primary storage provider.
 * Provides read/write/exists/delete/list/deleteByPrefix operations with key-based access.
 * Keys map to blob names within a configured container.
 */

import {
  BlobServiceClient,
  ContainerClient,
} from "@azure/storage-blob";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AzureBlobStorageConfig,
  BlobStorageInterface,
} from "./blob-storage.interface";

/**
 * Creates a configured ContainerClient for Azure Blob Storage.
 * Extracted for reuse by non-NestJS consumers (e.g. Temporal workers).
 * @param config - Azure connection configuration
 * @returns A configured ContainerClient instance
 */
export function createAzureContainerClient(
  config: AzureBlobStorageConfig,
): ContainerClient {
  const blobServiceClient = BlobServiceClient.fromConnectionString(
    config.connectionString,
  );
  return blobServiceClient.getContainerClient(config.containerName);
}

@Injectable()
export class AzureBlobStorageService implements BlobStorageInterface {
  private readonly logger = new Logger(AzureBlobStorageService.name);
  private readonly containerClient: ContainerClient;
  private readonly containerName: string;

  constructor(private configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      "AZURE_STORAGE_CONNECTION_STRING",
    );

    if (!connectionString) {
      this.logger.warn(
        "AZURE_STORAGE_CONNECTION_STRING not configured. Azure blob storage features will not work.",
      );
      return;
    }

    this.containerName = this.configService.get<string>(
      "AZURE_STORAGE_CONTAINER_NAME",
      "document-blobs",
    );

    const config: AzureBlobStorageConfig = {
      provider: "azure",
      connectionString,
      containerName: this.containerName,
    };

    this.containerClient = createAzureContainerClient(config);
    this.logger.log(
      `Azure blob storage initialized: container=${this.containerName}`,
    );
  }

  /**
   * Write data to a blob key.
   * @param key - The blob name within the container
   * @param data - The content to store
   */
  async write(key: string, data: Buffer): Promise<void> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(key);
      await blockBlobClient.uploadData(data);
      this.logger.debug(`Wrote blob: ${key} (${data.length} bytes)`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to write blob: ${key}`, err.stack);
      throw new Error(`Failed to write blob "${key}": ${err.message}`);
    }
  }

  /**
   * Read data from a blob key.
   * @param key - The blob name
   * @returns The stored content as a Buffer
   * @throws Error if the key does not exist
   */
  async read(key: string): Promise<Buffer> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(key);
      const downloadResponse = await blockBlobClient.download();

      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody as AsyncIterable<Buffer>) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      this.logger.debug(`Read blob: ${key} (${data.length} bytes)`);
      return data;
    } catch (error: unknown) {
      const err = error as Error & { statusCode?: number };
      if (err.statusCode === 404) {
        throw new Error(
          `Blob not found: "${key}" does not exist in container "${this.containerName}"`,
        );
      }
      this.logger.error(`Failed to read blob: ${key}`, err.stack);
      throw new Error(`Failed to read blob "${key}": ${err.message}`);
    }
  }

  /**
   * Check whether a blob key exists.
   * @param key - The blob name
   * @returns true if the blob exists in the container
   */
  async exists(key: string): Promise<boolean> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(key);
      return await blockBlobClient.exists();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to check blob existence: ${key}`, err.stack);
      throw new Error(
        `Failed to check blob existence "${key}": ${err.message}`,
      );
    }
  }

  /**
   * Delete a blob key. No error if the key does not exist.
   * @param key - The blob name to delete
   */
  async delete(key: string): Promise<void> {
    try {
      const blockBlobClient = this.containerClient.getBlockBlobClient(key);
      await blockBlobClient.deleteIfExists();
      this.logger.debug(`Deleted blob: ${key}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to delete blob: ${key}`, err.stack);
      throw new Error(`Failed to delete blob "${key}": ${err.message}`);
    }
  }

  /**
   * List all blob keys matching a given prefix.
   * @param prefix - The blob name prefix to filter by
   * @returns Array of matching blob names
   */
  async list(prefix: string): Promise<string[]> {
    try {
      const keys: string[] = [];

      for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
        keys.push(blob.name);
      }

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
   * @param prefix - The blob name prefix to match for deletion
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    let deleted = 0;

    for await (const blob of this.containerClient.listBlobsFlat({ prefix })) {
      await this.containerClient.deleteBlob(blob.name);
      deleted += 1;
    }

    this.logger.debug(
      `Deleted ${deleted} blobs with prefix "${prefix}"`,
    );
  }
}
