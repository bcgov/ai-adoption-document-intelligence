import { IconDatabase, IconFileCheck, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Center,
  DataTable,
  Loader,
  PageHeader,
  PanelCard,
  Stack,
  Text,
} from "../../../ui";
import { CreateDatasetDialog } from "../components/CreateDatasetDialog";
import { CreateDatasetFromHitlDialog } from "../components/CreateDatasetFromHitlDialog";
import { useDatasets } from "../hooks/useDatasets";

export function DatasetListPage() {
  const {
    datasets,
    isLoading,
    error,
    createDataset,
    isCreating,
    createError,
    resetCreateError,
  } = useDatasets();
  const [createDialogOpened, setCreateDialogOpened] = useState(false);
  const [hitlDialogOpened, setHitlDialogOpened] = useState(false);
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Center h="70vh">
        <Loader size="lg" />
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="70vh">
        <Stack align="center" gap="md">
          <Text c="red">Failed to load datasets</Text>
          <Text size="sm" c="dimmed">
            {error.message || "Unknown error"}
          </Text>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Datasets"
        description="Manage benchmark datasets and versions"
        actions={
          <>
            <Button
              variant="light"
              leftSection={<IconFileCheck size={18} />}
              onClick={() => setHitlDialogOpened(true)}
              data-testid="create-dataset-from-hitl-btn"
            >
              From verified documents
            </Button>
            <Button
              leftSection={<IconPlus size={18} />}
              onClick={() => setCreateDialogOpened(true)}
              data-testid="create-dataset-btn"
            >
              Create dataset
            </Button>
          </>
        }
      />

      {datasets.length === 0 ? (
        <PanelCard data-testid="datasets-empty-state">
          <Stack p="md">
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
                  Create dataset
                </Button>
              </Stack>
            </Center>
          </Stack>
        </PanelCard>
      ) : (
        <PanelCard>
          <DataTable
            striped
            highlightOnHover
            data-testid="datasets-table"
            caption={`${datasets.length} dataset${datasets.length === 1 ? "" : "s"}`}
          >
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Name</DataTable.Th>
                <DataTable.Th>Description</DataTable.Th>
                <DataTable.Th>Version count</DataTable.Th>
                <DataTable.Th>Created date</DataTable.Th>
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {datasets.map((dataset) => (
                <DataTable.Tr
                  key={dataset.id}
                  onClick={() =>
                    navigate(`/benchmarking/datasets/${dataset.id}`)
                  }
                  style={{ cursor: "pointer" }}
                  data-testid={`dataset-row-${dataset.id}`}
                >
                  <DataTable.Td>
                    <Text fw={600}>{dataset.name}</Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {dataset.description || "—"}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm">{dataset.versionCount || 0}</Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm">
                      {new Date(dataset.createdAt).toLocaleDateString()}
                    </Text>
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        </PanelCard>
      )}

      <CreateDatasetDialog
        opened={createDialogOpened}
        onClose={() => setCreateDialogOpened(false)}
        onCreate={createDataset}
        isCreating={isCreating}
        createError={createError}
        onResetError={resetCreateError}
      />

      <CreateDatasetFromHitlDialog
        opened={hitlDialogOpened}
        onClose={() => setHitlDialogOpened(false)}
        onSuccess={(datasetId) =>
          navigate(`/benchmarking/datasets/${datasetId}`)
        }
      />
    </Stack>
  );
}
