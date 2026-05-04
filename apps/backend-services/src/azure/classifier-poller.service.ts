import { getErrorStack } from "@ai-di/shared-logging";
import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AzureService } from "@/azure/azure.service";
import { ClassifierDbService } from "@/azure/classifier-db.service";
import { ClassifierStatus } from "@/azure/dto/classifier-constants.dto";
import { AzureStorageService } from "@/blob-storage/azure-storage.service";
import { BLOB_STORAGE_CONTAINER_NAME } from "@/blob-storage/blob-storage.module";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";

@Injectable()
export class ClassifierPollerService {
  constructor(
    private readonly classifierDb: ClassifierDbService,
    private readonly azureService: AzureService,
    private readonly azureStorage: AzureStorageService,
    private readonly logger: AppLoggerService,
    @Inject(BLOB_STORAGE_CONTAINER_NAME)
    private readonly containerName: string,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollActiveClassifiers(): Promise<void> {
    try {
      // Find all classifiers that are currently training
      const classifiers = await this.classifierDb.findAllTrainingClassifiers();
      if (classifiers.length === 0) return;
      this.logger.debug(`Polling ${classifiers.length} active classifier(s)`);
      for (const classifier of classifiers) {
        await this.pollClassifierStatus(
          classifier.name,
          classifier.group_id,
          classifier.operation_location,
        );
      }
    } catch (error) {
      this.logger.error("Error polling active classifiers", {
        stack: getErrorStack(error),
      });
    }
  }

  private async pollClassifierStatus(
    classifierName: string,
    groupId: string,
    operationLocation: string | null,
  ): Promise<void> {
    try {
      if (!operationLocation) {
        this.logger.warn(
          `Classifier ${classifierName} (group ${groupId}) has no operation location`,
        );
        return;
      }
      const result =
        await this.azureService.checkOperationStatus(operationLocation);
      const status = result.status || result.modelInfo?.status;
      if (status === "succeeded") {
        await this.classifierDb.systemUpdateClassifierModel(
          classifierName,
          groupId,
          {
            status: ClassifierStatus.READY,
          },
        );
        this.logger.log(
          `Classifier ${classifierName} (group ${groupId}) training succeeded.`,
        );
        // Need to remove the files from blob storage to avoid costs
        await this.azureStorage.deleteFilesWithPrefix(
          buildBlobPrefixPath(groupId, OperationCategory.CLASSIFICATION, [
            classifierName,
          ]),
          this.containerName,
        );
      } else if (status === "failed") {
        await this.classifierDb.systemUpdateClassifierModel(
          classifierName,
          groupId,
          {
            status: ClassifierStatus.FAILED,
          },
        );
        this.logger.warn(
          `Classifier ${classifierName} (group ${groupId}) training failed.`,
          { result },
        );
      } else {
        this.logger.debug(
          `Classifier ${classifierName} (group ${groupId}) still training (status: ${status}).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error polling classifier ${classifierName} (group ${groupId})`,
        { stack: getErrorStack(error) },
      );
    }
  }
}
