import type { AgentEnv, AgentProvider } from "./agent.env";
import { describeModel } from "./model-descriptors";
import {
  type AgentProviderRequirement,
  providerRequirements,
} from "./required-config";

/**
 * One (provider, model) pair this backend can actually serve, with everything
 * the chat composer's inline picker draws: the short name it shows in bold,
 * the one-line tier under it, the long label it falls back to, and a flag on
 * the one the backend would use if the client names no model at all.
 */
export interface ConfiguredAgentModel {
  provider: AgentProvider;
  model: string;
  /** Long, unambiguous form: "Azure OpenAI — gpt-4o". Used as the a11y name. */
  label: string;
  /** Short display name for the picker trigger: "gpt-4o", "Haiku 4.5". */
  name: string;
  /** "Fast" / "Balanced" / "Deep reasoning", or null — see `describeModel`. */
  tier: string | null;
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
 * `REQUIRED_CONFIG` table in `required-config.ts` (the env vars each provider
 * needs). Since `AgentEnv` treats a blank variable as absent, a provider whose
 * key is present-but-empty is correctly reported as unconfigured rather than
 * being offered and then failing mid-stream.
 *
 * **An empty array is a real answer**, not an impossible one: it means no
 * provider has credentials here. Pair it with `listMissingProviderConfig` to
 * say which variables would fix that.
 */
export function listConfiguredModels(env: AgentEnv): ConfiguredAgentModel[] {
  const providers: AgentProvider[] = ["azure", "anthropic"];
  const items: ConfiguredAgentModel[] = [];
  for (const provider of providers) {
    if (!env.hasProvider(provider)) continue;
    const model = env.defaultModelFor(provider);
    const descriptor = describeModel(provider, model);
    items.push({
      provider,
      model,
      label: `${PROVIDER_LABELS[provider]} — ${model}`,
      name: descriptor.name,
      tier: descriptor.tier,
      isDefault: provider === env.defaultProvider,
    });
  }
  return items;
}

/**
 * The providers this backend could serve but cannot, and the variable NAMES
 * that would make each usable. When every provider appears here, the
 * assistant is not configured at all and the chat drawer says so by name
 * instead of showing a live composer over a server that cannot answer
 * (Inderdeep 2026-08-14 — I1; Dylan — D4).
 */
export function listMissingProviderConfig(
  env: AgentEnv,
): AgentProviderRequirement[] {
  return providerRequirements().filter((r) => !env.hasProvider(r.provider));
}
