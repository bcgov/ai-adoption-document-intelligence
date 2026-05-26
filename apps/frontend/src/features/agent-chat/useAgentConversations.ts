import { useQuery } from "@tanstack/react-query";

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

function readCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("csrf_token="));
  return match?.split("=")[1];
}

export function getAgentAuthHeaders(
  activeGroupId?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const testApiKey = import.meta.env.VITE_TEST_API_KEY as string | undefined;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  const csrf = readCsrfToken();
  if (csrf !== undefined) headers["X-CSRF-Token"] = csrf;
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
      const res = await fetch(url, { headers: getAgentAuthHeaders(groupId) });
      if (!res.ok)
        throw new Error(`Failed to list conversations: ${res.status}`);
      const body = (await res.json()) as ListResponse;
      return body.items;
    },
  });
}

export function useAgentConversation(
  id: string | null,
  activeGroupId?: string | null,
) {
  return useQuery({
    queryKey: ["agent", "conversation", id ?? "none"],
    queryFn: async (): Promise<DetailResponse | null> => {
      if (id === null) return null;
      const path = `/api/agent/conversations/${id}`;
      const url =
        activeGroupId !== undefined && activeGroupId !== null
          ? `${path}?groupId=${encodeURIComponent(activeGroupId)}`
          : path;
      const res = await fetch(url, {
        headers: getAgentAuthHeaders(activeGroupId),
      });
      if (!res.ok)
        throw new Error(`Failed to load conversation: ${res.status}`);
      return (await res.json()) as DetailResponse;
    },
    enabled: id !== null,
  });
}
