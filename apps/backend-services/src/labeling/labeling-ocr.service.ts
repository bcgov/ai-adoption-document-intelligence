import { DocumentStatus, Prisma } from "@generated/client";
import { HttpService } from "@nestjs/axios";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { lastValueFrom } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { extensionForOriginalBlob } from "@/document/original-blob-key.util";
import {
  PdfNormalizationError,
  PdfNormalizationService,
} from "@/document/pdf-normalization.service";
import { AppLoggerService } from "@/logging/app-logger.service";
import {
  BLOB_STORAGE,
  BlobStorageInterface,
} from "../blob-storage/blob-storage.interface";
import type { AnalysisResponse, AnalysisResult } from "../ocr/azure-types";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";
import { LabelingDocumentDbService } from "./labeling-document-db.service";
import type { LabelingDocumentData } from "./labeling-document-db.types";

type JsonValue = Prisma.JsonValue;

export type CreateLabelingDocumentResult =
  | { kind: "success"; labelingDocument: LabelingDocumentData }
  | { kind: "conversion_failed"; labelingDocument: LabelingDocumentData };

@Injectable()
export class LabelingOcrService {
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;

  constructor(
    private readonly labelingDocumentDb: LabelingDocumentDbService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @Inject(BLOB_STORAGE)
    private readonly blobStorage: BlobStorageInterface,
    private readonly pdfNormalization: PdfNormalizationService,
    private readonly logger: AppLoggerService,
  ) {
    this.azureEndpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    this.azureApiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );
  }

  async createLabelingDocument(
    dto: LabelingUploadDto,
  ): Promise<CreateLabelingDocumentResult> {
    const base64Data = dto.file.includes(",")
      ? dto.file.split(",")[1]
      : dto.file;
    const fileBuffer = Buffer.from(base64Data, "base64");
    const originalFilename =
      dto.original_filename || `${dto.title}.${dto.file_type}`;

    await this.pdfNormalization.validateForUpload(fileBuffer, dto.file_type);

    const documentId = uuidv4();
    const extension = extensionForOriginalBlob(originalFilename, dto.file_type);
    const blobKey = `labeling-documents/${documentId}/original.${extension}`;

    await this.blobStorage.write(blobKey, fileBuffer);

    const normalizedKey = `labeling-documents/${documentId}/normalized.pdf`;
    try {
      const pdfBuffer = await this.pdfNormalization.normalizeToPdf(
        fileBuffer,
        dto.file_type,
      );
      await this.blobStorage.write(normalizedKey, pdfBuffer);
    } catch (e) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      if (!(e instanceof PdfNormalizationError)) {
        this.logger.warn("Labeling PDF normalization failed", {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      const labelingDocument =
        await this.labelingDocumentDb.createLabelingDocument({
          title: dto.title,
          original_filename: originalFilename,
          file_path: blobKey,
          normalized_file_path: null,
          file_type: dto.file_type,
          file_size: fileBuffer.length,
          metadata: dto.metadata,
          source: "labeling",
          status: DocumentStatus.conversion_failed,
          apim_request_id: null,
          model_id: "prebuilt-layout",
          ocr_result: null,
          group_id: dto.group_id,
        });

      return { kind: "conversion_failed", labelingDocument };
    }

    const labelingDocument =
      await this.labelingDocumentDb.createLabelingDocument({
        title: dto.title,
        original_filename: originalFilename,
        file_path: blobKey,
        normalized_file_path: normalizedKey,
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

    return { kind: "success", labelingDocument };
  }

  async processOcrForLabelingDocument(
    labelingDocumentId: string,
  ): Promise<void> {
    const labelingDocument =
      await this.labelingDocumentDb.findLabelingDocument(labelingDocumentId);
    if (!labelingDocument) {
      return;
    }

    if (
      !labelingDocument.normalized_file_path ||
      labelingDocument.status === DocumentStatus.conversion_failed
    ) {
      this.logger.debug(
        `Skipping OCR for labeling document ${labelingDocumentId}: no normalized PDF`,
      );
      return;
    }

    try {
      const apimRequestId = await this.requestOcr(
        labelingDocument.normalized_file_path,
      );

      await this.labelingDocumentDb.updateLabelingDocument(labelingDocumentId, {
        apim_request_id: apimRequestId,
        status: DocumentStatus.ongoing_ocr,
      });

      const analysisResponse = await this.waitForOcrCompletion(apimRequestId);

      await this.labelingDocumentDb.updateLabelingDocument(labelingDocumentId, {
        status: DocumentStatus.completed_ocr,
        ocr_result: analysisResponse as unknown as JsonValue,
      });
    } catch (error) {
      this.logger.error(
        `Labeling OCR failed for ${labelingDocumentId}: ${error.message}`,
      );
      await this.labelingDocumentDb.updateLabelingDocument(labelingDocumentId, {
        status: DocumentStatus.failed,
      });
    }
  }

  private async requestOcr(blobKey: string): Promise<string> {
    const fileBuffer = await this.blobStorage.read(blobKey);

    const url = `${this.azureEndpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&features=keyValuePairs`;

    const headers = {
      "api-key": this.azureApiKey,
      "Content-Type": "application/json",
    };

    const azureResponse = await lastValueFrom(
      this.httpService.post(
        url,
        { base64Source: fileBuffer.toString("base64") },
        { headers },
      ),
    );

    if (azureResponse.status !== 202) {
      throw new Error("Failed to submit OCR request");
    }

    return azureResponse.headers["apim-request-id"];
  }

  private async waitForOcrCompletion(
    apimRequestId: string,
    maxAttempts = 30,
    delayMs = 2000,
  ): Promise<AnalysisResponse> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await lastValueFrom(
        this.httpService.get(
          `${this.azureEndpoint}/documentintelligence/documentModels/prebuilt-layout/analyzeResults/${apimRequestId}?api-version=2024-11-30`,
          { headers: { "api-key": this.azureApiKey } },
        ),
      );

      if (response.status !== 200) {
        throw new Error("Failed to retrieve OCR results");
      }

      const analysisResponse: AnalysisResponse = response.data;
      if (analysisResponse.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!analysisResponse.analyzeResult) {
        throw new Error("OCR response missing analyzeResult");
      }

      return analysisResponse;
    }

    throw new Error("OCR processing timed out");
  }
}
