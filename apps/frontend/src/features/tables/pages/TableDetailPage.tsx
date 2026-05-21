import {
  Button,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useGroup } from "@/auth/GroupContext";
import { ColumnsTab } from "../components/ColumnsTab";
import { LookupSnippetPanel } from "../components/LookupSnippetPanel";
import { LookupsTab } from "../components/LookupsTab";
import { RowForm } from "../components/RowForm";
import { RowsTab } from "../components/RowsTab";
import { useDeleteTable } from "../hooks/useDeleteTable";
import { useTable } from "../hooks/useTable";
import { useUpdateTable } from "../hooks/useUpdateTable";
import type { LookupDef, TableRow } from "../types";

export function TableDetailPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { isSystemAdmin } = useAuth();
  const { activeGroup } = useGroup();
  const groupId = activeGroup?.id ?? null;
  const table = useTable(groupId, tableId ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tableDeleteConfirm, setTableDeleteConfirm] = useState("");
  const [editingRow, setEditingRow] = useState<TableRow | undefined>(undefined);
  const [rowFormOpen, setRowFormOpen] = useState(false);
  const [snippetLookup, setSnippetLookup] = useState<LookupDef | null>(null);

  const isAdmin = isSystemAdmin || activeGroup?.role === "ADMIN";

  const updateMeta = useUpdateTable(groupId, tableId);
  const deleteTable = useDeleteTable(groupId, tableId);

  const closeDeleteModal = () => {
    setConfirmDelete(false);
    setTableDeleteConfirm("");
  };

  if (table.isLoading)
    return (
      <Stack py="md">
        <Text c="dimmed">Loading…</Text>
      </Stack>
    );
  if (table.isError)
    return (
      <Stack py="md">
        <Text c="red">
          Failed to load table: {(table.error as Error).message}
        </Text>
      </Stack>
    );
  if (!table.data)
    return (
      <Stack py="md">
        <Text c="dimmed">Table not found.</Text>
      </Stack>
    );

  return (
    <Stack py="md">
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
          {isAdmin && <Tabs.Tab value="settings">Settings</Tabs.Tab>}
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
              isAdmin={isAdmin}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel value="lookups" pt="md">
          {groupId && tableId && (
            <LookupsTab
              groupId={groupId}
              tableId={tableId}
              columns={table.data.columns}
              lookups={table.data.lookups}
              onShowSnippet={setSnippetLookup}
              isAdmin={isAdmin}
            />
          )}
        </Tabs.Panel>
        {isAdmin && (
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
              onClose={closeDeleteModal}
              title="Delete table?"
            >
              <Stack>
                <Text>
                  This deletes the table and all its rows. Cannot be undone.
                </Text>
                <TextInput
                  label='Type "delete" to confirm'
                  placeholder="delete"
                  value={tableDeleteConfirm}
                  onChange={(e) => setTableDeleteConfirm(e.currentTarget.value)}
                />
                {deleteTable.isError && (
                  <Text c="red" size="sm">
                    {(deleteTable.error as Error).message}
                  </Text>
                )}
                <Group justify="flex-end">
                  <Button variant="default" onClick={closeDeleteModal}>
                    Cancel
                  </Button>
                  <Button
                    color="red"
                    disabled={tableDeleteConfirm !== "delete"}
                    loading={deleteTable.isPending}
                    onClick={() => deleteTable.mutate()}
                  >
                    Delete
                  </Button>
                </Group>
              </Stack>
            </Modal>
          </Tabs.Panel>
        )}
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
      {tableId && (
        <LookupSnippetPanel
          opened={!!snippetLookup}
          onClose={() => setSnippetLookup(null)}
          tableId={tableId}
          lookup={snippetLookup}
        />
      )}
    </Stack>
  );
}
