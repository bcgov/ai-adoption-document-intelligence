import {
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconGitCompare,
  IconPlus,
  IconTrophy,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CreateDefinitionDialog,
  type CreateDefinitionFormData,
} from "../components/CreateDefinitionDialog";
import { DefinitionDetailView } from "../components/DefinitionDetailView";
import { useDefinition, useDefinitions } from "../hooks/useDefinitions";
import { useProject } from "../hooks/useProjects";
import { useRuns } from "../hooks/useRuns";

function getStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "blue";
    case "running":
      return "yellow";
    case "completed":
      return "green";
    case "failed":
      return "red";
    case "cancelled":
      return "gray";
    default:
      return "gray";
  }
}

function formatDuration(durationMs: number | null): string {
  if (!durationMs) return "-";
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function getElapsedTime(startedAt: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsed = now - start;
  return formatDuration(elapsed);
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "";
  const navigate = useNavigate();

  const { project, isLoading: isLoadingProject, error: projectError } = useProject(projectId);
  const {
    definitions,
    isLoading: isLoadingDefinitions,
    createDefinition,
    isCreating,
  } = useDefinitions(projectId);
  const { runs, isLoading: isLoadingRuns } = useRuns(projectId);

  const [createDialogOpened, setCreateDialogOpened] = useState(false);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    string | null
  >(null);
  const [detailDialogOpened, setDetailDialogOpened] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);

  const { definition, isLoading: isLoadingDefinition } = useDefinition(
    projectId,
    selectedDefinitionId || "",
  );

  const previousIsCreatingRef = useRef(isCreating);

  useEffect(() => {
    if (previousIsCreatingRef.current && !isCreating) {
      setCreateDialogOpened(false);
    }
    previousIsCreatingRef.current = isCreating;
  }, [isCreating]);

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

  const handleToggleRunSelection = (runId: string) => {
    setSelectedRunIds((prev) =>
      prev.includes(runId)
        ? prev.filter((id) => id !== runId)
        : [...prev, runId],
    );
  };

  const handleCompare = () => {
    if (selectedRunIds.length < 2) return;
    const runIdsParam = selectedRunIds.join(",");
    navigate(`/benchmarking/projects/${projectId}/compare?runs=${runIdsParam}`);
  };

  if (isLoadingProject) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (projectError) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <Text c="red">Failed to load project</Text>
          <Text size="sm" c="dimmed">{projectError.message || 'Unknown error'}</Text>
          {projectId && <Text size="xs" c="dimmed">ID: {projectId}</Text>}
        </Stack>
      </Center>
    );
  }

  if (!project) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <Text c="dimmed">Project not found</Text>
          {projectId && <Text size="sm" c="dimmed">ID: {projectId}</Text>}
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Title order={2} data-testid="project-name-title">
          {project.name}
        </Title>
        {project.description && (
          <Text c="dimmed" size="sm" data-testid="project-description">
            {project.description}
          </Text>
        )}
        <Text c="dimmed" size="xs" data-testid="mlflow-experiment-id">
          MLflow Experiment: {project.mlflowExperimentId}
        </Text>
      </Stack>

      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3} data-testid="definitions-heading">
              Benchmark Definitions
            </Title>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => setCreateDialogOpened(true)}
              data-testid="create-definition-btn"
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
                <Text c="dimmed" data-testid="no-definitions-message">
                  No definitions yet
                </Text>
                <Button
                  variant="subtle"
                  onClick={() => setCreateDialogOpened(true)}
                  data-testid="create-first-definition-btn"
                >
                  Create your first definition
                </Button>
              </Stack>
            </Center>
          ) : (
            <Table striped highlightOnHover data-testid="definitions-table">
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
                    data-testid={`definition-row-${def.id}`}
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

      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3} data-testid="runs-heading">
              Recent Runs
            </Title>
            <Group gap="sm">
              {selectedRunIds.length > 0 && selectedRunIds.length < 2 && (
                <Text size="sm" c="dimmed">
                  Select at least 2 runs to compare
                </Text>
              )}
              {selectedRunIds.length > 5 && (
                <Text size="sm" c="red" data-testid="compare-limit-error">
                  Please select no more than 5 runs
                </Text>
              )}
              {selectedRunIds.length >= 2 && (
                <Button
                  leftSection={<IconGitCompare size={16} />}
                  onClick={handleCompare}
                  disabled={selectedRunIds.length > 5}
                  data-testid="compare-runs-btn"
                >
                  Compare ({selectedRunIds.length})
                </Button>
              )}
            </Group>
          </Group>

          {isLoadingRuns ? (
            <Center h={200}>
              <Loader />
            </Center>
          ) : runs.length === 0 ? (
            <Center h={200}>
              <Text c="dimmed" data-testid="no-runs-message">
                No runs yet
              </Text>
            </Center>
          ) : (
            <Table striped highlightOnHover data-testid="runs-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Select</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Run ID / Version</Table.Th>
                  <Table.Th>Definition</Table.Th>
                  <Table.Th>Started</Table.Th>
                  <Table.Th>Duration</Table.Th>
                  <Table.Th>Metrics</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {runs.map((run) => (
                  <Table.Tr key={run.id} data-testid={`run-row-${run.id}`}>
                    <Table.Td>
                      <Checkbox
                        checked={selectedRunIds.includes(run.id)}
                        onChange={() => handleToggleRunSelection(run.id)}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`run-checkbox-${run.id}`}
                      />
                    </Table.Td>
                    <Table.Td
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate(
                          `/benchmarking/projects/${projectId}/runs/${run.id}`,
                        )
                      }
                    >
                      <Group gap="xs">
                        <Badge color={getStatusColor(run.status)}>
                          {run.status}
                        </Badge>
                        {run.isBaseline && (
                          <Badge
                            color="yellow"
                            leftSection={<IconTrophy size={12} />}
                          >
                            BASELINE
                          </Badge>
                        )}
                        {run.hasRegression && run.regressedMetricCount && (
                          <Badge
                            color="red"
                            leftSection={<IconAlertTriangle size={12} />}
                            style={{ cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(
                                `/benchmarking/projects/${projectId}/runs/${run.id}/regression`,
                              );
                            }}
                            data-testid="regression-indicator"
                          >
                            {run.regressedMetricCount} regressed
                          </Badge>
                        )}
                      </Group>
                    </Table.Td>
                    <Table.Td
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate(
                          `/benchmarking/projects/${projectId}/runs/${run.id}`,
                        )
                      }
                    >
                      {run.tags && typeof run.tags === 'object' && 'version' in run.tags
                        ? run.tags.version
                        : run.id.substring(0, 8)}
                    </Table.Td>
                    <Table.Td
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate(
                          `/benchmarking/projects/${projectId}/runs/${run.id}`,
                        )
                      }
                    >
                      {run.definitionName}
                    </Table.Td>
                    <Table.Td
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate(
                          `/benchmarking/projects/${projectId}/runs/${run.id}`,
                        )
                      }
                    >
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : "-"}
                    </Table.Td>
                    <Table.Td
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate(
                          `/benchmarking/projects/${projectId}/runs/${run.id}`,
                        )
                      }
                    >
                      {run.status === "running" || run.status === "pending"
                        ? getElapsedTime(run.startedAt)
                        : formatDuration(run.durationMs)}
                    </Table.Td>
                    <Table.Td
                      style={{ cursor: "pointer" }}
                      onClick={() =>
                        navigate(
                          `/benchmarking/projects/${projectId}/runs/${run.id}`,
                        )
                      }
                    >
                      {run.headlineMetrics
                        ? Object.entries(run.headlineMetrics)
                            .slice(0, 2)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(", ")
                        : "-"}
                    </Table.Td>
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
