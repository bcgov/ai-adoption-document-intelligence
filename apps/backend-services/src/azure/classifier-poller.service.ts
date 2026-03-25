import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AzureService } from "@/azure/azure.service";
import { ClassifierDbService } from "@/azure/classifier-db.service";
import { ClassifierStatus } from "@/azure/dto/classifier-constants.dto";
import { AzureStorageService } from "@/blob-storage/azure-storage.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { ClassifierService } from "./classifier.service";

@Injectable()
export class ClassifierPollerService {
  constructor(
    private readonly classifierDb: ClassifierDbService,
    private readonly azureService: AzureService,
    private readonly azureStorage: AzureStorageService,
    private readonly classifierService: ClassifierService,
    private readonly logger: AppLoggerService,
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
        stack: error instanceof Error ? error.stack : String(error),
      });
    }
  }

  private async pollClassifierStatus(
    classifierName: string,
    groupId: string,
    operationLocation: string,
  ): Promise<void> {
    try {
      const result =
        await this.azureService.checkOperationStatus(operationLocation);
      const data = await result.json();
      const status = data.status || data.modelInfo?.status;
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
          `${groupId}/${classifierName}`,
          this.classifierService.classifierContainer,
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
        );
      } else {
        this.logger.debug(
          `Classifier ${classifierName} (group ${groupId}) still training (status: ${status}).`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Error polling classifier ${classifierName} (group ${groupId})`,
        error.stack,
      );
    }
  }
}
