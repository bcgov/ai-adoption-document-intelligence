import { ActionIcon, Tooltip } from "@mantine/core";
import { IconMessageCircle } from "@tabler/icons-react";
import { useAgentChatStore } from "./store";

/**
 * Global header icon that opens the workflow-builder agent chat drawer.
 * Always visible from the app header; the drawer mounts at the layout
 * root so the chat persists across route changes.
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
