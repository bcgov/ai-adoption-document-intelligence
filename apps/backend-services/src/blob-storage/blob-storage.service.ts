import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BlobServiceClient,
  ContainerClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

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
  private readonly logger = new Logger(BlobStorageService.name);
  private blobServiceClient: BlobServiceClient;
  private accountName: string;
  private accountKey: string;

  constructor(private configService: ConfigService) {
    const connectionString = this.configService.get<string>(
      'AZURE_STORAGE_CONNECTION_STRING',
    );
    this.accountName = this.configService.get<string>(
      'AZURE_STORAGE_ACCOUNT_NAME',
    );
    this.accountKey = this.configService.get<string>(
      'AZURE_STORAGE_ACCOUNT_KEY',
    );

    if (!connectionString) {
      this.logger.warn(
        'AZURE_STORAGE_CONNECTION_STRING not configured. Blob storage features will not work.',
      );
      return;
    }

    this.blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    this.logger.log('Blob Storage client initialized');
  }

  /**
   * Ensure a container exists, creating it if necessary
   */
  async ensureContainerExists(containerName: string): Promise<boolean> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);

      try {
        await containerClient.getProperties();
        this.logger.debug(`Container ${containerName} already exists`);
        return false; // Already exists
      } catch (error) {
        // Container doesn't exist, create it
        await containerClient.create();
        this.logger.log(`Created container: ${containerName}`);
        return true; // Created
      }
    } catch (error) {
      this.logger.error(
        `Failed to ensure container exists: ${containerName}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Upload a single file to blob storage
   */
  async uploadFile(
    containerName: string,
    blobName: string,
    content: Buffer | string,
    overwrite = true,
  ): Promise<string> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const buffer = typeof content === 'string' ? Buffer.from(content) : content;

      await blockBlobClient.upload(buffer, buffer.length, { overwrite });

      this.logger.debug(`Uploaded blob: ${blobName} to ${containerName}`);
      return blockBlobClient.url;
    } catch (error) {
      this.logger.error(`Failed to upload blob: ${blobName}`, error.stack);
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
          typeof file.content === 'string'
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
  async generateSasUrl(
    containerName: string,
    expiryDays = 7,
  ): Promise<string> {
    try {
      if (!this.accountName || !this.accountKey) {
        throw new Error('Azure Storage account credentials not configured');
      }

      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);

      const sharedKeyCredential = new StorageSharedKeyCredential(
        this.accountName,
        this.accountKey,
      );

      const expiresOn = new Date();
      expiresOn.setDate(expiresOn.getDate() + expiryDays);

      const permissions = new ContainerSASPermissions();
      permissions.read = true;
      permissions.list = true;

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName,
          permissions,
          expiresOn,
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
   * List all blobs in a container
   */
  async listBlobs(
    containerName: string,
    prefix?: string,
  ): Promise<BlobInfo[]> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      const blobs: BlobInfo[] = [];

      for await (const blob of containerClient.listBlobsFlat({
        prefix,
      })) {
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
    } catch (error) {
      this.logger.error(
        `Failed to list blobs in container: ${containerName}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Delete a container and all its contents
   */
  async deleteContainer(containerName: string): Promise<void> {
    try {
      const containerClient =
        this.blobServiceClient.getContainerClient(containerName);
      await containerClient.delete();
      this.logger.log(`Deleted container: ${containerName}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete container: ${containerName}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get container client for advanced operations
   */
  getContainerClient(containerName: string): ContainerClient {
    return this.blobServiceClient.getContainerClient(containerName);
  }
}
