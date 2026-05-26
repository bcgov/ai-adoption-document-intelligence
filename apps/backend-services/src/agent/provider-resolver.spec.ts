import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AgentEnv } from "./agent.env";
import { ProviderResolver } from "./provider-resolver";

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: <T = unknown>(key: string, defaultValue?: T): T => {
      const v = values[key];
      return (v ?? defaultValue) as T;
    },
  } as unknown as ConfigService;
}

describe("ProviderResolver", () => {
  it("uses Anthropic when only ANTHROPIC_API_KEY is set", async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderResolver,
        AgentEnv,
        {
          provide: ConfigService,
          useValue: makeConfig({ ANTHROPIC_API_KEY: "test-anthropic-key" }),
        },
      ],
    }).compile();
    const resolver = moduleRef.get(ProviderResolver);
    const sel = resolver.resolveDefault();
    expect(sel.provider).toBe("anthropic");
    expect(sel.model).toBe("claude-haiku-4-5-20251001");
  });

  it("uses Azure when only AZURE_OPENAI_* are set", async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderResolver,
        AgentEnv,
        {
          provide: ConfigService,
          useValue: makeConfig({
            AZURE_OPENAI_API_KEY: "test-azure-key",
            AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
            AZURE_OPENAI_DEPLOYMENT: "gpt-5.4-mini",
            AGENT_DEFAULT_PROVIDER: "azure",
          }),
        },
      ],
    }).compile();
    const resolver = moduleRef.get(ProviderResolver);
    const sel = resolver.resolveDefault();
    expect(sel.provider).toBe("azure");
    expect(sel.model).toBe("gpt-5.4-mini");
  });

  it("explicit selection overrides the default", async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderResolver,
        AgentEnv,
        {
          provide: ConfigService,
          useValue: makeConfig({
            ANTHROPIC_API_KEY: "test-anthropic-key",
            AZURE_OPENAI_API_KEY: "test-azure-key",
            AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
            AZURE_OPENAI_DEPLOYMENT: "gpt-5.4-mini",
          }),
        },
      ],
    }).compile();
    const resolver = moduleRef.get(ProviderResolver);
    const sel = resolver.resolve({ provider: "azure" });
    expect(sel.provider).toBe("azure");
  });

  it("rejects a provider that isn't configured", async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderResolver,
        AgentEnv,
        {
          provide: ConfigService,
          useValue: makeConfig({ ANTHROPIC_API_KEY: "x" }),
        },
      ],
    }).compile();
    const resolver = moduleRef.get(ProviderResolver);
    expect(() => resolver.resolve({ provider: "azure" })).toThrow(
      /Provider 'azure' is not configured/,
    );
  });

  it("throws if no provider is configured at all", async () => {
    await expect(
      Test.createTestingModule({
        providers: [
          ProviderResolver,
          AgentEnv,
          { provide: ConfigService, useValue: makeConfig({}) },
        ],
      })
        .compile()
        .then((m) => m.get(ProviderResolver)),
    ).rejects.toThrow(/at least one provider configured/);
  });
});
