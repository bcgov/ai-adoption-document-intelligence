import {
  ActionIcon,
  Button,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import type { ColumnDef } from "../types";
import { ColumnForm } from "./ColumnForm";

interface Props {
  groupId: string;
  tableId: string;
  columns: ColumnDef[];
  isAdmin: boolean;
}

export function ColumnsTab({ groupId, tableId, columns, isAdmin }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ColumnDef | "new" | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [typeConfirm, setTypeConfirm] = useState("");

  const closeDeleteModal = () => {
    setConfirmDeleteKey(null);
    setTypeConfirm("");
  };

  const openDeleteModal = (key: string) => {
    remove.reset();
    setConfirmDeleteKey(key);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tables", groupId, tableId] });
    qc.invalidateQueries({ queryKey: ["table-rows", groupId, tableId] });
  };

  const save = async (col: ColumnDef, key?: string, seedValue?: unknown) => {
    if (key) {
      const response = await apiService.patch(
        `/tables/${tableId}/columns/${key}?group_id=${groupId}`,
        col,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to update column");
    } else {
      const body = { ...(col as unknown as Record<string, unknown>) };
      if (seedValue !== undefined) body.seed_value = seedValue;
      const response = await apiService.post(
        `/tables/${tableId}/columns?group_id=${groupId}`,
        body,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to add column");
    }
    invalidate();
  };

  const remove = useMutation({
    mutationFn: async (key: string) => {
      const response = await apiService.delete(
        `/tables/${tableId}/columns/${key}?group_id=${groupId}`,
      );
      if (!response.success) {
        const msg = response.message ?? "Failed to delete column";
        if (msg.includes("referenced by lookups")) {
          setConflictMsg(msg);
        }
        throw new Error(msg);
      }
    },
    onSuccess: invalidate,
  });

  const pendingDeleteColumn = columns.find((c) => c.key === confirmDeleteKey);

  return (
    <Stack>
      {isAdmin && (
        <Group justify="flex-end">
          <Button onClick={() => setEditing("new")}>Add Column</Button>
        </Group>
      )}
      {columns.length === 0 ? (
        <Text c="dimmed" fs="italic">
          No columns defined yet. Click Add Column to create the first one.
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Key</Table.Th>
              <Table.Th>Label</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Required</Table.Th>
              <Table.Th>Unique</Table.Th>
              {isAdmin && <Table.Th ta="right" />}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {columns.map((c) => (
              <Table.Tr key={c.key}>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {c.key}
                  </Text>
                </Table.Td>
                <Table.Td>{c.label}</Table.Td>
                <Table.Td>{c.type}</Table.Td>
                <Table.Td>{c.required ? "✓" : ""}</Table.Td>
                <Table.Td>{c.unique ? "✓" : ""}</Table.Td>
                {isAdmin && (
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Tooltip label="Edit" withArrow>
                        <ActionIcon
                          variant="subtle"
                          onClick={() => setEditing(c)}
                          aria-label={`Edit column ${c.label}`}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          loading={
                            remove.isPending && remove.variables === c.key
                          }
                          onClick={() => openDeleteModal(c.key)}
                          aria-label={`Delete column ${c.label}`}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {isAdmin && editing && (
        <ColumnForm
          opened={!!editing}
          onClose={() => setEditing(null)}
          initial={editing === "new" ? undefined : editing}
          onSubmit={async (col, seedValue) =>
            save(
              col,
              editing === "new" ? undefined : (editing as ColumnDef).key,
              seedValue,
            )
          }
        />
      )}
      <Modal
        opened={!!conflictMsg}
        onClose={() => setConflictMsg(null)}
        title="Cannot delete column"
      >
        <Stack>
          <Text>{conflictMsg}</Text>
          <Group justify="flex-end">
            <Button onClick={() => setConflictMsg(null)}>OK</Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={!!confirmDeleteKey}
        onClose={closeDeleteModal}
        title="Delete column?"
      >
        <Stack>
          <Text>
            Delete column{" "}
            <Text span ff="monospace">
              {pendingDeleteColumn?.label ?? confirmDeleteKey}
            </Text>
            ? This removes this column&apos;s data from every row in the table
            and cannot be undone.
          </Text>
          <TextInput
            label='Type "delete" to confirm'
            placeholder="delete"
            value={typeConfirm}
            onChange={(e) => setTypeConfirm(e.currentTarget.value)}
          />
          {remove.isError && (
            <Text c="red" size="sm">
              {(remove.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button
              color="red"
              disabled={typeConfirm !== "delete"}
              loading={remove.isPending}
              onClick={() => {
                if (confirmDeleteKey) {
                  remove.mutate(confirmDeleteKey, {
                    onSuccess: closeDeleteModal,
                  });
                }
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
