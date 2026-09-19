import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { APICallError, type LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod/v4";
import { mockAppLogger } from "@/testUtils/mockAppLogger";
import { SuggestionLlmService } from "./suggestion-llm";

const SETTINGS: Record<string, string> = {
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_API_KEY: "test-key",
  AZURE_OPENAI_DEPLOYMENT: "gpt-test",
};

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

/** Uses the real settings check, then swaps in a mock model. */
class MockedLlmService extends SuggestionLlmService {
  constructor(
    config: ConfigService,
    private readonly mockModel: LanguageModel,
  ) {
    super(config, mockAppLogger);
  }

  protected override buildModel(): LanguageModel {
    super.buildModel();
    return this.mockModel;
  }
}

class ExposedLlmService extends SuggestionLlmService {
  exposeModel(): LanguageModel {
    return this.buildModel();
  }
}

function modelReplying(
  text: string,
  finish: "stop" | "length" = "stop",
): MockLanguageModelV3 {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: finish, raw: undefined },
      usage: {
        inputTokens: {
          total: 10,
          noCache: 10,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 5, text: 5, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

const request = {
  system: "system text",
  prompt: "prompt text",
  schema: z.object({ answer: z.string() }),
  schemaName: "test_reply",
};

describe("SuggestionLlmService", () => {
  it("returns the parsed reply", async () => {
    const service = new MockedLlmService(
      configWith(SETTINGS),
      modelReplying('{"answer":"42"}'),
    );
    await expect(service.generate(request)).resolves.toEqual({ answer: "42" });
  });

  it("names the missing settings, never their values, with a 503", async () => {
    const service = new SuggestionLlmService(
      configWith({ AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com" }),
      mockAppLogger,
    );
    const error = await service.generate(request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect((error as ServiceUnavailableException).getResponse()).toEqual({
      message: "Label suggestions are not configured",
      missingSettings: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"],
    });
  });

  it("turns a reply that breaks the schema into a 502", async () => {
    const service = new MockedLlmService(
      configWith(SETTINGS),
      modelReplying('{"wrong":1}'),
    );
    const error = await service.generate(request).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual({
      message: "The suggestion model call failed",
      reason: "the reply did not match the expected format",
    });
  });

  it("turns a reply that was cut off into a 502", async () => {
    const service = new MockedLlmService(
      configWith(SETTINGS),
      modelReplying('{"answer":"4', "length"),
    );
    const error = await service.generate(request).catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual(
      expect.objectContaining({
        reason: "the reply was cut off before it finished",
      }),
    );
  });

  it("turns repeated endpoint failures into a 502 once retries are exhausted", async () => {
    jest.useFakeTimers();
    try {
      const failure = new APICallError({
        message: "Internal Server Error",
        url: "https://example.openai.azure.com/openai/deployments/gpt-test/chat/completions",
        requestBodyValues: {},
        statusCode: 500,
      });
      const service = new MockedLlmService(
        configWith(SETTINGS),
        new MockLanguageModelV3({
          doGenerate: async () => {
            throw failure;
          },
        }),
      );

      const pending = service.generate(request).catch((e: unknown) => e);
      // maxRetries: 2 puts two backoff delays between the three attempts;
      // advance well past both before reading the result.
      for (let i = 0; i < 5; i += 1) {
        await jest.advanceTimersByTimeAsync(2000);
      }
      const error = await pending;

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(502);
      expect((error as HttpException).getResponse()).toEqual({
        message: "The suggestion model call failed",
        reason: "the model endpoint kept failing after retries",
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("turns a non-retryable endpoint error into a 502 without leaking the request or response", async () => {
    (mockAppLogger.warn as jest.Mock).mockClear();
    (mockAppLogger.debug as jest.Mock).mockClear();

    const failure = new APICallError({
      message: "Bad Request",
      url: "https://example.openai.azure.com/openai/deployments/gpt-test/chat/completions?api-version=2024-10-21",
      requestBodyValues: { marker: "should-not-leak-request-body" },
      statusCode: 400,
      responseHeaders: { "x-marker": "should-not-leak-header" },
      responseBody: "should-not-leak-response-body",
    });
    const service = new MockedLlmService(
      configWith(SETTINGS),
      new MockLanguageModelV3({
        doGenerate: async () => {
          throw failure;
        },
      }),
    );

    const error = await service.generate(request).catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual({
      message: "The suggestion model call failed",
      reason: "the model endpoint returned HTTP 400",
    });

    const forbidden = [
      failure.url,
      "should-not-leak-request-body",
      "should-not-leak-header",
      "should-not-leak-response-body",
    ];
    const loggedText = JSON.stringify([
      (mockAppLogger.warn as jest.Mock).mock.calls,
      (mockAppLogger.debug as jest.Mock).mock.calls,
    ]);
    const thrownText = JSON.stringify((error as HttpException).getResponse());
    for (const value of forbidden) {
      expect(loggedText).not.toContain(value);
      expect(thrownText).not.toContain(value);
    }
  });

  it("turns a request that timed out into a 502", async () => {
    const timedOut = new Error("The operation was aborted");
    timedOut.name = "TimeoutError";
    const service = new MockedLlmService(
      configWith(SETTINGS),
      new MockLanguageModelV3({
        doGenerate: async () => {
          throw timedOut;
        },
      }),
    );

    const error = await service.generate(request).catch((e: unknown) => e);

    expect((error as HttpException).getStatus()).toBe(502);
    expect((error as HttpException).getResponse()).toEqual({
      message: "The suggestion model call failed",
      reason: "the model did not answer within 120 s",
    });
  });

  it("builds an Azure chat-completions model for the configured deployment", () => {
    const service = new ExposedLlmService(configWith(SETTINGS), mockAppLogger);
    expect(service.exposeModel()).toMatchObject({
      provider: "azure.chat",
      modelId: "gpt-test",
    });
  });
});
