import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Identity } from "@/auth/identity.decorator";
import { DocumentService } from "../document/document.service";
import { AppLoggerService } from "../logging/app-logger.service";
import { QueueService } from "../queue/queue.service";
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
  @ApiBadRequestResponse({ description: "Invalid input or upload failed" })
  async uploadDocument(
    @Body() uploadDto: UploadDocumentDto,
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
      const uploadedDocument = await this.documentService.uploadDocument(
        uploadDto.title,
        uploadDto.file,
        uploadDto.file_type,
        originalFilename,
        uploadDto.model_id,
        uploadDto.group_id,
        uploadDto.metadata,
        workflowConfigId,
      );

      this.logger.debug(
        `Document uploaded successfully: ${uploadedDocument.id}`,
      );

      // Fire-and-forget OCR processing; log errors but don't block the response
      void this.queueService
        .processOcrForDocument({
          documentId: uploadedDocument.id,
          filePath: uploadedDocument.file_path,
          fileType: uploadedDocument.file_type,
          metadata: uploadedDocument.metadata,
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
