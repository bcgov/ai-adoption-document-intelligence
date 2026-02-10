import DocumentIntelligence, {
  DocumentIntelligenceClient,
  DocumentIntelligenceErrorResponseOutput,
  PagedDocumentIntelligenceOperationDetailsOutput,
} from "@azure-rest/ai-document-intelligence";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OcrService } from "@/ocr/ocr.service";

@Injectable()
export class AzureService {
  private readonly logger = new Logger(OcrService.name);
  private readonly client: DocumentIntelligenceClient;
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.endpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    );
    this.apiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    );

    this.client = DocumentIntelligence(
      this.endpoint,
      { key: this.apiKey },
      {
        credentials: {
          apiKeyHeaderName: "api-key",
        },
      },
    );
  }

  getClient() {
    return this.client;
  }

  getEndpoint() {
    return this.endpoint;
  }

  async checkOperationStatus(operationLocation: string) {
    const pollResp = await fetch(operationLocation, {
      headers: { "api-key": this.apiKey },
    });
    return pollResp;
  }

  /**
   * Polls an Azure operation-location endpoint until it succeeds or fails.
   * @param operationLocation The URL to poll.
   * @param onSuccess Callback invoked with the result when status is 'succeeded'.
   * @param onFailure Callback invoked with the result when status is 'failed'.
   * @param options Optional polling options (intervalMs, logger).
   */
  async pollOperationUntilResolved(
    operationLocation: string,
    onSuccess: (
      result: PagedDocumentIntelligenceOperationDetailsOutput,
    ) => Promise<void> | void,
    onFailure?: (
      result: DocumentIntelligenceErrorResponseOutput,
    ) => Promise<void> | void,
    options?: {
      intervalMs?: number;
      maxRetries?: number;
    },
  ): Promise<void> {
    const maxRetries = options?.maxRetries ?? 5;
    const interval = options?.intervalMs ?? 5000;
    const getStatus = (result) =>
      result &&
      (result.status ||
        (result.analyzeResult && result.analyzeResult.status) ||
        (result.modelInfo && result.modelInfo.status));

    let status = "notStarted";
    let result:
      | PagedDocumentIntelligenceOperationDetailsOutput
      | DocumentIntelligenceErrorResponseOutput;

    // Fetch initial result before entering the loop
    const pollResp = await this.checkOperationStatus(operationLocation);
    result = await pollResp.json();
    status = getStatus(result);
    this.logger.debug(`Operation status: ${status}`);
    let retryCount = 0;
    while (
      retryCount < maxRetries &&
      status !== "succeeded" &&
      status !== "failed"
    ) {
      retryCount++;
      await new Promise((res) => setTimeout(res, interval));
      const pollResp = await this.checkOperationStatus(operationLocation);
      result = await pollResp.json();
      status = getStatus(result);
      this.logger.debug(`Operation status: ${status}`);
      this.logger.debug(result);
    }
    if (status === "succeeded") {
      await onSuccess(
        result as PagedDocumentIntelligenceOperationDetailsOutput,
      );
    } else if (onFailure) {
      await onFailure(result as DocumentIntelligenceErrorResponseOutput);
    } else {
      this.logger.warn("Operation failed:");
      this.logger.warn(JSON.stringify(result, null, 2));
    }
  }
}
