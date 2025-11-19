import { DatabaseService } from "@/database/database.service";
import { DocumentStatus } from "@/generated/enums";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "fs/promises";
import DocumentIntelligence, {
  DocumentIntelligenceClient,
} from "@azure-rest/ai-document-intelligence";
import { AzureKeyCredential } from "@azure/core-auth";
import { AnalysisResponse, AnalysisResult } from "@/ocr/azureTypes";

export interface OcrRequestResponse {
  status: DocumentStatus;
  apimRequestId?: string;
  error?: Error;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly azureClient: DocumentIntelligenceClient;
  private readonly azureModelId: string;

  constructor(
    private configService: ConfigService,
    private databaseService: DatabaseService,
  ) {
    const azureEndpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    const azureApiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );
    this.azureModelId = "prebuilt-layout";

    if (!azureEndpoint || !azureApiKey) {
      const azureConfigMessage =
        "Azure Document Intelligence credentials not configured.";
      this.logger.warn(azureConfigMessage);
      throw Error(azureConfigMessage);
    }
    this.azureClient = DocumentIntelligence(
      azureEndpoint,
      new AzureKeyCredential(azureApiKey),
    );
  }

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
      // Read file from filesystem
      // TODO: Where is this actually meant to come from? Suggest separating to file service.
      const fileBuffer = await readFile(document.file_path);
      if (fileBuffer == null) throw Error("File not found.");
      this.logger.debug(`File size: ${fileBuffer.length} bytes`);

      // Send file to Azure for OCR
      const docPoller = await this.azureClient
        .pathUnchecked(
          `/documentModels/${this.azureModelId}:analyze?api-version=2024-11-30`,
        )
        .post({
          body: {
            base64Source: fileBuffer.toString("base64"),
          },
        });
      // Update status in database
      if (docPoller.status == "202") {
        const updateResult = await this.databaseService.updateDocument(
          documentId,
          {
            apim_request_id: docPoller.headers["apim-request-id"],
            status: DocumentStatus.ongoing_ocr,
          },
        );

        // Return the apim request ID
        return {
          apimRequestId: updateResult.apim_request_id,
          status: updateResult.status,
        };
      }
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

    // Get results from Azure
    const docPoller = await this.azureClient
      .pathUnchecked(
        `/documentModels/${this.azureModelId}/analyzeResults/${apim}?api-version=2024-11-30`,
      )
      .get();

    if (docPoller.status != "200") {
      throw Error(
        `Failed to retrieve OCR results for document ID ${documentId}`,
      );
    }

    const analysisResponse: AnalysisResponse = docPoller.body;
    const anaysisResult = analysisResponse.analyzeResult;
    // Update OCR results table
    this.databaseService.upsertOcrResult({
      documentId,
      analysisResponse,
    });
    return anaysisResult;
  }
}
