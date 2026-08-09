import type { AgentEnv, AgentProvider } from "./agent.env";

/**
 * One (provider, model) pair this backend can actually serve, with the label
 * the chat drawer shows and a flag on the one the backend would use if the
 * client names no model at all.
 */
export interface ConfiguredAgentModel {
  provider: AgentProvider;
  model: string;
  label: string;
  isDefault: boolean;
}

/** Human-readable provider names for the picker's labels. */
const PROVIDER_LABELS: Record<AgentProvider, string> = {
  azure: "Azure OpenAI",
  anthropic: "Anthropic Claude",
};

/**
 * The models this backend is configured for, in picker order.
 *
 * Cardinality is deliberately honest: a provider contributes **at most one
 * entry**, because a provider's configuration names exactly one model —
 * `AZURE_OPENAI_DEPLOYMENT` for Azure, `AGENT_ANTHROPIC_MODEL` for Anthropic.
 * There is no multi-deployment list variable and none is invented here; a
 * second Azure deployment would need a second backend configuration.
 *
 * "Configured" means `AgentEnv.hasProvider`, which is the runtime form of the
 * `REQUIRED_CONFIG` table in `provider-resolver.ts` (the env vars each
 * provider needs). Since `AgentEnv` now treats a blank variable as absent,
 * a provider whose key is present-but-empty is correctly reported as
 * unconfigured rather than being offered and then failing mid-stream.
 */
export function listConfiguredModels(env: AgentEnv): ConfiguredAgentModel[] {
  const providers: AgentProvider[] = ["azure", "anthropic"];
  const items: ConfiguredAgentModel[] = [];
  for (const provider of providers) {
    if (!env.hasProvider(provider)) continue;
    const model = env.defaultModelFor(provider);
    items.push({
      provider,
      model,
      label: `${PROVIDER_LABELS[provider]} — ${model}`,
      isDefault: provider === env.defaultProvider,
    });
  }
  return items;
}
