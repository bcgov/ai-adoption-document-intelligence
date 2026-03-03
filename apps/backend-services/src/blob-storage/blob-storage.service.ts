import {
  BlobServiceClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  SASProtocol,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "@/logging/app-logger.service";

export interface UploadFileResult {
  fileName: string;
  url: string;
  size: number;
}

export interface UploadResult {
  containerName: string;
  totalFiles: number;
  uploaded: number;
  failed: number;
  uploadedFiles: UploadFileResult[];
  failedFiles: { fileName: string; error: string }[];
}

export interface BlobInfo {
  name: string;
  size: number;
  lastModified: Date;
  contentType?: string;
}

@Injectable()
export class BlobStorageService {
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
        "AZURE_STORAGE_CONNECTION_STRING not configured. Blob storage features will not work.",
      );
      return;
    }

    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    this.logger.log("Blob Storage client initialized");
  }

  /**
   * Ensure a container exists, creating it if necessary
   */
  async ensureContainerExists(containerName: string): Promise<boolean> {
    const containerClient =
      this.blobServiceClient.getContainerClient(containerName);

    for (let attempt = 1; attempt <= this.deleteRetryAttempts; attempt += 1) {
      try {
        // Try to create directly; this is the reliable signal for reuse.
        await containerClient.create();
        this.logger.log(`Created container: ${containerName}`);
        return true;
      } catch (error) {
        const message = error.message || "";
        const statusCode = error.statusCode || error.status;
        const isAlreadyExists =
          statusCode === 409 &&
          (error.code === "ContainerAlreadyExists" ||
            message.includes("ContainerAlreadyExists"));
        const isBeingDeleted =
          statusCode === 409 &&
          (error.code === "ContainerBeingDeleted" ||
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
          error.stack,
        );
        throw error;
      }
    }

    throw new Error(
      `Failed to ensure container exists after ${this.deleteRetryAttempts} attempts: ${containerName}`,
    );
  }

  /**
   * Upload a single file to blob storage
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
    } catch (error) {
      this.logger.error(`Failed to upload blob: ${blobName}`, {
        stack: error instanceof Error ? error.stack : String(error),
      });
      throw error;
    }
  }

  /**
   * Upload multiple files to blob storage
   */
  async uploadFiles(
    containerName: string,
    files: { name: string; content: Buffer | string }[],
  ): Promise<UploadResult> {
    // Ensure container exists
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
      } catch (error) {
        failedFiles.push({
          fileName: file.name,
          error: error.message,
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
   * Generate a SAS URL for a container with read and list permissions
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
    } catch (error) {
      this.logger.error(
        `Failed to generate SAS URL for container: ${containerName}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete all blobs in a container without removing the container itself.
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
    } catch (error) {
      this.logger.error(
        `Failed to clear container contents: ${containerName}`,
        error.stack,
      );
      throw error;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
