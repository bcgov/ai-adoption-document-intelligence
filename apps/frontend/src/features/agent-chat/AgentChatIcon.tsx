import { ActionIcon, Tooltip } from "@mantine/core";
import { IconMessageCircle } from "@tabler/icons-react";
import { useAgentChatStore } from "./store";

/**
 * Header icon that opens the workflow-builder agent chat drawer. Mounted by
 * `RootLayout` only on the workflow routes (`isAgentChatRoute`) — the agent's
 * tools act on workflows and nothing else, so offering it elsewhere invited a
 * click that could not do anything.
 */
export function AgentChatIcon() {
  const toggle = useAgentChatStore((s) => s.toggle);
  const isOpen = useAgentChatStore((s) => s.isOpen);

  return (
    <Tooltip label={isOpen ? "Close workflow agent" : "Open workflow agent"}>
      <ActionIcon
        variant={isOpen ? "filled" : "light"}
        color="violet"
        size="lg"
        onClick={toggle}
        data-testid="agent-chat-icon"
        aria-label="Toggle workflow agent chat"
      >
        <IconMessageCircle size={20} />
      </ActionIcon>
    </Tooltip>
  );
}
