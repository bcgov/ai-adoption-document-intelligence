import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import { Button, DataTable, Group, Modal, Stack, Text } from "../../../ui";
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
        <DataTable striped highlightOnHover>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Key</DataTable.Th>
              <DataTable.Th>Label</DataTable.Th>
              <DataTable.Th>Type</DataTable.Th>
              <DataTable.Th>Required</DataTable.Th>
              <DataTable.Th />
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {columns.map((c) => (
              <DataTable.Tr key={c.key}>
                <DataTable.Td>
                  <Text ff="monospace" size="sm">
                    {c.key}
                  </Text>
                </DataTable.Td>
                <DataTable.Td>{c.label}</DataTable.Td>
                <DataTable.Td>{c.type}</DataTable.Td>
                <DataTable.Td>{c.required ? "✓" : ""}</DataTable.Td>
                <DataTable.Td>
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
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
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
