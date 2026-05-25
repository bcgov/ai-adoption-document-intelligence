import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { Prisma } from "@generated/client";
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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { AuditService } from "@/audit/audit.service";
import { Identity } from "@/auth/identity.decorator";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { validateBlobFilePath } from "@/blob-storage/storage-path-builder";
import {
  DocumentDataDto,
  DocumentStatusCountsDto,
  PaginatedDocumentsDto,
} from "@/document/dto/document-data.dto";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { AppLoggerService } from "../logging/app-logger.service";
import { TemporalClientService } from "../temporal/temporal-client.service";
import { type DocumentData, DocumentService } from "./document.service";
import { ApproveDocumentDto } from "./dto/approve-document.dto";
import { OcrResultResponseDto } from "./dto/ocr-result-response.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";
import { getContentTypeFromFilename } from "./mime-from-filename";

@ApiTags("Documents")
@Controller("api/documents")
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly temporalClientService: TemporalClientService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
    private readonly auditService: AuditService,
  ) {}

  @Get("/stats")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get document counts grouped by status" })
  @ApiQuery({
    name: "group_id",
    required: false,
    description: "Scope counts to a specific group ID.",
  })
  @ApiOkResponse({
    description: "Per-status document counts and grand total",
    type: DocumentStatusCountsDto,
  })
  @ApiForbiddenResponse({
    description: "Access denied: not a member of the specified group",
  })
  async getDocumentStats(
    @Req() req: Request,
    @Query("group_id") groupId?: string,
  ): Promise<DocumentStatusCountsDto> {
    let groupIds: string[] | undefined;
    if (groupId !== undefined) {
      identityCanAccessGroup(req.resolvedIdentity, groupId);
      groupIds = [groupId];
    } else {
      groupIds = getIdentityGroupIds(req.resolvedIdentity);
    }
    return this.documentService.getDocumentStatusCounts(groupIds);
  }

  @Get("/:documentId")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
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

    const document = await this.documentService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    identityCanAccessGroup(req.resolvedIdentity, document.group_id);

    await this.auditService.recordEvent({
      event_type: "document_accessed",
      resource_type: "document",
      resource_id: documentId,
      actor_id: req.resolvedIdentity.actorId,
      document_id: documentId,
      group_id: document.group_id ?? undefined,
      payload: { action: "metadata" },
    });

    this.logger.debug("=== DocumentController.getDocument completed ===");
    return document;
  }

  @Patch("/:documentId")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
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

    const document = await this.documentService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    identityCanAccessGroup(req.resolvedIdentity, document.group_id);

    const updated = await this.documentService.updateDocument(documentId, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.metadata !== undefined
        ? { metadata: body.metadata as Prisma.JsonValue }
        : {}),
    });
    if (!updated) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    await this.auditService.recordEvent({
      event_type: "document_accessed",
      resource_type: "document",
      resource_id: documentId,
      actor_id: req.resolvedIdentity.actorId,
      document_id: documentId,
      group_id: document.group_id ?? undefined,
      payload: { action: "metadata" },
    });

    this.logger.debug("=== DocumentController.updateDocument completed ===");
    return updated;
  }

  @Delete("/:documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Delete a document" })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiNoContentResponse({ description: "Document deleted successfully" })
  @ApiNotFoundResponse({ description: "Document not found" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  @ApiConflictResponse({
    description: "Document is currently being processed and cannot be deleted",
  })
  async deleteDocument(
    @Param("documentId") documentId: string,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.debug(`=== DocumentController.deleteDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    const document = await this.documentService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    identityCanAccessGroup(req.resolvedIdentity, document.group_id);

    await this.documentService.deleteDocument(documentId);

    await this.auditService.recordEvent({
      event_type: "document_deleted",
      resource_type: "document",
      resource_id: documentId,
      actor_id: req.resolvedIdentity.actorId,
      document_id: documentId,
      group_id: document.group_id ?? undefined,
      payload: {
        original_filename: document.original_filename,
        status: document.status,
      },
    });

    this.logger.debug("=== DocumentController.deleteDocument completed ===");
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Get documents (paginated)" })
  @ApiQuery({
    name: "group_id",
    required: false,
    description:
      "Filter documents by group ID. When provided, only documents belonging to this group are returned.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description:
      "Maximum number of documents to return per page (default 50, max 200).",
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "Number of documents to skip for pagination (default 0).",
  })
  @ApiOkResponse({
    description: "Returns a paginated list of documents",
    type: PaginatedDocumentsDto,
  })
  @ApiForbiddenResponse({
    description: "Access denied: not a member of the specified group",
  })
  async getAllDocuments(
    @Req() req: Request,
    @Query("group_id") groupId?: string,
    @Query("limit") limitStr?: string,
    @Query("offset") offsetStr?: string,
  ): Promise<PaginatedDocumentsDto> {
    this.logger.debug("=== DocumentController.getAllDocuments ===");

    let groupIds: string[] | undefined;

    if (groupId !== undefined) {
      identityCanAccessGroup(req.resolvedIdentity, groupId);
      groupIds = [groupId];
    } else {
      groupIds = getIdentityGroupIds(req.resolvedIdentity);
    }

    const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);
    const offset = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);

    try {
      const { documents, total } = await this.documentService.findAllDocuments(
        groupIds,
        { limit, offset },
      );

      if (req.resolvedIdentity) {
        await this.auditService.recordEvent({
          event_type: "document_list_accessed",
          resource_type: "document_collection",
          resource_id:
            groupId ?? (groupIds?.length === 1 ? groupIds[0] : "multi"),
          actor_id: req.resolvedIdentity.actorId,
          group_id: groupId,
          payload: {
            action: "metadata",
            count: documents.length,
            total,
            limit,
            offset,
            group_ids: groupIds,
          },
        });
      }

      this.logger.debug(`Retrieved ${documents.length} of ${total} documents`);
      this.logger.debug("=== DocumentController.getAllDocuments completed ===");

      return { documents, total, limit, offset };
    } catch (error) {
      this.logger.error(
        `Error retrieving documents: ${getErrorMessage(error)}`,
      );
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      throw new NotFoundException(
        getErrorMessage(error) || "Failed to retrieve documents",
      );
    }
  }

  @Get("/:documentId/ocr")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
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
      const document = await this.documentService.findDocument(documentId);
      if (!document) {
        this.logger.warn(`Document not found: ${documentId}`);
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      identityCanAccessGroup(req.resolvedIdentity, document.group_id);

      this.logger.debug(`Document status: ${document.status}`);
      this.logger.debug(`Document created: ${document.created_at}`);
      if (document.apim_request_id) {
        this.logger.debug(`APIM Request ID: ${document.apim_request_id}`);
      }

      const ocrResult = await this.documentService.findOcrResult(documentId);

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

        await this.auditService.recordEvent({
          event_type: "document_accessed",
          resource_type: "ocr_result",
          resource_id: ocrResult.id,
          actor_id: req.resolvedIdentity.actorId,
          document_id: documentId,
          group_id: document.group_id ?? undefined,
          payload: { action: "ocr" },
        });
      }

      this.logger.debug("=== DocumentController.getOcrResult completed ===");

      return response;
    } catch (error) {
      this.logger.error(
        `Error retrieving OCR result: ${getErrorMessage(error)}`,
      );
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new NotFoundException(
        getErrorMessage(error) ||
          `Failed to retrieve OCR result for document: ${documentId}`,
      );
    }
  }

  @Get("/:documentId/view")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "View normalized document as PDF",
    description:
      "Streams the normalized PDF used for in-app display and OCR. Always application/pdf.",
  })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiProduces("application/pdf")
  @ApiOkResponse({
    description: "Normalized PDF bytes (Content-Type: application/pdf)",
  })
  @ApiNotFoundResponse({
    description: "Document not found or normalized PDF unavailable",
  })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiForbiddenResponse({ description: "Access denied: not a group member" })
  async viewDocument(
    @Param("documentId") documentId: string,
    @Res() res: Response,
    @Req() req: Request,
  ): Promise<void> {
    this.logger.debug(`=== DocumentController.viewDocument ===`);
    this.logger.debug(`Document ID: ${documentId}`);

    const document = await this.documentService.findDocument(documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${documentId}`);
    }

    identityCanAccessGroup(req.resolvedIdentity, document.group_id);

    if (!document.normalized_file_path) {
      throw new NotFoundException(
        `Normalized PDF is not available for document: ${documentId}`,
      );
    }

    await this.auditService.recordEvent({
      event_type: "document_accessed",
      resource_type: "document",
      resource_id: documentId,
      actor_id: req.resolvedIdentity.actorId,
      document_id: documentId,
      group_id: document.group_id ?? undefined,
      payload: { action: "view" },
    });

    const fileBuffer = await this.blobStorage.read(
      validateBlobFilePath(document.normalized_file_path),
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="document.pdf"');
    res.setHeader("Content-Length", fileBuffer.length);
    res.send(fileBuffer);

    this.logger.debug("=== DocumentController.viewDocument completed ===");
  }

  @Get("/:documentId/download")
  @HttpCode(HttpStatus.OK)
  @Identity({ allowApiKey: true })
  @ApiOperation({
    summary: "Download original uploaded file",
    description:
      "Serves the stored original blob (not the normalized PDF). Filename and type follow original_filename.",
  })
  @ApiParam({ name: "documentId", description: "Document ID" })
  @ApiOkResponse({
    description: "Returns the original file buffer",
  })
  @ApiNotFoundResponse({ description: "Document not found or file missing" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
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
      const document = await this.documentService.findDocument(documentId);
      if (!document) {
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      identityCanAccessGroup(req.resolvedIdentity, document.group_id);

      await this.auditService.recordEvent({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: documentId,
        actor_id: req.resolvedIdentity.actorId,
        document_id: documentId,
        group_id: document.group_id,
        payload: { action: "download" },
      });

      // Read file from blob storage using the blob key
      const filePath = validateBlobFilePath(document.file_path);
      const fileBuffer = await this.blobStorage.read(filePath);

      const fileName = document.original_filename || `document-${documentId}`;
      const mimeType = getContentTypeFromFilename(fileName);

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
      res.setHeader("Content-Length", fileBuffer.length);

      this.logger.debug(
        `Serving file: ${document.file_path} (${fileBuffer.length} bytes)`,
      );
      this.logger.debug(
        "=== DocumentController.downloadDocument completed ===",
      );

      await this.auditService.recordEvent({
        event_type: "document_accessed",
        resource_type: "document",
        resource_id: documentId,
        actor_id: req.resolvedIdentity.actorId,
        document_id: documentId,
        group_id: document.group_id,
        payload: { action: "download" },
      });

      res.send(fileBuffer);
    } catch (error) {
      this.logger.error(
        `Error downloading document: ${getErrorMessage(error)}`,
      );
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new NotFoundException(
        getErrorMessage(error) || `Failed to download document: ${documentId}`,
      );
    }
  }

  @Post("/:documentId/approve")
  @HttpCode(HttpStatus.OK)
  @Identity()
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
      const document = await this.documentService.findDocument(documentId);
      if (!document) {
        throw new NotFoundException(`Document not found: ${documentId}`);
      }

      identityCanAccessGroup(req.resolvedIdentity, document.group_id);

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
        actor_id: req.resolvedIdentity.actorId,
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
      this.logger.error(`Error approving document: ${getErrorMessage(error)}`);
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      throw new NotFoundException(
        getErrorMessage(error) || `Failed to approve document: ${documentId}`,
      );
    }
  }
}
