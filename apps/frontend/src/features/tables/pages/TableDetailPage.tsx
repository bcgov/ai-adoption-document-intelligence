import {
  Button,
  Container,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";
import { ColumnsTab } from "../components/ColumnsTab";
import { RowForm } from "../components/RowForm";
import { RowsTab } from "../components/RowsTab";
import { useTable } from "../hooks/useTable";
import type { TableRow } from "../types";

export function TableDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { activeGroup } = useGroup();
  const groupId = activeGroup?.id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const table = useTable(groupId, tableId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingRow, setEditingRow] = useState<TableRow | undefined>(undefined);
  const [rowFormOpen, setRowFormOpen] = useState(false);

  const updateMeta = useMutation({
    mutationFn: async (patch: {
      label?: string;
      description?: string | null;
    }) => {
      const response = await apiService.patch(
        `/tables/${tableId}?group_id=${groupId}`,
        patch,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to update table");
      return response.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables", groupId, tableId] });
      qc.invalidateQueries({ queryKey: ["tables", groupId] });
    },
  });

  const deleteTable = useMutation({
    mutationFn: async () => {
      const response = await apiService.delete(
        `/tables/${tableId}?group_id=${groupId}`,
      );
      if (!response.success)
        throw new Error(response.message ?? "Failed to delete table");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tables", groupId] });
      navigate("/tables");
    },
  });

  if (table.isLoading)
    return (
      <Container py="md">
        <Text c="dimmed">Loading…</Text>
      </Container>
    );
  if (table.isError)
    return (
      <Container py="md">
        <Text c="red">
          Failed to load table: {(table.error as Error).message}
        </Text>
      </Container>
    );
  if (!table.data)
    return (
      <Container py="md">
        <Text c="dimmed">Table not found.</Text>
      </Container>
    );

  return (
    <Container size="xl" py="md">
      <Group justify="space-between" mb="md">
        <Stack gap={0}>
          <Title order={2}>{table.data.label}</Title>
          <Text c="dimmed" size="sm" ff="monospace">
            {table.data.table_id}
          </Text>
        </Stack>
      </Group>
      <Tabs defaultValue="rows">
        <Tabs.List>
          <Tabs.Tab value="rows">Rows</Tabs.Tab>
          <Tabs.Tab value="columns">Columns</Tabs.Tab>
          <Tabs.Tab value="lookups">Lookups</Tabs.Tab>
          <Tabs.Tab value="settings">Settings</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="rows" pt="md">
          {groupId && tableId && (
            <RowsTab
              groupId={groupId}
              tableId={tableId}
              columns={table.data.columns}
              onCreate={() => {
                setEditingRow(undefined);
                setRowFormOpen(true);
              }}
              onEdit={(row) => {
                setEditingRow(row);
                setRowFormOpen(true);
              }}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="columns" pt="md">
          {groupId && tableId && (
            <ColumnsTab
              groupId={groupId}
              tableId={tableId}
              columns={table.data.columns}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="lookups" pt="md">
          <Text c="dimmed" fs="italic">
            Lookups tab — implemented in Task 28.
          </Text>
        </Tabs.Panel>
        <Tabs.Panel value="settings" pt="md">
          <Stack maw={500}>
            <TextInput
              label="Label"
              defaultValue={table.data.label}
              onBlur={(e) => {
                const next = e.currentTarget.value.trim();
                if (next && next !== table.data?.label) {
                  updateMeta.mutate({ label: next });
                }
              }}
            />
            <Textarea
              label="Description"
              defaultValue={table.data.description ?? ""}
              onBlur={(e) => {
                const raw = e.currentTarget.value;
                const next = raw.trim() || null;
                if (next !== (table.data?.description ?? null)) {
                  updateMeta.mutate({ description: next });
                }
              }}
            />
            {updateMeta.isError && (
              <Text c="red" size="sm">
                {(updateMeta.error as Error).message}
              </Text>
            )}
            <Group>
              <Button color="red" onClick={() => setConfirmDelete(true)}>
                Delete Table
              </Button>
            </Group>
          </Stack>
          <Modal
            opened={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            title="Delete table?"
          >
            <Stack>
              <Text>
                This deletes the table and all its rows. Cannot be undone.
              </Text>
              {deleteTable.isError && (
                <Text c="red" size="sm">
                  {(deleteTable.error as Error).message}
                </Text>
              )}
              <Group justify="flex-end">
                <Button
                  variant="default"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  loading={deleteTable.isPending}
                  onClick={() => deleteTable.mutate()}
                >
                  Delete
                </Button>
              </Group>
            </Stack>
          </Modal>
        </Tabs.Panel>
      </Tabs>
      {groupId && tableId && (
        <RowForm
          opened={rowFormOpen}
          onClose={() => setRowFormOpen(false)}
          groupId={groupId}
          tableId={tableId}
          columns={table.data.columns}
          existing={editingRow}
        />
      )}
    </Container>
  );
}
