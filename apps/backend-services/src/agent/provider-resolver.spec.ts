import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { AgentEnv } from "./agent.env";
import {
  AgentAssistantNotConfiguredException,
  type AgentErrorBody,
  AgentProviderNotConfiguredException,
  AgentUnknownModelException,
} from "./agent-errors";
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
    // Item 22: a bare Error here became a generic 500 with nothing for the
    // chat drawer to name. It is now a 503 carrying the cause and the
    // environment variable NAMES (never values) that would fix it.
    let thrown: unknown;
    try {
      resolver.resolve({ provider: "azure" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AgentProviderNotConfiguredException);
    const body = (
      thrown as AgentProviderNotConfiguredException
    ).getResponse() as AgentErrorBody;
    expect(body.code).toBe("provider-not-configured");
    expect(body.provider).toBe("azure");
    expect(body.missingConfig).toEqual([
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT",
    ]);
  });

  it("buildModel refuses the same way when the key is absent", async () => {
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
    expect(() =>
      resolver.buildModel({ provider: "azure", model: "gpt-5.4" }),
    ).toThrow(AgentProviderNotConfiguredException);
  });
});

/**
 * D4 / I1, 2026-08-14. `AgentEnv` used to throw from its constructor when no
 * provider was configured. `AgentEnv` is a plain provider inside `AgentModule`
 * and `AppModule` imports `AgentModule` unconditionally, so that throw was a
 * DI failure at startup — a developer with no API key got an app that would
 * not boot, and the message named the agent module, so it read as the agent
 * having broken the build. The contract is now: the app comes up, the
 * assistant is disabled, and anything that asks for a turn is refused with a
 * cause it can render.
 */
describe("ProviderResolver — nothing configured at all", () => {
  async function unconfiguredResolver(): Promise<ProviderResolver> {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderResolver,
        AgentEnv,
        { provide: ConfigService, useValue: makeConfig({}) },
      ],
    }).compile();
    return moduleRef.get(ProviderResolver);
  }

  it("constructs the DI graph instead of failing at startup", async () => {
    await expect(unconfiguredResolver()).resolves.toBeInstanceOf(
      ProviderResolver,
    );
  });

  it("reports the environment as unconfigured rather than guessing a default", async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AgentEnv,
        { provide: ConfigService, useValue: makeConfig({}) },
      ],
    }).compile();
    const env = moduleRef.get(AgentEnv);
    expect(env.defaultProvider).toBeNull();
    expect(env.isConfigured).toBe(false);
  });

  it("refuses a turn with a typed 503 naming every variable that would fix it", async () => {
    const resolver = await unconfiguredResolver();
    let thrown: unknown;
    try {
      resolver.resolve({});
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AgentAssistantNotConfiguredException);
    const body = (
      thrown as AgentAssistantNotConfiguredException
    ).getResponse() as AgentErrorBody;
    expect(body.statusCode).toBe(503);
    // A distinct code from `provider-not-configured`: the client cannot fix
    // this by picking a different model, so the drawer disables the composer.
    expect(body.code).toBe("assistant-not-configured");
    expect(body.missingConfig).toEqual([
      "ANTHROPIC_API_KEY",
      "AZURE_OPENAI_API_KEY",
      "AZURE_OPENAI_ENDPOINT",
    ]);
    // NAMES only — no value of any kind reaches the message.
    expect(body.message).toContain("ANTHROPIC_API_KEY");
    expect(body.message).toContain(
      "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT",
    );
  });

  it("refuses resolveDefault the same way", async () => {
    const resolver = await unconfiguredResolver();
    expect(() => resolver.resolveDefault()).toThrow(
      AgentAssistantNotConfiguredException,
    );
  });

  it("still names the one provider when the caller asks for a specific missing one", async () => {
    const resolver = await unconfiguredResolver();
    let thrown: unknown;
    try {
      resolver.resolve({ provider: "azure" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AgentProviderNotConfiguredException);
    const body = (
      thrown as AgentProviderNotConfiguredException
    ).getResponse() as AgentErrorBody;
    expect(body.code).toBe("provider-not-configured");
    expect(body.provider).toBe("azure");
  });
});

describe("ProviderResolver — model allowlist (finding 2 / Change I)", () => {
  async function makeResolver(): Promise<ProviderResolver> {
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
            ANTHROPIC_API_KEY: "test-anthropic-key",
            AGENT_ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
          }),
        },
      ],
    }).compile();
    return moduleRef.get(ProviderResolver);
  }

  it("accepts the configured model for the resolved provider", async () => {
    const resolver = await makeResolver();
    const sel = resolver.resolve({ provider: "azure", model: "gpt-5.4-mini" });
    expect(sel).toEqual({ provider: "azure", model: "gpt-5.4-mini" });
  });

  it("rejects a model the backend does not serve with the 400 unknown-model refusal", async () => {
    const resolver = await makeResolver();
    let thrown: unknown;
    try {
      resolver.resolve({ provider: "azure", model: "gpt-imaginary" });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AgentUnknownModelException);
    const body = (
      thrown as AgentUnknownModelException
    ).getResponse() as AgentErrorBody;
    expect(body.statusCode).toBe(400);
    expect(body.code).toBe("unknown-model");
    // The refusal names what IS served — the same list /models returns.
    expect(body.message).toContain("gpt-5.4-mini");
    expect(body.message).toContain("claude-haiku-4-5-20251001");
  });

  it("rejects a cross-provider model string (the other provider's model on this provider)", async () => {
    const resolver = await makeResolver();
    expect(() =>
      resolver.resolve({
        provider: "azure",
        model: "claude-haiku-4-5-20251001",
      }),
    ).toThrow(AgentUnknownModelException);
  });

  it("still defaults the model when the turn names none", async () => {
    const resolver = await makeResolver();
    const sel = resolver.resolve({ provider: "azure" });
    expect(sel.model).toBe("gpt-5.4-mini");
  });
});
