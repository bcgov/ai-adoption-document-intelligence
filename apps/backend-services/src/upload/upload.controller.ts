import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
import { identityCanAccessGroup } from "@/auth/identity.helpers";
import { GroupRole } from "@/generated";
import { DocumentService } from "../document/document.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { QueueService } from "../queue/queue.service";
import { WorkflowService } from "../workflow/workflow.service";
import { UploadConversionFailedResponseDto } from "./dto/upload-conversion-failed-response.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { UploadDocumentResponseDto } from "./dto/upload-document-response.dto";

@ApiTags("Upload")
@Controller("api/upload")
export class UploadController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly queueService: QueueService,
    private readonly workflowService: WorkflowService,
    private readonly logger: AppLoggerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({ allowApiKey: true })
  @ApiOperation({ summary: "Upload a new document and start OCR processing" })
  @ApiCreatedResponse({
    description:
      "Document uploaded successfully. Returns document id, title, file info, status, and created_at.",
    type: UploadDocumentResponseDto,
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Stored original but PDF normalization failed (see message and document status)",
    type: UploadConversionFailedResponseDto,
  })
  @ApiBadRequestResponse({ description: "Invalid input or upload failed" })
  @ApiUnauthorizedResponse({ description: "Not authenticated" })
  @ApiForbiddenResponse({
    description:
      "Access denied: not a member of the requested group or insufficient role",
  })
  async uploadDocument(
    @Body() uploadDto: UploadDocumentDto,
    @Req() req: Request,
  ): Promise<UploadDocumentResponseDto> {
    this.logger.debug("=== UploadController.uploadDocument ===");

    try {
      // Validate base64 file data
      if (!uploadDto.file || uploadDto.file.trim().length === 0) {
        throw new BadRequestException("File data is required");
      }

      // Use original_filename from DTO or default to title
      const originalFilename =
        uploadDto.original_filename ||
        `${uploadDto.title}.${uploadDto.file_type}`;

      // Resolve group: explicit body > API key's group. Mismatches between the
      // body's group_id and the API key's group are rejected by
      // identityCanAccessGroup below (the API key's groupRoles only contains
      // its own scoped group, so a foreign body group_id fails the membership
      // check with a 403).
      const groupId = uploadDto.group_id ?? req.apiKey?.groupId;
      if (!groupId) {
        throw new BadRequestException(
          "group_id is required when not authenticating with an API key",
        );
      }
      identityCanAccessGroup(req.resolvedIdentity, groupId, GroupRole.MEMBER);

      // Resolve workflow → WorkflowVersion.id. Accept slug (+ optional version)
      // or a workflow_config_id (Version.id or Lineage.id).
      const workflowConfigId =
        await this.workflowService.resolveWorkflowVersionId({
          groupId,
          workflowSlug: uploadDto.workflow_slug,
          workflowVersion: uploadDto.workflow_version,
          workflowConfigId: uploadDto.workflow_config_id,
        });

      // Default model_id from the workflow's ctx.modelId.defaultValue when not provided.
      let modelId: string | undefined = uploadDto.model_id;
      if (!modelId && workflowConfigId) {
        modelId =
          (await this.workflowService.getModelIdDefault(workflowConfigId)) ??
          undefined;
      }
      if (!modelId) {
        throw new BadRequestException(
          "model_id is required when the workflow does not declare a default",
        );
      }

      this.logger.debug(
        `Upload resolved: group=${groupId}, workflowVersion=${workflowConfigId ?? "<none>"}, model=${modelId}, file_type=${uploadDto.file_type}`,
      );

      const uploadResult = await this.documentService.uploadDocument(
        uploadDto.title,
        uploadDto.file,
        uploadDto.file_type,
        originalFilename,
        modelId,
        groupId,
        uploadDto.metadata,
        workflowConfigId ?? undefined,
      );

      if (uploadResult.kind === "conversion_failed") {
        const doc = uploadResult.document;
        this.logger.warn(
          `Document ${doc.id} stored but PDF normalization failed`,
        );
        throw new HttpException(
          {
            success: false,
            code: "conversion_failed",
            message: "Document could not be converted to PDF",
            document: {
              id: doc.id,
              title: doc.title,
              original_filename: doc.original_filename,
              normalized_file_path: doc.normalized_file_path,
              file_type: doc.file_type,
              file_size: doc.file_size,
              status: doc.status,
              created_at: doc.created_at,
            },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const uploadedDocument = uploadResult.document;

      this.logger.debug(
        `Document uploaded successfully: ${uploadedDocument.id}`,
      );

      void this.queueService
        .processOcrForDocument({
          documentId: uploadedDocument.id,
          filePath: uploadedDocument.normalized_file_path ?? "",
          fileType: "pdf",
          metadata: uploadedDocument.metadata,
          ctxOverrides: uploadDto.ctx_overrides,
          timestamp: new Date(),
        })
        .catch((error) => {
          this.logger.error(
            `Background OCR processing failed for document ${uploadedDocument.id}: ${getErrorMessage(error)}`,
          );
          this.logger.error(`Stack: ${getErrorStack(error)}`);
        });

      this.logger.debug("=== UploadController.uploadDocument completed ===");

      return {
        success: true,
        document: {
          id: uploadedDocument.id,
          title: uploadedDocument.title,
          original_filename: uploadedDocument.original_filename,
          normalized_file_path: uploadedDocument.normalized_file_path,
          file_type: uploadedDocument.file_type,
          file_size: uploadedDocument.file_size,
          status: uploadedDocument.status,
          created_at: uploadedDocument.created_at,
        },
      };
    } catch (error) {
      this.logger.error(`Error in uploadDocument: ${getErrorMessage(error)}`);
      this.logger.error(`Stack: ${getErrorStack(error)}`);

      if (
        error instanceof HttpException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }

      throw new BadRequestException(
        getErrorMessage(error) || "Failed to upload document",
      );
    }
  }
}
