import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  Pagination,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const rows = useTableRows(groupId, tableId, {
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  // Reset selection when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page]);

  const deleteRows = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.all(
        ids.map((id) =>
          apiService.delete(
            `/tables/${tableId}/rows/${id}?group_id=${groupId}`,
          ),
        ),
      );
      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        throw new Error(
          failed.map((r) => r.message ?? "Failed to delete row").join("; "),
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["table-rows", groupId, tableId] });
      setRowToDelete(null);
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
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
  const currentPageRows = rows.data.rows;
  const allPageSelected =
    currentPageRows.length > 0 &&
    currentPageRows.every((r) => selectedIds.has(r.id));
  const somePageSelected =
    currentPageRows.some((r) => selectedIds.has(r.id)) && !allPageSelected;

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageRows.forEach((r) => {
          next.delete(r.id);
        });
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        currentPageRows.forEach((r) => {
          next.add(r.id);
        });
        return next;
      });
    }
  };

  const totalSelected = selectedIds.size;

  return (
    <Stack>
      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {rows.data.total} {rows.data.total === 1 ? "row" : "rows"}
        </Text>
        <Group gap="xs">
          {totalSelected > 0 && (
            <Button
              color="red"
              variant="light"
              size="sm"
              onClick={() => setConfirmBulkDelete(true)}
            >
              Delete {totalSelected} selected
            </Button>
          )}
          <Button onClick={onCreate}>Create Row</Button>
        </Group>
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
                <Table.Th w={40}>
                  <Checkbox
                    checked={allPageSelected}
                    indeterminate={somePageSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows on this page"
                  />
                </Table.Th>
                {columns.map((c) => (
                  <Table.Th key={c.key}>{c.label}</Table.Th>
                ))}
                <Table.Th ta="right" />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.data.rows.map((row) => (
                <Table.Tr
                  key={row.id}
                  style={
                    selectedIds.has(row.id)
                      ? { backgroundColor: "var(--mantine-color-blue-0)" }
                      : undefined
                  }
                >
                  <Table.Td>
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleRow(row.id)}
                      aria-label="Select row"
                    />
                  </Table.Td>
                  {columns.map((c) => (
                    <Table.Td key={c.key}>
                      {renderCell(row.data[c.key], c.type)}
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Tooltip label="Edit" withArrow>
                        <ActionIcon
                          variant="subtle"
                          onClick={() => onEdit(row)}
                          aria-label="Edit row"
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => setRowToDelete(row)}
                          aria-label="Delete row"
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
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
          {deleteRows.isError && (
            <Text c="red" size="sm">
              {(deleteRows.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRowToDelete(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteRows.isPending}
              onClick={() => {
                if (rowToDelete) deleteRows.mutate([rowToDelete.id]);
              }}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
      <Modal
        opened={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        title="Delete selected rows?"
      >
        <Stack>
          <Text>
            Permanently delete {totalSelected}{" "}
            {totalSelected === 1 ? "row" : "rows"}? This cannot be undone.
          </Text>
          {deleteRows.isError && (
            <Text c="red" size="sm">
              {(deleteRows.error as Error).message}
            </Text>
          )}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setConfirmBulkDelete(false)}
            >
              Cancel
            </Button>
            <Button
              color="red"
              loading={deleteRows.isPending}
              onClick={() => deleteRows.mutate([...selectedIds])}
            >
              Delete {totalSelected} {totalSelected === 1 ? "row" : "rows"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
