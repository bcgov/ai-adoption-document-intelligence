import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  Get,
} from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { DocumentService } from "../document/document.service";
import { QueueService } from "../queue/queue.service";
import { UploadDocumentDto } from "./dto/upload-document.dto";

@Controller("api")
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  constructor(
    private readonly documentService: DocumentService,
    private readonly queueService: QueueService,
  ) {}

  @Get("public")
  @Public()
  getPublicData(): { message: string } {
    return { message: "This endpoint is public" };
  }

  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  async uploadDocument(@Body() uploadDto: UploadDocumentDto): Promise<{
    success: boolean;
    document: {
      id: string;
      title: string;
      original_filename: string;
      file_type: string;
      file_size: number;
      status: string;
      created_at: Date;
    };
  }> {
    this.logger.debug("=== UploadController.uploadDocument ===");
    this.logger.debug(
      `Received upload request: ${JSON.stringify(
        {
          title: uploadDto.title,
          file_type: uploadDto.file_type,
          original_filename: uploadDto.original_filename,
          metadata: uploadDto.metadata,
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
      const uploadedDocument = await this.documentService.uploadDocument(
        uploadDto.title,
        uploadDto.file,
        uploadDto.file_type,
        originalFilename,
        uploadDto.metadata,
      );

      this.logger.debug(
        `Document uploaded successfully: ${uploadedDocument.id}`,
      );

      // Publish message to queue
      try {
        await this.queueService.publishDocumentUploaded({
          documentId: uploadedDocument.id,
          filePath: uploadedDocument.file_path,
          fileType: uploadedDocument.file_type,
          metadata: uploadedDocument.metadata,
          timestamp: new Date(),
        });
        this.logger.debug("Message published to queue");
      } catch (queueError) {
        this.logger.error(
          `Failed to publish message to queue: ${queueError.message}`,
        );
        // Don't fail the upload if queue publish fails - log and continue
      }

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
      this.logger.error(`Error in uploadDocument: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException(
        error.message || "Failed to upload document",
      );
    }
  }
}
