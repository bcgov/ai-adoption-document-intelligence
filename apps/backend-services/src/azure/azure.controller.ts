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
  NotFoundException,
  Patch,
  Post,
  Query,
  Req,
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
import { Request } from "express";
import { Identity } from "@/auth/identity.decorator";
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
import {
  buildBlobFilePath,
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { GroupRole } from "@/generated/edge";
import { AppLoggerService } from "@/logging/app-logger.service";

@ApiTags("Azure")
@Controller("api/azure")
export class AzureController {
  constructor(
    private readonly classifierService: ClassifierService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly azureService: AzureService,
    private readonly logger: AppLoggerService,
  ) {}

  @Get("classifier")
  @Identity()
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
  async getClassifiers(
    @Req() req: Request,
    @Query("group_id") groupId?: string,
  ) {
    if (groupId) {
      identityCanAccessGroup(req.resolvedIdentity, groupId);
      return this.classifierService.findAllClassifierModelsForGroups([groupId]);
    }
    const groupIds = getIdentityGroupIds(req.resolvedIdentity);
    const classifiers =
      await this.classifierService.findAllClassifierModelsForGroups(groupIds);
    return classifiers;
  }

  @Post("classifier")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { body: "group_id" },
  })
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
  async createClassifier(
    @Req() req: Request,
    @Body() body: ClassifierCreationDto,
  ) {
    const { name, description, source, group_id } = body;

    // Does this classifier already exist?
    const classifier = await this.classifierService.findClassifierModel(
      name,
      group_id,
    );
    if (classifier != null) {
      throw new ForbiddenException("Classifier with this name already exists.");
    }
    const creationResult = await this.classifierService.createClassifierModel(
      name,
      {
        description,
        source,
        status: ClassifierStatus.PRETRAINING,
        config: { labels: [] },
        group_id: group_id,
      },
      req.resolvedIdentity.actorId,
    );
    return creationResult;
  }

  @Patch("classifier")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { body: "group_id" },
  })
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
  async updateClassifier(
    @Req() req: Request,
    @Body() body: UpdateClassifierDto,
  ) {
    const { name, group_id, description, source } = body;

    // Check if classifier exists
    const classifier = await this.classifierService.findClassifierModel(
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

    const updateResult = await this.classifierService.updateClassifierModel(
      name,
      group_id,
      updateData,
      req.resolvedIdentity.actorId,
    );

    return updateResult;
  }

  @Post("classifier/documents")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { query: "group_id" },
  })
  @ApiOperation({
    summary: "Upload training documents",
    description: "Upload training documents for a classifier.",
  })
  @UseInterceptors(FilesInterceptor("files"))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "group_id", required: true, description: "Group ID" })
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
      },
      required: ["files", "name", "label"],
    },
    description: "Upload training documents for a classifier",
  })
  @ApiCreatedResponse({
    description: "Files uploaded successfully",
    type: UploadClassifierDocumentsResponseDto,
  })
  async uploadClassifierDocuments(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: UploadClassifierDocumentsDto,
    @Query("group_id") group_id: string,
  ): Promise<UploadClassifierDocumentsResponseDto> {
    const { name, label } = body;

    const existingModelData = await this.classifierService.findClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }

    const uploadResults: string[] = [];
    for (const file of files) {
      const key = buildBlobFilePath(
        group_id,
        OperationCategory.CLASSIFICATION,
        [name, label],
        file.originalname,
      );
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
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { query: "group_id" },
  })
  @ApiOperation({
    summary: "Get training documents",
    description: "Get the list of training documents for a classifier.",
  })
  @ApiCreatedResponse({
    description: "Documents retrieved successfully",
    type: [String],
  })
  async getClassifierDocuments(
    @Query() query: GetClassifierDocumentsQueryDto,
  ): Promise<string[]> {
    const { name, group_id } = query;

    const existingModelData = await this.classifierService.findClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }

    const prefix = buildBlobPrefixPath(
      group_id,
      OperationCategory.CLASSIFICATION,
      [name],
    );
    const documents = await this.blobStorage.list(prefix);
    return documents.map((doc) => doc.slice(prefix.length));
  }

  @Delete("classifier/documents")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { query: "group_id" },
  })
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
    @Query() query: DeleteClassifierDocumentsDto,
  ): Promise<void> {
    const { name, group_id, folder } = query;

    const existingModelData = await this.classifierService.findClassifierModel(
      name,
      group_id,
    );
    if (existingModelData == null) {
      throw new NotFoundException("No existing record of classifier model.");
    }
    try {
      // If there is a folder, only delete that folder
      if (folder != null) {
        const prefix = buildBlobPrefixPath(
          group_id,
          OperationCategory.CLASSIFICATION,
          [name, folder],
        );
        await this.blobStorage.deleteByPrefix(prefix);
      } else {
        // Delete all document folders for this classifier.
        const prefix = buildBlobPrefixPath(
          group_id,
          OperationCategory.CLASSIFICATION,
          [name],
        );
        await this.blobStorage.deleteByPrefix(prefix);
      }
      // No return value: 204 No Content
    } catch {
      this.logger.error("Failed to delete folder", { folder });
      throw new InternalServerErrorException(
        "Failed to delete requested folder.",
      );
    }
  }

  @Post("classifier/train")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { body: "group_id" },
  })
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
    @Req() req: Request,
    @Body() body: RequestClassifierTrainingDto,
  ): Promise<ClassifierModelResponseDto> {
    const { name, group_id } = body;
    const actorId = req.resolvedIdentity.actorId;
    // Respond immediately and run the heavy work in the background
    const model = await this.classifierService.updateClassifierModel(
      name,
      group_id,
      { status: ClassifierStatus.TRAINING },
      actorId,
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
          actorId,
        );
      } catch (e) {
        this.logger.error(
          `Background classification request failed for classifier ${name} in group ${group_id}.`,
          { error: String(e) },
        );
        await this.classifierService.updateClassifierModel(
          name,
          group_id,
          { status: ClassifierStatus.FAILED },
          actorId,
        );
      }
    });

    return {
      ...model,
      status: ClassifierStatus[model.status as keyof typeof ClassifierStatus],
      source: ClassifierSource[model.source as keyof typeof ClassifierSource],
      last_used_at: model.last_used_at ?? undefined,
      operation_location: model.operation_location ?? undefined,
    };
  }

  @Post("classifier/classify")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { query: "group_id" },
  })
  @ApiOperation({
    summary: "Request document classification",
    description: "Request classification for a document using a classifier.",
  })
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiQuery({ name: "group_id", required: true, description: "Group ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
        name: { type: "string" },
      },
      required: ["file", "name"],
    },
    description: "Request classification for a document",
  })
  @ApiCreatedResponse({
    description: "Classification requested successfully",
    type: ClassifierResponseDto,
  })
  async requestClassification(
    @Req() req: Request,
    @Body() body: RequestClassificationDto,
    @UploadedFile() file: Express.Multer.File,
    @Query("group_id") group_id: string,
  ): Promise<ClassifierResponseDto> {
    const { name } = body;
    const actorId = req.resolvedIdentity.actorId;
    // Is there a classifier trained for this group?
    const classifier = await this.classifierService.findClassifierModel(
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

    await this.classifierService.updateClassifierModel(
      name,
      group_id,
      {
        last_used_at: new Date(),
      },
      actorId,
    );
    return response;
  }

  @Get("classifier/classify")
  // No identity check, as caller is providing only the operation location url, which we do not store.
  @Identity()
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
    return returnValue as unknown as ClassificationResultDto;
  }

  @Get("classifier/train")
  @Identity({
    minimumRole: GroupRole.MEMBER,
    groupIdFrom: { query: "group_id" },
  })
  @ApiOperation({
    summary: "Get training result",
    description: "Get the result of a classifier training operation.",
  })
  @ApiOkResponse({
    description: "Training result retrieved",
    type: ClassifierModelResponseDto,
  })
  async getTrainingResult(
    @Req() req: Request,
    @Query() query: GetTrainingResultQueryDto,
  ): Promise<ClassifierModelResponseDto> {
    const { name, group_id } = query;
    if (name == null || group_id == null) {
      throw new BadRequestException(
        "Must provide both name and group_id query parameters.",
      );
    }
    identityCanAccessGroup(req.resolvedIdentity, group_id);
    const actorId = req.resolvedIdentity.actorId;
    const classifier = await this.classifierService.findClassifierModel(
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
      async (_r) => {
        returnValue = await this.classifierService.updateClassifierModel(
          name,
          group_id,
          { status: ClassifierStatus.READY },
          actorId,
        );
      },
      (r) => {
        throw new Error(
          `Could not retrieve status of classifier. Code: ${r.error.code}. Message: ${r.error.message}`,
        );
      },
    );
    return returnValue as unknown as ClassifierModelResponseDto;
  }
}
