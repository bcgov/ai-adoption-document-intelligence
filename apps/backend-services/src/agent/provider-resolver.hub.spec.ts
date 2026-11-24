import { ConfigService } from "@nestjs/config";
import { generateText } from "ai";
import { AgentEnv } from "./agent.env";
import { ProviderResolver } from "./provider-resolver";

describe("agent Azure SDK Hub contract", () => {
  afterEach(() => jest.restoreAllMocks());

  it("uses GPT-5.6-sol through tenant-scoped Chat Completions, not Responses", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "fake",
          created: 1,
          model: "gpt-5.6-sol",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "ok" },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const resolver = new ProviderResolver(
      new AgentEnv(
        new ConfigService({
          AZURE_OPENAI_ENDPOINT: "https://hub.example/tenant",
          AZURE_OPENAI_API_KEY: "fake-key",
          AZURE_OPENAI_DEPLOYMENT: "gpt-5.6-sol",
          AZURE_OPENAI_API_VERSION: "2025-03-01-preview",
          AGENT_DEFAULT_PROVIDER: "azure",
        }),
      ),
    );
    const selection = resolver.resolveDefault();
    expect(selection).toEqual({ provider: "azure", model: "gpt-5.6-sol" });
    const result = await generateText({
      model: resolver.buildModel(selection),
      prompt: "Say ok",
      maxRetries: 0,
      maxOutputTokens: 256,
    });
    expect(result.text).toBe("ok");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [input, init] = fetchSpy.mock.calls[0];
    expect(String(input)).toBe(
      "https://hub.example/tenant/openai/deployments/gpt-5.6-sol/chat/completions?api-version=2025-03-01-preview",
    );
    expect(new Headers(init?.headers).get("api-key")).toBe("fake-key");
    expect(typeof init?.body).toBe("string");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      max_completion_tokens: 256,
    });
  });
});
