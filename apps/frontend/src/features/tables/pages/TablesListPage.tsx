import {
  Button,
  Container,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGroup } from "@/auth/GroupContext";
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
    <Container size="xl" py="md">
      <Group justify="space-between">
        <Title order={2}>Tables</Title>
        <Button onClick={() => setModalOpen(true)} disabled={!activeGroup}>
          Create Table
        </Button>
      </Group>
      <Stack mt="md">
        <TextInput
          placeholder="Search by label"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
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
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Label</Table.Th>
                <Table.Th>Table ID</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Rows</Table.Th>
                <Table.Th>Updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((t) => (
                <Table.Tr
                  key={t.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/tables/${t.table_id}`)}
                >
                  <Table.Td>{t.label}</Table.Td>
                  <Table.Td>
                    <Text c="dimmed" ff="monospace" size="sm">
                      {t.table_id}
                    </Text>
                  </Table.Td>
                  <Table.Td>{t.description ?? ""}</Table.Td>
                  <Table.Td>{t.row_count}</Table.Td>
                  <Table.Td>
                    {new Date(t.updated_at).toLocaleDateString()}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
      <CreateTableModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(tid) => navigate(`/tables/${tid}`)}
      />
    </Container>
  );
}
