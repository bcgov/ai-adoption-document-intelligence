import { DocumentStatus, Prisma } from "@generated/client";
import { HttpService } from "@nestjs/axios";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { lastValueFrom } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import { DatabaseService } from "../database/database.service";
import type { AnalysisResponse, AnalysisResult } from "../ocr/azure-types";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";

type JsonValue = Prisma.JsonValue;

@Injectable()
export class LabelingOcrService {
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly logger: AppLoggerService,
  ) {
    this.azureEndpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    this.azureApiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );
  }

  private getFileExtension(fileType: string): string {
    const typeMap: Record<string, string> = {
      pdf: "pdf",
      image: "jpg",
      scan: "pdf",
    };
    return typeMap[fileType.toLowerCase()] || "bin";
  }

  async createLabelingDocument(dto: LabelingUploadDto) {
    const base64Data = dto.file.includes(",")
      ? dto.file.split(",")[1]
      : dto.file;
    const fileBuffer = Buffer.from(base64Data, "base64");
    const originalFilename =
      dto.original_filename || `${dto.title}.${dto.file_type}`;

    const documentId = uuidv4();
    const extension = this.getFileExtension(dto.file_type);
    const blobKey = `labeling-documents/${documentId}/original.${extension}`;

    await this.blobStorage.write(blobKey, fileBuffer);

    const labelingDocument = await this.db.createLabelingDocument({
      title: dto.title,
      original_filename: originalFilename,
      file_path: blobKey,
      file_type: dto.file_type,
      file_size: fileBuffer.length,
      metadata: dto.metadata,
      source: "labeling",
      status: DocumentStatus.ongoing_ocr,
      apim_request_id: null,
      model_id: "prebuilt-layout",
      ocr_result: null,
      group_id: dto.group_id,
    });

    return labelingDocument;
  }

  async processOcrForLabelingDocument(
    labelingDocumentId: string,
  ): Promise<void> {
    const labelingDocument =
      await this.db.findLabelingDocument(labelingDocumentId);
    if (!labelingDocument) {
      this.logger.warn(
        `processOcrForLabelingDocument: labeling document not found`,
        { labelingDocumentId },
      );
      return;
    }

    this.logger.debug(`Starting OCR for labeling document`, {
      labelingDocumentId,
      file_path: labelingDocument.file_path,
      azureEndpoint: this.azureEndpoint
        ? `${this.azureEndpoint.replace(/\/$/, "").slice(0, 50)}...`
        : undefined,
    });

    try {
      const apimRequestId = await this.requestOcr(
        labelingDocument.file_path,
        labelingDocumentId,
      );

      await this.db.updateLabelingDocument(labelingDocumentId, {
        apim_request_id: apimRequestId,
        status: DocumentStatus.ongoing_ocr,
      });

      const analysisResponse = await this.waitForOcrCompletion(
        apimRequestId,
        labelingDocumentId,
      );

      await this.db.updateLabelingDocument(labelingDocumentId, {
        status: DocumentStatus.completed_ocr,
        ocr_result: analysisResponse as unknown as JsonValue,
      });
    } catch (error: unknown) {
      const err = error as Error & {
        response?: { status?: number; data?: unknown };
        config?: { url?: string; method?: string };
      };
      this.logger.error(
        `Labeling OCR failed for ${labelingDocumentId}: ${err.message}`,
      );
      if (err.response) {
        this.logger.error(`Labeling OCR HTTP error details`, {
          labelingDocumentId,
          statusCode: err.response.status,
          responseData: err.response.data,
          url: err.config?.url,
          method: err.config?.method,
        });
      } else {
        this.logger.error(`Labeling OCR error (non-HTTP)`, {
          labelingDocumentId,
          stack: err.stack,
        });
      }
      await this.db.updateLabelingDocument(labelingDocumentId, {
        status: DocumentStatus.failed,
      });
    }
  }

  private async requestOcr(
    blobKey: string,
    labelingDocumentId: string,
  ): Promise<string> {
    this.logger.debug(`Reading blob for OCR`, {
      labelingDocumentId,
      blobKey,
    });
    const fileBuffer = await this.blobStorage.read(blobKey);
    this.logger.debug(`Blob read complete`, {
      labelingDocumentId,
      blobKey,
      sizeBytes: fileBuffer.length,
    });

    const url = `${this.azureEndpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&features=keyValuePairs`;

    const headers = {
      "api-key": this.azureApiKey,
      "Content-Type": "application/json",
    };

    this.logger.debug(`Submitting OCR request to Azure Document Intelligence`, {
      labelingDocumentId,
      url: url.replace(/api-key=[^&]+/, "api-key=***"),
    });
    const azureResponse = await lastValueFrom(
      this.httpService.post(
        url,
        { base64Source: fileBuffer.toString("base64") },
        { headers },
      ),
    );

    if (azureResponse.status !== 202) {
      this.logger.error(`OCR submit returned non-202`, {
        labelingDocumentId,
        statusCode: azureResponse.status,
        headers: azureResponse.headers,
      });
      throw new Error("Failed to submit OCR request");
    }

    const apimRequestId = azureResponse.headers["apim-request-id"];
    this.logger.debug(`OCR request submitted`, {
      labelingDocumentId,
      apimRequestId,
      statusCode: azureResponse.status,
    });
    return apimRequestId;
  }

  private async waitForOcrCompletion(
    apimRequestId: string,
    labelingDocumentId: string,
    maxAttempts = 30,
    delayMs = 2000,
  ): Promise<AnalysisResponse> {
    const resultsUrl = `${this.azureEndpoint}/documentintelligence/documentModels/prebuilt-layout/analyzeResults/${apimRequestId}?api-version=2024-11-30`;
    this.logger.debug(`Polling for OCR results`, {
      labelingDocumentId,
      apimRequestId,
      resultsUrl: resultsUrl.replace(/api-key=[^&]+/, "api-key=***"),
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.debug(`OCR results poll attempt`, {
        labelingDocumentId,
        attempt,
        maxAttempts,
      });
      const response = await lastValueFrom(
        this.httpService.get(resultsUrl, {
          headers: { "api-key": this.azureApiKey },
        }),
      );

      if (response.status !== 200) {
        this.logger.error(`OCR results poll returned non-200`, {
          labelingDocumentId,
          apimRequestId,
          attempt,
          statusCode: response.status,
          data: response.data,
        });
        throw new Error("Failed to retrieve OCR results");
      }

      const analysisResponse: AnalysisResponse = response.data;
      if (analysisResponse.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!analysisResponse.analyzeResult) {
        this.logger.error(`OCR response missing analyzeResult`, {
          labelingDocumentId,
          apimRequestId,
          analysisStatus: analysisResponse.status,
        });
        throw new Error("OCR response missing analyzeResult");
      }

      this.logger.debug(`OCR completed successfully`, {
        labelingDocumentId,
        apimRequestId,
        attempt,
      });
      return analysisResponse;
    }

    this.logger.error(`OCR processing timed out`, {
      labelingDocumentId,
      apimRequestId,
      maxAttempts,
    });
    throw new Error("OCR processing timed out");
  }
}
