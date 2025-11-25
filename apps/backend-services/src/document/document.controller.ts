import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Req,
  Post,
  BadRequestException,
  MaxFileSizeValidator,
  ParseFilePipe,
  UploadedFile,
  UseInterceptors,
  Body,
} from "@nestjs/common";
import { Request } from "express";
import { Roles } from "../auth/roles.decorator";
import { DatabaseService, DocumentData } from "../database/database.service";
import { OcrResult } from "@/generated/client";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentService } from "@/document/document.service";
import { QueueService } from "@/queue/queue.service";
import { UploadFileDto } from "@/document/dto/uploadFile.dto";

@Controller("api")
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly documentService: DocumentService,
    private readonly queueService: QueueService,
  ) {}

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
      const ocrResult = await this.databaseService.findOcrResult(documentId);

      if (!ocrResult) {
        this.logger.warn(`OCR result not found for document: ${documentId}`);
        throw new NotFoundException(
          `OCR result not found for document: ${documentId}`,
        );
      }

      this.logger.debug(
        `OCR result retrieved successfully for document: ${documentId}`,
      );
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

  // TODO: Include who document was uploaded by in database.
  @Post("documents")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5e7 }), // 50 MB
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() body: UploadFileDto,
  ): Promise<{
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
    this.logger.debug("=== DocumentController.uploadDocument ===");
    this.logger.debug(
      `Received upload request: ${JSON.stringify(
        {
          size: file.size,
          file_type: file.mimetype,
          original_filename: file.originalname,
          fieldname: file.fieldname,
          filename: file.filename,
          path: file.path,
        },
        null,
        2,
      )}`,
    );

    try {
      // Validate file types
      const acceptedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png'
      ]
      if (!acceptedTypes.includes(file.mimetype)){
        throw new BadRequestException(`File type must be one of the following: ${acceptedTypes.join(', ')}`);
      }
      // Validate the file size
      if (!file || file.size === 0) {
        throw new BadRequestException("File data is required");
      }

      // Save file to storage
      const saveDetails = await this.documentService.saveDocumentFile(file);
      // Save document record to database
      const uploadedDocument = await this.documentService.addDocument(
        body.title || file.originalname,
        file,
        saveDetails,
      );

      // TODO: Update this as queue is implemented
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

      this.logger.debug("=== DocumentController.uploadDocument completed ===");

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
