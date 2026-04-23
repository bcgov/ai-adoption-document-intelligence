import DocumentIntelligence, {
  DocumentIntelligenceClient,
  DocumentIntelligenceErrorResponseOutput,
  PagedDocumentIntelligenceOperationDetailsOutput,
} from "@azure-rest/ai-document-intelligence";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "@/logging/app-logger.service";

@Injectable()
export class AzureService {
  private readonly client: DocumentIntelligenceClient;
  private readonly endpoint: string;
  private readonly apiKey: string;

  constructor(
    private configService: ConfigService,
    private readonly logger: AppLoggerService,
  ) {
    this.endpoint = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
    )!;
    this.apiKey = this.configService.get<string>(
      "AZURE_DOCUMENT_INTELLIGENCE_API_KEY",
    )!;

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

  private buildValidatedOperationLocation(operationLocation: string): string {
    let parsed: URL;
    try {
      parsed = new URL(operationLocation);
    } catch {
      throw new Error(`Invalid operationLocation URL: ${operationLocation}`);
    }

    const endpointUrl = new URL(this.endpoint);
    if (endpointUrl.protocol !== "https:") {
      throw new Error(
        `Invalid Azure endpoint protocol "${endpointUrl.protocol}". Expected "https:"`,
      );
    }
    if (parsed.protocol !== "https:") {
      throw new Error(
        `operationLocation protocol "${parsed.protocol}" is not allowed. Expected "https:"`,
      );
    }
    if (parsed.username || parsed.password) {
      throw new Error("operationLocation must not include credentials");
    }
    if (parsed.origin !== endpointUrl.origin) {
      throw new Error(
        `operationLocation origin "${parsed.origin}" does not match expected Azure endpoint origin "${endpointUrl.origin}"`,
      );
    }

    // Rebuild URL from trusted origin so request host cannot be user-controlled.
    return new URL(`${parsed.pathname}${parsed.search}`, endpointUrl.origin)
      .toString();
  }

  /**
   * Retrieves current operation information.
   * @param operationLocation The url of the operation to check.
   * @returns A respnose from Azure on your operation.
   */
  async checkOperationStatus(operationLocation: string) {
    const validatedUrl = this.buildValidatedOperationLocation(operationLocation);
    const pollResp = await fetch(validatedUrl, {
      headers: { "api-key": this.apiKey },
    });
    return pollResp;
  }

  /**
   * Polls an Azure operation-location endpoint until it succeeds or fails.
   * @param operationLocation The URL to poll.
   * @param onSuccess Callback invoked with the result when status is 'succeeded'.
   * @param onFailure Callback invoked with the result when status is 'failed'.
   * @param options Optional polling options (intervalMs, maxRetries).
   * @throws {Error} If the operationLocation is not a valid URL or does not match the configured Azure endpoint.
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
    const validatedOperationLocation =
      this.buildValidatedOperationLocation(operationLocation);

    const maxRetries = options?.maxRetries ?? 5;
    const interval = options?.intervalMs ?? 5000;
    const getStatus = (
      result:
        | PagedDocumentIntelligenceOperationDetailsOutput
        | DocumentIntelligenceErrorResponseOutput,
    ): string | undefined => {
      if (!result) return undefined;
      const withStatus = result as { status?: string };
      const withAnalyzeResult = result as {
        analyzeResult?: { status?: string };
      };
      const withModelInfo = result as { modelInfo?: { status?: string } };
      return (
        withStatus.status ??
        withAnalyzeResult.analyzeResult?.status ??
        withModelInfo.modelInfo?.status
      );
    };

    let status: string | undefined;
    let result:
      | PagedDocumentIntelligenceOperationDetailsOutput
      | DocumentIntelligenceErrorResponseOutput;

    // Fetch initial result before entering the loop
    const pollResp =
      await this.checkOperationStatus(validatedOperationLocation);
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
      const retryResp = await this.checkOperationStatus(
        validatedOperationLocation,
      );
      result = await retryResp.json();
      status = getStatus(result);
      this.logger.debug(`Operation status: ${status}`);
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
