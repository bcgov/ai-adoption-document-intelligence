import {
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconDatabase, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateDatasetDialog } from "../components/CreateDatasetDialog";
import { useDatasets } from "../hooks/useDatasets";

export function DatasetListPage() {
  const { datasets, isLoading, createDataset, isCreating } = useDatasets();
  const [createDialogOpened, setCreateDialogOpened] = useState(false);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" data-testid="datasets-header">
        <Stack gap={2}>
          <Title order={2}>Datasets</Title>
          <Text c="dimmed" size="sm">
            Manage benchmark datasets and versions
          </Text>
        </Stack>
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={() => setCreateDialogOpened(true)}
          data-testid="create-dataset-btn"
        >
          Create Dataset
        </Button>
      </Group>

      {datasets.length === 0 ? (
        <Card withBorder p="xl" data-testid="datasets-empty-state">
          <Center>
            <Stack align="center" gap="md">
              <IconDatabase size={48} stroke={1.5} color="gray" />
              <Stack gap={4} align="center">
                <Text fw={600}>No datasets yet</Text>
                <Text size="sm" c="dimmed">
                  Create your first benchmark dataset to get started
                </Text>
              </Stack>
              <Button
                leftSection={<IconPlus size={18} />}
                onClick={() => setCreateDialogOpened(true)}
                data-testid="create-dataset-empty-btn"
              >
                Create Dataset
              </Button>
            </Stack>
          </Center>
        </Card>
      ) : (
        <Card withBorder p={0}>
          <Table striped highlightOnHover data-testid="datasets-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Version Count</Table.Th>
                <Table.Th>Created Date</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {datasets.map((dataset) => (
                <Table.Tr
                  key={dataset.id}
                  onClick={() =>
                    navigate(`/benchmarking/datasets/${dataset.id}`)
                  }
                  style={{ cursor: "pointer" }}
                  data-testid={`dataset-row-${dataset.id}`}
                >
                  <Table.Td>
                    <Text fw={600}>{dataset.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {dataset.description || "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{dataset.versionCount || 0}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {new Date(dataset.createdAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      <CreateDatasetDialog
        opened={createDialogOpened}
        onClose={() => setCreateDialogOpened(false)}
        onCreate={createDataset}
        isCreating={isCreating}
      />
    </Stack>
  );
}
