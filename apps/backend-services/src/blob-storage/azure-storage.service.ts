/**
 * Azure Storage Service
 *
 * Provides Azure Blob Storage operations specifically for Azure Document Intelligence
 * model training. This service always uses Azure Blob Storage regardless of the
 * primary blob storage provider (MinIO or Azure), because Azure DI requires
 * files to be in Azure Blob Storage with SAS URLs for training.
 *
 * Consolidated from the former BlobService and BlobStorageService.
 */

import {
  BlobServiceClient,
  ContainerClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "@/logging/app-logger.service";

/** Result of a single file upload. */
export interface UploadFileResult {
  fileName: string;
  url: string;
  size: number;
}

/** Result of a bulk upload operation. */
export interface UploadResult {
  containerName: string;
  totalFiles: number;
  uploaded: number;
  failed: number;
  uploadedFiles: UploadFileResult[];
  failedFiles: { fileName: string; error: string }[];
}

/** Metadata for a blob in a container. */
export interface BlobInfo {
  name: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

/**
 * NestJS injection token for the Azure storage service.
 */
export const AZURE_STORAGE = Symbol("AZURE_STORAGE");

@Injectable()
export class AzureStorageService {
  private blobServiceClient: BlobServiceClient;
  private accountName: string;
  private accountKey: string;
  private readonly deleteRetryDelayMs = 5000;
  private readonly deleteRetryAttempts = 24;

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    const connectionString = this.configService.get<string>(
      "AZURE_STORAGE_CONNECTION_STRING",
    );
    this.accountName = this.configService.get<string>(
      "AZURE_STORAGE_ACCOUNT_NAME",
    );
    this.accountKey = this.configService.get<string>(
      "AZURE_STORAGE_ACCOUNT_KEY",
    );

    if (!connectionString) {
      this.logger.warn(
        "AZURE_STORAGE_CONNECTION_STRING not configured. Azure storage features will not work.",
      );
      return;
    }

    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    this.logger.log("Azure Storage client initialized");
  }

  /**
   * Ensure a container exists, creating it if necessary.
   * Handles the race condition where a container is being deleted.
   * @param containerName - Name of the container to create or verify
   * @returns true if a new container was created, false if it already existed
   */
  async ensureContainerExists(containerName: string): Promise<boolean> {
    const containerClient =
      this.blobServiceClient.getContainerClient(containerName);

    for (let attempt = 1; attempt <= this.deleteRetryAttempts; attempt += 1) {
      try {
        await containerClient.create();
        this.logger.log(`Created container: ${containerName}`);
        return true;
      } catch (error: unknown) {
        const err = error as Error & {
          statusCode?: number;
          status?: number;
          code?: string;
        };
        const message = err.message || "";
        const statusCode = err.statusCode || err.status;
        const isAlreadyExists =
          statusCode === 409 &&
          (err.code === "ContainerAlreadyExists" ||
            message.includes("ContainerAlreadyExists"));
        const isBeingDeleted =
          statusCode === 409 &&
          (err.code === "ContainerBeingDeleted" ||
            message.includes("being deleted"));

        if (isAlreadyExists) {
          this.logger.debug(`Container ${containerName} already exists`);
          return false;
        }

        if (isBeingDeleted && attempt < this.deleteRetryAttempts) {
          this.logger.warn(
            `Container ${containerName} is being deleted. Retry ${attempt}/${this.deleteRetryAttempts}`,
          );
          await this.delay(this.deleteRetryDelayMs);
          continue;
        }

        this.logger.error(
          `Failed to ensure container exists: ${containerName}`,
          {
            stack: err.stack,
          },
        );
        throw error;
      }
    }

    throw new Error(
      `Failed to ensure container exists after ${this.deleteRetryAttempts} attempts: ${containerName}`,
    );
  }

  /**
   * Upload a single file to blob storage.
   * @param containerName - Target container
   * @param blobName - Name/path of the blob within the container
   * @param content - File content as Buffer or string
   * @returns The URL of the uploaded blob
   */
  async uploadFile(
    containerName: string,
    blobName: string,
    content: Buffer | string,
  ): Promise<string> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const buffer =
        typeof content === "string" ? Buffer.from(content) : content;

      await blockBlobClient.uploadData(buffer);

      this.logger.debug(`Uploaded blob: ${blobName} to ${containerName}`);
      return blockBlobClient.url;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to upload blob: ${blobName}`, {
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Upload multiple files to blob storage.
   * Ensures the container exists before uploading.
   * @param containerName - Target container
   * @param files - Array of files with name and content
   * @returns Summary of upload results including successes and failures
   */
  async uploadFiles(
    containerName: string,
    files: { name: string; content: Buffer | string }[],
  ): Promise<UploadResult> {
    await this.ensureContainerExists(containerName);

    const uploadedFiles: UploadFileResult[] = [];
    const failedFiles: { fileName: string; error: string }[] = [];

    for (const file of files) {
      try {
        const url = await this.uploadFile(
          containerName,
          file.name,
          file.content,
        );
        const buffer =
          typeof file.content === "string"
            ? Buffer.from(file.content)
            : file.content;

        uploadedFiles.push({
          fileName: file.name,
          url,
          size: buffer.length,
        });
      } catch (error: unknown) {
        const err = error as Error;
        failedFiles.push({
          fileName: file.name,
          error: err.message,
        });
      }
    }

    return {
      containerName,
      totalFiles: files.length,
      uploaded: uploadedFiles.length,
      failed: failedFiles.length,
      uploadedFiles,
      failedFiles,
    };
  }

  /**
   * Generate a SAS URL for a container with read and list permissions.
   * Required for Azure Document Intelligence training API.
   * @param containerName - Container to generate SAS for
   * @param expiryDays - Number of days until the SAS expires (default: 7)
   * @returns SAS URL for the container
   */
  async generateSasUrl(containerName: string, expiryDays = 7): Promise<string> {
    try {
      if (!this.accountName || !this.accountKey) {
        throw new Error("Azure Storage account credentials not configured");
      }

      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);

      const sharedKeyCredential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey,
      );

      const startsOn = new Date();
      startsOn.setMinutes(startsOn.getMinutes() - 5);
      const expiresOn = new Date();
      expiresOn.setDate(expiresOn.getDate() + expiryDays);

      const permissions = ContainerSASPermissions.parse("rl");

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          permissions,
          startsOn,
          expiresOn,
          protocol: SASProtocol.Https,
        },
        sharedKeyCredential,
      ).toString();

      const sasUrl = `${containerClient.url}?${sasToken}`;

      this.logger.log(
        `Generated SAS URL for container ${containerName} (expires in ${expiryDays} days)`,
      );

      return sasUrl;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to generate SAS URL for container: ${containerName}`,
        {
          stack: err.stack,
        },
      );
      throw error;
    }
  }

  /**
   * Generate a SAS URL for a specific blob with read permissions.
   * @param containerName - Container holding the blob
   * @param blobName - Name/path of the blob
   * @param expiresInMinutes - Validity duration in minutes (default: 60)
   * @returns SAS URL for the specific blob
   */
  getBlobSasUrl(
    containerName: string,
    blobName: string,
    expiresInMinutes = 60,
  ): string {
    if (!this.accountName || !this.accountKey) {
      throw new Error("Storage account name/key not configured.");
    }
    const sharedKeyCredential = new StorageSharedKeyCredential(
      this.accountName,
      this.accountKey,
    );
    const containerClient =
      this.blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(blobName);
    const expires = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Note: Do not use the now time as the start time of this SAS url.
    // It somehow gets called before the start time somehow.
    const sas = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: ContainerSASPermissions.parse("r"),
        expiresOn: expires,
        protocol: SASProtocol.Https,
      },
      sharedKeyCredential,
    ).toString();
    return `${blobClient.url}?${sas}`;
  }

  /**
   * Validate a container SAS URL by attempting to list blobs.
   * @param sasUrl - The SAS URL to validate
   * @returns Validation result with canList flag and optional blob info
   */
  async validateContainerSasUrl(sasUrl: string): Promise<{
    canList: boolean;
    error?: string;
    blobCount?: number;
    sampleBlobs?: string[];
  }> {
    try {
      const containerClient = new ContainerClient(sasUrl);
      const sampleBlobs: string[] = [];
      let count = 0;

      for await (const blob of containerClient.listBlobsFlat()) {
        count += 1;
        if (sampleBlobs.length < 5) {
          sampleBlobs.push(blob.name);
        }
      }

      return {
        canList: true,
        blobCount: count,
        sampleBlobs,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return {
        canList: false,
        error: err.message,
      };
    }
  }

  /**
   * List all blobs in a container, optionally filtered by prefix.
   * @param containerName - Container to list
   * @param prefix - Optional prefix filter
   * @returns Array of blob metadata
   */
  async listBlobs(containerName: string, prefix?: string): Promise<BlobInfo[]> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      const blobs: BlobInfo[] = [];

      for await (const blob of containerClient.listBlobsFlat({ prefix })) {
        blobs.push({
          name: blob.name,
          size: blob.properties.contentLength || 0,
          lastModified: blob.properties.lastModified,
          contentType: blob.properties.contentType,
        });
      }

      this.logger.debug(
        `Listed ${blobs.length} blobs in container ${containerName}`,
      );
      return blobs;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to list blobs in container: ${containerName}`, {
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Delete a container and all its contents.
   * @param containerName - Container to delete
   */
  async deleteContainer(containerName: string): Promise<void> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      await containerClient.delete();
      this.logger.log(`Deleted container: ${containerName}`);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to delete container: ${containerName}`, {
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Delete a container if it exists. No error if the container does not exist.
   * @param containerName - Container to delete
   * @returns true if the container was deleted, false if it didn't exist
   */
  async deleteContainerIfExists(containerName: string): Promise<boolean> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      const result = await containerClient.deleteIfExists();
      if (result.succeeded) {
        this.logger.log(`Deleted container: ${containerName}`);
      } else {
        this.logger.debug(`Container not found: ${containerName}`);
        return false;
      }
      return true;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(`Failed to delete container: ${containerName}`, {
        stack: err.stack,
      });
      throw error;
    }
  }

  /**
   * Delete all blobs in a container without removing the container itself.
   * @param containerName - Container to clear
   * @returns Number of blobs deleted
   */
  async clearContainerContents(containerName: string): Promise<number> {
    try {
      await this.ensureContainerExists(containerName);
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      let deleted = 0;

      for await (const blob of containerClient.listBlobsFlat()) {
        await containerClient.deleteBlob(blob.name);
        deleted += 1;
      }

      this.logger.log(
        `Cleared ${deleted} blob(s) from container: ${containerName}`,
      );
      return deleted;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to clear container contents: ${containerName}`,
        {
          stack: err.stack,
        },
      );
      throw error;
    }
  }

  /**
   * Delete all blobs with a specific prefix in a container.
   * @param prefix - The prefix of the blobs to delete
   * @param containerName - The container name
   */
  async deleteFilesWithPrefix(
    prefix: string,
    containerName: string,
  ): Promise<void> {
    const containerClient =
      this.blobServiceClient.getContainerClient(containerName);
    let deleted = 0;
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      await containerClient.deleteBlob(blob.name);
      deleted += 1;
    }
    this.logger.log(
      `Deleted ${deleted} blob(s) with prefix '${prefix}' from container '${containerName}'`,
    );
  }

  /**
   * Get a container client for advanced operations.
   * @param containerName - Container name
   * @returns Azure SDK ContainerClient instance
   */
  getContainerClient(containerName: string): ContainerClient {
    return this.blobServiceClient.getContainerClient(containerName);
  }

  async fileExists(containerName, filePath: string): Promise<boolean> {
    const containerClient =
      this.blobServiceClient.getContainerClient(containerName);
      const blobClient = containerClient.getBlobClient(filePath);
      return await blobClient.exists()
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
