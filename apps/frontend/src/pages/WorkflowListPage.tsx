import { IconEdit, IconFlask, IconPlus, IconTrash } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SlugChip } from "../components/workflow/SlugChip";
import { useDeleteWorkflow, useWorkflows } from "../data/hooks/useWorkflows";
import {
  Badge,
  Button,
  DataTable,
  Group,
  IconActionButton,
  Modal,
  notifications,
  PageHeader,
  PanelCard,
  Stack,
  Switch,
  Text,
} from "../ui";

const WORKFLOWS_DESCRIPTION =
  "Create and manage custom OCR processing workflows";

export function WorkflowListPage() {
  const navigate = useNavigate();
  const [showBenchmarkCandidates, setShowBenchmarkCandidates] = useState(false);
  const {
    data: workflows,
    isLoading,
    error,
  } = useWorkflows({
    includeBenchmarkCandidates: showBenchmarkCandidates,
  });
  const deleteWorkflowMutation = useDeleteWorkflow();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleDeleteClick = (workflowId: string, workflowName: string) => {
    setWorkflowToDelete({ id: workflowId, name: workflowName });
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!workflowToDelete) return;

    try {
      await deleteWorkflowMutation.mutateAsync(workflowToDelete.id);
      notifications.show({
        title: "Success",
        message: `Workflow "${workflowToDelete.name}" deleted successfully`,
        color: "green",
      });
      setDeleteModalOpen(false);
      setWorkflowToDelete(null);
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error ? error.message : "Failed to delete workflow",
        color: "red",
      });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setWorkflowToDelete(null);
  };

  const listActions = (
    <Group gap="md" align="center" wrap="wrap">
      {workflows && workflows.length > 0 ? (
        <Switch
          checked={showBenchmarkCandidates}
          onChange={(e) => setShowBenchmarkCandidates(e.currentTarget.checked)}
          label="Show benchmark candidates"
        />
      ) : null}
      <Button
        leftSection={<IconPlus size={16} />}
        onClick={() => navigate("/workflows/create")}
      >
        Create Workflow
      </Button>
    </Group>
  );

  let main: ReactNode;
  if (isLoading) {
    main = (
      <Stack gap="lg">
        <PageHeader title="Workflows" description={WORKFLOWS_DESCRIPTION} />
        <Text c="dimmed">Loading workflows...</Text>
      </Stack>
    );
  } else if (error) {
    main = (
      <Stack gap="lg">
        <PageHeader title="Workflows" description={WORKFLOWS_DESCRIPTION} />
        <Text c="red">
          {error instanceof Error ? error.message : "Failed to load workflows"}
        </Text>
      </Stack>
    );
  } else if (!workflows || workflows.length === 0) {
    main = (
      <Stack gap="lg">
        <PageHeader
          title="Workflows"
          description={WORKFLOWS_DESCRIPTION}
          actions={listActions}
        />

        <PanelCard p="xl">
          <Stack align="center" gap="md">
            <IconFlask
              size={48}
              stroke={1.5}
              color="var(--mantine-color-gray-5)"
            />
            <Stack gap={4} align="center">
              <Text fw={500} size="lg">
                No workflows yet
              </Text>
              <Text c="dimmed" size="sm" ta="center">
                Create your first workflow to customize OCR processing steps and
                parameters
              </Text>
            </Stack>
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => navigate("/workflows/create")}
              mt="md"
            >
              Create Your First Workflow
            </Button>
          </Stack>
        </PanelCard>
      </Stack>
    );
  } else {
    main = (
      <Stack gap="lg">
        <PageHeader
          title="Workflows"
          description={WORKFLOWS_DESCRIPTION}
          actions={listActions}
        />

        <PanelCard>
          <DataTable
            striped
            highlightOnHover
            caption={`${workflows.length} workflow${workflows.length === 1 ? "" : "s"}`}
          >
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Name</DataTable.Th>
                <DataTable.Th>Slug</DataTable.Th>
                <DataTable.Th>Description</DataTable.Th>
                <DataTable.Th>Version</DataTable.Th>
                <DataTable.Th>Schema</DataTable.Th>
                <DataTable.Th>Created</DataTable.Th>
                <DataTable.Th>Updated</DataTable.Th>
                <DataTable.Th />
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              {workflows.map((workflow) => (
                <DataTable.Tr key={workflow.id}>
                  <DataTable.Td>
                    <Text fw={500}>{workflow.name}</Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <SlugChip slug={workflow.slug} />
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text c="dimmed" size="sm" lineClamp={1}>
                      {workflow.description || "—"}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge variant="light" color="blue">
                      v{workflow.version}
                    </Badge>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Badge variant="light" color="gray">
                      {workflow.config.schemaVersion}
                    </Badge>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(workflow.createdAt).toLocaleDateString()}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed">
                      {new Date(workflow.updatedAt).toLocaleDateString()}
                    </Text>
                  </DataTable.Td>
                  <DataTable.Td>
                    <Group gap="xs" wrap="nowrap">
                      <IconActionButton
                        tooltip="Edit workflow"
                        variant="light"
                        color="blue"
                        onClick={() =>
                          navigate(`/workflows/${workflow.id}/edit`)
                        }
                        icon={<IconEdit size={18} />}
                      />
                      <IconActionButton
                        tooltip="Delete workflow"
                        variant="light"
                        color="red"
                        onClick={() =>
                          handleDeleteClick(workflow.id, workflow.name)
                        }
                        loading={
                          deleteWorkflowMutation.isPending &&
                          workflowToDelete?.id === workflow.id
                        }
                        icon={<IconTrash size={18} />}
                      />
                    </Group>
                  </DataTable.Td>
                </DataTable.Tr>
              ))}
            </DataTable.Tbody>
          </DataTable>
        </PanelCard>
      </Stack>
    );
  }

  return (
    <>
      {main}
      <Modal
        opened={deleteModalOpen}
        onClose={handleDeleteCancel}
        title="Delete Workflow"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete workflow "{workflowToDelete?.name}"?
            This action cannot be undone.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button type="button" variant="subtle" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              color="red"
              onClick={handleDeleteConfirm}
              loading={deleteWorkflowMutation.isPending}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
