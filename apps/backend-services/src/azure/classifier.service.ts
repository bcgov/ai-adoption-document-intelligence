import { DocumentIntelligenceClient } from "@azure-rest/ai-document-intelligence";
import type { ClassifierModel } from "@generated/client";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import "multer";
import * as path from "node:path";
import { AzureService } from "@/azure/azure.service";
import {
  type ClassifierConfig,
  ClassifierDbService,
  type ClassifierEditableProperties,
  type ClassifierModelWithGroup,
} from "@/azure/classifier-db.service";
import { ClassifierStatus } from "@/azure/dto/classifier-constants.dto";
import { AzureStorageService } from "@/blob-storage/azure-storage.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "@/blob-storage/blob-storage.interface";
import { BLOB_STORAGE_CONTAINER_NAME } from "@/blob-storage/blob-storage.module";
import {
  buildBlobPrefixPath,
  OperationCategory,
  validateBlobFilePath,
} from "@/blob-storage/storage-path-builder";
import { AppLoggerService } from "@/logging/app-logger.service";

export type {
  ClassifierConfig,
  ClassifierEditableProperties,
  ClassifierModelWithGroup,
};

interface DocType {
  azureBlobSource: {
    containerUrl: string; // Sas Url of container root.
    prefix: string; // Folder where this type of document is found.
  };
}

@Injectable()
export class ClassifierService {
  private readonly client: DocumentIntelligenceClient;

  constructor(
    private classifierDb: ClassifierDbService,
    private azureService: AzureService,
    private azureStorage: AzureStorageService,
    @Inject(BLOB_STORAGE)
    private blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
    @Inject(BLOB_STORAGE_CONTAINER_NAME)
    private readonly containerName: string,
  ) {
    this.client = azureService.getClient();
  }

  /**
   * Creates json files of the results produced by the prebuilt-layout model in Azure DI.
   * Saves them to blob storage beside the original files.
   * @param filePaths A list of relative file paths in blob storage for analysis. They should match the files exactly, not folders.
   */
  createLayoutJson = async (filePaths: string[]) => {
    // Each file in a training folder needs accompanying layout json.
    // The file must be named just like its corresponding image + .ocr.json
    // e.g. If image is file.jpg, layout json must be file.jpg.ocr.json.

    // Looping through each folder of training
    await Promise.all(
      filePaths.map(async (filePath) => {
        // Analyze each file
        if (!filePath.match(/\.(jpg|jpeg|png|bmp|tif|tiff)$/i)) return; // Only process images
        // Does this file already exist?
        const jsonBlobName = filePath + ".ocr.json";
        const exists = await this.azureStorage.fileExists(
          this.containerName,
          jsonBlobName,
        );
        if (exists) return;
        const url = this.azureStorage.getBlobSasUrl(
          this.containerName,
          filePath,
        );

        // Run general layout model
        const analyzeResponse = await this.client
          // @ts-expect-error: Azure SDK type is too strict for .path()
          .path("/documentModels/prebuilt-layout:analyze")
          .post({
            body: {
              urlSource: url,
            },
            contentType: "application/json",
            queryParameters: { "api-version": "2024-11-30" },
          });

        if (analyzeResponse.status === "202") {
          // Poll operation-location until succeeded or failed
          const operationLocation =
            analyzeResponse.headers["operation-location"] ||
            analyzeResponse.headers["Operation-Location"];
          if (!operationLocation) {
            this.logger.error(
              "No operation-location header returned for 202 response",
            );
            return;
          }
          await this.azureService.pollOperationUntilResolved(
            operationLocation,
            async (result) => {
              // Save JSON result to blob storage with same base name but .ocr.json extension
              await this.azureStorage.uploadFile(
                this.containerName,
                jsonBlobName,
                Buffer.from(JSON.stringify(result, null, 2)),
              );
              this.logger.debug(
                `Uploaded layout JSON to blob: ${jsonBlobName}`,
              );
            },
            (result) => {
              this.logger.error("Analyze operation failed", { result });
            },
          );
        } else if (analyzeResponse.status === "404") {
          // Possible fallback if the url doesn't work. Download and analyze via upload.
          // I haven't had to rely on this so far.
          this.logger.warn(
            `404 from analyze API for ${filePath}, falling back to download/upload method.`,
          );
          this.logger.warn("Original error", { body: analyzeResponse.body });
          // Download the blob
          const blobResp = await fetch(url);
          if (!blobResp.ok) {
            this.logger.error(
              `Failed to download blob for fallback: ${filePath}`,
            );
            return;
          }
          const fileBuffer = Buffer.from(await blobResp.arrayBuffer());
          // Fallback: Send as base64Source in JSON body
          const uploadResponse = await this.client
            // @ts-expect-error: Azure SDK type is too strict for .path()
            .path("/documentModels/{modelId}:analyze")
            .post({
              // @ts-expect-error: base64Source is not in the SDK types but is accepted by the API
              body: { base64Source: fileBuffer.toString("base64") },
              queryParameters: { "api-version": "2024-11-30" },
              pathParameters: { modelId: "prebuilt-layout" },
              headers: { "Content-Type": "application/json" },
            });
          if (uploadResponse.status === "200") {
            await this.azureStorage.uploadFile(
              this.containerName,
              jsonBlobName,
              Buffer.from(JSON.stringify(uploadResponse.body, null, 2)),
            );
            this.logger.debug(
              `Uploaded layout JSON to blob (fallback): ${jsonBlobName}`,
            );
          } else {
            this.logger.error("Fallback analyze failed", {
              filePath,
              status: uploadResponse.status,
              body: uploadResponse.body,
            });
          }
        } else {
          this.logger.error("Failed to analyze blob", {
            filePath,
            url,
            status: analyzeResponse.status,
            body: analyzeResponse.body,
          });
        }
      }),
    );
  };

