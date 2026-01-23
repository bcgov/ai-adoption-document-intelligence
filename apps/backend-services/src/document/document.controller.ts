import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Response } from "express";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { DocumentDataDto } from "@/document/dto/document-data.dto";
import { DatabaseService } from "../database/database.service";
import { OcrResultResponseDto } from "./dto/ocr-result-response.dto";

@ApiTags("Documents")
@Controller("api/documents")
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
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

  @Get("/:documentId/ocr")
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

  @Get("/:documentId/download")
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
