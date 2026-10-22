import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  getAgentAuthHeaders,
  useAgentConversations,
} from "./useAgentConversations";

interface Props {
  /**
   * Whether the panel is showing. Owned by the drawer, because the control
   * that opens it is the header's history button, not a toggle inside the
   * panel itself (Inderdeep, 2026-08-06 — item 30).
   */
  open: boolean;
  workflowId: string | null;
  activeConversationId: string | null;
  activeGroupId: string | null;
  onSelect: (conversationId: string | null) => void;
}

export function ConversationSwitcher({
  open,
  workflowId,
  activeConversationId,
  activeGroupId,
  onSelect,
}: Props) {
  const queryClient = useQueryClient();
  const { data, isFetching } = useAgentConversations({
    workflowId,
    activeGroupId,
  });
  const items = useMemo(() => data ?? [], [data]);

  if (!open) return null;

  return (
    <Stack
      gap={0}
      style={{ borderBottom: "1px solid #e9ecef" }}
      data-testid="agent-chat-conversation-switcher"
    >
      <Text size="xs" c="dimmed" px="md" pt={6}>
        Past conversations
        {items.length > 0 ? ` (${items.length})` : ""}
      </Text>
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
                <Group gap={6}>
                  <Text size="xs" fw={600}>
                    {c.title ?? "Untitled conversation"}
                  </Text>
                  {c.isDemo && (
                    <Badge
                      size="xs"
                      color="teal"
                      variant="light"
                      data-testid={`agent-chat-conversation-${c.id}-demo-badge`}
                    >
                      demo replay
                    </Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {new Date(c.lastMessageAt).toLocaleString()} · {c.provider}/
                  {c.model}
                </Text>
              </Stack>
              {/* A seeded demo is shared with the whole group, so it is not
                  any one person's to delete — and the backend would refuse
                  anyway for everyone but the seeder (item 24). */}
              {!c.isDemo && (
                <Tooltip label="Delete conversation">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const url =
                        activeGroupId !== null
                          ? `/api/agent/conversations/${c.id}?groupId=${encodeURIComponent(activeGroupId)}`
                          : `/api/agent/conversations/${c.id}`;
                      await fetch(url, {
                        method: "DELETE",
                        headers: getAgentAuthHeaders(activeGroupId),
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
              )}
            </Group>
          );
        })}
      </Box>
    </Stack>
  );
}
