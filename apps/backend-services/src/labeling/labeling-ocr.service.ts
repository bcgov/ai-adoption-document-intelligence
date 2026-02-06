import { DocumentStatus, Prisma } from "@generated/client";
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { lastValueFrom } from "rxjs";
import { v4 as uuidv4 } from "uuid";
import { DatabaseService } from "../database/database.service";
import type { AnalysisResponse, AnalysisResult } from "../ocr/azure-types";
import { LabelingUploadDto } from "./dto/labeling-upload.dto";

type JsonValue = Prisma.JsonValue;

@Injectable()
export class LabelingOcrService {
  private readonly logger = new Logger(LabelingOcrService.name);
  private readonly storagePath: string;
  private readonly azureEndpoint: string;
  private readonly azureApiKey: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.storagePath =
      this.configService.get<string>("LABELING_STORAGE_PATH") ||
      join(process.cwd(), "storage", "labeling-documents");
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

  private generateFileName(originalFilename: string, fileType: string): string {
    const extension = this.getFileExtension(fileType);
    const uuid = uuidv4();
    const sanitizedOriginal = originalFilename
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .substring(0, 50);
    return `${uuid}_${sanitizedOriginal}.${extension}`;
  }

  async createLabelingDocument(dto: LabelingUploadDto) {
    const base64Data = dto.file.includes(",")
      ? dto.file.split(",")[1]
      : dto.file;
    const fileBuffer = Buffer.from(base64Data, "base64");
    const originalFilename =
      dto.original_filename || `${dto.title}.${dto.file_type}`;
    const fileName = this.generateFileName(originalFilename, dto.file_type);
    const fullFilePath = join(this.storagePath, fileName);
    const relativePath = `storage/labeling-documents/${fileName}`;

    await mkdir(this.storagePath, { recursive: true });
    await writeFile(fullFilePath, fileBuffer);

    const labelingDocument = await this.db.createLabelingDocument({
      title: dto.title,
      original_filename: originalFilename,
      file_path: relativePath,
      file_type: dto.file_type,
      file_size: fileBuffer.length,
      metadata: dto.metadata,
      source: "labeling",
      status: DocumentStatus.ongoing_ocr,
      apim_request_id: null,
      model_id: "prebuilt-layout",
      ocr_result: null,
    });

    return labelingDocument;
  }

  async processOcrForLabelingDocument(
    labelingDocumentId: string,
  ): Promise<void> {
    const labelingDocument =
      await this.db.findLabelingDocument(labelingDocumentId);
    if (!labelingDocument) {
      return;
    }

    try {
      const apimRequestId = await this.requestOcr(labelingDocument.file_path);

      await this.db.updateLabelingDocument(labelingDocumentId, {
        apim_request_id: apimRequestId,
        status: DocumentStatus.ongoing_ocr,
      });

      const analysisResponse = await this.waitForOcrCompletion(apimRequestId);

      await this.db.updateLabelingDocument(labelingDocumentId, {
        status: DocumentStatus.completed_ocr,
        ocr_result: analysisResponse as unknown as JsonValue,
      });
    } catch (error) {
      this.logger.error(
        `Labeling OCR failed for ${labelingDocumentId}: ${error.message}`,
      );
      await this.db.updateLabelingDocument(labelingDocumentId, {
        status: DocumentStatus.failed,
      });
    }
  }

  private async requestOcr(filePath: string): Promise<string> {
    const fullPath = join(process.cwd(), filePath);
    const fileBuffer = await readFile(fullPath);

    const url = `${this.azureEndpoint}/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&features=keyValuePairs`;

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
          `${this.azureEndpoint}/documentModels/prebuilt-layout/analyzeResults/${apimRequestId}?api-version=2024-11-30`,
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
