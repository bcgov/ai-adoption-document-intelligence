import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { LanguageModel } from "ai";
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

  it("builds an Azure chat-completions model for the configured deployment", () => {
    const service = new ExposedLlmService(configWith(SETTINGS), mockAppLogger);
    expect(service.exposeModel()).toMatchObject({
      provider: "azure.chat",
      modelId: "gpt-test",
    });
  });
});
