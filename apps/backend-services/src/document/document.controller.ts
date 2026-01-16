import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { readFile } from "fs/promises";
import { join } from "path";
import { ApiKeyAuth, KeycloakSSOAuth } from "@/decorators/customAuthDecorators";
import { DocumentDataDto } from "@/document/dto/document-data.dto";
import { OcrResult } from "@/generated/client";
import { Roles } from "../auth/roles.decorator";
import { DatabaseService, DocumentData } from "../database/database.service";
import { AdminDataResponseDto } from "./dto/admin-data-response.dto";
import { OcrResultResponseDto } from "./dto/ocr-result-response.dto";
import { ProtectedDataResponseDto } from "./dto/protected-data-response.dto";

@ApiTags("Documents")
@Controller("api")
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get("protected")
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get protected data for the authenticated user" })
  @ApiOkResponse({
    description: "Returns protected data and user info",
    type: ProtectedDataResponseDto,
  })
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
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get admin-only data for users with admin role" })
  @ApiOkResponse({
    description: "Returns admin data and user info",
    type: AdminDataResponseDto,
  })
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
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get all documents" })
  @ApiOkResponse({
    description: "Returns a list of all documents",
    type: [DocumentDataDto],
  })
  async getAllDocuments(): Promise<DocumentDataDto[]> {
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
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get OCR result for a document by ID" })
  @ApiOkResponse({
    description: "Returns OCR result and document info",
    type: OcrResultResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document or OCR result not found" })
  async getOcrResult(
    @Param("documentId") documentId: string,
  ): Promise<OcrResultResponseDto> {
    this.logger.debug(`=== DocumentController.getOcrResult ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    try {
      // First check if document exists and its status
      const document = await this.databaseService.findDocument(documentId);
      if (!document) {
        this.logger.warn(`Document not found: ${documentId}`);
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      this.logger.debug(`Document status: ${document.status}`);
      this.logger.debug(`Document created: ${document.created_at}`);
      if (document.apim_request_id) {
        this.logger.debug(`APIM Request ID: ${document.apim_request_id}`);
      }

      const ocrResult = await this.databaseService.findOcrResult(documentId);

      // Return consistent structure with document info and ocr_result
      const response = {
        document_id: document.id,
        status: document.status,
        title: document.title,
        original_filename: document.original_filename,
        file_type: document.file_type,
        file_size: document.file_size,
        created_at: document.created_at,
        updated_at: document.updated_at,
        apim_request_id: document.apim_request_id,
        model_id: document.model_id,
        ocr_result: ocrResult,
      };

      if (!ocrResult) {
        this.logger.debug(
          `OCR result not found for document: ${documentId}, returning document status with ocr_result: null`,
        );
        this.logger.debug(`Document status is: ${document.status}`);
      } else {
        this.logger.debug(
          `OCR result retrieved successfully for document: ${documentId}`,
        );
        this.logger.debug(`OCR processed at: ${ocrResult.processed_at}`);
      }

      this.logger.debug("=== DocumentController.getOcrResult completed ===");
      return response;
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
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Download a document file by ID" })
  @ApiOkResponse({
    description: "Returns the document file buffer as a download",
  })
  @ApiNotFoundResponse({ description: "Document not found or file missing" })
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

      // Resolve stored relative path to absolute (we only store relative paths)
      const filePath = join(process.cwd(), document.file_path);

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
