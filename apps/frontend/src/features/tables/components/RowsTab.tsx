import { useState } from "react";
import { Button, DataTable, Group, Pagination, Stack, Text } from "../../../ui";
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
  const [page, setPage] = useState(1);
  const rows = useTableRows(groupId, tableId, {
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
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
          <DataTable striped highlightOnHover>
            <DataTable.Thead>
              <DataTable.Tr>
                {columns.map((c) => (
                  <DataTable.Th key={c.key}>{c.label}</DataTable.Th>
                ))}
                <DataTable.Th />
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {rows.data.rows.map((row) => (
                <DataTable.Tr key={row.id}>
                  {columns.map((c) => (
                    <DataTable.Td key={c.key}>
                      {renderCell(row.data[c.key], c.type)}
                    </DataTable.Td>
                  ))}
                  <DataTable.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => onEdit(row)}
                    >
                      Edit
                    </Button>
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
          {totalPages > 1 && (
            <Group justify="center">
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
          )}
        </>
      )}
    </Stack>
  );
}
