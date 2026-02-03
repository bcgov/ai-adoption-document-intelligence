import { DocumentStatus } from "@generated/client";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
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
import { DatabaseService, DocumentData } from "../database/database.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { ApproveDocumentDto } from "./dto/approve-document.dto";
import { OcrResultResponseDto } from "./dto/ocr-result-response.dto";

@ApiTags("Documents")
@Controller("api/documents")
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly temporalClientService: TemporalClientService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get all documents" })
  @ApiOkResponse({
    description: "Returns a list of all documents",
    type: [DocumentDataDto],
  })
  async getAllDocuments(): Promise<
    (DocumentData & { needsReview?: boolean })[]
  > {
    this.logger.debug("=== DocumentController.getAllDocuments ===");

    try {
      const documents = await this.databaseService.findAllDocuments();

      // Check workflow status for documents that have workflow_execution_id
      const documentsWithWorkflowStatus = await Promise.all(
        documents.map(async (doc) => {
          // Check workflow status for documents with execution ID and status ongoing_ocr or completed_ocr
          // (completed_ocr documents may be awaiting review if OCR results were stored before human review)
          if (
            doc.workflow_execution_id &&
            (doc.status === "ongoing_ocr" || doc.status === "completed_ocr")
          ) {
            try {
              // Use workflow_execution_id directly (it's the Temporal workflow execution ID)
              const workflowId = doc.workflow_execution_id;
              const workflowQueryStatus =
                await this.temporalClientService.queryWorkflowStatus(
                  workflowId,
                );

              // If workflow is awaiting review, mark document as needing review
              if (workflowQueryStatus.status === "awaiting_review") {
                this.logger.debug(
                  `Document ${doc.id} workflow is awaiting review`,
                );
                return {
                  ...doc,
                  // Override status for UI - needs_validation is not a valid DocumentStatus enum value but used for UI display
                  status: "needs_validation" as DocumentStatus,
                  needsReview: true,
                };
              }
            } catch (error) {
              // If workflow query fails, log but don't fail the entire request
              // This can happen if workflow is not found, completed, or Temporal is unavailable
              this.logger.debug(
                `Could not query workflow status for document ${doc.id}: ${error.message}`,
              );
            }
          }
          return doc;
        }),
      );

      this.logger.debug(`Retrieved ${documents.length} documents`);
      this.logger.debug("=== DocumentController.getAllDocuments completed ===");

      return documentsWithWorkflowStatus;
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

  @Post("/:documentId/approve")
  @HttpCode(HttpStatus.OK)
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Approve or reject a document",
    description:
      "Sends a human approval signal to the document's workflow. When rejecting, rejectionReason is required.",
  })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiBody({
    type: ApproveDocumentDto,
    description:
      "Approval decision and optional reviewer info, comments, rejection reason, annotations",
  })
  @ApiOkResponse({
    description: "Approval signal sent successfully",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        message: { type: "string", example: "Document approved successfully" },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      "Invalid request (e.g. rejection without rejectionReason, or document has no workflow execution)",
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  async approveDocument(
    @Param("documentId") documentId: string,
    @Body() body: ApproveDocumentDto,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.debug(`=== DocumentController.approveDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);
    this.logger.debug(`Approved: ${body.approved}`);

    try {
      // Validate rejection reason is provided when rejecting
      if (!body.approved && !body.rejectionReason) {
        throw new BadRequestException(
          "Rejection reason is required when rejecting a document",
        );
      }

      // Find the document
      const document = await this.databaseService.findDocument(documentId);
      if (!document) {
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      // Get workflow execution ID from document
      // Use workflow_execution_id (new field) or fallback to workflow_id (legacy)
      const workflowId = document.workflow_execution_id || document.workflow_id;
      if (!workflowId) {
        throw new BadRequestException(
          `Document ${documentId} does not have an associated workflow execution ID.`,
        );
      }

      // Send human approval signal to the workflow
      await this.temporalClientService.sendHumanApproval(workflowId, {
        approved: body.approved,
        reviewer: body.reviewer,
        comments: body.comments,
        rejectionReason: body.rejectionReason,
        annotations: body.annotations,
      });

      this.logger.log(
        `Human approval signal sent for document ${documentId}: ${body.approved ? "approved" : "rejected"}`,
      );
      if (!body.approved && body.rejectionReason) {
        this.logger.log(`Rejection reason: ${body.rejectionReason}`);
      }
      this.logger.debug("=== DocumentController.approveDocument completed ===");

      return {
        success: true,
        message: `Document ${body.approved ? "approved" : "rejected"} successfully`,
      };
    } catch (error) {
      this.logger.error(`Error approving document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new NotFoundException(
        error.message || `Failed to approve document: ${documentId}`,
      );
    }
  }
}
