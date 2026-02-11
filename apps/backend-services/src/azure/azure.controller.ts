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
  Post,
  Query,
  Request,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AzureService } from "@/azure/azure.service";
import { ClassifierService } from "@/azure/classifier.service";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";
import {
  ClassifierCreationDto,
  DeleteClassifierDocumentsDto,
  GetClassificationResultQueryDto,
  GetTrainingResultQueryDto,
  RequestClassificationDto,
  RequestClassifierTrainingDto,
  UploadClassifierDocumentsDto,
} from "@/azure/dto/classifier-requests.dto";
import {
  ClassifierModelResponseDto,
  ClassifierResponseDto,
  DeleteClassifierDocumentsResponseDto,
  UploadClassifierDocumentsResponseDto,
} from "@/azure/dto/classifier-responses.dto";
import { DatabaseService } from "@/database/database.service";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { Operation, StorageService } from "@/storage/storage.service";

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
  @ApiOperation({
    summary: "Create a new classifier",
    description: "Creates a new classifier for a group.",
  })
  @ApiCreatedResponse({
    description: "Classifier created successfully",
    type: ClassifierCreationDto,
  })
  @ApiBody({
    type: ClassifierCreationDto,
    description: "Classifier creation payload",
  })
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

  @Post("classifier/documents")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Upload training documents",
    description: "Upload training documents for a classifier.",
  })
  @UseInterceptors(FilesInterceptor("files"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
        },
        classifierName: { type: "string" },
        label: { type: "string" },
        groupId: { type: "string" },
      },
      required: ["files", "classifierName", "label", "groupId"],
    },
    description: "Upload training documents for a classifier",
  })
  @ApiCreatedResponse({
    description: "Files uploaded successfully",
    type: UploadClassifierDocumentsResponseDto,
  })
  async uploadClassifierDocuments(
    @Request() req,
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: UploadClassifierDocumentsDto,
  ): Promise<UploadClassifierDocumentsResponseDto> {
    const { classifierName, label, groupId } = body;
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

  @Delete("classifier/documents")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Delete training documents",
    description: "Delete training documents for a classifier.",
  })
  @ApiNoContentResponse({
    description: "Documents deleted successfully.",
    type: DeleteClassifierDocumentsResponseDto,
  })
  @ApiBody({
    type: DeleteClassifierDocumentsDto,
    description: "Delete classifier documents payload",
  })
  @HttpCode(204)
  async deleteClassifierDocuments(
    @Request() req,
    @Body() body: DeleteClassifierDocumentsDto,
  ): Promise<void> {
    const { classifierName, groupId, folders } = body;
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
        const path = this.storageService.getStoragePath(
          groupId,
          Operation.CLASSIFICATION,
          classifierName,
        );
        this.storageService.deleteFolderRecursive(path);
      }
      // No return value: 204 No Content
    } catch {
      this.logger.error("Failed to delete folders: ", folders);
      throw new InternalServerErrorException(
        "Failed to delete requested folders.",
      );
    }
  }

  @Post("classifier/train")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Request classifier training",
    description: "Request training for a classifier.",
  })
  @ApiCreatedResponse({
    description: "Training requested successfully",
    type: ClassifierModelResponseDto,
  })
  @ApiBody({
    type: RequestClassifierTrainingDto,
    description: "Request classifier training payload",
  })
  async requestClassifierTraining(
    @Request() req,
    @Body() body: RequestClassifierTrainingDto,
  ): Promise<ClassifierModelResponseDto> {
    const { classifierName, groupId } = body;
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
      const model = await this.classifierService.requestClassifierTraining(
        classifierName,
        groupId,
        userId,
      );
      return {
        ...model,
        status: ClassifierStatus[model.status as keyof typeof ClassifierStatus],
        source: ClassifierSource[model.source as keyof typeof ClassifierSource],
      };
    } catch (e) {
      this.logger.error(
        `Classification request failed for classifier ${classifierName} in group ${groupId}.`,
        e,
      );
      const model = await this.databaseService.updateClassifierModel(
        classifierName,
        groupId,
        { status: ClassifierStatus.FAILED },
        userId,
      );
      return {
        ...model,
        status: ClassifierStatus[model.status as keyof typeof ClassifierStatus],
        source: ClassifierSource[model.source as keyof typeof ClassifierSource],
      };
    }
  }

  @Post("classifier/classify")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Request document classification",
    description: "Request classification for a document using a classifier.",
  })
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        classifierName: { type: "string" },
        groupId: { type: "string" },
      },
      required: ["file", "classifierName", "groupId"],
    },
    description: "Request classification for a document",
  })
  @ApiCreatedResponse({
    description: "Classification requested successfully",
    type: ClassifierResponseDto,
  })
  async requestClassification(
    @Request() req,
    @Body() body: RequestClassificationDto,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ClassifierResponseDto> {
    const { classifierName, groupId } = body;
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

    const response = await this.classifierService.requestClassificationFromFile(
      file,
      classifierName,
      groupId,
    );

    await this.databaseService.updateClassifierModel(
      classifierName,
      groupId,
      {
        last_used_at: new Date(),
      },
      userId,
    );
    return response;
  }

  @Get("classifier/classify")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get classification result",
    description: "Get the result of a classification operation.",
  })
  @ApiCreatedResponse({
    description: "Classification result retrieved",
    type: ClassifierResponseDto,
  })
  async getClassificationResult(
    @Query() query: GetClassificationResultQueryDto,
  ): Promise<ClassifierResponseDto> {
    const { operationLocation } = query;
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

  @Get("classifier/train")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get training result",
    description: "Get the result of a classifier training operation.",
  })
  @ApiCreatedResponse({
    description: "Training result retrieved",
    type: ClassifierModelResponseDto,
  })
  async getTrainingResult(
    @Request() req,
    @Query() query: GetTrainingResultQueryDto,
  ): Promise<ClassifierModelResponseDto> {
    const { classifierName, groupId } = query;
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
