import {
  DocumentIntelligenceClient,
} from "@azure-rest/ai-document-intelligence";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import * as path from "path";
import { AzureService } from "@/azure/azure.service";
import { BlobService } from "@/azure/blob.service";
import { DatabaseService } from "@/database/database.service";
import { ClassifierStatus } from "@/generated";
import { OcrService } from "@/ocr/ocr.service";
import { Operation, StorageService } from "@/storage/storage.service";

interface DocType {
  azureBlobSource: {
    containerUrl: string; // Sas Url of container root.
    prefix: string; // Folder where this type of document is found.
  };
}

@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(OcrService.name);
  private readonly client: DocumentIntelligenceClient;
  private readonly classifierContainer: string = "classification";

  constructor(
    private databaseService: DatabaseService,
    private azureService: AzureService,
    private blobService: BlobService,
    private storageService: StorageService,
  ) {
    this.client = azureService.getClient();
  }

  // Each file in a training folder needs accompanying layout json.
  // The file must be named just like its corresponding image + .ocr.json
  // e.g. If image is file.jpg, layout json must be file.jpg.ocr.json.
  createLayoutJson = async (filePaths: string[]) => {
    const containerClient = this.blobService.getContainerClient(
      this.classifierContainer,
    );

    // Looping through each folder of training data
    for (const filePath of filePaths) {
      // Analyze each file
      if (!filePath.match(/\.(jpg|jpeg|png|bmp|tif|tiff)$/i)) continue; // Only process images
      const url = this.blobService.getBlobSasUrl(
        this.classifierContainer,
        filePath,
      );

      // Run general layout model
      const analyzeResponse = await this.client
        .path("/documentModels/prebuilt-layout:analyze")
        .post({
          body: {
            urlSource: url,
          },
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
          continue;
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
            this.logger.debug(`Uploaded layout JSON to blob: ${jsonBlobName}`);
          },
          (result) => {
            this.logger.error("Analyze operation failed:", result);
          },
        );
      } else if (analyzeResponse.status == "404") {
        // Possible fallback if the url doesn't work. Download and analyze via upload.
        // I haven't had to rely on this so far.
        this.logger.warn(
          `404 from analyze API for ${filePath}, falling back to download/upload method.`,
        );
        this.logger.warn(`Original error:`, analyzeResponse.body);
        // Download the blob
        const blobResp = await fetch(url);
        if (!blobResp.ok) {
          this.logger.error(
            `Failed to download blob for fallback: ${filePath}`,
          );
          continue;
        }
        const fileBuffer = Buffer.from(await blobResp.arrayBuffer());
        // Fallback: Send as base64Source in JSON body
        const uploadResponse = await this.client
          .path("/documentModels/{modelId}:analyze")
          .post({
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
          this.logger.error(
            `Fallback analyze failed for ${filePath}:`,
            uploadResponse.status,
            uploadResponse.body,
          );
        }
      } else {
        this.logger.error(
          `Failed to analyze blob ${filePath}:`,
          analyzeResponse.status,
          analyzeResponse.body,
        );
      }
    }
  };

  async uploadDocumentsForTraining(groupId: string, classifierName: string) {
    await this.blobService.ensureContainerExists(this.classifierContainer);
    // Get the relative storage path for this classifier
    const relativeStoragePath = this.storageService.getStoragePath(
      groupId,
      Operation.CLASSIFICATION,
      classifierName,
    );
    // Get the absolute storage root
    const storageRoot = this.storageService["storagePath"];
    // Recursively get all files (with relative paths)
    const allFiles = await this.storageService.getAllFileNamesAndPaths(
      relativeStoragePath,
      true,
    );
    // Compute the absolute path for each file

    const uploadResults = await Promise.all(
      allFiles.map(async (fileObj) => {
        // fileObj.path is the absolute path, fileObj.name is the file name
        // We want the relative path from relativeStoragePath to preserve folder structure
        const relativePath = path.relative(storageRoot, fileObj.path);
        // Always use posix separators for blob storage
        const blobName = path.posix.join(
          groupId,
          classifierName,
          ...relativePath.split(path.sep).slice(3),
        );
        // slice(3) removes groupId/classification/classifierName from the relative path
        const fileBuffer = await this.storageService.readFile(fileObj.path);
        // Use blobService.uploadFile to upload the file
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

  async generateTrainingConfig(
    groupId: string,
    classifierName: string,
    description: string,
    containerUrl: string,
  ) {
    // Get list of folders in this classifier's

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
      // folderPath: 'groupId/classifierName/label/'
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
      classifierId: classifierName,
      description,
      docTypes,
      allowOverwrite: true, // Default is false,
      // baseClassifierId: classifierId
    };
  }

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
      // Must replace with our actual Doc Intelligence endpoint (not training one)
      const docIntelligenceEndpoint = this.azureService.getEndpoint();
      operationLocation = operationLocation.replace(
        /https:\/\/[^/]+\/documentintelligence/,
        docIntelligenceEndpoint,
      );

      // Update classifier record
      await this.databaseService.updateClassifierModel(
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
      this.logger.error(message);
      this.logger.error(response.status);
      this.logger.error(response.body);
      throw new Error(message);
    }
  };
}
