import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import "multer";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import {
  getIdentityGroupIds,
  identityCanAccessGroup,
} from "@/auth/identity.helpers";
import { AzureService } from "@/azure/azure.service";
import { ClassifierService } from "@/azure/classifier.service";
import { ClassificationResultDto } from "@/azure/dto/classification-result.dto";
import {
  ClassifierSource,
  ClassifierStatus,
} from "@/azure/dto/classifier-constants.dto";
import {
  ClassifierCreationDto,
  DeleteClassifierDocumentsDto,
  GetClassificationResultQueryDto,
  GetClassifierDocumentsQueryDto,
  GetTrainingResultQueryDto,
  RequestClassificationDto,
  RequestClassifierTrainingDto,
  UpdateClassifierDto,
  UploadClassifierDocumentsDto,
} from "@/azure/dto/classifier-requests.dto";
import {
  ClassifierModelResponseDto,
  ClassifierResponseDto,
  DeleteClassifierDocumentsResponseDto,
  UploadClassifierDocumentsResponseDto,
} from "@/azure/dto/classifier-responses.dto";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { DatabaseService } from "@/database/database.service";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";

@ApiTags("Azure")
@Controller("api/azure")
export class AzureController {
  private readonly logger = new Logger(AzureController.name);

  constructor(
    private readonly classifierService: ClassifierService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly databaseService: DatabaseService,
    private readonly azureService: AzureService,
  ) {}

  @Get("classifier")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get classifiers for user groups",
    description:
      "Retrieves classifiers for the specified group, or all groups the user belongs to when no group_id is provided.",
  })
  @ApiQuery({
    name: "group_id",
    required: false,
    description:
      "Optional group ID to filter classifiers. When provided, only classifiers for that group are returned and access is validated.",
  })
  @ApiCreatedResponse({
    description: "Classifiers retrieved successfully",
    type: [ClassifierModelResponseDto],
  })
  async getClassifiers(@Request() req, @Query("group_id") groupId?: string) {
    if (groupId) {
      await identityCanAccessGroup(
        req.resolvedIdentity,
        groupId,
        this.databaseService,
      );
      return this.databaseService.getClassifierModelsForGroups([groupId]);
    }
    const groupIds = await getIdentityGroupIds(
      req.resolvedIdentity,
      this.databaseService,
    );
    const classifiers =
      await this.databaseService.getClassifierModelsForGroups(groupIds);
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
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );

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
      req.resolvedIdentity.userId,
    );
    return creationResult;
  }

  @Patch("classifier")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Update a classifier",
    description: "Updates an existing classifier's properties.",
  })
  @ApiCreatedResponse({
    description: "Classifier updated successfully",
    type: ClassifierModelResponseDto,
  })
  @ApiBody({
    type: UpdateClassifierDto,
    description: "Classifier update payload",
  })
  async updateClassifier(@Request() req, @Body() body: UpdateClassifierDto) {
    const { name, group_id, description, source } = body;

    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );

    // Check if classifier exists
    const classifier = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (classifier == null) {
      throw new NotFoundException("Classifier not found.");
    }

    // Build update object with only provided fields
    const updateData: Partial<UpdateClassifierDto> = {};
    if (description !== undefined) {
      updateData.description = description;
    }
    if (source !== undefined) {
      updateData.source = source;
    }

    const updateResult = await this.databaseService.updateClassifierModel(
      name,
      group_id,
      updateData,
      req.resolvedIdentity.userId,
    );

    return updateResult;
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
        name: { type: "string" },
        label: { type: "string" },
        group_id: { type: "string" },
      },
      required: ["files", "name", "label", "group_id"],
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
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );

    const existingModelData = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }

    const keyPrefix = `classifier/${group_id}/${name}/${label}/`;
    const uploadResults: string[] = [];
    for (const file of files) {
      const key = `${keyPrefix}${file.originalname}`;
      await this.blobStorage.write(key, file.buffer);
      uploadResults.push(key);
    }

    return {
      message: "Received files and data.",
      fileCount: files?.length || 0,
      results: uploadResults,
    };
  }

  @Get("classifier/documents")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get training documents",
    description: "Get the list of training documents for a classifier.",
  })
  @ApiCreatedResponse({
    description: "Documents retrieved successfully",
    type: [String],
  })
  async getClassifierDocuments(
    @Request() req,
    @Query() query: GetClassifierDocumentsQueryDto,
  ): Promise<string[]> {
    const { name, group_id } = query;
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );

    const existingModelData = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }

    const prefix = `classifier/${group_id}/${name}/`;
    const documents = await this.blobStorage.list(prefix);
    return documents.map((doc) => doc.slice(prefix.length));
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
  @HttpCode(204)
  async deleteClassifierDocuments(
    @Request() req,
    @Query() query: DeleteClassifierDocumentsDto,
  ): Promise<void> {
    const { name, group_id, folder } = query;
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );

    const existingModelData = await this.databaseService.getClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }
    try {
      // If there is a folder, only delete that folder
      if (folder != null) {
        const prefix = `classifier/${group_id}/${name}/${folder}/`;
        await this.blobStorage.deleteByPrefix(prefix);
      } else {
        // Delete all document folders for this classifier.
        const prefix = `classifier/${group_id}/${name}/`;
        await this.blobStorage.deleteByPrefix(prefix);
      }
      // No return value: 204 No Content
    } catch {
      this.logger.error("Failed to delete folder: ", folder);
      throw new InternalServerErrorException(
        "Failed to delete requested folder.",
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
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );

    // Respond immediately and run the heavy work in the background
    const model = await this.databaseService.updateClassifierModel(
      name,
      group_id,
      { status: ClassifierStatus.TRAINING },
      userId,
    );

    setImmediate(async () => {
      try {
        // Upload the documents required for training
        const uploadResults =
          await this.classifierService.uploadDocumentsForTraining(
            group_id,
            name,
          );

        // Create the layout json for them
        const filePaths = uploadResults.map((r) => r.blobPath);
        await this.classifierService.createLayoutJson(filePaths);

        // Start the training process
        await this.classifierService.requestClassifierTraining(
          name,
          group_id,
          userId,
        );
      } catch (e) {
        this.logger.error(
          `Background classification request failed for classifier ${name} in group ${group_id}.`,
          e,
        );
        await this.databaseService.updateClassifierModel(
          name,
          group_id,
          { status: ClassifierStatus.FAILED },
          userId,
        );
      }
    });

    return {
      ...model,
      status: ClassifierStatus[model.status as keyof typeof ClassifierStatus],
      source: ClassifierSource[model.source as keyof typeof ClassifierSource],
    };
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
        name: { type: "string" },
        group_id: { type: "string" },
      },
      required: ["file", "name", "group_id"],
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
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );
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
  @ApiOkResponse({
    description: "Classification result retrieved",
    type: ClassificationResultDto,
  })
  async getClassificationResult(
    @Query() query: GetClassificationResultQueryDto,
  ): Promise<ClassificationResultDto> {
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
    return returnValue as ClassificationResultDto;
  }

  @Get("classifier/train")
  @KeycloakSSOAuth()
  @ApiOperation({
    summary: "Get training result",
    description: "Get the result of a classifier training operation.",
  })
  @ApiOkResponse({
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
    await identityCanAccessGroup(
      req.resolvedIdentity,
      group_id,
      this.databaseService,
    );
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
