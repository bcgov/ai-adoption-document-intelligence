import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AgentProvider = "anthropic" | "azure";

/**
 * Read one environment setting, treating a variable that is present but blank
 * exactly like one that is absent.
 *
 * A plain `?? null` counted `ANTHROPIC_API_KEY=""` — which is what the
 * repo-root `.env` actually holds — as a configured credential, so
 * `hasProvider("anthropic")` said yes, the resolver handed the SDK an empty
 * key, and the user got a mid-stream HTTP 401 instead of the typed
 * provider-not-configured refusal. Applied to every setting, not just the
 * credentials: a blank `AZURE_OPENAI_DEPLOYMENT` would otherwise become an
 * empty deployment name, and a blank numeric bound would become `Number("")`,
 * i.e. 0.
 */
function readSetting(config: ConfigService, key: string): string | null {
  const raw = config.get<string>(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
  /**
   * The provider a chat turn uses when it names none — or `null` when this
   * backend has no provider configured at all.
   *
   * `null` rather than a constructor throw. `AgentEnv` is a plain Nest
   * provider inside `AgentModule`, which `AppModule` imports unconditionally,
   * so a throw here was a DI failure at startup: a developer with no API key
   * got a backend that would not boot, and the error named the agent module
   * so it read as "the agent broke the build" (Dylan, 2026-08-14 — D4). An
   * unconfigured environment must yield a working app with a disabled
   * assistant, which is what `null` produces: `listConfiguredModels` returns
   * `[]`, `GET /api/agent/models` reports which variables are missing, and
   * `ProviderResolver` refuses a turn with a typed 503.
   */
  readonly defaultProvider: AgentProvider | null;
  readonly anthropicApiKey: string | null;
  readonly anthropicDefaultModel: string;
  readonly azureApiKey: string | null;
  readonly azureEndpoint: string | null;
  readonly azureDefaultDeployment: string;
  readonly azureApiVersion: string;
  readonly maxSteps: number;
  readonly maxOutputTokens: number;
  /**
   * Cumulative token ceiling (input + output) across all turns of a
   * single conversation. Once a conversation's recorded spend exceeds
   * this, further model calls are refused. Guards against unbounded
   * cost from a long-lived or runaway conversation.
   */
  readonly maxConversationTokens: number;
  /**
   * Maximum number of characters of a single tool result that may be
   * injected into the model context. Large payloads (document/OCR text
   * in preview caches, full workflow configs) are truncated past this
   * with a clear marker so they don't blow up context or cost.
   */
  readonly maxToolResultChars: number;
  /**
   * Maximum live workflow runs (startRun + startTestRun) the agent may start
   * within a single conversation. Guards the Azure/OCR bill from a runaway
   * test-fix loop. Enforced by RunBudgetMap in the run tools.
   */
  readonly maxRunsPerConversation: number;

  constructor(config: ConfigService) {
    const read = (key: string): string | null => readSetting(config, key);

    this.anthropicApiKey = read("ANTHROPIC_API_KEY");
    this.anthropicDefaultModel =
      read("AGENT_ANTHROPIC_MODEL") ?? "claude-haiku-4-5-20251001";

    this.azureApiKey = read("AZURE_OPENAI_API_KEY");
    this.azureEndpoint = read("AZURE_OPENAI_ENDPOINT");
    this.azureDefaultDeployment = read("AZURE_OPENAI_DEPLOYMENT") ?? "gpt-4o";
    this.azureApiVersion = read("AZURE_OPENAI_API_VERSION") ?? "2024-10-21";

    const requestedDefault = (
      read("AGENT_DEFAULT_PROVIDER") ?? "anthropic"
    ).toLowerCase() as AgentProvider;
    this.defaultProvider = this.resolveDefaultProvider(requestedDefault);

    // The functional-by-default loop (design → describeNode per node → build →
    // connect → validate → startTestRun → poll → fix) legitimately needs more
    // than the original 30 steps; 50 gives headroom for one or two fix cycles.
    this.maxSteps = Number(read("AGENT_MAX_STEPS") ?? "50");
    this.maxOutputTokens = Number(read("AGENT_MAX_OUTPUT_TOKENS") ?? "4096");
    this.maxConversationTokens = Number(
      read("AGENT_MAX_CONVERSATION_TOKENS") ?? "500000",
    );
    this.maxToolResultChars = Number(
      read("AGENT_MAX_TOOL_RESULT_CHARS") ?? "20000",
    );
    this.maxRunsPerConversation = Number(
      read("AGENT_MAX_RUNS_PER_CONVERSATION") ?? "5",
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

  /**
   * True when at least one provider has usable credentials — i.e. when the
   * assistant can answer at all. The one question every caller that is not
   * about to build a model actually has.
   */
  get isConfigured(): boolean {
    return this.defaultProvider !== null;
  }

  private resolveDefaultProvider(
    requested: AgentProvider,
  ): AgentProvider | null {
    if (this.hasProvider(requested)) return requested;
    if (this.hasProvider("anthropic")) return "anthropic";
    if (this.hasProvider("azure")) return "azure";
    return null;
  }
}
