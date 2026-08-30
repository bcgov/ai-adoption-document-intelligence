import type { AgentProvider } from "./agent.env";

/**
 * Which environment variables have to be present for a provider to be
 * usable. NAMES only — nothing in this file ever holds, reads or forwards a
 * value, and everything that renders these names (the 503 refusal body, the
 * `GET /api/agent/models` response, the chat drawer's unconfigured notice)
 * inherits that guarantee.
 *
 * Kept in its own module so the HTTP surface can name the missing variables
 * without importing `ProviderResolver` — which pulls in both provider SDKs.
 */
export const REQUIRED_CONFIG: Record<AgentProvider, string[]> = {
  anthropic: ["ANTHROPIC_API_KEY"],
  azure: ["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
};

/** One provider and the variable names that would make it usable. */
export interface AgentProviderRequirement {
  provider: AgentProvider;
  variables: string[];
}

/**
 * Every provider's requirement, in the order the model picker lists them.
 * Used to tell a client which variables an unconfigured backend is missing.
 */
export function providerRequirements(): AgentProviderRequirement[] {
  return (Object.keys(REQUIRED_CONFIG) as AgentProvider[]).map((provider) => ({
    provider,
    variables: [...REQUIRED_CONFIG[provider]],
  }));
}
