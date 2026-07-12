import { useQuery } from "@tanstack/react-query";
import {
  builderAuthHeaders,
  builderFetch,
} from "../../data/services/builder-fetch";

export interface AgentConversationListItem {
  id: string;
  workflowId: string | null;
  groupId: string;
  createdBy: string;
  provider: string;
  model: string;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
}

interface ListResponse {
  items: AgentConversationListItem[];
}

interface DetailResponse {
  conversation: AgentConversationListItem;
  messages: AgentConversationMessage[];
}

export interface AgentConversationMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
}

/**
 * Agent-chat auth headers: the shared builder auth headers (test key + CSRF)
 * plus the optional `x-group-id`. Exported because the assistant-ui streaming
 * runtime + the manual DELETE fetches in the drawer build their own requests
 * and need the header set directly.
 */
export function getAgentAuthHeaders(
  activeGroupId?: string | null,
): Record<string, string> {
  const headers = builderAuthHeaders();
  if (activeGroupId !== undefined && activeGroupId !== null) {
    headers["x-group-id"] = activeGroupId;
  }
  return headers;
}

export function useAgentConversations(opts?: {
  workflowId?: string | null;
  activeGroupId?: string | null;
}) {
  const wfId = opts?.workflowId ?? null;
  const groupId = opts?.activeGroupId ?? null;
  return useQuery({
    queryKey: ["agent", "conversations", wfId ?? "all", groupId ?? "no-group"],
    queryFn: async (): Promise<AgentConversationListItem[]> => {
      const qs = new URLSearchParams();
      if (wfId !== null) qs.set("workflowId", wfId);
      if (groupId !== null) qs.set("groupId", groupId);
      const url =
        qs.toString().length > 0
          ? `/api/agent/conversations?${qs}`
          : "/api/agent/conversations";
      const res = await builderFetch(url, {
        headers: groupId !== null ? { "x-group-id": groupId } : undefined,
      });
      if (!res.ok)
        throw new Error(`Failed to list conversations: ${res.status}`);
      const body = (await res.json()) as ListResponse;
      return body.items;
    },
  });
}

/**
 * Fetch one conversation and its messages imperatively. Shared by the
 * `useAgentConversation` query hook and the drawer's replay path (which
 * loads a selected conversation's history before remounting the thread).
 */
export async function fetchAgentConversation(
  id: string,
  activeGroupId?: string | null,
): Promise<DetailResponse> {
  const path = `/api/agent/conversations/${id}`;
  const url =
    activeGroupId !== undefined && activeGroupId !== null
      ? `${path}?groupId=${encodeURIComponent(activeGroupId)}`
      : path;
  const res = await builderFetch(url, {
    headers:
      activeGroupId !== undefined && activeGroupId !== null
        ? { "x-group-id": activeGroupId }
        : undefined,
  });
  if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
  return (await res.json()) as DetailResponse;
}

export function useAgentConversation(
  id: string | null,
  activeGroupId?: string | null,
) {
  return useQuery({
    queryKey: ["agent", "conversation", id ?? "none"],
    queryFn: async (): Promise<DetailResponse | null> => {
      if (id === null) return null;
      return fetchAgentConversation(id, activeGroupId);
    },
    enabled: id !== null,
  });
}
