import {
  ClassifierCopyAuthorizationOutput,
  DocumentIntelligenceErrorResponseOutput,
  ModelCopyAuthorizationOutput,
} from "@azure-rest/ai-document-intelligence";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AzureService } from "@/azure/azure.service";
import { ClassifierService } from "@/azure/classifier.service";
import { ClassifierCreationDto } from "@/azure/dto/classifier.dto";
import { DatabaseService } from "@/database/database.service";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { ClassifierStatus } from "@/generated";
import { Operation, StorageService } from "@/storage/storage.service";

export interface OperationRequestResponse {
  status: string;
  content: string;
  error?:
    | DocumentIntelligenceErrorResponseOutput
    | (DocumentIntelligenceErrorResponseOutput &
        ModelCopyAuthorizationOutput &
        ClassifierCopyAuthorizationOutput)
    | (DocumentIntelligenceErrorResponseOutput & ModelCopyAuthorizationOutput)
    | (DocumentIntelligenceErrorResponseOutput &
        ClassifierCopyAuthorizationOutput);
}

@ApiTags("Azure")
@Controller("api/azure")
export class AzureController {
  private readonly logger = new Logger(AzureController.name);

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly storageService: StorageService,
    private readonly databaseService: DatabaseService,
    private readonly azureService: AzureService,
  ) {}

  @Post("classifier")
  @KeycloakSSOAuth()
  @ApiCreatedResponse()
  async createClassifier(@Request() req, @Body() body: ClassifierCreationDto) {
    const { classifierName, description, source, status, groupId } = body;
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, groupId))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    // Does this classifier already exist?
    const classifier = await this.databaseService.getClassifierModel(
      classifierName,
      groupId,
    );
    if (classifier != null) {
      throw new ForbiddenException("Classifier with this name already exists.");
    }
    const creationResult = await this.databaseService.createClassifierModel(
      classifierName,
      {
        description,
        source,
        status,
        config: { labels: [] },
        group_id: groupId,
      },
      userId,
    );
    return creationResult;
  }

  // Save Training documents to storage
  @Post("classifier/documents")
  @KeycloakSSOAuth()
  @UseInterceptors(FilesInterceptor("files"))
  async uploadClassifierDocuments(
    @Request() req,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body("classifierName") classifierName: string,
    @Body("label") label: string,
    @Body("groupId") groupId: string,
  ) {
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, groupId))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    const existingModelData = await this.databaseService.getClassifierModel(
      classifierName,
      groupId,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }

    const path = this.storageService.getStoragePath(
      groupId,
      Operation.CLASSIFICATION,
      `${classifierName}/${label}`,
    );
    const uploadResults = await this.storageService.saveFilesBulk(files, path);

    return {
      message: "Received files and data.",
      fileCount: files?.length || 0,
      results: uploadResults,
    };
  }

  // Remove training documents from storage
  @Delete("classifier/documents")
  @KeycloakSSOAuth()
  @ApiNoContentResponse({ description: "Documents deleted successfully." })
  @HttpCode(204)
  async deleteClassifierDocuments(
    @Request() req,
    @Body("classifierName") classifierName: string,
    @Body("groupId") groupId: string,
    @Body("folders") folders?: string[],
  ): Promise<void> {
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, groupId))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    const existingModelData = await this.databaseService.getClassifierModel(
      classifierName,
      groupId,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }
    try {
      // If there are folders, only delete those folders
      if (folders != null) {
        await Promise.all(
          folders.map((f) => {
            const path = this.storageService.getStoragePath(
              groupId,
              Operation.CLASSIFICATION,
              `${classifierName}/${f}`,
            );
            this.storageService.deleteFolderRecursive(path);
          }),
        );
      } else {
        // Delete all document folders for this classifier.
        await Promise.all(
          folders.map((f) => {
            const path = this.storageService.getStoragePath(
              groupId,
              Operation.CLASSIFICATION,
              classifierName,
            );
            this.storageService.deleteFolderRecursive(path);
          }),
        );
      }
      // No return value: 204 No Content
    } catch {
      this.logger.error("Failed to delete folders: ", folders);
      throw new InternalServerErrorException(
        "Failed to delete requested folders.",
      );
    }
  }

  // Request Training
  @Post("classifier/train")
  @KeycloakSSOAuth()
  async requestClassifierTraining(
    @Request() req,
    @Body("classifierName") classifierName: string,
    @Body("groupId") groupId: string,
  ) {
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, groupId))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    try {
      // Upload the documents required for training
      const uploadResults =
        await this.classifierService.uploadDocumentsForTraining(
          groupId,
          classifierName,
        );

      // Create the layout json for them
      const filePaths = uploadResults.map((r) => r.blobPath);
      await this.classifierService.createLayoutJson(filePaths);

      // Start the training process
      const result = await this.classifierService.requestClassifierTraining(
        classifierName,
        groupId,
        userId,
      );
      return result;
    } catch (e) {
      await this.databaseService.updateClassifierModel(
        classifierName,
        groupId,
        { status: ClassifierStatus.FAILED },
        userId,
      );
      return new InternalServerErrorException(e);
    }
  }

  // Request Classification
  @Post("classifier/classify")
  @KeycloakSSOAuth()
  @UseInterceptors(FileInterceptor("file"))
  async requestClassification(
    @Request() req,
    @Body("classifierName") classifierName: string,
    @Body("groupId") groupId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<OperationRequestResponse> {
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, groupId))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    // Is there a classifier trained for this group?
    const classifier = await this.databaseService.getClassifierModel(
      classifierName,
      groupId,
    );
    if (classifier == null) {
      throw new NotFoundException("Classifier not found.");
    }

    return await this.classifierService.requestClassificationFromFile(
      file,
      classifierName,
      groupId,
    );
  }

  // Check Classification status
  @Get("classifier/classify")
  @KeycloakSSOAuth()
  async getClassificationResult(
    @Query("operationLocation") operationLocation: string,
  ) {
    let returnValue;
    await this.azureService.pollOperationUntilResolved(
      operationLocation,
      (r) => {
        returnValue = r;
      },
      (r) => {
        throw new Error(
          `Could not retrieve classified document. Code: ${r.error.code}. Message: ${r.error.message}`,
        );
      },
    );
    return returnValue;
  }

  // Check Training status
  @Get("classifier/train")
  @KeycloakSSOAuth()
  async getTrainingResult(
    @Request() req,
    @Query("classifierName") classifierName: string,
    @Query("groupId") groupId: string,
  ) {
    if (classifierName == null || groupId == null) {
      throw new BadRequestException(
        "Must provide both classifierName and groupId query parameters.",
      );
    }
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, groupId))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    const classifier = await this.databaseService.getClassifierModel(
      classifierName,
      groupId,
    );
    if (classifier == null) {
      throw new NotFoundException("No classifier model found.");
    }
    if (classifier.operation_location == null) {
      throw new Error(
        "Classifier has not previously been sent for training. Request training first.",
      );
    }
    let returnValue;
    await this.azureService.pollOperationUntilResolved(
      classifier.operation_location,
      async (r) => {
        returnValue = await this.databaseService.updateClassifierModel(
          classifierName,
          groupId,
          { status: ClassifierStatus.READY },
          userId,
        );
      },
      (r) => {
        throw new Error(
          `Could not retrieve status of classifier. Code: ${r.error.code}. Message: ${r.error.message}`,
        );
      },
    );
    return returnValue;
  }
}
