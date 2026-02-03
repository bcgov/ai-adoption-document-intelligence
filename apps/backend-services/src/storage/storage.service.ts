import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, promises as fs } from 'fs';
import { mkdir, writeFile } from "fs/promises";
import * as path from 'path';

export interface StorageOptions {
  basePath?: string;
}


// TODO: Replace this with some non-local storage.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private storagePath: string;

  constructor(
    private configService: ConfigService,
    options?: StorageOptions) {
    this.storagePath = this.configService.get<string>("STORAGE_PATH") ||
      path.join(process.cwd(), "storage", "documents");
    this.ensureStorageDirectory();
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      if (!existsSync(this.storagePath)) {
        await mkdir(this.storagePath, { recursive: true });
        this.logger.log(`Created storage directory: ${this.storagePath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to create storage directory: ${error.message}`);
      throw error;
    }
  }

  async saveFile(relativePath: string, buffer: Buffer): Promise<string> {
    const fullPath = path.join(this.storagePath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return fullPath;
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const fullPath = path.join(this.storagePath, relativePath);
    return fs.readFile(fullPath);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.storagePath, relativePath);
    await fs.unlink(fullPath);
  }
}
