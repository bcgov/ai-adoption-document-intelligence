import {
  Button,
  Group,
  Modal,
  Pagination,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiService } from "@/data/services/api.service";
import { useTableRows } from "../hooks/useTableRows";
import type { ColumnDef, TableRow } from "../types";

interface Props {
  groupId: string;
  tableId: string;
  columns: ColumnDef[];
  onCreate: () => void;
  onEdit: (row: TableRow) => void;
}

const PAGE_SIZE = 25;

function renderCell(value: unknown, type: ColumnDef["type"]): string {
  if (value === undefined || value === null) return "";
  if (type === "boolean") return value ? "✓" : "✗";
  return String(value);
}

export function RowsTab({
  groupId,
  tableId,
  columns,
  onCreate,
  onEdit,
}: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [rowToDelete, setRowToDelete] = useState<TableRow | null>(null);
  const rows = useTableRows(groupId, tableId, {
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const deleteRow = useMutation({
    mutationFn: async (rowId: string) => {
      const response = await apiService.delete(
        `/tables/${tableId}/rows/${rowId}?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to delete row");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["table-rows", groupId, tableId] });
      setRowToDelete(null);
    },
  });

  if (columns.length === 0) {
    return (
      <Text c="dimmed" fs="italic">
        Define columns first (use the Columns tab).
      </Text>
    );
  }

  if (rows.isLoading) return <Text c="dimmed">Loading rows…</Text>;
  if (rows.isError)
    return (
      <Text c="red">Failed to load rows: {(rows.error as Error).message}</Text>
    );
  if (!rows.data) return null;

  const totalPages = Math.max(1, Math.ceil(rows.data.total / PAGE_SIZE));

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {rows.data.total} {rows.data.total === 1 ? "row" : "rows"}
        </Text>
        <Button onClick={onCreate}>Create Row</Button>
      </Group>
      {rows.data.rows.length === 0 ? (
        <Text c="dimmed" fs="italic">
          No rows yet — click Create Row to add one.
        </Text>
      ) : (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                {columns.map((c) => (
                  <Table.Th key={c.key}>{c.label}</Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.data.rows.map((row) => (
                <Table.Tr key={row.id}>
                  {columns.map((c) => (
                    <Table.Td key={c.key}>
                      {renderCell(row.data[c.key], c.type)}
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => onEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="subtle"
                        onClick={() => setRowToDelete(row)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {totalPages > 1 && (
            <Group justify="center">
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
          )}
        </>
      )}
      <Modal
        opened={!!rowToDelete}
        onClose={() => setRowToDelete(null)}
        title="Delete row?"
      >
        <Stack>
          <Text>This will permanently delete the row. Cannot be undone.</Text>
          {deleteRow.isError && (
            <Text c="red" size="sm">
              {(deleteRow.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRowToDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteRow.isPending}
              onClick={() => {
                if (rowToDelete) deleteRow.mutate(rowToDelete.id);
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
