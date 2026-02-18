import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { existsSync, promises as fs } from "fs";
import { mkdir, readdir } from "fs/promises";
import * as path from "path";

export enum Operation {
  CLASSIFICATION = "classification",
}

// TODO: Replace this with some non-local storage.
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private storagePath: string;

  constructor(private configService: ConfigService) {
    this.storagePath =
      this.configService.get<string>("STORAGE_PATH") ||
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

  /**
   * Saves an array of files to a target folder in bulk.
   * @param files Array of files (Express.Multer.File[])
   * @param targetFolder Path to the folder where files will be saved
   * @returns Array of saved file paths
   */
  async saveFilesBulk(
    files: Array<Express.Multer.File>,
    targetFolder: string,
  ): Promise<string[]> {
    if (!existsSync(targetFolder)) {
      await mkdir(targetFolder, { recursive: true });
    }
    const savedPaths: string[] = [];
    for (const file of files) {
      const filePath = path.join(
        this.storagePath,
        targetFolder,
        file.originalname,
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, file.buffer);
      savedPaths.push(filePath);
    }
    return savedPaths;
  }

  async readFile(filePath: string): Promise<Buffer> {
    // Normalize both paths for robust comparison
    const normalizedFilePath = path.resolve(filePath);
    const normalizedStoragePath = path.resolve(this.storagePath);
    let fullPath: string;
    if (
      path.isAbsolute(filePath) ||
      normalizedFilePath.startsWith(normalizedStoragePath)
    ) {
      fullPath = normalizedFilePath;
    } else {
      fullPath = path.join(normalizedStoragePath, filePath);
    }
    return fs.readFile(fullPath);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.storagePath, relativePath);
    await fs.unlink(fullPath);
  }

  /**
   * Deletes a folder and all its contents recursively.
   * @param relativeFolderPath Path to the folder to delete (relative to storagePath)
   */
  async deleteFolderRecursive(relativeFolderPath: string): Promise<void> {
    const fullPath = path.join(this.storagePath, relativeFolderPath);
    if (existsSync(fullPath)) {
      await fs.rm(fullPath, { recursive: true, force: true });
      this.logger.log(`Deleted folder and contents: ${fullPath}`);
    } else {
      this.logger.warn(`Folder does not exist: ${fullPath}`);
    }
  }

  /**
   * Recursively get all file paths from a folder
   * @param folderPath Relative or absolute path to the folder
   * @param recurse Whether it should recursively get files from child folders.
   * @returns Array of absolute file paths
   */
  async getAllFilesFromFolder(
    folderPath: string,
    recurse: boolean = false,
  ): Promise<string[]> {
    const dirPath = path.isAbsolute(folderPath)
      ? folderPath
      : path.join(this.storagePath, folderPath);
    const files: string[] = [];
    async function walk(currentPath: string) {
      const entries = await readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory() && recurse) {
          await walk(fullPath);
        } else {
          files.push(fullPath);
        }
      }
    }
    await walk(dirPath);
    return files;
  }

  /**
   * Get all file names and paths from a folder
   * @param folderPath Relative or absolute path to the folder
   * @param recurse Whether it should recursively get files from child folders.
   * @returns Array of { name, path } objects
   */
  async getAllFileNamesAndPaths(
    folderPath: string,
    recurse: boolean = false,
  ): Promise<{ name: string; path: string }[]> {
    const dirPath = path.isAbsolute(folderPath)
      ? folderPath
      : path.join(this.storagePath, folderPath);
    const files: { name: string; path: string }[] = [];
    async function walk(currentPath: string) {
      const entries = await readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory() && recurse) {
          await walk(fullPath);
        } else {
          files.push({ name: entry.name, path: fullPath });
        }
      }
    }
    await walk(dirPath);
    return files;
  }

  getStoragePath(groupId: string, operation: Operation, subpath: string) {
    return path.join(groupId, operation, subpath);
  }
}
