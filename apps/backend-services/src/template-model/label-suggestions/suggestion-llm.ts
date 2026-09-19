import { getErrorMessage, getErrorStack } from "@ai-di/shared-logging";
import { createAzure } from "@ai-sdk/azure";
import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  APICallError,
  generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
} from "ai";
import type { z } from "zod/v4";
import { AppLoggerService } from "@/logging/app-logger.service";

/** How long one suggestion call may take before it is abandoned. */
export const LLM_TIMEOUT_MS = 120_000;

const DEFAULT_API_VERSION = "2024-10-21";

export interface StructuredLlmRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Name sent with the JSON schema; letters, digits, _ and - only. */
  schemaName: string;
}

/**
 * Calls the Azure OpenAI deployment named by the AZURE_OPENAI_* settings (the
 * same settings the workflow agent reads) with a strict reply schema.
 */
@Injectable()
export class SuggestionLlmService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: AppLoggerService,
  ) {}

  async generate<T>(request: StructuredLlmRequest<T>): Promise<T> {
    const model = this.buildModel();
    try {
      const result = await generateText({
        model,
        system: request.system,
        prompt: request.prompt,
        output: Output.object({
          schema: request.schema,
          name: request.schemaName,
        }),
        abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        // Explicit rather than left at the SDK default (also 2): each retry
        // resends the whole prompt, which can reach MAX_TAGGED_TEXT_CHARS,
        // so this bounds the cost a flaky endpoint can run up, not just the
        // wall-clock time LLM_TIMEOUT_MS bounds.
        maxRetries: 2,
      });
      return result.output;
    } catch (error) {
      const reason = describeLlmError(error);
      // Raw error, kept separate from `reason`: server-side diagnostics
      // only, never part of what the caller receives.
      this.logger.debug("Label suggestion model call raised an error", {
        error: getErrorMessage(error),
        stack: getErrorStack(error),
      });
      this.logger.warn("Label suggestion model call failed", { reason });
      throw new HttpException(
        { message: "The suggestion model call failed", reason },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  protected buildModel(): LanguageModel {
    const endpoint = this.read("AZURE_OPENAI_ENDPOINT");
    const apiKey = this.read("AZURE_OPENAI_API_KEY");
    const deployment = this.read("AZURE_OPENAI_DEPLOYMENT");
    if (endpoint === null || apiKey === null || deployment === null) {
      const missingSettings = [
        endpoint === null ? "AZURE_OPENAI_ENDPOINT" : null,
        apiKey === null ? "AZURE_OPENAI_API_KEY" : null,
        deployment === null ? "AZURE_OPENAI_DEPLOYMENT" : null,
      ].filter((name): name is string => name !== null);
      throw new ServiceUnavailableException({
        message: "Label suggestions are not configured",
        missingSettings,
      });
    }
    const trimmed = endpoint.replace(/\/+$/, "");
    const baseURL = /\/openai$/i.test(trimmed) ? trimmed : `${trimmed}/openai`;
    const azure = createAzure({
      apiKey,
      baseURL,
      useDeploymentBasedUrls: true,
      apiVersion: this.read("AZURE_OPENAI_API_VERSION") ?? DEFAULT_API_VERSION,
    });
    return azure.chat(deployment);
  }

  private read(key: string): string | null {
    const raw = this.config.get<string>(key);
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

/** A short reason for a failed model call that never includes the reply or the document. */
export function describeLlmError(error: unknown): string {
  if (NoObjectGeneratedError.isInstance(error)) {
    return "the reply did not match the expected format";
  }
  if (NoOutputGeneratedError.isInstance(error)) {
    return "the reply was cut off before it finished";
  }
  if (RetryError.isInstance(error)) {
    return "the model endpoint kept failing after retries";
  }
  if (APICallError.isInstance(error)) {
    return `the model endpoint returned HTTP ${error.statusCode ?? "error"}`;
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return `the model did not answer within ${LLM_TIMEOUT_MS / 1000} s`;
  }
  return "an unexpected error occurred";
}
