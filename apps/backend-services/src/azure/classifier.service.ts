import { DocumentIntelligenceClient } from "@azure-rest/ai-document-intelligence";
import { Injectable, NotFoundException } from "@nestjs/common";
import "multer";
import * as path from "path";
import { AzureService } from "@/azure/azure.service";
import { BlobService } from "@/azure/blob.service";
import { ClassifierStatus } from "@/azure/dto/classifier-constants.dto";
import { DatabaseService } from "@/database/database.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import { Operation, StorageService } from "@/storage/storage.service";

interface DocType {
  azureBlobSource: {
    containerUrl: string; // Sas Url of container root.
    prefix: string; // Folder where this type of document is found.
  };
}

@Injectable()
export class ClassifierService {
  private readonly client: DocumentIntelligenceClient;
  public readonly classifierContainer: string = "classification";

  constructor(
    private databaseService: DatabaseService,
    private azureService: AzureService,
    private blobService: BlobService,
    private storageService: StorageService,
    private readonly logger: AppLoggerService,
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
    const containerClient = this.blobService.getContainerClient(
      this.classifierContainer,
    );

    // Looping through each folder of training
    await Promise.all(
      filePaths.map(async (filePath) => {
        // Analyze each file
        if (!filePath.match(/\.(jpg|jpeg|png|bmp|tif|tiff)$/i)) return; // Only process images
        const url = this.blobService.getBlobSasUrl(
          this.classifierContainer,
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

        if (analyzeResponse.status == "202") {
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
              const jsonBlobName = filePath + ".ocr.json";
              const blockBlobClient =
                containerClient.getBlockBlobClient(jsonBlobName);
              await blockBlobClient.upload(
                Buffer.from(JSON.stringify(result, null, 2)),
                Buffer.byteLength(JSON.stringify(result, null, 2)),
              );
              this.logger.debug(
                `Uploaded layout JSON to blob: ${jsonBlobName}`,
              );
            },
            (result) => {
              this.logger.error("Analyze operation failed", { result });
            },
          );
        } else if (analyzeResponse.status == "404") {
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
          if (uploadResponse.status == "200") {
            const jsonBlobName = filePath + ".ocr.json";
            const blockBlobClient =
              containerClient.getBlockBlobClient(jsonBlobName);
            await blockBlobClient.upload(
              Buffer.from(JSON.stringify(uploadResponse.body, null, 2)),
              Buffer.byteLength(JSON.stringify(uploadResponse.body, null, 2)),
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
    await this.blobService.ensureContainerExists(this.classifierContainer);

    const relativeStoragePath = this.storageService.getStoragePath(
      groupId,
      Operation.CLASSIFICATION,
      classifierName,
    );

    const storageRoot = this.storageService["storagePath"];
    // Recursively get all files (with relative paths)
    const allFiles = await this.storageService.getAllFileNamesAndPaths(
      relativeStoragePath,
      true,
    );

    const uploadResults = await Promise.all(
      allFiles.map(async (fileObj) => {
        // fileObj.path is the absolute path, fileObj.name is the file name
        // We want the relative path from relativeStoragePath to preserve folder structure
        const relativePath = path.relative(storageRoot, fileObj.path);
        const blobName = path.posix.join(
          groupId,
          classifierName,
          ...relativePath.split(path.sep).slice(3),
        );
        // slice(3) removes groupId/classification/classifierName from the relative path
        const fileBuffer = await this.storageService.readFile(fileObj.path);

        await this.blobService.uploadFile(
          this.classifierContainer,
          blobName,
          fileBuffer,
        );
        return {
          originalPath: fileObj.path,
          blobPath: blobName,
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
    const prefix = path.posix.join(groupId, classifierName) + "/";
    const containerClient = this.blobService.getContainerClient(
      this.classifierContainer,
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
      // folderPath = 'groupId/classifierName/label/'
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
   * @param userId ID of the user making the request.
   * @returns The updated record of classifier model from the database.
   */
  requestClassifierTraining = async (
    classifierName: string,
    groupId: string,
    userId: string,
  ) => {
    // Does this classifier record exist?
    const existingClassifier = await this.databaseService.getClassifierModel(
      classifierName,
      groupId,
    );
    if (existingClassifier == null) {
      throw new NotFoundException(
        "Classifier entry not found. Cannot proceed with training.",
      );
    }
    const containerUrl = await this.blobService.generateSasUrl(
      this.classifierContainer,
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
    if (response.status == "202" && operationLocation) {
      // Returned operation-location header uses wrong domain.
      // Must replace with our actual Azure endpoint
      const docIntelligenceEndpoint = this.azureService.getEndpoint();
      operationLocation = operationLocation.replace(
        /https:\/\/[^/]+/,
        docIntelligenceEndpoint,
      );

      // Update classifier record
      return await this.databaseService.updateClassifierModel(
        classifierName,
        groupId,
        {
          status: ClassifierStatus.TRAINING,
          operation_location: operationLocation,
        },
        userId,
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
    const fileData = await this.storageService.readFile(filePath);
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
    if (response.status == "202") {
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
    if (response.status == "202") {
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
}
