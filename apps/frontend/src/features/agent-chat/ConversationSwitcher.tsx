import {
  ActionIcon,
  Box,
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAgentConversations } from "./useAgentConversations";

interface Props {
  workflowId: string | null;
  activeConversationId: string | null;
  onSelect: (conversationId: string | null) => void;
}

function getApiKeyHeader(): Record<string, string> {
  const headers: Record<string, string> = {};
  const testApiKey = import.meta.env.VITE_TEST_API_KEY as string | undefined;
  if (typeof testApiKey === "string" && testApiKey.length > 0) {
    headers["x-api-key"] = testApiKey;
  }
  return headers;
}

export function ConversationSwitcher({
  workflowId,
  activeConversationId,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data, isFetching } = useAgentConversations({ workflowId });
  const items = useMemo(() => data ?? [], [data]);

  return (
    <Stack
      gap={0}
      style={{ borderBottom: "1px solid #e9ecef" }}
      data-testid="agent-chat-conversation-switcher"
    >
      <UnstyledButton
        onClick={() => setOpen((s) => !s)}
        style={{
          padding: "6px 14px",
          fontSize: 12,
          color: "#666",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text size="xs" c="dimmed">
          {open ? "Hide" : "Show"} past conversations
          {items.length > 0 ? ` (${items.length})` : ""}
        </Text>
        {open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
      </UnstyledButton>
      {open && (
        <Box style={{ maxHeight: 200, overflowY: "auto" }}>
          {isFetching && (
            <Text size="xs" c="dimmed" p="xs">
              Loading…
            </Text>
          )}
          {!isFetching && items.length === 0 && (
            <Text size="xs" c="dimmed" p="xs">
              No prior conversations
              {workflowId !== null ? " for this workflow" : ""}.
            </Text>
          )}
          {items.map((c) => {
            const isActive = c.id === activeConversationId;
            return (
              <Group
                key={c.id}
                justify="space-between"
                px="md"
                py={4}
                style={{
                  background: isActive ? "#f3f0ff" : undefined,
                  borderLeft: isActive
                    ? "3px solid #7950f2"
                    : "3px solid transparent",
                  cursor: "pointer",
                }}
                onClick={() => onSelect(c.id)}
                data-testid={`agent-chat-conversation-${c.id}`}
              >
                <Stack gap={0}>
                  <Text size="xs" fw={600}>
                    {c.title ?? "Untitled conversation"}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {new Date(c.lastMessageAt).toLocaleString()} · {c.provider}/
                    {c.model}
                  </Text>
                </Stack>
                <Tooltip label="Delete conversation">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await fetch(`/api/agent/conversations/${c.id}`, {
                        method: "DELETE",
                        headers: getApiKeyHeader(),
                      });
                      await queryClient.invalidateQueries({
                        queryKey: ["agent", "conversations"],
                      });
                      if (c.id === activeConversationId) {
                        onSelect(null);
                      }
                    }}
                    data-testid={`agent-chat-conversation-${c.id}-delete`}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}
