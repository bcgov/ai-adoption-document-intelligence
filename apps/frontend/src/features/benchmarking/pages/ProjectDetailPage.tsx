import {
  Alert,
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
  IconArrowLeft,
  IconGitCompare,
  IconPlus,
  IconTrash,
  IconTrophy,
} from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CreateDefinitionDialog,
  type CreateDefinitionFormData,
  type DefinitionFormInitialValues,
} from "../components/CreateDefinitionDialog";
import { DefinitionDetailView } from "../components/DefinitionDetailView";
import { useDefinition, useDefinitions } from "../hooks/useDefinitions";
import { useProject, useProjects } from "../hooks/useProjects";
import { useRuns } from "../hooks/useRuns";
import { formatDurationMs, getElapsedTime, getStatusColor } from "../utils";

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "";
  const navigate = useNavigate();

  const {
    project,
    isLoading: isLoadingProject,
    error: projectError,
  } = useProject(projectId);
  const {
    definitions,
    isLoading: isLoadingDefinitions,
    createDefinition,
    isCreating,
    deleteDefinition,
    isDeletingDefinition,
  } = useDefinitions(projectId);
  const {
    runs,
    isLoading: isLoadingRuns,
    deleteRun,
    isDeletingRun,
  } = useRuns(projectId);

  const [createDialogOpened, setCreateDialogOpened] = useState(false);
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<
    string | null
  >(null);
  const [detailDialogOpened, setDetailDialogOpened] = useState(false);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [deleteDefDialogOpen, setDeleteDefDialogOpen] = useState(false);
  const [defToDelete, setDefToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteRunDialogOpen, setDeleteRunDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const {
    deleteProject,
    isDeletingProject,
    deleteError: deleteProjectError,
  } = useProjects();

  const {
    definition,
    isLoading: isLoadingDefinition,
    updateDefinition,
    isUpdating,
  } = useDefinition(projectId, selectedDefinitionId || "");
  const [editDialogOpened, setEditDialogOpened] = useState(false);
  const [editInitialValues, setEditInitialValues] = useState<
    DefinitionFormInitialValues | undefined
  >(undefined);

  const previousIsCreatingRef = useRef(isCreating);
  const previousIsUpdatingRef = useRef(isUpdating);

  useEffect(() => {
    if (previousIsCreatingRef.current && !isCreating) {
      setCreateDialogOpened(false);
    }
    previousIsCreatingRef.current = isCreating;
  }, [isCreating]);

  useEffect(() => {
    if (previousIsUpdatingRef.current && !isUpdating) {
      setEditDialogOpened(false);
      setEditInitialValues(undefined);
    }
    previousIsUpdatingRef.current = isUpdating;
  }, [isUpdating]);

  const handleCreateDefinition = (data: CreateDefinitionFormData) => {
    createDefinition({ ...data, splitId: data.splitId ?? "" });
  };

  const handleEditDefinition = () => {
    if (!definition || definition.immutable) return;
    setEditInitialValues({
      name: definition.name,
      datasetVersionId: definition.datasetVersion.id,
      splitId: definition.split?.id,
      workflowVersionId: definition.workflow.workflowVersionId,
      evaluatorType: definition.evaluatorType,
      evaluatorConfig: definition.evaluatorConfig,
      runtimeSettings: definition.runtimeSettings,
      workflowConfigOverrides: definition.workflowConfigOverrides,
    });
    setDetailDialogOpened(false);
    setEditDialogOpened(true);
  };

  const handleUpdateDefinition = (data: CreateDefinitionFormData) => {
    updateDefinition(data);
  };

  const handleViewDetails = (definitionId: string) => {
    setSelectedDefinitionId(definitionId);
    setDetailDialogOpened(true);
  };

  const handleCloseDetail = () => {
    setDetailDialogOpened(false);
    setSelectedDefinitionId(null);
  };

  const handleDeleteDefinitionClick = (defId: string, defName: string) => {
    setDefToDelete({ id: defId, name: defName });
    setDeleteDefDialogOpen(true);
  };

  const handleDeleteDefinitionConfirm = () => {
    if (!defToDelete) return;
    deleteDefinition(defToDelete.id);
    setDeleteDefDialogOpen(false);
    setDefToDelete(null);
  };

  const handleDeleteDefinitionCancel = () => {
    setDeleteDefDialogOpen(false);
    setDefToDelete(null);
  };

  const handleDeleteRunClick = (runId: string, runLabel: string) => {
    setRunToDelete({ id: runId, label: runLabel });
    setDeleteRunDialogOpen(true);
  };

  const handleDeleteRunConfirm = () => {
    if (!runToDelete) return;
    deleteRun(runToDelete.id);
    setDeleteRunDialogOpen(false);
    setRunToDelete(null);
  };

  const handleDeleteRunCancel = () => {
    setDeleteRunDialogOpen(false);
    setRunToDelete(null);
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
          <Text size="sm" c="dimmed">
            {projectError.message || "Unknown error"}
          </Text>
          {projectId && (
            <Text size="xs" c="dimmed">
              ID: {projectId}
            </Text>
          )}
        </Stack>
      </Center>
    );
  }

  if (!project) {
    return (
      <Center h={400}>
        <Stack align="center" gap="sm">
          <Text c="dimmed">Project not found</Text>
          {projectId && (
            <Text size="sm" c="dimmed">
              ID: {projectId}
            </Text>
          )}
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Group justify="space-between" align="center">
          <Group gap="sm" align="center">
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => navigate("/benchmarking/projects")}
              data-testid="back-to-projects-btn"
            >
              Back
            </Button>
            <Title order={2} data-testid="project-name-title">
              {project.name}
            </Title>
          </Group>
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setDeleteProjectDialogOpen(true)}
            data-testid="delete-project-btn"
          >
            Delete Project
          </Button>
        </Group>
        {project.description && (
          <Text c="dimmed" size="sm" data-testid="project-description">
            {project.description}
          </Text>
        )}
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
                  <Table.Th>Actions</Table.Th>
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
                      {def.datasetVersion.datasetName}{" "}
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
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() =>
                          handleDeleteDefinitionClick(def.id, def.name)
                        }
                        loading={isDeletingDefinition}
                        data-testid={`delete-definition-btn-${def.id}`}
                      >
                        Delete
                      </Button>
                    </Table.Td>
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
                  <Table.Th>Actions</Table.Th>
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
                      {run.tags &&
                      typeof run.tags === "object" &&
                      "version" in run.tags
                        ? String((run.tags as Record<string, unknown>).version)
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
                        : formatDurationMs(run.durationMs)}
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
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      {(run.status === "completed" ||
                        run.status === "failed" ||
                        run.status === "cancelled") && (
                        <Button
                          size="xs"
                          variant="subtle"
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() =>
                            handleDeleteRunClick(
                              run.id,
                              run.tags &&
                                typeof run.tags === "object" &&
                                "version" in run.tags
                                ? String(run.tags.version)
                                : run.id.substring(0, 8),
                            )
                          }
                          loading={isDeletingRun}
                          data-testid={`delete-run-btn-${run.id}`}
                        >
                          Delete
                        </Button>
                      )}
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

      <CreateDefinitionDialog
        opened={editDialogOpened}
        onClose={() => {
          setEditDialogOpened(false);
          setEditInitialValues(undefined);
        }}
        onCreate={handleUpdateDefinition}
        isCreating={isUpdating}
        mode="edit"
        initialValues={editInitialValues}
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
          <DefinitionDetailView
            definition={definition}
            onEdit={handleEditDefinition}
          />
        ) : (
          <Text c="dimmed">Definition not found</Text>
        )}
      </Modal>

      <Modal
        opened={deleteDefDialogOpen}
        onClose={handleDeleteDefinitionCancel}
        title="Delete Benchmark Definition"
        centered
        data-testid="delete-definition-confirm-dialog"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete definition &quot;{defToDelete?.name}
            &quot;? All associated completed runs will also be deleted. This
            action cannot be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              onClick={handleDeleteDefinitionCancel}
              data-testid="delete-def-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteDefinitionConfirm}
              loading={isDeletingDefinition}
              data-testid="delete-def-confirm-btn"
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteRunDialogOpen}
        onClose={handleDeleteRunCancel}
        title="Delete Benchmark Run"
        centered
        data-testid="delete-run-confirm-dialog"
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete run &quot;{runToDelete?.label}
            &quot;? All associated artifacts will also be deleted. This action
            cannot be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              onClick={handleDeleteRunCancel}
              data-testid="delete-run-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteRunConfirm}
              loading={isDeletingRun}
              data-testid="delete-run-confirm-btn"
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteProjectDialogOpen}
        onClose={() => setDeleteProjectDialogOpen(false)}
        title="Delete Benchmark Project"
        centered
        data-testid="delete-project-confirm-dialog"
      >
        <Stack gap="md">
          {deleteProjectError && (
            <Alert color="red" title="Failed to delete project">
              {deleteProjectError.message}
            </Alert>
          )}
          <Text>
            Are you sure you want to delete project &quot;{project.name}&quot;?
            All definitions and runs will be permanently deleted. This action
            cannot be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              onClick={() => setDeleteProjectDialogOpen(false)}
              data-testid="delete-project-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                deleteProject(projectId, {
                  onSuccess: () => {
                    navigate("/benchmarking/projects");
                  },
                });
              }}
              loading={isDeletingProject}
              data-testid="delete-project-confirm-btn"
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
