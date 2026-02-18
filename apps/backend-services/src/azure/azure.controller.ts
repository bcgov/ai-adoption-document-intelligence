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

  @Get("classifier")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get classifiers for user groups",
    description:
      "Retrieves all classifiers for the groups the user belongs to.",
  })
  @ApiCreatedResponse({
    description: "Classifiers retrieved successfully",
    type: [ClassifierModelResponseDto],
  })
  async getClassifiers(@Request() req) {
    const userId = req.user.sub;
    const groups = await this.databaseService.getUsersGroups(userId);
    const classifiers = await this.databaseService.getClassifierModelsForGroups(
      groups.map((g) => g.group_id),
    );
    return classifiers;
  }

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
    const { name, description, source, group_id } = body;
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, group_id))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    // Does this classifier already exist?
    const classifier = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (classifier != null) {
      throw new ForbiddenException("Classifier with this name already exists.");
    }
    const creationResult = await this.databaseService.createClassifierModel(
      name,
      {
        description,
        source,
        status: ClassifierStatus.PRETRAINING,
        config: { labels: [] },
        group_id: group_id,
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
        group_id: { type: "string" },
      },
      required: ["files", "classifierName", "label", "group_id"],
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
    const { name, label, group_id } = body;
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, group_id))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    const existingModelData = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }

    const path = this.storageService.getStoragePath(
      group_id,
      Operation.CLASSIFICATION,
      `${name}/${label}`,
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
    const { name, group_id, folders } = body;
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, group_id))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    const existingModelData = await this.databaseService.getClassifierModel(
      name,
      group_id,
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
              group_id,
              Operation.CLASSIFICATION,
              `${name}/${f}`,
            );
            this.storageService.deleteFolderRecursive(path);
          }),
        );
      } else {
        // Delete all document folders for this classifier.
        const path = this.storageService.getStoragePath(
          group_id,
          Operation.CLASSIFICATION,
          name,
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
    const { name, group_id } = body;
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, group_id))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }

    try {
      // Upload the documents required for training
      const uploadResults =
        await this.classifierService.uploadDocumentsForTraining(group_id, name);

      // Create the layout json for them
      const filePaths = uploadResults.map((r) => r.blobPath);
      await this.classifierService.createLayoutJson(filePaths);

      // Start the training process
      const model = await this.classifierService.requestClassifierTraining(
        name,
        group_id,
        userId,
      );
      return {
        ...model,
        status: ClassifierStatus[model.status as keyof typeof ClassifierStatus],
        source: ClassifierSource[model.source as keyof typeof ClassifierSource],
      };
    } catch (e) {
      this.logger.error(
        `Classification request failed for classifier ${name} in group ${group_id}.`,
        e,
      );
      const model = await this.databaseService.updateClassifierModel(
        name,
        group_id,
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
        group_id: { type: "string" },
      },
      required: ["file", "classifierName", "group_id"],
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
    const { name, group_id } = body;
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, group_id))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    // Is there a classifier trained for this group?
    const classifier = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (classifier == null) {
      throw new NotFoundException("Classifier not found.");
    }

    const response = await this.classifierService.requestClassificationFromFile(
      file,
      name,
      group_id,
    );

    await this.databaseService.updateClassifierModel(
      name,
      group_id,
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
    const { name, group_id } = query;
    if (name == null || group_id == null) {
      throw new BadRequestException(
        "Must provide both name and group_id query parameters.",
      );
    }
    const userId = req.user.sub;
    if (!(await this.databaseService.isUserInGroup(userId, group_id))) {
      throw new ForbiddenException("User does not belong to requested group.");
    }
    const classifier = await this.databaseService.getClassifierModel(
      name,
      group_id,
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
          name,
          group_id,
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
