import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AgentProvider = "anthropic" | "azure";

/**
 * Resolved Phase 7 agent configuration. Read once at module init from
 * environment variables.
 *
 * Provider defaults to "azure" because the user has gpt-5.4-mini wired
 * up and it's the cheapest path for initial validation. Override via
 * AGENT_DEFAULT_PROVIDER or per-request body.
 *
 * Secrets are never logged — only their presence is checked.
 */
@Injectable()
export class AgentEnv {
  readonly defaultProvider: AgentProvider;
  readonly anthropicApiKey: string | null;
  readonly anthropicDefaultModel: string;
  readonly azureApiKey: string | null;
  readonly azureEndpoint: string | null;
  readonly azureDefaultDeployment: string;
  readonly azureApiVersion: string;
  readonly maxSteps: number;
  readonly maxOutputTokens: number;

  constructor(config: ConfigService) {
    this.anthropicApiKey = config.get<string>("ANTHROPIC_API_KEY") ?? null;
    this.anthropicDefaultModel =
      config.get<string>("AGENT_ANTHROPIC_MODEL") ??
      "claude-haiku-4-5-20251001";

    this.azureApiKey = config.get<string>("AZURE_OPENAI_API_KEY") ?? null;
    this.azureEndpoint = config.get<string>("AZURE_OPENAI_ENDPOINT") ?? null;
    this.azureDefaultDeployment =
      config.get<string>("AZURE_OPENAI_DEPLOYMENT") ?? "gpt-4o";
    this.azureApiVersion =
      config.get<string>("AZURE_OPENAI_API_VERSION") ?? "2024-10-21";

    const requestedDefault = (
      config.get<string>("AGENT_DEFAULT_PROVIDER") ?? "anthropic"
    ).toLowerCase() as AgentProvider;
    this.defaultProvider = this.resolveDefaultProvider(requestedDefault);

    this.maxSteps = Number(config.get<string>("AGENT_MAX_STEPS") ?? "30");
    this.maxOutputTokens = Number(
      config.get<string>("AGENT_MAX_OUTPUT_TOKENS") ?? "4096",
    );
  }

  hasProvider(provider: AgentProvider): boolean {
    if (provider === "anthropic") return this.anthropicApiKey !== null;
    if (provider === "azure")
      return this.azureApiKey !== null && this.azureEndpoint !== null;
    return false;
  }

  defaultModelFor(provider: AgentProvider): string {
    return provider === "anthropic"
      ? this.anthropicDefaultModel
      : this.azureDefaultDeployment;
  }

  private resolveDefaultProvider(requested: AgentProvider): AgentProvider {
    if (this.hasProvider(requested)) return requested;
    if (this.hasProvider("anthropic")) return "anthropic";
    if (this.hasProvider("azure")) return "azure";
    throw new Error(
      "AgentModule requires at least one provider configured. " +
        "Set ANTHROPIC_API_KEY or AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT.",
    );
  }
}