  /**
   * Uploads local documents into Azure blob storage for classifier training.
   * @param groupId The ID of the group that owns this classifier.
   * @param classifierName The name given to the classifier.
   * @returns A list of objects specifying the original path and new blob path.
   */
  async uploadDocumentsForTraining(groupId: string, classifierName: string) {
    // No need to ensure container exists, handled by blobStorage implementation

    // List all files from primary blob storage under the classifier prefix
    const allKeys = await this.blobStorage.list(
      buildBlobPrefixPath(groupId, OperationCategory.CLASSIFICATION, [
        classifierName,
      ]),
    );

    const uploadResults = await Promise.all(
      allKeys.map(async (key) => {
        // Read file data from primary blob storage
        const blobFilePath = validateBlobFilePath(key);
        // Does this file already exist in Azure storage?
        const exists = await this.azureStorage.fileExists(
          this.containerName,
          blobFilePath,
        );
        if (exists)
          return {
            originalPath: key,
            blobPath: blobFilePath,
          };
        const fileBuffer = await this.blobStorage.read(blobFilePath);

        await this.azureStorage.uploadFile(
          this.containerName,
          blobFilePath,
          fileBuffer,
        );
        return {
          originalPath: key,
          blobPath: blobFilePath,
        };
      }),
    );

    return uploadResults;
  }

  /**
   * Generates a classifier model training config.
   * @param groupId ID of group that owns classifier.
   * @param classifierName Name of classifier.
   * @param description Description of classifier.
   * @param containerUrl Blob container URL.
   * @returns
   */
  async generateTrainingConfig(
    groupId: string,
    classifierName: string,
    description: string,
    containerUrl: string,
  ) {
    // Get a list of folder paths in the groupId/classifierName folder in blob storage
    const prefix =
      path.posix.join(
        groupId,
        OperationCategory.CLASSIFICATION,
        classifierName,
      ) + "/";
    const containerClient = this.azureStorage.getContainerClient(
      this.containerName,
    );
    const folderPaths: string[] = [];
    for await (const item of containerClient.listBlobsByHierarchy("/", {
      prefix,
    })) {
      if (item.kind === "prefix" && item.name !== prefix) {
        folderPaths.push(item.name);
      }
    }

    const docTypes: Record<string, DocType> = {};
    for (const folderPath of folderPaths) {
      // folderPath = 'groupId/operation/classifierName/label/'
      const parts = folderPath.split("/").filter(Boolean);
      const label = parts[parts.length - 1];
      docTypes[label] = {
        azureBlobSource: {
          containerUrl,
          prefix: folderPath,
        },
      };
    }
    // NOTE: baseClassifierId cannot be the same one you are overwriting.
    // It will not find the original. Possibly clears beforehand.
    return {
      classifierId: this.getConstructedClassifierName(groupId, classifierName),
      description,
      docTypes,
      allowOverwrite: true, // Default is false,
      // baseClassifierId: classifierId
    };
  }

