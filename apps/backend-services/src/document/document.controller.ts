import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { readFile } from "fs/promises";
import { join } from "path";
import { Request } from "express";
import { Roles } from "../auth/roles.decorator";
import { DatabaseService, DocumentData } from "../database/database.service";
import { OcrResult } from "@/generated/client";

@Controller("api")
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get("protected")
  getProtectedData(@Req() req: Request): {
    message: string;
    user: {
      idirUsername?: string;
      displayName?: string;
      email?: string;
    };
  } {
    const user = req.user; // Contains decoded token
    return {
      message: "Protected data",
      user: {
        idirUsername: user?.idir_username,
        displayName: user?.display_name,
        email: user?.email,
      },
    };
  }

  @Get("admin")
  @Roles("admin")
  getAdminData(@Req() req: Request): {
    message: string;
    user: {
      idirUsername?: string;
      displayName?: string;
      email?: string;
      roles: string[];
    };
  } {
    const user = req.user;
    return {
      message: "Admin only data",
      user: {
        idirUsername: user?.idir_username,
        displayName: user?.display_name,
        email: user?.email,
        roles: user?.roles || [],
      },
    };
  }

  @Get("documents")
  @HttpCode(HttpStatus.OK)
  async getAllDocuments(): Promise<DocumentData[]> {
    this.logger.debug("=== DocumentController.getAllDocuments ===");

    try {
      const documents = await this.databaseService.findAllDocuments();

      this.logger.debug(`Retrieved ${documents.length} documents`);
      this.logger.debug("=== DocumentController.getAllDocuments completed ===");

      return documents;
    } catch (error) {
      this.logger.error(`Error retrieving documents: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      throw new NotFoundException(
        error.message || "Failed to retrieve documents",
      );
    }
  }

  @Get("documents/:documentId/ocr")
  @HttpCode(HttpStatus.OK)
  async getOcrResult(
    @Param("documentId") documentId: string,
  ): Promise<OcrResult> {
    this.logger.debug(`=== DocumentController.getOcrResult ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    try {
      // First check if document exists and its status
      const document = await this.databaseService.findDocument(documentId);
      if (document) {
        this.logger.debug(`Document status: ${document.status}`);
        this.logger.debug(`Document created: ${document.created_at}`);
        if (document.apim_request_id) {
          this.logger.debug(`APIM Request ID: ${document.apim_request_id}`);
        }
      } else {
        this.logger.warn(`Document not found: ${documentId}`);
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      const ocrResult = await this.databaseService.findOcrResult(documentId);

      if (!ocrResult) {
        this.logger.warn(`OCR result not found for document: ${documentId}`);
        this.logger.warn(`Document status is: ${document.status}`);
        throw new NotFoundException(
          `OCR result not found for document: ${documentId}. Current status: ${document.status}`,
        );
      }

      this.logger.debug(
        `OCR result retrieved successfully for document: ${documentId}`,
      );
      this.logger.debug(`OCR processed at: ${ocrResult.processed_at}`);
      this.logger.debug("=== DocumentController.getOcrResult completed ===");

      return ocrResult;
    } catch (error) {
      this.logger.error(`Error retrieving OCR result: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new NotFoundException(
        error.message ||
          `Failed to retrieve OCR result for document: ${documentId}`,
      );
    }
  }

  @Get("documents/:documentId/download")
  @HttpCode(HttpStatus.OK)
  async downloadDocument(
    @Param("documentId") documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.debug(`=== DocumentController.downloadDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    try {
      // Find the document
      const document = await this.databaseService.findDocument(documentId);
      if (!document) {
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      // Resolve file path
      let filePath: string;
      if (document.file_path.startsWith("/")) {
        // Absolute path
        filePath = document.file_path;
      } else if (document.file_path.startsWith("storage/documents/")) {
        // Relative path from project root
        filePath = join(process.cwd(), document.file_path);
      } else {
        // Legacy relative path from storage directory
        filePath = join(
          process.cwd(),
          "storage",
          "documents",
          document.file_path,
        );
      }

      // Read file
      const fileBuffer = await readFile(filePath);

      // Set appropriate headers
      const fileName = document.original_filename || `document-${documentId}`;
      const mimeType =
        document.file_type === "pdf"
          ? "application/pdf"
          : document.file_type === "image"
            ? "image/jpeg"
            : "application/octet-stream";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Content-Length", fileBuffer.length);

      this.logger.debug(
        `Serving file: ${filePath} (${fileBuffer.length} bytes)`,
      );
      this.logger.debug(
        "=== DocumentController.downloadDocument completed ===",
      );

      res.send(fileBuffer);
    } catch (error) {
      this.logger.error(`Error downloading document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new NotFoundException(
        error.message || `Failed to download document: ${documentId}`,
      );
    }
  }
}
