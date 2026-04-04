import { Kbd, Modal, Stack, Table, Text } from "@mantine/core";
import { FC } from "react";
import type { ShortcutDefinition } from "../../core/keyboard/useKeyboardShortcuts";

interface ShortcutsOverlayProps {
  opened: boolean;
  onClose: () => void;
  shortcuts: ShortcutDefinition[];
}

const formatShortcut = (s: ShortcutDefinition) => {
  const parts: string[] = [];
  if (s.ctrl) parts.push("Ctrl");
  if (s.shift) parts.push("Shift");
  if (s.alt) parts.push("Alt");

  const keyDisplay: Record<string, string> = {
    arrowdown: "↓",
    arrowup: "↑",
    enter: "Enter",
    escape: "Esc",
    tab: "Tab",
    "/": "/",
  };
  parts.push(keyDisplay[s.key.toLowerCase()] ?? s.key.toUpperCase());
  return parts;
};

export const ShortcutsOverlay: FC<ShortcutsOverlayProps> = ({
  opened,
  onClose,
  shortcuts,
}) => (
  <Modal opened={opened} onClose={onClose} title="Keyboard Shortcuts" size="md">
    <Stack gap="xs">
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Shortcut</Table.Th>
            <Table.Th>Action</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shortcuts.map((s, i) => (
            <Table.Tr key={i}>
              <Table.Td>
                {formatShortcut(s).map((part, j) => (
                  <span key={j}>
                    {j > 0 && (
                      <Text component="span" size="xs" c="dimmed" mx={2}>
                        +
                      </Text>
                    )}
                    <Kbd size="sm">{part}</Kbd>
                  </span>
                ))}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{s.description}</Text>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  </Modal>
);
