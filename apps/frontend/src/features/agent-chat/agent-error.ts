/**
 * Turning a failed agent turn into something the conversation can say out
 * loud (Inderdeep, 2026-08-06 — item 22: *"I ran the prompt. Nothing. Why is
 * it not working?"*).
 *
 * Two shapes arrive here, and both come through as an `Error`:
 *
 *  - **The request was refused before the stream started.** The AI SDK
 *    throws `new Error(await response.text())`, so `message` is the raw
 *    response body — for our own refusals a JSON `AgentErrorBody`
 *    (`{ code, message, provider, missingConfig }`), for anything else
 *    Nest's `{ statusCode, message }`.
 *  - **The stream failed mid-turn.** The backend's `describeAgentStreamError`
 *    has already written a sentence into the stream, and the SDK hands it
 *    back as the error message.
 */

export interface AgentChatError {
  /** Headline for the alert — names the *kind* of failure. */
  title: string;
  /** The specific cause, in the backend's own words wherever it gave them. */
  detail: string;
  /** The backend's machine-readable cause, when it named one. */
  code: string | null;
}

const TITLE_BY_CODE: Record<string, string> = {
  "provider-not-configured": "That model is not configured on this server",
  // Distinct from the line above: not "pick another model" but "this server
  // has none" (Inderdeep 2026-08-14 — I1). Reached only if a turn is posted
  // anyway; the drawer normally disables send before it gets here.
  "assistant-not-configured": "The assistant isn't configured on this server",
  "conversation-budget-exceeded": "This conversation has spent its budget",
  "demo-conversation-read-only": "This is a read-only demo replay",
};

const FALLBACK_TITLE = "The agent could not complete this request";

const FALLBACK_DETAIL =
  "The request failed and the server did not say why. Check the backend logs for the agent module.";

export function describeAgentChatError(error: unknown): AgentChatError {
  const raw = (error instanceof Error ? error.message : String(error)).trim();
  const parsed = parseErrorBody(raw);

  if (parsed !== null) {
    const code = parsed.code;
    return {
      title:
        (code !== null ? TITLE_BY_CODE[code] : undefined) ?? FALLBACK_TITLE,
      detail: parsed.message ?? FALLBACK_DETAIL,
      code,
    };
  }

  if (raw.length === 0 || looksLikeMarkup(raw)) {
    // An HTML error page from a proxy, or nothing at all. Echoing markup
    // into the conversation would be worse than saying so plainly.
    return {
      title: FALLBACK_TITLE,
      detail:
        raw.length === 0
          ? FALLBACK_DETAIL
          : "The server returned an unexpected non-JSON response. The request did not reach the agent.",
      code: null,
    };
  }

  return { title: FALLBACK_TITLE, detail: raw, code: null };
}

interface ParsedErrorBody {
  code: string | null;
  message: string | null;
}

/**
 * Read a JSON error body if that is what the text is. Nest's own
 * `message` can be a string or an array of validation strings, so both
 * are folded into one sentence.
 */
function parseErrorBody(raw: string): ParsedErrorBody | null {
  if (!raw.startsWith("{")) return null;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const code = typeof record.code === "string" ? record.code : null;
  const message = readMessage(record);
  if (code === null && message === null) return null;
  return { code, message };
}

function readMessage(record: Record<string, unknown>): string | null {
  const value = record.message;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join(" ");
  }
  if (typeof record.statusCode === "number") {
    return `The server refused the request (HTTP ${record.statusCode}).`;
  }
  return null;
}

function looksLikeMarkup(raw: string): boolean {
  return raw.startsWith("<");
}
