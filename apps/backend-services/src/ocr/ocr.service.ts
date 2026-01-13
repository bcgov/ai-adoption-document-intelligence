import { HttpService } from "@nestjs/axios";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "fs/promises";
import { join } from "path";
import { lastValueFrom } from "rxjs";
import { DatabaseService } from "@/database/database.service";
import { DocumentStatus } from "@/generated/enums";
import { AnalysisResponse, AnalysisResult } from "@/ocr/azureTypes";

export interface OcrRequestResponse {
  status: DocumentStatus;
  apimRequestId?: string;
  error?: Error;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
    private httpService: HttpService,
  ) {
    this.azureEndpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    this.azureApiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );

    if (!this.azureEndpoint || !this.azureApiKey) {
      const azureConfigMessage =
        "Azure Document Intelligence credentials not configured.";
      this.logger.warn(azureConfigMessage);
      throw Error(azureConfigMessage);
    }
  }

  /**
   * Sends a document to Azure for OCR processing.
   * @param documentId ID from documents table
   * @returns New status of document and request ID from Azure.
   */
  async requestOcr(documentId: string): Promise<OcrRequestResponse> {
    this.logger.debug(`Document ID: ${documentId || "N/A"}`);
    // Find filepath of document
    const document = await this.databaseService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`,
      );
    }
    try {
      // Resolve stored relative path to absolute (we only store relative paths)
      const filePath = join(process.cwd(), document.file_path);

      const fileBuffer = await readFile(filePath);
      if (fileBuffer == null) throw Error("File not found.");
      this.logger.debug(`File size: ${fileBuffer.length} bytes`);

      // Send file to Azure for OCR using the document's model_id
      const modelId = document.model_id;
      this.logger.debug(`Using model: ${modelId}`);

      // Build URL - only include features param for prebuilt models
      const isPrebuiltModel =
        modelId.startsWith("prebuilt-") || modelId === "prebuilt-read";
      const url = isPrebuiltModel
        ? `${this.azureEndpoint}/documentModels/${modelId}:analyze?api-version=2024-11-30&features=keyValuePairs`
        : `${this.azureEndpoint}/documentModels/${modelId}:analyze?api-version=2024-11-30`;

      const headers = {
        "api-key": this.azureApiKey,
        "Content-Type": "application/json",
      };

      this.logger.debug(`Request URL: ${url}`);
      this.logger.debug(
        `Request headers: ${JSON.stringify({ ...headers, "api-key": "[REDACTED]" })}`,
      );

      let azureResponse;
      try {
        azureResponse = await lastValueFrom(
          this.httpService.post(
            url,
            {
              base64Source: fileBuffer.toString("base64"),
            },
            { headers },
          ),
        );
      } catch (axiosError) {
        this.logger.error(`Azure API request failed`);
        this.logger.error(`Status: ${axiosError.response?.status}`);
        this.logger.error(
          `Response data: ${JSON.stringify(axiosError.response?.data, null, 2)}`,
        );
        this.logger.error(
          `Response headers: ${JSON.stringify(axiosError.response?.headers, null, 2)}`,
        );
        throw axiosError;
      }

      this.logger.debug(`Azure response status: ${azureResponse.status}`);
      this.logger.debug(
        `Azure response headers: ${JSON.stringify(azureResponse.headers, null, 2)}`,
      );

      if (azureResponse.status != 202) {
        throw Error("Error sending document to Azure");
      }
      const updateResult = await this.databaseService.updateDocument(
        documentId,
        {
          apim_request_id: azureResponse.headers["apim-request-id"], // docPoller.headers["apim-request-id"],
          status: DocumentStatus.ongoing_ocr,
        },
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

  /**
   * Retrieves the results of an Azure OCR request.
   * @param documentId ID from documents table
   * @returns The AnalysisResult of OCR processing.
   */
  async retrieveOcrResults(documentId: string): Promise<AnalysisResult> {
    // Get apim ID of document
    const document = await this.databaseService.findDocument(documentId);
    if (document == null) {
      throw new NotFoundException(
        `Entry for document with ID ${documentId} not found.`,
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

    // Get OCR results from Azure using the document's model_id
    const modelId = document.model_id;
    const azureResponse = await lastValueFrom(
      this.httpService.get(
        `${this.azureEndpoint}/documentModels/${modelId}/analyzeResults/${apim}?api-version=2024-11-30`,
        {
          headers: {
            "api-key": this.azureApiKey,
          },
        },
      ),
    );

    if (azureResponse.status != 200) {
      throw Error(
        `Failed to retrieve OCR results for document ID ${documentId}`,
      );
    }

    const analysisResponse: AnalysisResponse = azureResponse.data;
    this.logger.debug(`Azure response status: ${analysisResponse.status}`);
    this.logger.debug(
      `Azure response created: ${analysisResponse.createdDateTime}`,
    );
    this.logger.debug(
      `Azure response updated: ${analysisResponse.lastUpdatedDateTime}`,
    );

    // Log the full response for debugging
    // this.logger.debug(`Full Azure response: ${JSON.stringify(analysisResponse, null, 2)}`);

    // If status is "running", processing is not complete yet
    if (analysisResponse.status === "running") {
      this.logger.debug(
        `OCR processing still running for document ${documentId}, will retry later`,
      );
      return null; // Indicate processing not complete
    }

    const analysisResult = analysisResponse.analyzeResult;
    if (!analysisResult) {
      throw new Error(
        `No analyzeResult in Azure response for document ${documentId} (status: ${analysisResponse.status})`,
      );
    }

    this.logger.debug(
      `Analysis result content length: ${analysisResult.content?.length || 0}`,
    );
    this.logger.debug(
      `Analysis result pages: ${analysisResult.pages?.length || 0}`,
    );

    // Update OCR results table
    this.databaseService.upsertOcrResult({
      documentId,
      analysisResponse,
    });
    return analysisResult;
  }
}
