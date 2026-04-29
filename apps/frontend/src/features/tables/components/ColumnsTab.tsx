import { Button, Group, Modal, Stack, Table, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import type { ColumnDef } from "../types";
import { ColumnForm } from "./ColumnForm";

interface Props {
  groupId: string;
  tableId: string;
  columns: ColumnDef[];
}

export function ColumnsTab({ groupId, tableId, columns }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ColumnDef | "new" | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tables", groupId, tableId] });
  };

  const save = async (col: ColumnDef, key?: string) => {
    if (key) {
      const response = await apiService.patch(
        `/tables/${tableId}/columns/${key}?group_id=${groupId}`,
        col,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to update column");
    } else {
      const response = await apiService.post(
        `/tables/${tableId}/columns?group_id=${groupId}`,
        col,
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

  return (
    <Stack>
      <Group justify="flex-end">
        <Button onClick={() => setEditing("new")}>Add Column</Button>
      </Group>
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
              <Table.Th />
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
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => setEditing(c)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      loading={remove.isPending && remove.variables === c.key}
                      onClick={() => remove.mutate(c.key)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {editing && (
        <ColumnForm
          opened={!!editing}
          onClose={() => setEditing(null)}
          initial={editing === "new" ? undefined : editing}
          onSubmit={async (col) =>
            save(
              col,
              editing === "new" ? undefined : (editing as ColumnDef).key,
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
    </Stack>
  );
}
