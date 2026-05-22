import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import { Button, DataTable, Group, Stack, Text } from "../../../ui";
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
        <DataTable striped highlightOnHover>
          <DataTable.Thead>
            <DataTable.Tr>
              <DataTable.Th>Name</DataTable.Th>
              <DataTable.Th>Template</DataTable.Th>
              <DataTable.Th>Pick</DataTable.Th>
              <DataTable.Th>Params</DataTable.Th>
              <DataTable.Th />
            </DataTable.Tr>
          </DataTable.Thead>
          <DataTable.Tbody>
            {lookups.map((l) => (
              <DataTable.Tr key={l.name}>
                <DataTable.Td>
                  <Text ff="monospace" size="sm">
                    {l.name}
                  </Text>
                </DataTable.Td>
                <DataTable.Td>{l.templateId ?? "custom-json"}</DataTable.Td>
                <DataTable.Td>{l.pick}</DataTable.Td>
                <DataTable.Td>
                  {l.params.map((p) => p.name).join(", ") || "—"}
                </DataTable.Td>
                <DataTable.Td>
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
                </DataTable.Td>
              </DataTable.Tr>
            ))}
          </DataTable.Tbody>
        </DataTable>
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
