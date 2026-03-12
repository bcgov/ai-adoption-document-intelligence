import { DocumentStatus, Prisma } from "@generated/client";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { AuditService } from "@/audit/audit.service";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import {
  ApiKeyAuth,
  KeycloakSSOAuth,
} from "@/decorators/custom-auth-decorators";
import { DocumentDataDto } from "@/document/dto/document-data.dto";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DatabaseService, DocumentData } from "../database/database.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { ApproveDocumentDto } from "./dto/approve-document.dto";
import { OcrResultResponseDto } from "./dto/ocr-result-response.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";

@ApiTags("Documents")
@Controller("api/documents")
export class DocumentController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly temporalClientService: TemporalClientService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
  ) {}

  @Get("/:documentId")
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get a document by ID" })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiOkResponse({
    description: "Returns the document",
    type: DocumentDataDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getDocument(
    @Param("documentId") documentId: string,
    @Req() req: Request,
  ): Promise<DocumentData> {
    this.logger.debug(`=== DocumentController.getDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    const document = await this.databaseService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    await identityCanAccessGroup(
      req.resolvedIdentity,
      document.group_id,
      this.databaseService,
    );

    await this.auditService.recordEvent({
      event_type: "document_accessed",
      resource_type: "document",
      resource_id: documentId,
      actor_id: req.resolvedIdentity?.userId,
      document_id: documentId,
      group_id: document.group_id ?? undefined,
      payload: { action: "metadata" },
    });

    this.logger.debug("=== DocumentController.getDocument completed ===");
    return document;
  }

  @Patch("/:documentId")
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Update a document" })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiBody({ type: UpdateDocumentDto })
  @ApiOkResponse({
    description: "Returns the updated document",
    type: DocumentDataDto,
  })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiBadRequestResponse({ description: "Invalid input" })
  async updateDocument(
    @Param("documentId") documentId: string,
    @Body() body: UpdateDocumentDto,
    @Req() req: Request,
  ): Promise<DocumentData> {
    this.logger.debug(`=== DocumentController.updateDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    const document = await this.databaseService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    await identityCanAccessGroup(
      req.resolvedIdentity,
      document.group_id,
      this.databaseService,
    );

    const updated = await this.databaseService.updateDocument(documentId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.metadata !== undefined
        ? { metadata: body.metadata as Prisma.JsonValue }
        : {}),
    });
    if (!updated) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    this.logger.debug("=== DocumentController.updateDocument completed ===");
    return updated;
  }

  @Delete("/:documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Delete a document" })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiNoContentResponse({ description: "Document deleted successfully" })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async deleteDocument(
    @Param("documentId") documentId: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.debug(`=== DocumentController.deleteDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    const document = await this.databaseService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    await identityCanAccessGroup(
      req.resolvedIdentity,
      document.group_id,
      this.databaseService,
    );

    await this.databaseService.deleteDocument(documentId);
    try {
      await this.blobStorage.delete(document.file_path);
    } catch (error) {
      this.logger.warn(
        `Failed to delete blob for document ${documentId}: ${(error as Error).message}`,
      );
    }

    this.logger.debug("=== DocumentController.deleteDocument completed ===");
  }

  // TODO: Refactor list endpoint to avoid per-request Temporal fan-out and full-table reads.
  // Add pagination, make DB the source of truth for status/review state, move reconciliation off read path,
  // and align workflow query status contract. See: ./get-all-documents-fixes.md
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiKeyAuth()
  @KeycloakSSOAuth()
  @ApiOperation({ summary: "Get all documents" })
  @ApiQuery({
    name: "group_id",
    required: false,
    description:
      "Filter documents by group ID. When provided, only documents belonging to this group are returned.",
  })
  @ApiOkResponse({
    description: "Returns a list of all documents",
    type: [DocumentDataDto],
  })
  @ApiForbiddenResponse({
    description: "Access denied: not a member of the specified group",
  })
  async getAllDocuments(
    @Req() req: Request,
    @Query("group_id") groupId?: string,
  ): Promise<(DocumentData & { needsReview?: boolean })[]> {
    this.logger.debug("=== DocumentController.getAllDocuments ===");

    let groupIds: string[] | undefined;

    if (groupId !== undefined) {
      await identityCanAccessGroup(
        req.resolvedIdentity,
        groupId,
        this.databaseService,
      );
      groupIds = [groupId];
    } else {
      groupIds = await getIdentityGroupIds(
        req.resolvedIdentity,
        this.databaseService,
      );
    }

    try {
      const documents = await this.databaseService.findAllDocuments(groupIds);

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

              // First check the actual workflow execution status
              const workflowStatus =
                await this.temporalClientService.getWorkflowStatus(workflowId);

              // If workflow has failed, terminated, timed out, or cancelled, update database status
              if (
                workflowStatus.status === "FAILED" ||
                workflowStatus.status === "TERMINATED" ||
                workflowStatus.status === "TIMED_OUT" ||
                workflowStatus.status === "CANCELLED"
              ) {
                this.logger.warn(
                  `Document ${doc.id} workflow ended with status ${workflowStatus.status}, updating database`,
                );
                await this.databaseService.updateDocument(doc.id, {
                  status: DocumentStatus.failed,
                });
                return {
                  ...doc,
                  status: DocumentStatus.failed,
                };
              }

              // If workflow is still running, try to query its internal status
              if (workflowStatus.status === "RUNNING") {
                try {
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
                } catch (queryError) {
                  // Query failed but workflow is running - this is OK, just return current status
                  this.logger.debug(
                    `Could not query running workflow for document ${doc.id}: ${queryError.message}`,
                  );
                }
              }
            } catch (error) {
              // If workflow status check fails, log but don't fail the entire request
              // This can happen if Temporal is unavailable
              this.logger.debug(
                `Could not get workflow status for document ${doc.id}: ${error.message}`,
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
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiOkResponse({
    description: "Returns OCR result and document info",
    type: OcrResultResponseDto,
  })
  @ApiNotFoundResponse({ description: "Document or OCR result not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async getOcrResult(
    @Param("documentId") documentId: string,
    @Req() req: Request,
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

      await identityCanAccessGroup(
        req.resolvedIdentity,
        document.group_id,
        this.databaseService,
      );

      await this.auditService.recordEvent({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: documentId,
        actor_id: req.resolvedIdentity?.userId,
        document_id: documentId,
        group_id: document.group_id ?? undefined,
        payload: { action: "ocr" },
      });

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

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
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
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiOkResponse({
    description: "Returns the document file buffer as a download",
  })
  @ApiNotFoundResponse({ description: "Document not found or file missing" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async downloadDocument(
    @Param("documentId") documentId: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.debug(`=== DocumentController.downloadDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    try {
      // Find the document
      const document = await this.databaseService.findDocument(documentId);
      if (!document) {
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      await identityCanAccessGroup(
        req.resolvedIdentity,
        document.group_id,
        this.databaseService,
      );

      await this.auditService.recordEvent({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: documentId,
        actor_id: req.resolvedIdentity?.userId,
        document_id: documentId,
        group_id: document.group_id ?? undefined,
        payload: { action: "download" },
      });

      // Read file from blob storage using the blob key
      const fileBuffer = await this.blobStorage.read(document.file_path);

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
        `Serving file: ${document.file_path} (${fileBuffer.length} bytes)`,
      );
      this.logger.debug(
        "=== DocumentController.downloadDocument completed ===",
      );

      res.send(fileBuffer);
    } catch (error) {
      this.logger.error(`Error downloading document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
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
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async approveDocument(
    @Param("documentId") documentId: string,
    @Body() body: ApproveDocumentDto,
    @Req() req: Request,
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

      await identityCanAccessGroup(
        req.resolvedIdentity,
        document.group_id,
        this.databaseService,
      );

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

      await this.auditService.recordEvent({
        event_type: "human_approval_signal_sent",
        resource_type: "workflow_run",
        resource_id: workflowId,
        actor_id: body.reviewer,
        document_id: documentId,
        workflow_execution_id: workflowId,
        group_id: document.group_id,
        payload: {
          approved: body.approved,
          reviewer: body.reviewer ?? undefined,
        },
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

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new NotFoundException(
        error.message || `Failed to approve document: ${documentId}`,
      );
    }
  }
}
