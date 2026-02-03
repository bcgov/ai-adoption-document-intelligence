// Azure Document Intelligence Operation Status interface
export interface OperationStatus {
  operationId: string;
  status: "notStarted" | "running" | "succeeded" | "failed" | "canceled";
  createdDateTime: string;
  lastUpdatedDateTime: string;
  percentCompleted?: number;
  resourceLocation?: string;
  result?: any;
  error?: {
    code: string;
    message: string;
    innererror?: any;
  };
}
import { DatabaseService } from "@/database/database.service";
import { OcrService } from "@/ocr/ocr.service";
import { TemporalClientService } from "@/temporal/temporal-client.service";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import DocumentIntelligence, { DocumentIntelligenceClient, DocumentIntelligenceErrorResponseOutput, ListOperations200Response, ListOperationsDefaultResponse, PagedDocumentIntelligenceOperationDetailsOutput } from "@azure-rest/ai-document-intelligence";
import { AzureService } from "@/azure/azure.service";
import { BlobService } from "@/azure/blob.service";

export interface UploadConfig {
  label: string;
  fromFolder: string;
  blobFolder: string;
}

interface DocType {
  azureBlobSource: {
    containerUrl: string; // Sas Url of container root.
    prefix: string; // Folder where this type of document is found.
  }
}

