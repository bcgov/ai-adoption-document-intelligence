/**
 * Local Blob Storage Service
 *
 * Implements blob storage using the local filesystem.
 * Provides read/write/exists/delete operations with key-based access.
 * Keys map to file paths under a configurable base directory.
 *
 * See docs/DAG_WORKFLOW_ENGINE.md Section 13.3
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Abstract interface for blob storage operations.
 * Implementations can target local filesystem, Azure Blob, S3, etc.
 */
export interface BlobStorageInterface {
  write(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

@Injectable()
export class LocalBlobStorageService implements BlobStorageInterface {
  private readonly logger = new Logger(LocalBlobStorageService.name);
  private readonly basePath: string;

  constructor(private configService: ConfigService) {
    this.basePath = this.configService.get<string>(
      "LOCAL_BLOB_STORAGE_PATH",
      "./data/blobs",
    );
    this.logger.log(`Local blob storage initialized at: ${this.basePath}`);
  }

  /**
   * Write data to a blob key, creating intermediate directories as needed.
   */
  async write(key: string, data: Buffer): Promise<void> {
    const filePath = this.resolveKeyToPath(key);
    const dirPath = path.dirname(filePath);

    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, data);

    this.logger.debug(`Wrote blob: ${key} (${data.length} bytes)`);
  }

  /**
   * Read data from a blob key.
   * Throws a descriptive error if the key does not exist.
   */
  async read(key: string): Promise<Buffer> {
    const filePath = this.resolveKeyToPath(key);

    try {
      const data = await fs.readFile(filePath);
      this.logger.debug(`Read blob: ${key} (${data.length} bytes)`);
      return data;
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error(
          `Blob not found: "${key}" does not exist at path "${filePath}"`,
        );
      }
      throw error;
    }
  }

  /**
   * Check whether a blob key exists.
   */
  async exists(key: string): Promise<boolean> {
    const filePath = this.resolveKeyToPath(key);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a blob key. No error if the key does not exist.
   */
  async delete(key: string): Promise<void> {
    const filePath = this.resolveKeyToPath(key);

    try {
      await fs.unlink(filePath);
      this.logger.debug(`Deleted blob: ${key}`);
    } catch (error: unknown) {
      if (isNodeError(error) && error.code === "ENOENT") {
        // File already doesn't exist - not an error
        return;
      }
      throw error;
    }
  }

  /**
   * Resolve a blob key to an absolute filesystem path.
   */
  private resolveKeyToPath(key: string): string {
    // Prevent path traversal attacks
    const normalized = path.normalize(key);
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
      throw new Error(
        `Invalid blob key: "${key}" - path traversal not allowed`,
      );
    }

    return path.join(this.basePath, normalized);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
