import { ConfigService } from "@nestjs/config";
import { AgentEnv } from "./agent.env";

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string, defaultValue?: T): T => {
      const v = values[key];
      return (v ?? defaultValue) as T;
    },
  } as unknown as ConfigService;
}

// At least one provider must be configured for the env to construct.
const PROVIDER = { ANTHROPIC_API_KEY: "k" } as const;

describe("AgentEnv — cost-ceiling config (ITEM 26)", () => {
  it("defaults the per-conversation token ceiling and tool-result cap", () => {
    const env = new AgentEnv(makeConfig({ ...PROVIDER }));
    expect(env.maxConversationTokens).toBe(500000);
    expect(env.maxToolResultChars).toBe(20000);
  });

  it("reads overrides from the environment", () => {
    const env = new AgentEnv(
      makeConfig({
        ...PROVIDER,
        AGENT_MAX_CONVERSATION_TOKENS: "1234",
        AGENT_MAX_TOOL_RESULT_CHARS: "777",
      }),
    );
    expect(env.maxConversationTokens).toBe(1234);
    expect(env.maxToolResultChars).toBe(777);
  });

  it("keeps the existing per-turn bounds", () => {
    const env = new AgentEnv(makeConfig({ ...PROVIDER }));
    expect(env.maxSteps).toBe(50);
    expect(env.maxOutputTokens).toBe(4096);
  });

  it("defaults maxRunsPerConversation to 5 and reads the override", () => {
    const env = new AgentEnv(makeConfig({ ...PROVIDER }));
    expect(env.maxRunsPerConversation).toBe(5);

    const overridden = new AgentEnv(
      makeConfig({ ...PROVIDER, AGENT_MAX_RUNS_PER_CONVERSATION: "2" }),
    );
    expect(overridden.maxRunsPerConversation).toBe(2);
  });
});

// ITEM 23. The repo-root `.env` holds `ANTHROPIC_API_KEY=""`. Read with a
// plain `?? null` that counted as a configured provider, so `hasProvider`
// said yes, the resolver handed the SDK a blank key, and the turn died
// mid-stream with an HTTP 401 instead of the typed provider-not-configured
// refusal.
describe("AgentEnv — a blank variable is not a configured credential", () => {
  const AZURE = {
    AZURE_OPENAI_API_KEY: "azure-key",
    AZURE_OPENAI_ENDPOINT: "https://example.invalid",
  } as const;

  it.each([
    ["unset", undefined],
    ["an empty string", ""],
    ["whitespace only", "   \t\n "],
  ])("treats an Anthropic key that is %s as absent", (_label, value) => {
    const env = new AgentEnv(
      makeConfig({ ...AZURE, ANTHROPIC_API_KEY: value }),
    );
    expect(env.anthropicApiKey).toBeNull();
    expect(env.hasProvider("anthropic")).toBe(false);
    // …and the default provider falls through to the one that is real.
    expect(env.defaultProvider).toBe("azure");
  });

  it("accepts a real Anthropic key, trimmed", () => {
    const env = new AgentEnv(
      makeConfig({ ...AZURE, ANTHROPIC_API_KEY: "  sk-real  " }),
    );
    expect(env.anthropicApiKey).toBe("sk-real");
    expect(env.hasProvider("anthropic")).toBe(true);
    // AGENT_DEFAULT_PROVIDER is unset, so the requested default is
    // "anthropic" and it is now genuinely available.
    expect(env.defaultProvider).toBe("anthropic");
  });

  it.each([
    ["unset", undefined],
    ["an empty string", ""],
    ["whitespace only", "  "],
  ])("treats an Azure key that is %s as absent", (_label, value) => {
    const env = new AgentEnv(
      makeConfig({
        ...PROVIDER,
        AZURE_OPENAI_API_KEY: value,
        AZURE_OPENAI_ENDPOINT: "https://example.invalid",
      }),
    );
    expect(env.azureApiKey).toBeNull();
    expect(env.hasProvider("azure")).toBe(false);
  });

  it.each([
    ["unset", undefined],
    ["an empty string", ""],
    ["whitespace only", " \t "],
  ])("treats an Azure endpoint that is %s as absent", (_label, value) => {
    const env = new AgentEnv(
      makeConfig({
        ...PROVIDER,
        AZURE_OPENAI_API_KEY: "azure-key",
        AZURE_OPENAI_ENDPOINT: value,
      }),
    );
    expect(env.azureEndpoint).toBeNull();
    expect(env.hasProvider("azure")).toBe(false);
  });

  it("accepts real Azure credentials, trimmed", () => {
    const env = new AgentEnv(
      makeConfig({
        AZURE_OPENAI_API_KEY: " azure-key ",
        AZURE_OPENAI_ENDPOINT: " https://example.invalid ",
      }),
    );
    expect(env.azureApiKey).toBe("azure-key");
    expect(env.azureEndpoint).toBe("https://example.invalid");
    expect(env.hasProvider("azure")).toBe(true);
  });

  it("throws when every provider's credential is blank rather than missing", () => {
    expect(
      () =>
        new AgentEnv(
          makeConfig({
            ANTHROPIC_API_KEY: "",
            AZURE_OPENAI_API_KEY: "  ",
            AZURE_OPENAI_ENDPOINT: "",
          }),
        ),
    ).toThrow(/at least one provider/i);
  });

  it("falls back to the built-in defaults when a non-credential setting is blank", () => {
    const env = new AgentEnv(
      makeConfig({
        ...PROVIDER,
        AGENT_ANTHROPIC_MODEL: "  ",
        AZURE_OPENAI_DEPLOYMENT: "",
        AZURE_OPENAI_API_VERSION: "   ",
        AGENT_MAX_STEPS: "",
      }),
    );
    expect(env.anthropicDefaultModel).toBe("claude-haiku-4-5-20251001");
    expect(env.azureDefaultDeployment).toBe("gpt-4o");
    expect(env.azureApiVersion).toBe("2024-10-21");
    // Without the trim this was `Number("")` — zero steps, an agent that
    // cannot make a single tool call.
    expect(env.maxSteps).toBe(50);
  });
});
