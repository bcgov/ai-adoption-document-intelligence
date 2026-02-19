import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AzureService } from "@/azure/azure.service";
import { ClassifierStatus } from "@/azure/dto/classifier-constants.dto";
import { DatabaseService } from "@/database/database.service";

@Injectable()
export class ClassifierPollerService {
  private readonly logger = new Logger(ClassifierPollerService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly azureService: AzureService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async pollActiveClassifiers(): Promise<void> {
    try {
      // Find all classifiers that are currently training
      const classifiers = await this.db["prisma"].classifierModel.findMany({
        where: {
          status: ClassifierStatus.TRAINING,
          operation_location: { not: null },
        },
      });
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
      this.logger.error("Error polling active classifiers", error.stack);
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
        await this.databaseService.updateClassifierModel(
          classifierName,
          groupId,
          { status: ClassifierStatus.READY },
        );
        this.logger.log(
          `Classifier ${classifierName} (group ${groupId}) training succeeded.`,
        );
      } else if (status === "failed") {
        await this.databaseService.updateClassifierModel(
          classifierName,
          groupId,
          { status: ClassifierStatus.FAILED },
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