@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(OcrService.name);
  private readonly client: DocumentIntelligenceClient;
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private temporalClientService: TemporalClientService,
    private azureService: AzureService,
    private blobService: BlobService,
  ) {
    this.client = azureService.getClient();
  }

  // Each file in a training folder needs accompanying layout json.
  // The file must be named just like its corresponding image + .ocr.json
  // e.g. If image is file.jpg, layout json must be file.jpg.ocr.json.
  createLayoutJson = async (containerName: string, uploadConfigs: UploadConfig[]) => {
    const containerClient = this.blobService.getContainerClient(containerName);

    // Looping through each folder of training data
    for (const uc of uploadConfigs) {
      // List blobs with the prefix for this doc type
      const prefix = uc.blobFolder.endsWith('/') ? uc.blobFolder : uc.blobFolder + '/';
      const iter = containerClient.listBlobsFlat({ prefix });

      // Analyze each file
      for await (const blobItem of iter) {
        if (!blobItem.name.match(/\.(jpg|jpeg|png|bmp|tif|tiff)$/i)) continue; // Only process images
        const url = this.blobService.getBlobSasUrl(containerName, blobItem.name);

        // Run general layout model
        const analyzeResponse = await this.client.path('/documentModels/prebuilt-layout:analyze').post({
          body: {
            urlSource: url,
          },
          queryParameters: { "api-version": "2024-11-30" },
        });

        if (analyzeResponse.status == '202') {
          // Poll operation-location until succeeded or failed
          const operationLocation = analyzeResponse.headers["operation-location"] || analyzeResponse.headers["Operation-Location"];
          if (!operationLocation) {
            this.logger.error("No operation-location header returned for 202 response");
            continue;
          }
          await this.azureService.pollOperationUntilResolved(operationLocation, async (result) => {
            // Save JSON result to blob storage with same base name but .ocr.json extension
            const jsonBlobName = blobItem.name + '.ocr.json';
            const blockBlobClient = containerClient.getBlockBlobClient(jsonBlobName);
            await blockBlobClient.upload(
              Buffer.from(JSON.stringify(result, null, 2)),
              Buffer.byteLength(JSON.stringify(result, null, 2))
            );
            this.logger.debug(`Uploaded layout JSON to blob: ${jsonBlobName}`);
          }, (result) => {
            this.logger.error("Analyze operation failed:", result);
          })
        } else if (analyzeResponse.status == '404') {
          // Possible fallback if the url doesn't work. Download and analyze via upload.
          // I haven't had to rely on this so far.
          this.logger.warn(`404 from analyze API for ${blobItem.name}, falling back to download/upload method.`);
          this.logger.warn(`Original error:`, analyzeResponse.body)
          // Download the blob
          const blobResp = await fetch(url);
          if (!blobResp.ok) {
            this.logger.error(`Failed to download blob for fallback: ${blobItem.name}`);
            continue;
          }
          const fileBuffer = Buffer.from(await blobResp.arrayBuffer());
          // Fallback: Send as base64Source in JSON body
          const uploadResponse = await this.client.path('/documentModels/{modelId}:analyze').post({
            body: { base64Source: fileBuffer.toString('base64') },
            queryParameters: { "api-version": "2024-11-30" },
            pathParameters: { "modelId": "prebuilt-layout" },
            headers: { 'Content-Type': 'application/json' }
          });
          if (uploadResponse.status == '200') {
            const jsonBlobName = blobItem.name + '.ocr.json';
            const blockBlobClient = containerClient.getBlockBlobClient(jsonBlobName);
            await blockBlobClient.upload(
              Buffer.from(JSON.stringify(uploadResponse.body, null, 2)),
              Buffer.byteLength(JSON.stringify(uploadResponse.body, null, 2))
            );
            this.logger.debug(`Uploaded layout JSON to blob (fallback): ${jsonBlobName}`);
          } else {
            this.logger.error(`Fallback analyze failed for ${blobItem.name}:`, uploadResponse.status, uploadResponse.body);
          }
        } else {
          this.logger.error(`Failed to analyze blob ${blobItem.name}:`, analyzeResponse.status, analyzeResponse.body);
        }
      }
    }
  }

  // TODO: Get files from somewhere...
  async uploadDocumentsForTraining(containerName: string, fromFolder: string, blobFolder: string = 'documents', max: number = 10) {
    const fileNames: string[] = [];
    // for await (const entry of Deno.readDir(fromFolder)) {
    //   if (entry.isFile) {
    //     fileNames.push(entry.name);
    //   }
    // }

    // Limit to max files
    const limitedFileNames = fileNames.slice(0, max);

    const files = await Promise.all(
      limitedFileNames.map(async (name) => {
        const filePath = `${fromFolder}/${name}`;
        const fileData = await new File([], 'temp');// Deno.readFile(filePath);
        return { name, content: fileData.arrayBuffer as unknown as Buffer };
      })
    );

    const uploadResult = await this.blobService.uploadFiles(containerName, files.map(f => ({ name: `${blobFolder}/${f.name}`, content: f.content })));
    return uploadResult;
  };

  generateTrainingConfig(classifierId: string, description: string, uploadConfigs: UploadConfig[], containerUrl: string) {
    const docTypes: Record<string, DocType> = {};
    for (const uc of uploadConfigs) {
      // This docType defines the label the classifier issues to recognised documents.
      docTypes[uc.label] = {
        azureBlobSource: {
          containerUrl,
          prefix: uc.blobFolder.endsWith('/') ? uc.blobFolder : uc.blobFolder + '/'
        }
      };
    }
    // NOTE: baseClassifierId cannot be the same one you are overwriting.
    // It will not find the original. Possibly clears beforehand.
    return {
      classifierId,
      description,
      docTypes,
      allowOverwrite: true, // Default is false,
      // baseClassifierId: classifierId
    };
  };

  trainClassifier = async (classifierName: string, description: string, uploadConfigs: UploadConfig[], containerName: string) => {
    const containerUrl = await this.blobService.generateSasUrl(containerName);

    const trainingConfig = this.generateTrainingConfig(
      classifierName,
      description,
      uploadConfigs,
      containerUrl
    );

    // Run training of classifier
    const response = await this.client.path('/documentClassifiers:build',).post({
      body: trainingConfig,
      queryParameters: { "api-version": "2024-11-30" },
    });


    // Poll operation status if 202 Accepted
    let operationLocation = response.headers["operation-location"] || response.headers["Operation-Location"];
    if (response.status == '202' && operationLocation) {
      // Returned operation-location header uses wrong domain.
      // Must replace with our actual Doc Intelligence endpoint (not training one)
      const docIntelligenceEndpoint = this.azureService.getEndpoint();
      operationLocation = operationLocation.replace(
        /https:\/\/[^/]+\/documentintelligence/,
        docIntelligenceEndpoint
      );
      // TODO: Save this to the database
      await this.azureService.pollOperationUntilResolved(operationLocation, async () => {
        // Check completed classifier
        const classifier = await this.client.path(`/documentClassifiers/${classifierName}`).get({
          queryParameters: { "api-version": "2024-11-30" },
        })
        this.logger.debug('Classifier training results:')
        this.logger.debug(classifier.status)
        this.logger.debug(classifier.body)
      }, (result) => {
        this.logger.error("Training failed:", result);
      });
    } else {
      this.logger.error('Request for training unsuccessful:')
      this.logger.error(response.status);
      this.logger.error(response.body);
    }
  }
}