  /**
   * Initiates the training of a classifier model in Azure DI.
   * The files must have been uploaded and had their layout json created before this point.
   * @param classifierName Name of the classifier model.
   * @param groupId ID of the group that owns the classifier.
   * @param actorId ID of the user making the request.
   * @returns The updated record of classifier model from the database.
   */
  requestClassifierTraining = async (
    classifierName: string,
    groupId: string,
    actorId: string,
  ) => {
    // Does this classifier record exist?
    const existingClassifier = await this.classifierDb.findClassifierModel(
      classifierName,
      groupId,
    );
    if (existingClassifier == null) {
      throw new NotFoundException(
        "Classifier entry not found. Cannot proceed with training.",
      );
    }

    const containerUrl = await this.azureStorage.generateSasUrl(
      this.containerName,
    );

    const trainingConfig = await this.generateTrainingConfig(
      groupId,
      classifierName,
      existingClassifier.description,
      containerUrl,
    );

    // Run training of classifier
    const response = await this.client.path("/documentClassifiers:build").post({
      body: trainingConfig,
      queryParameters: { "api-version": "2024-11-30" },
    });

    // Poll operation status if 202 Accepted
    let operationLocation =
      response.headers["operation-location"] ||
      response.headers["Operation-Location"];
    if (response.status === "202" && operationLocation) {
      // Returned operation-location header uses wrong domain.
      // Must replace with our actual Azure endpoint
      const docIntelligenceEndpoint = this.azureService.getEndpoint();
      operationLocation = operationLocation.replace(
        /https:\/\/[^/]+/,
        docIntelligenceEndpoint.replace(/\/$/, ""),
      );

      // Update classifier record
      return await this.classifierDb.updateClassifierModel(
        classifierName,
        groupId,
        {
          status: ClassifierStatus.TRAINING,
          operation_location: operationLocation,
        },
        actorId,
      );
    } else {
      const message = `Request for training classifier ${classifierName} unsuccessful. See logs for details.`;
      this.logger.error(message, {
        status: response.status,
        body: response.body,
      });
      throw new Error(message);
    }
  };

  /**
   * Sends a file to Azure for classification from local application storage.
   * @param filePath Path to file in application storage.
   * @param classiferName Name of classifier.
   * @param groupId ID of group that owns classifier.
   * @returns Response from Azure containing the operation location to retrieve results.
   */
  requestClassification = async (
    filePath: string,
    classiferName: string,
    groupId: string,
  ) => {
    const constructedClassifierName = this.getConstructedClassifierName(
      groupId,
      classiferName,
    );
    // Read file and encode to base64
    const blobFilePath = validateBlobFilePath(filePath);
    const fileData = await this.blobStorage.read(blobFilePath);
    const base64String = Buffer.from(fileData).toString("base64");

    const response = await this.client
      // @ts-expect-error: Azure SDK type is too strict for .path()
      .path(`/documentClassifiers/${constructedClassifierName}:analyze`)
      .post({
        body: {
          // @ts-expect-error: base64Source is not in the SDK types but is accepted by the API
          base64Source: base64String,
        },
        queryParameters: {
          "api-version": "2024-11-30",
          _overload: "classifyDocument",
        },
      });
    if (response.status === "202") {
      const operationLocation =
        response.headers["operation-location"] ||
        response.headers["Operation-Location"];
      return { status: "202", content: operationLocation };
    }
    return { status: response.status, content: "", error: response.body };
  };

