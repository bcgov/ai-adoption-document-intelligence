import DocumentIntelligence, {
  DocumentIntelligenceClient,
  DocumentIntelligenceErrorResponseOutput,
} from "@azure-rest/ai-document-intelligence";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLoggerService } from "@/logging/app-logger.service";

type PollOperationResult = {
  status?: string;
  analyzeResult?: { status?: string };
  modelInfo?: { status?: string };
  [key: string]: unknown;
};

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

  private asPollResult(value: unknown): PollOperationResult {
    return value as PollOperationResult;
  }

  private validateOperationLocationUrl(operationLocation: string): URL {
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
    if (!parsed.pathname.includes("/documentintelligence/")) {
      throw new Error(
        `operationLocation path "${parsed.pathname}" is not an allowed Azure Document Intelligence endpoint path`,
      );
    }
    return parsed;
  }

  /**
   * Rebuilds the operation URL from the trusted endpoint origin plus only the
   * validated path and query string from the supplied location. This ensures
   * the outgoing request always targets the configured Azure endpoint, even if
   * `validateOperationLocationUrl` were somehow bypassed.
   */
  private buildSafeOperationStatusUrl(operationLocation: string): string {
    const parsed = this.validateOperationLocationUrl(operationLocation);
    const endpointUrl = new URL(this.endpoint);
    const safeUrl = new URL(endpointUrl.origin);
    safeUrl.pathname = parsed.pathname;
    safeUrl.search = parsed.search;
    return safeUrl.toString();
  }

  /**
   * Retrieves current operation information.
   * @param operationLocation The url of the operation to check.
   * @returns A response from Azure on your operation.
   */
  async checkOperationStatus(operationLocation: string) {
    const safeUrl = this.buildSafeOperationStatusUrl(operationLocation);
    // Reconstruct URL from trusted endpoint origin + validated path/query and disable redirects.
    const response = await fetch(safeUrl, {
      headers: { "api-key": this.apiKey },
      redirect: "error",
    });
    const body: unknown = await response.json();
    this.logger.debug("checkOperationStatus response", {
      httpStatus: response.status,
      body,
    });
    return this.asPollResult(body);
  }

  /**
   * Checks whether a classifier model exists in Azure Document Intelligence.
   * Uses the SDK client so the correct base URL (including any path suffix) is
   * applied regardless of whether the endpoint is a direct DI URL or an APIM gateway.
   * Used as a fallback when the async operation record has expired (404).
   * @param classifierId The fully-qualified classifier ID (e.g. groupId__name).
   * @returns true if the classifier model exists, false otherwise.
   */
  async checkClassifierExists(classifierId: string): Promise<boolean> {
    const response = await (
      this.client as unknown as {
        path: (p: string) => {
          get: (opts: object) => Promise<{ status: string }>;
        };
      }
    )
      .path(`/documentClassifiers/${encodeURIComponent(classifierId)}`)
      .get({ queryParameters: { "api-version": "2024-11-30" } });
    this.logger.debug(
      `checkClassifierExists: ${classifierId} -> HTTP ${response.status}`,
    );
    return response.status === "200";
  }

  /**
   * Polls an operation by its bare UUID, constructing the URL from the configured
   * endpoint (preserving any path suffix) rather than accepting an external URL.
   * This avoids the SSRF validation required by checkOperationStatus and is safe
   * because the URL is built entirely from trusted, internal components.
   * @param operationId The operation UUID returned by Azure DI.
   * @returns The operation status result.
   */
  async checkOperationStatusById(operationId: string) {
    const base = this.endpoint.replace(/\/$/, "");
    const url = `${base}/documentClassifiers/operations/${operationId}?api-version=2024-11-30`;
    const response = await fetch(url, {
      headers: { "api-key": this.apiKey },
      redirect: "error",
    });
    const body: unknown = await response.json();
    this.logger.debug("checkOperationStatusById response", {
      operationId,
      httpStatus: response.status,
      body,
    });
    return this.asPollResult(body);
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
    onSuccess: (result: PollOperationResult) => Promise<void> | void,
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
    const getStatus = (result: PollOperationResult): string | undefined => {
      if (!result) return undefined;
      return (
        result.status ??
        result.analyzeResult?.status ??
        result.modelInfo?.status
      );
    };

    let status: string | undefined;
    let result: PollOperationResult;

    // Fetch initial result before entering the loop
    result = await this.checkOperationStatus(operationLocation);
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
      result = await this.checkOperationStatus(operationLocation);
      status = getStatus(result);
      this.logger.debug(`Operation status: ${status}`);
    }
    if (status === "succeeded") {
      await onSuccess(result);
    } else if (onFailure) {
      await onFailure(
        result as unknown as DocumentIntelligenceErrorResponseOutput,
      );
    } else {
      this.logger.warn("Operation failed:");
      this.logger.warn(JSON.stringify(result, null, 2));
    }
  }
}
