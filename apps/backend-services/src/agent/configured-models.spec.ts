import { ConfigService } from "@nestjs/config";
import { AgentEnv } from "./agent.env";
import { listConfiguredModels } from "./configured-models";

function makeEnv(values: Record<string, string | undefined>): AgentEnv {
  const config = {
    get: <T = unknown>(key: string, defaultValue?: T): T =>
      (values[key] ?? defaultValue) as T,
  } as unknown as ConfigService;
  return new AgentEnv(config);
}

const AZURE = {
  AZURE_OPENAI_API_KEY: "azure-key",
  AZURE_OPENAI_ENDPOINT: "https://example.invalid",
} as const;

// ITEM 23 — the picker must only ever offer what this backend can serve.
describe("listConfiguredModels", () => {
  it("reports the one Azure deployment when only Azure is configured", () => {
    const env = makeEnv({ ...AZURE, AZURE_OPENAI_DEPLOYMENT: "gpt-5.4" });

    expect(listConfiguredModels(env)).toEqual([
      {
        provider: "azure",
        model: "gpt-5.4",
        label: "Azure OpenAI — gpt-5.4",
        isDefault: true,
      },
    ]);
  });

  it("omits Anthropic when its key is present but blank", () => {
    // Exactly the repo-root `.env` shape that produced the mid-stream 401.
    const env = makeEnv({ ...AZURE, ANTHROPIC_API_KEY: "" });
    const items = listConfiguredModels(env);
    expect(items.map((i) => i.provider)).toEqual(["azure"]);
  });

  it("lists both providers when both are configured, Azure first", () => {
    const env = makeEnv({
      ...AZURE,
      AZURE_OPENAI_DEPLOYMENT: "gpt-4o",
      ANTHROPIC_API_KEY: "sk-real",
      AGENT_ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
      AGENT_DEFAULT_PROVIDER: "azure",
    });

    const items = listConfiguredModels(env);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      provider: "azure",
      model: "gpt-4o",
      label: "Azure OpenAI — gpt-4o",
      isDefault: true,
    });
    expect(items[1]).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      label: "Anthropic Claude — claude-haiku-4-5-20251001",
      isDefault: false,
    });
  });

  it("flags exactly one default, and it is the env's default provider", () => {
    const env = makeEnv({
      ...AZURE,
      ANTHROPIC_API_KEY: "sk-real",
      AGENT_DEFAULT_PROVIDER: "anthropic",
    });

    const defaults = listConfiguredModels(env).filter((i) => i.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].provider).toBe("anthropic");
  });

  it("names the configured deployment, not a hardcoded model id", () => {
    const env = makeEnv({
      ...AZURE,
      AZURE_OPENAI_DEPLOYMENT: "bcgov-shared-gpt",
    });
    expect(listConfiguredModels(env)[0].model).toBe("bcgov-shared-gpt");
  });
});
