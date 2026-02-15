import {
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  CreateDefinitionDialog,
  type CreateDefinitionFormData,
} from "../components/CreateDefinitionDialog";
import { DefinitionDetailView } from "../components/DefinitionDetailView";
import { useDefinition, useDefinitions } from "../hooks/useDefinitions";
import { useProject } from "../hooks/useProjects";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "";

  const { project, isLoading: isLoadingProject } = useProject(projectId);
  const {
    definitions,
    isLoading: isLoadingDefinitions,
    createDefinition,
    isCreating,
  } = useDefinitions(projectId);

  const [createDialogOpened, setCreateDialogOpened] = useState(false);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    string | null
  >(null);
  const [detailDialogOpened, setDetailDialogOpened] = useState(false);

  const { definition, isLoading: isLoadingDefinition } = useDefinition(
    projectId,
    selectedDefinitionId || "",
  );

  const handleCreateDefinition = (data: CreateDefinitionFormData) => {
    createDefinition(data);
  };

  const handleViewDetails = (definitionId: string) => {
    setSelectedDefinitionId(definitionId);
    setDetailDialogOpened(true);
  };

  const handleCloseDetail = () => {
    setDetailDialogOpened(false);
    setSelectedDefinitionId(null);
  };

  if (isLoadingProject) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!project) {
    return (
      <Center h={400}>
        <Text c="dimmed">Project not found</Text>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2}>{project.name}</Title>
        {project.description && (
          <Text c="dimmed" size="sm">
            {project.description}
          </Text>
        )}
        <Text c="dimmed" size="xs">
          MLflow Experiment: {project.mlflowExperimentId}
        </Text>
      </Stack>

      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3}>Benchmark Definitions</Title>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateDialogOpened(true)}
            >
              Create Definition
            </Button>
          </Group>

          {isLoadingDefinitions ? (
            <Center h={200}>
              <Loader />
            </Center>
          ) : definitions.length === 0 ? (
            <Center h={200}>
              <Stack gap="xs" align="center">
                <Text c="dimmed">No definitions yet</Text>
                <Button
                  variant="subtle"
                  onClick={() => setCreateDialogOpened(true)}
                >
                  Create your first definition
                </Button>
              </Stack>
            </Center>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Dataset Version</Table.Th>
                  <Table.Th>Workflow</Table.Th>
                  <Table.Th>Evaluator</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Revision</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {definitions.map((def) => (
                  <Table.Tr
                    key={def.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => handleViewDetails(def.id)}
                  >
                    <Table.Td>{def.name}</Table.Td>
                    <Table.Td>
                      {def.datasetVersion.datasetName} v
                      {def.datasetVersion.version}
                    </Table.Td>
                    <Table.Td>
                      {def.workflow.name} v{def.workflow.version}
                    </Table.Td>
                    <Table.Td>{def.evaluatorType}</Table.Td>
                    <Table.Td>
                      {def.immutable ? (
                        <Badge color="gray">Immutable</Badge>
                      ) : (
                        <Badge color="blue">Mutable</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>{def.revision}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Stack>
      </Card>

      <CreateDefinitionDialog
        opened={createDialogOpened}
        onClose={() => setCreateDialogOpened(false)}
        onCreate={handleCreateDefinition}
        isCreating={isCreating}
      />

      <Modal
        opened={detailDialogOpened}
        onClose={handleCloseDetail}
        title="Definition Details"
        size="xl"
      >
        {isLoadingDefinition ? (
          <Center h={200}>
            <Loader />
          </Center>
        ) : definition ? (
          <DefinitionDetailView definition={definition} />
        ) : (
          <Text c="dimmed">Definition not found</Text>
        )}
      </Modal>
    </Stack>
  );
}
