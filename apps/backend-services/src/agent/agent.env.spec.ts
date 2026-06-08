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
    expect(env.maxSteps).toBe(30);
    expect(env.maxOutputTokens).toBe(4096);
  });
});
