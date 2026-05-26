import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { Injectable } from "@nestjs/common";
import type { LanguageModel } from "ai";
import { AgentEnv, type AgentProvider } from "./agent.env";

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
    return { provider, model: this.env.defaultModelFor(provider) };
  }

  resolve(selection: Partial<ProviderSelection>): ProviderSelection {
    const provider = selection.provider ?? this.env.defaultProvider;
    if (!this.env.hasProvider(provider)) {
      throw new Error(
        `Provider '${provider}' is not configured on this backend.`,
      );
    }
    const model = selection.model ?? this.env.defaultModelFor(provider);
    return { provider, model };
  }

  buildModel(selection: ProviderSelection): LanguageModel {
    if (selection.provider === "anthropic") {
      if (this.env.anthropicApiKey === null) {
        throw new Error("ANTHROPIC_API_KEY is not configured.");
      }
      const anthropic = createAnthropic({ apiKey: this.env.anthropicApiKey });
      return anthropic(selection.model);
    }
    if (selection.provider === "azure") {
      if (this.env.azureApiKey === null || this.env.azureEndpoint === null) {
        throw new Error(
          "AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT are not configured.",
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
