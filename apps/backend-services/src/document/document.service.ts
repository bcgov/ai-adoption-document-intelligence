import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { v4 as uuidv4 } from "uuid";
import { DatabaseService, DocumentData } from "../database/database.service";
import { JsonValue } from "../generated/internal/prismaNamespace";
import { DocumentStatus } from "@/generated/enums";
import { SaveDetails } from "@/document/interfaces/saveDetails";

export interface UploadedDocument {
  id: string;
  title: string;
  original_filename: string;
  file_path: string;
  file_type: string;
  file_size: number;
  metadata?: Record<string, unknown>;
  source: string;
  status: DocumentStatus;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);
  private readonly storagePath: string;

  constructor(
    private databaseService: DatabaseService,
    private configService: ConfigService,
  ) {
    this.storagePath =
      this.configService.get<string>("STORAGE_PATH") ||
      join(process.cwd(), "storage", "documents");
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

  private generateFileName(originalFilename: string): string {
    const originalName = originalFilename.slice(
      0,
      originalFilename.lastIndexOf("."),
    );
    const extension =
      originalFilename.lastIndexOf(".") > -1
        ? originalFilename.slice(originalFilename.lastIndexOf("."))
        : "";
    const uuid = uuidv4();
    const sanitizedOriginal = originalName
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .substring(0, 50);
    return `${uuid}_${sanitizedOriginal}${extension}`;
  }

  async addDocument(
    title: string,
    file: Express.Multer.File,
    saveDetails: SaveDetails,
    metadata?: Record<string, unknown>,
  ): Promise<UploadedDocument> {
    this.logger.debug("=== DocumentService.addDocument ===");
    this.logger.debug(
      `Title: ${title}, FileType: ${file.mimetype}, OriginalFilename: ${file.originalname}`,
    );

    try {
      this.logger.debug(`Decoded file size: ${file.size} bytes`);

      // Store metadata in database
      const documentData: Omit<
        DocumentData,
        "id" | "created_at" | "updated_at"
      > = {
        title,
        original_filename: file.originalname,
        file_path: saveDetails.filePath,
        file_type: file.mimetype,
        file_size: file.size,
        metadata: (metadata || {}) as JsonValue,
        source: "api",
        status: DocumentStatus.pre_ocr,
        apim_request_id: null,
      };

      const savedDocument =
        await this.databaseService.createDocument(documentData);
      this.logger.debug(`Document saved to database: ${savedDocument.id}`);

      const result: UploadedDocument = {
        id: savedDocument.id!,
        title: savedDocument.title,
        original_filename: savedDocument.original_filename,
        file_path: savedDocument.file_path,
        file_type: savedDocument.file_type,
        file_size: savedDocument.file_size,
        metadata: savedDocument.metadata as Record<string, unknown>,
        source: savedDocument.source,
        status: savedDocument.status,
        created_at: savedDocument.created_at || new Date(),
        updated_at: savedDocument.updated_at || new Date(),
      };

      this.logger.debug("=== DocumentService.addDocument completed ===");
      return result;
    } catch (error) {
      this.logger.error(`Error uploading document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);
      throw error;
    }
  }

  async saveDocumentFile(file: Express.Multer.File): Promise<SaveDetails> {
    // Generate unique filename and path
    const fileName = uuidv4();
    const filePath = join(this.storagePath, fileName);
    // Ensure storage directory exists
    await this.ensureStorageDirectory();

    // Save file to filesystem
    await writeFile(filePath, file.buffer);
    this.logger.debug(`File saved to: ${filePath}`);
    return {
      filePath,
    };
  }

  async getDocument(id: string): Promise<UploadedDocument | null> {
    this.logger.debug(`DocumentService.getDocument: ${id}`);
    const document = await this.databaseService.findDocument(id);
    if (!document) {
      return null;
    }

    return {
      id: document.id!,
      title: document.title,
      original_filename: document.original_filename,
      file_path: document.file_path,
      file_type: document.file_type,
      file_size: document.file_size,
      metadata: document.metadata as Record<string, unknown>,
      source: document.source,
      status: document.status,
      created_at: document.created_at || new Date(),
      updated_at: document.updated_at || new Date(),
    };
  }
}
