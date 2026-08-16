import {
  ForbiddenException,
  HttpStatus,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AgentProviderRequirement } from "./required-config";

/**
 * Machine-readable causes the agent chat endpoint can refuse a turn for.
 * The frontend maps these onto a headline; the human-readable `message`
 * travels with them so an unmapped code still says something specific.
 */
export type AgentErrorCode =
  | "provider-not-configured"
  | "assistant-not-configured"
  | "conversation-budget-exceeded"
  | "demo-conversation-read-only";

/**
 * The body shape every deliberate agent refusal serialises to. Nest
 * returns an `HttpException`'s object payload verbatim, so this is exactly
 * what the browser reads off a non-2xx `POST /api/agent/chat`.
 *
 * `missingConfig` carries environment variable NAMES only — never values.
 */
export interface AgentErrorBody {
  statusCode: number;
  code: AgentErrorCode;
  message: string;
  provider?: string;
  missingConfig?: string[];
}

/**
 * The model provider the caller asked for has no usable configuration on
 * this backend (the case Inderdeep hit on 2026-08-06: an Azure deployment
 * with no key behind it). 503 rather than 500 — the request was fine, the
 * server simply cannot serve it until someone configures the provider.
 */
export class AgentProviderNotConfiguredException extends ServiceUnavailableException {
  constructor(provider: string, missingConfig: string[]) {
    super({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: "provider-not-configured",
      provider,
      missingConfig,
      message:
        `Provider '${provider}' is not configured on this backend. ` +
        `Set ${missingConfig.join(" and ")}, or pick a model from a provider that is configured.`,
    } satisfies AgentErrorBody);
  }
}

/**
 * **No** provider is configured on this backend — not "the one you asked for
 * is missing" but "the assistant cannot answer anybody". A separate code from
 * `provider-not-configured` because it is a separate thing to say: the client
 * cannot fix it by picking a different model, and the drawer disables the
 * composer rather than inviting another attempt (Inderdeep 2026-08-14 — I1).
 *
 * Reached only if a client posts a turn anyway; `GET /api/agent/models`
 * already reports the same `missingConfig` up front.
 */
export class AgentAssistantNotConfiguredException extends ServiceUnavailableException {
  constructor(requirements: AgentProviderRequirement[]) {
    super({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: "assistant-not-configured",
      // Flattened NAMES only. Grouping is preserved in the sentence below,
      // because "set A or B and C" and "set A, B, C" are different asks.
      missingConfig: requirements.flatMap((r) => r.variables),
      message:
        "The assistant is not configured on this backend: no model provider has credentials here. " +
        `Set ${requirements
          .map((r) => r.variables.join(" and "))
          .join(", or ")}, then restart the backend.`,
    } satisfies AgentErrorBody);
  }
}

/** The conversation's cumulative token spend has passed its ceiling. */
export class AgentBudgetExceededException extends ForbiddenException {
  constructor(spentTokens: number, maxTokens: number) {
    super({
      statusCode: HttpStatus.FORBIDDEN,
      code: "conversation-budget-exceeded",
      message: `Conversation token budget exceeded (${spentTokens} / ${maxTokens}). Start a new conversation to continue.`,
    } satisfies AgentErrorBody);
  }
}

/**
 * Seeded demo conversations are shared, group-visible fixtures — a replay
 * of a chat that already happened. Anyone may read one; nobody may append
 * to one, because the next reader would see the additions as part of the
 * demo.
 */
export class AgentDemoConversationReadOnlyException extends ForbiddenException {
  constructor() {
    super({
      statusCode: HttpStatus.FORBIDDEN,
      code: "demo-conversation-read-only",
      message:
        "This is a seeded demo conversation — a read-only replay shared with everyone in the group. Start a new conversation to chat with the agent.",
    } satisfies AgentErrorBody);
  }
}

/** Cap on how much of a provider error message is forwarded to the client. */
const MAX_STREAM_ERROR_CHARS = 400;

/**
 * Turn an error raised *inside* the stream (after the response headers are
 * already on the wire) into the text the client renders. The AI SDK's
 * default is the string "An error occurred." — which is exactly the silence
 * this exists to remove.
 *
 * Only the error's own message and HTTP status are forwarded: never the
 * request URL, headers, or body, any of which can carry a key.
 */
export function describeAgentStreamError(error: unknown): string {
  if (isAbortError(error)) {
    return "The response was stopped before it finished.";
  }
  const status = readStatusCode(error);
  const message = truncate(
    error instanceof Error ? error.message : String(error),
  );
  if (status === 401 || status === 403) {
    return `The model provider rejected the request (HTTP ${status}): the configured credential is not valid for this deployment. ${message}`;
  }
  if (status === 404) {
    return `The model provider returned HTTP 404: the configured deployment or model name does not exist on that endpoint. ${message}`;
  }
  if (status === 429) {
    return `The model provider is rate-limiting this request (HTTP 429). Wait a moment and try again. ${message}`;
  }
  if (status !== null) {
    return `The model provider returned HTTP ${status}: ${message}`;
  }
  if (message.length === 0) {
    return "The agent turn failed before it produced any output.";
  }
  return `The agent turn failed: ${message}`;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function readStatusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = (error as { statusCode?: unknown }).statusCode;
  return typeof candidate === "number" ? candidate : null;
}

function truncate(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_STREAM_ERROR_CHARS
    ? `${trimmed.slice(0, MAX_STREAM_ERROR_CHARS)}…`
    : trimmed;
}
