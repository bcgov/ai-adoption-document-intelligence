import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Modal,
  Pagination,
  Popover,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconColumns, IconPencil, IconTrash } from "@tabler/icons-react";
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

  const storageKey = `rows-hidden-cols:${groupId}:${tableId}`;
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored
        ? new Set(JSON.parse(stored) as string[])
        : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleCol = (key: string) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  };

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));
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
      // Process in chunks of 10 to avoid saturating the connection pool.
      const CHUNK_SIZE = 10;
      const results: { success: boolean; message?: string }[] = [];
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const chunkResults = await Promise.all(
          chunk.map((id) =>
            apiService.delete(
              `/tables/${tableId}/rows/${id}?group_id=${groupId}`,
            ),
          ),
        );
        results.push(...chunkResults);
      }
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
              onClick={() => {
                deleteRows.reset();
                setConfirmBulkDelete(true);
              }}
            >
              Delete {totalSelected} selected
            </Button>
          )}
          <Popover position="bottom-end" withinPortal>
            <Popover.Target>
              <Tooltip label="Show / hide columns" withArrow>
                <ActionIcon variant="default" aria-label="Column visibility">
                  <IconColumns size={16} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                {columns.map((c) => (
                  <Checkbox
                    key={c.key}
                    label={c.label}
                    checked={!hiddenCols.has(c.key)}
                    onChange={() => toggleCol(c.key)}
                  />
                ))}
              </Stack>
            </Popover.Dropdown>
          </Popover>
          <Button onClick={onCreate}>Create Row</Button>
        </Group>
      </Group>
      {rows.data.rows.length === 0 ? (
        <Text c="dimmed" fs="italic">
          No rows yet — click Create Row to add one.
        </Text>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <Table striped highlightOnHover style={{ tableLayout: "auto" }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th
                    w={40}
                    style={{
                      position: "sticky",
                      left: 0,
                      background: "var(--mantine-color-body)",
                      zIndex: 1,
                    }}
                  >
                    <Checkbox
                      checked={allPageSelected}
                      indeterminate={somePageSelected}
                      onChange={toggleAll}
                      aria-label="Select all rows on this page"
                    />
                  </Table.Th>
                  {visibleColumns.map((c) => (
                    <Table.Th key={c.key}>{c.label}</Table.Th>
                  ))}
                  <Table.Th
                    ta="right"
                    style={{
                      position: "sticky",
                      right: 0,
                      background: "var(--mantine-color-body)",
                      zIndex: 1,
                    }}
                  />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.data.rows.map((row, idx) => {
                  const isSelected = selectedIds.has(row.id);
                  // Match Mantine's striped="odd" pattern (1-indexed odd = 0-indexed even)
                  const stripeBg =
                    idx % 2 === 0
                      ? "var(--table-striped-color)"
                      : "var(--mantine-color-body)";
                  const stickyBg = isSelected
                    ? "var(--mantine-color-blue-1)"
                    : stripeBg;
                  const selBg = isSelected
                    ? "var(--mantine-color-blue-1)"
                    : undefined;
                  const selColor = isSelected
                    ? "var(--mantine-color-dark-9)"
                    : undefined;
                  return (
                    <Table.Tr key={row.id}>
                      <Table.Td
                        style={{
                          position: "sticky",
                          left: 0,
                          background: stickyBg,
                          color: selColor,
                          zIndex: 1,
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          aria-label="Select row"
                        />
                      </Table.Td>
                      {visibleColumns.map((c) => (
                        <Table.Td
                          key={c.key}
                          style={
                            selBg
                              ? { backgroundColor: selBg, color: selColor }
                              : undefined
                          }
                        >
                          {renderCell(row.data[c.key], c.type)}
                        </Table.Td>
                      ))}
                      <Table.Td
                        style={{
                          position: "sticky",
                          right: 0,
                          background: stickyBg,
                          color: selColor,
                          zIndex: 1,
                        }}
                      >
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
                              onClick={() => {
                                deleteRows.reset();
                                setRowToDelete(row);
                              }}
                              aria-label="Delete row"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
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
