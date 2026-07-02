import { IconDeviceFloppy, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useGroup } from "@/auth/GroupContext";
import {
  Button,
  Group,
  Modal,
  PageHeader,
  PanelCard,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "../../../ui";
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

  // Controlled state for the settings form
  const [settingsLabel, setSettingsLabel] = useState<string | null>(null);
  const [settingsDescription, setSettingsDescription] = useState<string | null>(
    null,
  );

  // Use live table data as the source of truth; local state only while editing
  const currentLabel = settingsLabel ?? table.data?.label ?? "";
  const currentDescription =
    settingsDescription ?? table.data?.description ?? "";

  const closeDeleteModal = () => {
    setConfirmDelete(false);
    setTableDeleteConfirm("");
  };

  if (table.isLoading)
    return (
      <Stack gap="lg">
        <PageHeader title="Table" description="Loading table details…" />
        <Text c="dimmed">Loading…</Text>
      </Stack>
    );
  if (table.isError)
    return (
      <Stack gap="lg">
        <PageHeader title="Table" description="Table detail" />
        <Text c="red">
          Failed to load table: {(table.error as Error).message}
        </Text>
      </Stack>
    );
  if (!table.data)
    return (
      <Stack gap="lg">
        <PageHeader title="Table" description="Table detail" />
        <Text c="dimmed">Table not found.</Text>
      </Stack>
    );

  return (
    <Stack gap="lg">
      <PageHeader title={table.data.label} description={table.data.table_id} />
      <PanelCard>
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
                  value={currentLabel}
                  onChange={(e) => setSettingsLabel(e.currentTarget.value)}
                />
                <Textarea
                  label="Description"
                  value={currentDescription}
                  onChange={(e) =>
                    setSettingsDescription(e.currentTarget.value)
                  }
                />
                {updateMeta.isError && (
                  <Text c="red" size="sm">
                    {(updateMeta.error as Error).message}
                  </Text>
                )}
                <Group>
                  <Button
                    leftSection={<IconDeviceFloppy size={16} />}
                    loading={updateMeta.isPending}
                    onClick={() => {
                      const label = currentLabel.trim();
                      const description = currentDescription.trim() || null;
                      if (!label) return;
                      updateMeta.mutate(
                        { label, description },
                        {
                          onSuccess: () => {
                            setSettingsLabel(null);
                            setSettingsDescription(null);
                          },
                        },
                      );
                    }}
                  >
                    Save settings
                  </Button>
                  <Button
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete table
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
                    This deletes the table and all its rows. cannot be undone.
                  </Text>
                  <TextInput
                    label='Type "delete" to confirm'
                    placeholder="delete"
                    value={tableDeleteConfirm}
                    onChange={(e) =>
                      setTableDeleteConfirm(e.currentTarget.value)
                    }
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
                      leftSection={<IconTrash size={16} />}
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
      </PanelCard>
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
