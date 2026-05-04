import { getErrorStack } from "@ai-di/shared-logging";
import { DocumentIntelligenceClient } from "@azure-rest/ai-document-intelligence";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AzureService } from "@/azure/azure.service";
import { ClassifierService } from "@/azure/classifier.service";
import { ClassifierDbService } from "@/azure/classifier-db.service";
import { AzureStorageService } from "@/blob-storage/azure-storage.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { BLOB_STORAGE_CONTAINER_NAME } from "@/blob-storage/blob-storage.module";
import {
  buildBlobPrefixPath,
  OperationCategory,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";

/** Environment variable name that enables this cleanup job */
const ENABLE_ENV_VAR = "ENABLE_CLASSIFIER_ORPHAN_CLEANUP";

@Injectable()
export class ClassifierOrphanCleanupService implements OnModuleInit {
  private readonly client: DocumentIntelligenceClient;

  constructor(
    private readonly classifierService: ClassifierService,
    private readonly classifierDb: ClassifierDbService,
    private readonly azureStorage: AzureStorageService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
    @Inject(BLOB_STORAGE_CONTAINER_NAME)
    private readonly containerName: string,
    azureService: AzureService,
  ) {
    this.client = azureService.getClient();
  }

  /**
   * Logs at startup whether the orphan cleanup job is enabled or disabled.
   */
  onModuleInit(): void {
    if (process.env[ENABLE_ENV_VAR] !== "true") {
      this.logger.debug(
        `Orphan classifier cleanup is disabled. Set ${ENABLE_ENV_VAR}=true to enable.`,
      );
    }
  }

  /**
   * Scheduled weekly cleanup job that removes Azure DI classifier models and
   * their blob storage files when no corresponding database record exists.
   * Controlled by the `ENABLE_CLASSIFIER_ORPHAN_CLEANUP` environment variable.
   */
  @Cron(CronExpression.EVERY_WEEK, {
    disabled: process.env[ENABLE_ENV_VAR] !== "true",
  })
  async cleanupOrphanClassifiers(): Promise<void> {
    this.logger.log("Starting orphan classifier cleanup run");

    let azureClassifiers: string[] = [];
    try {
      azureClassifiers = await this.classifierService.listAzureClassifiers();
    } catch (err) {
      this.logger.error("Failed to list Azure DI classifiers — aborting run", {
        stack: getErrorStack(err),
      });
      return;
    }

    // Fetch all DB records once and build a Set for O(1) membership checks
    let dbClassifierKeys: Set<string>;
    try {
      const dbRecords =
        await this.classifierDb.findAllClassifierNameGroupPairs();
      dbClassifierKeys = new Set(
        dbRecords.map((r) => `${r.group_id}__${r.name}`),
      );
    } catch (err) {
      this.logger.error(
        "Failed to fetch classifier DB records — aborting run",
        {
          stack: getErrorStack(err),
        },
      );
      return;
    }

    let totalOrphaned = 0;
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const modelId of azureClassifiers) {
      const parsed = this.parseClassifierModelId(modelId);
      if (!parsed) {
        this.logger.warn(
          `Skipping Azure DI classifier with malformed ID: "${modelId}" — expected format {groupId}__{classifierName}`,
        );
        continue;
      }

      const { groupId, classifierName } = parsed;

      if (dbClassifierKeys.has(modelId)) {
        // Not an orphan — DB record exists
        continue;
      }

      totalOrphaned++;
      this.logger.log(
        `Found orphan classifier: groupId="${groupId}", classifierName="${classifierName}"`,
      );

      const deleted = await this.deleteOrphan(groupId, classifierName, modelId);
      if (deleted) {
        totalDeleted++;
      } else {
        totalErrors++;
        this.logger.warn(
          `Failed to fully delete orphan classifier: groupId="${groupId}", classifierName="${classifierName}"`,
          { groupId, classifierName },
        );
      }
    }

    this.logger.log("Orphan classifier cleanup run complete", {
      totalFound: azureClassifiers.length,
      totalOrphaned,
      totalDeleted,
      totalErrors,
    });
  }

  /**
   * Deletes all resources associated with an orphaned Azure DI classifier model.
   * Individual step failures are logged but do not stop subsequent steps.
   * @param groupId The group ID parsed from the model ID.
   * @param classifierName The classifier name parsed from the model ID.
   * @param modelId The full Azure DI model ID (e.g. `{groupId}__{classifierName}`).
   * @returns `true` if all deletions succeeded, `false` if any step failed.
   */
  private async deleteOrphan(
    groupId: string,
    classifierName: string,
    modelId: string,
  ): Promise<boolean> {
    let success = true;
    const blobPrefix = buildBlobPrefixPath(
      groupId,
      OperationCategory.CLASSIFICATION,
      [classifierName],
    );

    // Delete Azure DI model
    try {
      await (
        this.client as unknown as {
          path: (p: string) => {
            delete: (opts: object) => Promise<{ status: string }>;
          };
        }
      )
        .path(`/documentClassifiers/${modelId}`)
        .delete({ queryParameters: { "api-version": "2024-11-30" } });
      this.logger.log(`Deleted orphan Azure DI classifier model "${modelId}"`, {
        groupId,
        classifierName,
      });
    } catch (err) {
      this.logger.error(
        `Failed to delete orphan Azure DI classifier model "${modelId}"`,
        { groupId, classifierName, stack: getErrorStack(err) },
      );
      success = false;
    }

    // Delete Azure blob storage files
    try {
      await this.azureStorage.deleteFilesWithPrefix(
        blobPrefix,
        this.containerName,
      );
      this.logger.log(
        `Deleted orphan Azure blob storage files for "${classifierName}"`,
        { groupId, classifierName },
      );
    } catch (err) {
      this.logger.error(
        `Failed to delete orphan Azure blob storage files for "${classifierName}"`,
        { groupId, classifierName, stack: getErrorStack(err) },
      );
      success = false;
    }

    // Delete primary blob storage files
    try {
      await this.blobStorage.deleteByPrefix(blobPrefix);
      this.logger.log(
        `Deleted orphan primary blob storage files for "${classifierName}"`,
        { groupId, classifierName },
      );
    } catch (err) {
      this.logger.error(
        `Failed to delete orphan primary blob storage files for "${classifierName}"`,
        { groupId, classifierName, stack: getErrorStack(err) },
      );
      success = false;
    }

    return success;
  }

  /**
   * Parses an Azure DI classifier model ID into groupId and classifierName.
   * Expected format: `{groupId}__{classifierName}`.
   * @param modelId The Azure DI model ID string.
   * @returns Parsed `{ groupId, classifierName }` or `null` if the format is invalid.
   */
  private parseClassifierModelId(
    modelId: string,
  ): { groupId: string; classifierName: string } | null {
    const separatorIndex = modelId.indexOf("__");
    if (separatorIndex === -1) return null;
    const groupId = modelId.slice(0, separatorIndex);
    const classifierName = modelId.slice(separatorIndex + 2);
    if (!groupId || !classifierName) return null;
    return { groupId, classifierName };
  }
}
