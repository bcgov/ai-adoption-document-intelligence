import { Button, Group, Stack, Table, Text } from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import type { ColumnDef, LookupDef } from "../types";
import { LookupForm } from "./LookupForm";

interface Props {
  groupId: string;
  tableId: string;
  columns: ColumnDef[];
  lookups: LookupDef[];
  onShowSnippet: (lookup: LookupDef) => void;
}

export function LookupsTab({
  groupId,
  tableId,
  columns,
  lookups,
  onShowSnippet,
}: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LookupDef | "new" | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tables", groupId, tableId] });
  };

  const save = async (lookup: LookupDef, originalName?: string) => {
    if (originalName) {
      const response = await apiService.patch(
        `/tables/${tableId}/lookups/${originalName}?group_id=${groupId}`,
        lookup,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to update lookup");
    } else {
      const response = await apiService.post(
        `/tables/${tableId}/lookups?group_id=${groupId}`,
        lookup,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to add lookup");
    }
    invalidate();
  };

  const remove = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiService.delete(
        `/tables/${tableId}/lookups/${name}?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to delete lookup");
    },
    onSuccess: invalidate,
  });

  return (
    <Stack>
      <Group justify="flex-end">
        <Button
          onClick={() => setEditing("new")}
          disabled={columns.length === 0}
        >
          Add Lookup
        </Button>
      </Group>
      {columns.length === 0 ? (
        <Text c="dimmed" fs="italic">
          Define columns first (use the Columns tab) — lookups reference column
          values.
        </Text>
      ) : lookups.length === 0 ? (
        <Text c="dimmed" fs="italic">
          No lookups defined yet. Click Add Lookup to create one.
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Template</Table.Th>
              <Table.Th>Pick</Table.Th>
              <Table.Th>Params</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lookups.map((l) => (
              <Table.Tr key={l.name}>
                <Table.Td>
                  <Text ff="monospace" size="sm">
                    {l.name}
                  </Text>
                </Table.Td>
                <Table.Td>{l.templateId ?? "custom-json"}</Table.Td>
                <Table.Td>{l.pick}</Table.Td>
                <Table.Td>
                  {l.params.map((p) => p.name).join(", ") || "—"}
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => onShowSnippet(l)}
                    >
                      Use in workflow
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => setEditing(l)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="xs"
                      color="red"
                      variant="subtle"
                      loading={remove.isPending && remove.variables === l.name}
                      onClick={() => remove.mutate(l.name)}
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
        <LookupForm
          opened={!!editing}
          onClose={() => setEditing(null)}
          columns={columns}
          initial={editing === "new" ? undefined : editing}
          onSubmit={(l) =>
            save(l, editing === "new" ? undefined : (editing as LookupDef).name)
          }
        />
      )}
    </Stack>
  );
}
