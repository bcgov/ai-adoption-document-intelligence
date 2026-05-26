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

function getApiKeyHeader(): Record<string, string> {
  const headers: Record<string, string> = {};
  const testApiKey = import.meta.env.VITE_TEST_API_KEY as string | undefined;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  return headers;
}

export function useAgentConversations(opts?: { workflowId?: string | null }) {
  const wfId = opts?.workflowId ?? null;
  return useQuery({
    queryKey: ["agent", "conversations", wfId ?? "all"],
    queryFn: async (): Promise<AgentConversationListItem[]> => {
      const url = new URL("/api/agent/conversations", window.location.origin);
      if (wfId !== null) url.searchParams.set("workflowId", wfId);
      const res = await fetch(
        url.toString().replace(window.location.origin, ""),
        {
          headers: getApiKeyHeader(),
        },
      );
      if (!res.ok)
        throw new Error(`Failed to list conversations: ${res.status}`);
      const body = (await res.json()) as ListResponse;
      return body.items;
    },
  });
}

export function useAgentConversation(id: string | null) {
  return useQuery({
    queryKey: ["agent", "conversation", id ?? "none"],
    queryFn: async (): Promise<DetailResponse | null> => {
      if (id === null) return null;
      const res = await fetch(`/api/agent/conversations/${id}`, {
        headers: getApiKeyHeader(),
      });
      if (!res.ok)
        throw new Error(`Failed to load conversation: ${res.status}`);
      return (await res.json()) as DetailResponse;
    },
    enabled: id !== null,
  });
}
