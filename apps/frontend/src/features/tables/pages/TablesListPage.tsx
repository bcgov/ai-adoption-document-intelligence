import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGroup } from "@/auth/GroupContext";
import {
  Button,
  DataTable,
  PageHeader,
  PanelCard,
  SearchField,
  Stack,
  Text,
} from "../../../ui";
import { CreateTableModal } from "../components/CreateTableModal";
import { useTables } from "../hooks/useTables";

export function TablesListPage() {
  const { activeGroup } = useGroup();
  const navigate = useNavigate();
  const tables = useTables(activeGroup?.id ?? null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const filtered = (tables.data ?? []).filter((t) =>
    t.label.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Tables"
        description="Manage reference data tables for your group."
        actions={
          <Button onClick={() => setModalOpen(true)} disabled={!activeGroup}>
            Create Table
          </Button>
        }
      />

      <PanelCard>
        <Stack gap="md">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search by label"
          />
          {tables.isLoading && <Text c="dimmed">Loading…</Text>}
          {tables.isError && (
            <Text c="red">
              Failed to load tables: {(tables.error as Error).message}
            </Text>
          )}
          {tables.data && filtered.length === 0 && (
            <Text c="dimmed">
              {search
                ? "No tables match the search."
                : "No tables yet — click Create Table to add one."}
            </Text>
          )}
          {filtered.length > 0 && (
            <DataTable
              striped
              highlightOnHover
              caption={`${filtered.length} table${filtered.length === 1 ? "" : "s"}`}
            >
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Label</DataTable.Th>
                  <DataTable.Th>Table ID</DataTable.Th>
                  <DataTable.Th>Description</DataTable.Th>
                  <DataTable.Th>Rows</DataTable.Th>
                  <DataTable.Th>Updated</DataTable.Th>
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {filtered.map((t) => (
                  <DataTable.Tr
                    key={t.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/tables/${t.table_id}`)}
                  >
                    <DataTable.Td>{t.label}</DataTable.Td>
                    <DataTable.Td>
                      <Text c="dimmed" ff="monospace" size="sm">
                        {t.table_id}
                      </Text>
                    </DataTable.Td>
                    <DataTable.Td>{t.description ?? ""}</DataTable.Td>
                    <DataTable.Td>{t.row_count}</DataTable.Td>
                    <DataTable.Td>
                      {new Date(t.updated_at).toLocaleDateString()}
                    </DataTable.Td>
                  </DataTable.Tr>
                ))}
              </DataTable.Tbody>
            </DataTable>
          )}
        </Stack>
      </PanelCard>

      <CreateTableModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(tableId) => navigate(`/tables/${tableId}`)}
      />
    </Stack>
  );
}
