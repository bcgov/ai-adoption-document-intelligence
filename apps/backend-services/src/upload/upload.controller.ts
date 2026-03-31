import {
  BadRequestException,
  Body,
  Controller,
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
import { DocumentService } from "../document/document.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { QueueService } from "../queue/queue.service";
import { UploadConversionFailedResponseDto } from "./dto/upload-conversion-failed-response.dto";
import { UploadDocumentDto } from "./dto/upload-document.dto";
import { UploadDocumentResponseDto } from "./dto/upload-document-response.dto";

@ApiTags("Upload")
@Controller("api/upload")
export class UploadController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly queueService: QueueService,
    private readonly logger: AppLoggerService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Identity({
    allowApiKey: true,
    minimumRole: "MEMBER",
    groupIdFrom: { body: "group_id" },
  })
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
    description: "Access denied: not a member of the requested group or insufficient role",
  })
  async uploadDocument(
    @Body() uploadDto: UploadDocumentDto,
    @Req() req: Request,
  ): Promise<UploadDocumentResponseDto> {
    this.logger.debug("=== UploadController.uploadDocument ===");
    this.logger.debug(
      `Received upload request: ${JSON.stringify(
        {
          title: uploadDto.title,
          file_type: uploadDto.file_type,
          original_filename: uploadDto.original_filename,
          metadata: uploadDto.metadata,
          model_id: uploadDto.model_id,
          file_length: uploadDto.file?.length || 0,
        },
        null,
        2,
      )}`,
    );

    try {
      // Validate base64 file data
      if (!uploadDto.file || uploadDto.file.trim().length === 0) {
        throw new BadRequestException("File data is required");
      }

      // Use original_filename from DTO or default to title
      const originalFilename =
        uploadDto.original_filename ||
        `${uploadDto.title}.${uploadDto.file_type}`;

      // Upload document (saves file and stores metadata)
      // Use workflow_config_id if provided, fallback to workflow_id for backward compatibility
      const workflowConfigId =
        uploadDto.workflow_config_id || uploadDto.workflow_id;
      const uploadResult = await this.documentService.uploadDocument(
        uploadDto.title,
        uploadDto.file,
        uploadDto.file_type,
        originalFilename,
        uploadDto.model_id,
        uploadDto.group_id,
        uploadDto.metadata,
        workflowConfigId,
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
          timestamp: new Date(),
        })
        .catch((error) => {
          this.logger.error(
            `Background OCR processing failed for document ${uploadedDocument.id}: ${error.message}`,
          );
          this.logger.error(`Stack: ${error.stack}`);
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
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(`Error in uploadDocument: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      throw new BadRequestException(
        error instanceof Error ? error.message : "Failed to upload document",
      );
    }
  }
}
