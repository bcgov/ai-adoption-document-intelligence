import {
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
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { group } from "console";
import { Public } from "@/auth/public.decorator";
import { AzureService } from "@/azure/azure.service";
import { ClassifierService } from "@/azure/classifier.service";
import { ClassifierCreationDto } from "@/azure/dto/classifier.dto";
import { DatabaseService } from "@/database/database.service";
import { KeycloakSSOAuth } from "@/decorators/custom-auth-decorators";
import { ClassifierStatus } from "@/generated";
import { Operation, StorageService } from "@/storage/storage.service";

// @ApiTags("OCR")
@Controller("api/azure")
export class AzureController {
  private readonly logger = new Logger(AzureController.name);

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly storageService: StorageService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Post("classifier")
  @Public()
  @ApiCreatedResponse()
  async createClassifier(@Body() body: ClassifierCreationDto) {
    const { classifierName, description, source, status } = body;
    // TODO: Get group and user id based on requestor
    const group_id = "00000000-0000-0000-0000-000000000000";
    const user_id = "00000000-0000-0000-0000-000000000000";

    // Does this classifier already exist?

    const classifier = await this.databaseService.getClassifierModel(
      classifierName,
      group_id,
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
        group_id,
      },
      user_id,
    );
    return creationResult;
  }

  // Save Training documents to storage
  @Post("classifier/documents")
  @Public()
  @UseInterceptors(FilesInterceptor("files"))
  async uploadClassifierDocuments(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body("classifierName") classifierName: string,
    @Body("label") label: string,
  ) {
    // TODO: Determine what group this user is from.
    // Should only access classifier for their group.
    const groupId = "00000000-0000-0000-0000-000000000000";

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
  @Public()
  @ApiNoContentResponse({ description: "Documents deleted successfully." })
  @HttpCode(204)
  async deleteClassifierDocuments(
    @Body("classifierName") classifierName: string,
    @Body("folders") folders?: string[],
  ): Promise<void> {
    // TODO: Check that requestor is part of group for this classifier.
    const groupId = "00000000-0000-0000-0000-000000000000";
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
  @Public()
  async requestClassifierTraining(
    @Body("classifierName") classifierName: string,
  ) {
    // TODO: get user id from token
    const userId = "00000000-0000-0000-0000-000000000000";

    // TODO: get group id from user info
    const groupId = "00000000-0000-0000-0000-000000000000";

    // TODO: Break this into Temporal components
    // Upload the documents required for training
    const uploadResults =
      await this.classifierService.uploadDocumentsForTraining(
        groupId,
        classifierName,
      );

    // Create the layout json for them
    const filePaths = uploadResults.map((r) => r.blobPath);
    await this.classifierService.createLayoutJson(filePaths);

    // // Start the training process
    await this.classifierService.requestClassifierTraining(
      classifierName,
      groupId,
      userId,
    );

    // // Update status of database entry
    await this.databaseService.updateClassifierModel(
      classifierName,
      groupId,
      {
        status: ClassifierStatus.TRAINING,
      },
      userId,
    );
  }

  // Request Classification
  // @Post("classifier/classify")
  // @Public()
  // async requestClassification(@Body("classifierName") classifierName: string, @Body("documentId") documentId: string){
  //   // TODO: get group id from user info
  //   const groupId = "00000000-0000-0000-0000-000000000000";
  //   // Is there a classifier trained for this group?
  //   const classifier = await this.databaseService.getClassifierModel(classifierName, groupId);
  //   if (classifier == null){
  //     throw new NotFoundException("Classifier not found.")
  //   }

  // }

  // Check Classification status

  // Check Training status
}