  /**
   * Sends a file to Azure for classification.
   * @param file Multer file to send.
   * @param classiferName Name of classifier.
   * @param groupId ID of group that owns classifier.
   * @returns Response from Azure containing the operation location to retrieve results.
   */
  requestClassificationFromFile = async (
    file: Express.Multer.File,
    classiferName: string,
    groupId: string,
  ) => {
    const constructedClassifierName = this.getConstructedClassifierName(
      groupId,
      classiferName,
    );
    // Read file and encode to base64
    const base64String = Buffer.from(file.buffer).toString("base64");
    const response = await this.client
      // @ts-expect-error: Azure SDK type is too strict for .path()
      .path(`/documentClassifiers/${constructedClassifierName}:analyze`)
      .post({
        body: {
          // @ts-expect-error: base64Source is not in the SDK types but is accepted by the API
          base64Source: base64String,
        },
        queryParameters: {
          "api-version": "2024-11-30",
          _overload: "classifyDocument",
        },
      });
    if (response.status === "202") {
      const operationLocation =
        response.headers["operation-location"] ||
        response.headers["Operation-Location"];
      return { status: "202", content: operationLocation };
    }
    return { status: response.status, content: "", error: response.body };
  };

  getConstructedClassifierName = (groupId: string, classifierName: string) => {
    return `${groupId}__${classifierName}`;
  };

  /**
   * Finds a classifier model by name and group ID.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @returns The ClassifierModel record or null if not found.
   */
  async findClassifierModel(
    classifierName: string,
    groupId: string,
  ): Promise<ClassifierModel | null> {
    return this.classifierDb.findClassifierModel(classifierName, groupId);
  }

  /**
   * Finds all classifier models belonging to the specified groups.
   * @param groupIds The list of group IDs to filter by.
   * @returns An array of ClassifierModel records with their associated group.
   */
  async findAllClassifierModelsForGroups(
    groupIds: string[] | undefined,
  ): Promise<ClassifierModelWithGroup[]> {
    return this.classifierDb.findAllClassifierModelsForGroups(groupIds);
  }

  /**
   * Creates a new classifier model record.
   * @param classifierName The name of the classifier.
   * @param properties The editable properties for the classifier.
   * @param actorId The ID of the user creating the classifier.
   * @returns The created ClassifierModel record.
   */
  async createClassifierModel(
    classifierName: string,
    properties: ClassifierEditableProperties,
    actorId: string,
  ): Promise<ClassifierModel> {
    return this.classifierDb.createClassifierModel(
      classifierName,
      properties,
      actorId,
    );
  }

  /**
   * Updates an existing classifier model record.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @param properties The partial properties to update.
   * @param actorId The ID of the user making the update.
   * @returns The updated ClassifierModel record.
   */
  async updateClassifierModel(
    classifierName: string,
    groupId: string,
    properties: Partial<ClassifierEditableProperties>,
    actorId: string,
  ): Promise<ClassifierModel> {
    return this.classifierDb.updateClassifierModel(
      classifierName,
      groupId,
      properties,
      actorId,
    );
  }

  /**
   * Lists all classifier models registered in Azure Document Intelligence.
   * @returns An array of Azure DI classifier model IDs.
   */
  async listAzureClassifiers(): Promise<string[]> {
    const response = await (
      this.client as unknown as {
        path: (p: string) => {
          get: (opts: object) => Promise<{ status: string; body: unknown }>;
        };
      }
    )
      .path("/documentClassifiers")
      .get({ queryParameters: { "api-version": "2024-11-30" } });

    if (response.status !== "200") {
      this.logger.error("Failed to list Azure DI classifiers", {
        status: response.status,
        body: response.body,
      });
      throw new Error(
        `Failed to list Azure DI classifiers: ${response.status}`,
      );
    }

    const body = response.body as {
      value?: Array<{ classifierId: string }>;
    };
    return (body.value ?? []).map((item) => item.classifierId);
  }

