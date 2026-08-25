import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { AgentEnv, type AgentProvider } from "./agent.env";
import {
  AgentAssistantNotConfiguredException,
  AgentProviderNotConfiguredException,
  AgentUnknownModelException,
} from "./agent-errors";
import { listConfiguredModels } from "./configured-models";
import { providerRequirements, REQUIRED_CONFIG } from "./required-config";

export interface ProviderSelection {
  provider: AgentProvider;
  model: string;
}

/**
 * Resolves a (provider, model) pair to a Vercel AI SDK `LanguageModel`
 * instance. Encapsulates provider-specific construction so the agent
 * service stays provider-agnostic.
 */
@Injectable()
export class ProviderResolver {
  constructor(private readonly env: AgentEnv) {}

  resolveDefault(): ProviderSelection {
    const provider = this.env.defaultProvider;
    if (provider === null) {
      throw new AgentAssistantNotConfiguredException(providerRequirements());
    }
    return { provider, model: this.env.defaultModelFor(provider) };
  }

  resolve(selection: Partial<ProviderSelection>): ProviderSelection {
    const provider = selection.provider ?? this.env.defaultProvider;
    if (provider === null) {
      // Nothing is configured at all, so there is no alternative model to
      // suggest — a different refusal from "that one provider is missing".
      throw new AgentAssistantNotConfiguredException(providerRequirements());
    }
    if (!this.env.hasProvider(provider)) {
      // A structured HTTP refusal, not a bare Error: a bare Error leaves
      // Nest with nothing to say but "Internal server error", and the chat
      // drawer then had no cause to name (Inderdeep, 2026-08-06 — item 22).
      throw new AgentProviderNotConfiguredException(
        provider,
        REQUIRED_CONFIG[provider],
      );
    }
    // Allowlist check (finding 2): the override must be a model this
    // backend actually serves — the same contract `GET /api/agent/models`
    // states ("the picker can never offer a model the backend cannot
    // serve"). A provider's configuration names exactly one model, so the
    // check is equality against the resolved provider's configured model;
    // the refusal lists every configured model so a caller holding a stale
    // picker knows what to send instead.
    if (
      selection.model !== undefined &&
      selection.model !== this.env.defaultModelFor(provider)
    ) {
      throw new AgentUnknownModelException(
        selection.model,
        listConfiguredModels(this.env).map((m) => m.model),
      );
    }
    const model = selection.model ?? this.env.defaultModelFor(provider);
    return { provider, model };
  }

  buildModel(selection: ProviderSelection): LanguageModel {
    if (selection.provider === "anthropic") {
      if (this.env.anthropicApiKey === null) {
        throw new AgentProviderNotConfiguredException(
          "anthropic",
          REQUIRED_CONFIG.anthropic,
        );
      }
      const anthropic = createAnthropic({ apiKey: this.env.anthropicApiKey });
      return anthropic(selection.model);
    }
    if (selection.provider === "azure") {
      if (this.env.azureApiKey === null || this.env.azureEndpoint === null) {
        throw new AgentProviderNotConfiguredException(
          "azure",
          REQUIRED_CONFIG.azure,
        );
      }
      // Build a baseURL that works for both standard Azure OpenAI and
      // APIM-proxied deployments. With `useDeploymentBasedUrls: true`,
      // the SDK builds `{baseURL}/deployments/{deploymentId}{path}?api-version=...`.
      // Both `*.openai.azure.com` and APIM proxies tend to keep the
      // `/openai/...` path prefix, so we ensure baseURL ends with `/openai`.
      const trimmed = this.env.azureEndpoint.replace(/\/+$/, "");
      const baseURL = /\/openai$/i.test(trimmed)
        ? trimmed
        : `${trimmed}/openai`;
      const azure = createAzure({
        apiKey: this.env.azureApiKey,
        baseURL,
        useDeploymentBasedUrls: true,
        apiVersion: this.env.azureApiVersion,
        // APIM proxies in front of Azure OpenAI sometimes reject
        // `content: null` on assistant tool-call messages (the standard
        // OpenAI shape). Wrap the SDK's fetch to coerce null/undefined
        // content to an empty string before forwarding the request.
        fetch: normalizeNullContentFetch,
      });
      // Use the legacy chat/completions endpoint rather than the
      // Responses API — APIM proxies often only forward the former.
      return azure.chat(selection.model);
    }
    throw new Error(`Unknown provider: ${selection.provider as string}`);
  }
}

/**
 * Some Azure OpenAI APIM proxies are stricter than the upstream API and
 * reject `content: null` on assistant messages (which the OpenAI chat
 * schema permits when `tool_calls` is present). This wrapper intercepts
 * the SDK's outgoing request, parses the JSON body, replaces null /
 * undefined content with an empty string on each message, and forwards.
 */
const normalizeNullContentFetch: typeof fetch = async (input, init) => {
  if (!init || init.method !== "POST" || typeof init.body !== "string") {
    return fetch(input, init);
  }
  try {
    const parsed = JSON.parse(init.body) as {
      messages?: Array<{ role?: string; content?: unknown }>;
    };
    if (Array.isArray(parsed.messages)) {
      let mutated = false;
      for (const msg of parsed.messages) {
        if (msg.content === null || msg.content === undefined) {
          msg.content = "";
          mutated = true;
        }
      }
      if (mutated) {
        return fetch(input, { ...init, body: JSON.stringify(parsed) });
      }
    }
  } catch {
    // Not JSON or unexpected shape — fall through to the original request.
  }
  return fetch(input, init);
};
