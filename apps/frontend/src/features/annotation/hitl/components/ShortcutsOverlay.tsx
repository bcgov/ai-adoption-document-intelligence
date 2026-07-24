import { FC } from "react";
import { DataTable, Kbd, Modal, Stack, Text } from "../../../../ui";
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
  <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="md">
    <Stack gap="xs">
      <DataTable>
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Shortcut</DataTable.Th>
            <DataTable.Th>Action</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {shortcuts.map((s, i) => (
            <DataTable.Tr key={i}>
              <DataTable.Td>
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
              </DataTable.Td>
              <DataTable.Td>
                <Text size="sm">{s.description}</Text>
              </DataTable.Td>
            </DataTable.Tr>
          ))}
        </DataTable.Tbody>
      </DataTable>
    </Stack>
  </Modal>
);