  /**
   * Deletes a classifier and all its associated resources.
   * Steps: cancel training (if applicable), delete Azure DI model, delete Azure blob files,
   * delete primary blob files, hard-delete DB record.
   * @param classifierName The name of the classifier.
   * @param groupId The group ID that owns the classifier.
   * @param actorId The ID of the actor requesting deletion.
   * @returns An object listing conflicting workflow names/IDs if deletion is blocked, or null on success.
   */
  async deleteClassifier(
    classifierName: string,
    groupId: string,
    actorId: string,
  ): Promise<{ conflictingWorkflows: { id: string; name: string }[] } | null> {
    const conflictingWorkflows =
      await this.classifierDb.findWorkflowVersionsReferencingClassifier(
        classifierName,
        groupId,
      );
    if (conflictingWorkflows.length > 0) {
      return { conflictingWorkflows };
    }

    const classifier = await this.classifierDb.findClassifierModel(
      classifierName,
      groupId,
    );
    if (!classifier) {
      return null;
    }

    const constructedName = this.getConstructedClassifierName(
      groupId,
      classifierName,
    );
    const blobPrefix = buildBlobPrefixPath(
      groupId,
      OperationCategory.CLASSIFICATION,
      [classifierName],
    );

    // Hard-delete DB record first. Removing the row before touching external
    // resources means the classifier immediately disappears from the user's
    // perspective and a stale READY row can never be left pointing at nothing.
    // All subsequent external-resource deletions are best-effort; any leftovers
    // will be collected by the orphan cleaner.
    await this.classifierDb.deleteClassifierModel(classifierName, groupId);
    this.logger.log(`Deleted classifier DB record for ${classifierName}`, {
      groupId,
      classifierName,
      actorId,
    });

    // Cancel training if in progress
    if (classifier.status === ClassifierStatus.TRAINING) {
      try {
        await (
          this.client as unknown as {
            path: (p: string) => {
              delete: (opts: object) => Promise<{ status: string }>;
            };
          }
        )
          .path(`/documentClassifiers/${constructedName}`)
          .delete({ queryParameters: { "api-version": "2024-11-30" } });
        this.logger.warn(
          `Cancelled in-progress training for classifier ${classifierName} (group ${groupId})`,
          { actorId },
        );
      } catch (err) {
        this.logger.warn(
          `Failed to cancel training for classifier ${classifierName} (group ${groupId}), continuing deletion`,
          { actorId, error: String(err) },
        );
      }
    }

    // Delete Azure DI model if it exists.
    // PRETRAINING classifiers have never been submitted to Azure DI, so skip the
    // remote call entirely to avoid unnecessary network timeouts.
    // TRAINING classifiers were already deleted by the cancel block above, so
    // skip here to avoid a redundant call that would produce a misleading 404 warning.
    if (
      classifier.status === ClassifierStatus.READY ||
      classifier.status === ClassifierStatus.FAILED
    ) {
      try {
        const azureClassifiers = await this.listAzureClassifiers();
        if (azureClassifiers.includes(constructedName)) {
          await (
            this.client as unknown as {
              path: (p: string) => {
                delete: (opts: object) => Promise<{ status: string }>;
              };
            }
          )
            .path(`/documentClassifiers/${constructedName}`)
            .delete({ queryParameters: { "api-version": "2024-11-30" } });
          this.logger.log(
            `Deleted Azure DI classifier model ${constructedName}`,
            { groupId, classifierName, actorId },
          );
        } else {
          this.logger.warn(
            `Azure DI classifier model ${constructedName} not found, skipping Azure DI deletion`,
            { groupId, classifierName, actorId },
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to delete Azure DI classifier model ${constructedName}, continuing deletion`,
          { groupId, classifierName, actorId, error: String(err) },
        );
      }
    } else {
      this.logger.log(
        `Classifier ${classifierName} is in ${classifier.status} status — skipping Azure DI model deletion`,
        { groupId, classifierName, actorId },
      );
    }

    // Delete Azure blob storage files
    try {
      await this.azureStorage.deleteFilesWithPrefix(
        blobPrefix,
        this.containerName,
      );
      this.logger.log(
        `Deleted Azure blob storage files for classifier ${classifierName}`,
        { groupId, classifierName, actorId },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete Azure blob storage files for classifier ${classifierName}, continuing deletion`,
        { groupId, classifierName, actorId, error: String(err) },
      );
    }

    // Delete primary blob storage files
    // Depending on deployment, this may also be the Azure blob storage
    try {
      await this.blobStorage.deleteByPrefix(blobPrefix);
      this.logger.log(
        `Deleted primary blob storage files for classifier ${classifierName}`,
        { groupId, classifierName, actorId },
      );
    } catch (err) {
      this.logger.warn(
        `Failed to delete primary blob storage files for classifier ${classifierName}, continuing deletion`,
        { groupId, classifierName, actorId, error: String(err) },
      );
    }

    return null;
  }
}
