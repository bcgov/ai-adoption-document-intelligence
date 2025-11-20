import { DatabaseService } from "@/database/database.service";
import { DocumentStatus } from "@/generated/enums";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "fs/promises";
import { AnalysisResponse, AnalysisResult } from "@/ocr/azureTypes";
import { join } from "path";
import { HttpService } from "@nestjs/axios";
import { lastValueFrom } from "rxjs";

export interface OcrRequestResponse {
  status: DocumentStatus;
  apimRequestId?: string;
  error?: Error;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly azureModelId: string;
  private readonly storagePath: string;
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private httpService: HttpService
  ) {
    this.azureEndpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"
    );
    this.azureApiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY"
    );
    this.azureModelId = "prebuilt-layout";

    if (!this.azureEndpoint || !this.azureApiKey) {
      const azureConfigMessage =
        "Azure Document Intelligence credentials not configured.";
      this.logger.warn(azureConfigMessage);
      throw Error(azureConfigMessage);
    }
    this.storagePath =
      this.configService.get<string>("STORAGE_PATH") ||
      join(process.cwd(), "storage", "documents");
  }

  async requestOcr(documentId: string): Promise<OcrRequestResponse> {
    this.logger.debug(`Document ID: ${documentId || "N/A"}`);
    // Find filepath of document
    const document = await this.databaseService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`
      );
    }
    try {
      // Read file from filesystem
      // TODO: Where is this actually meant to come from? Suggest separating to file service.
      const filePath = `${this.storagePath}/${document.file_path}`;
      const fileBuffer = await readFile(filePath);
      if (fileBuffer == null) throw Error("File not found.");
      this.logger.debug(`File size: ${fileBuffer.length} bytes`);

      // Send file to Azure for OCR
      const azureResponse = await lastValueFrom(
        this.httpService.post(
          `${this.azureEndpoint}/documentModels/${this.azureModelId}:analyze?api-version=2024-11-30&features=keyValuePairs`,
          {
            base64Source: fileBuffer.toString("base64"),
          },
          {
            headers: {
              "api-key": this.azureApiKey,
            },
          }
        )
      );

      if (azureResponse.status != 202) {
        throw Error("Error sending document to Azure");
      }
      const updateResult = await this.databaseService.updateDocument(
        documentId,
        {
          apim_request_id: azureResponse.headers["apim-request-id"], // docPoller.headers["apim-request-id"],
          status: DocumentStatus.ongoing_ocr,
        }
      );

      // Return the apim request ID
      return {
        apimRequestId: updateResult.apim_request_id,
        status: updateResult.status,
      };
    } catch (error) {
      this.logger.error(`Error processing document: ${error.message}`);
      this.logger.error(`Stack: ${error.stack}`);

      if (document != null) {
        await this.databaseService.updateDocument(documentId, {
          status: DocumentStatus.failed,
        });
      }

      return {
        status: DocumentStatus.failed,
        error: error.message,
      };
    }
  }

  async retrieveOcrResults(documentId: string): Promise<AnalysisResult> {
    // Get apim ID of document
    const document = await this.databaseService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`
      );
    }

    const apim = document.apim_request_id;

    // Potentially was never sent or failed to send
    if (
      document.status == DocumentStatus.pre_ocr ||
      document.status == DocumentStatus.failed ||
      apim == null
    ) {
      throw Error(`Document ID ${documentId} has not yet been sent for OCR.`);
    }

    // Get OCR results from Azure
    const azureResponse = await lastValueFrom(
      this.httpService.get(
        `${this.azureEndpoint}/documentModels/${this.azureModelId}/analyzeResults/${apim}?api-version=2024-11-30`,
        {
          headers: {
            "api-key": this.azureApiKey,
          },
        }
      )
    );

    if (azureResponse.status != 200) {
      throw Error(
        `Failed to retrieve OCR results for document ID ${documentId}`
      );
    }

    const analysisResponse: AnalysisResponse = azureResponse.data;
    const anaysisResult = analysisResponse.analyzeResult;
    // Update OCR results table
    this.databaseService.upsertOcrResult({
      documentId,
      analysisResponse,
    });
    return anaysisResult;
  }
}
