import type { UIMessage } from "ai";
import type { AgentConversationMessage } from "./useAgentConversations";

/**
 * Convert persisted chat rows into the `UIMessage[]` shape the assistant-ui
 * runtime seeds a thread from, so selecting a past conversation visually
 * replays its full history (text + tool calls).
 *
 * Mirrors the backend's `storedRowToUIMessage`: user rows are saved verbatim
 * as a UIMessage-shaped object (`{ role, parts }`); assistant rows are the
 * envelope `{ parts, finishReason, usage }`. A legacy `{ text }` envelope is
 * projected into a single text part. Rows we can't shape (null / non-object /
 * no parts+text, or an unsupported role) are dropped so a malformed row never
 * breaks replay of the rest.
 */
export function storedMessagesToUIMessages(
  messages: AgentConversationMessage[],
): UIMessage[] {
  const out: UIMessage[] = [];
  for (const row of messages) {
    if (row.role !== "user" && row.role !== "assistant") continue;
    const content = row.content;
    if (content === null || typeof content !== "object") continue;
    const obj = content as Record<string, unknown>;

    let parts: UIMessage["parts"] | null = null;
    if (Array.isArray(obj.parts)) {
      parts = obj.parts as UIMessage["parts"];
    } else if (typeof obj.text === "string") {
      parts = [{ type: "text", text: obj.text }] as UIMessage["parts"];
    }
    if (parts === null) continue;

    out.push({ id: row.id, role: row.role, parts } as UIMessage);
  }
  return out;
}

/**
 * Read a chat-log deep-link from a URL search string. A guide link of the
 * form `?agentChat=<conversationId>` opens the drawer and replays that
 * conversation. Returns null when the param is absent or empty.
 */
export function parseAgentChatDeepLink(search: string): string | null {
  const id = new URLSearchParams(search).get("agentChat");
  return id !== null && id.length > 0 ? id : null;
}
