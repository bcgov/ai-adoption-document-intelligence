import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEdit, IconFlask, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useDeleteWorkflow, useWorkflows } from "../data/hooks/useWorkflows";

interface WorkflowListPageProps {
  onEdit?: (workflowId: string) => void;
  onCreate?: () => void;
}

export function WorkflowListPage({ onEdit, onCreate }: WorkflowListPageProps) {
  const { data: workflows, isLoading, error } = useWorkflows();
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

  if (isLoading) {
    return (
      <Stack gap="lg">
        <Title order={2}>Workflows</Title>
        <Text c="dimmed">Loading workflows...</Text>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap="lg">
        <Title order={2}>Workflows</Title>
        <Text c="red">
          {error instanceof Error ? error.message : "Failed to load workflows"}
        </Text>
      </Stack>
    );
  }

  if (!workflows || workflows.length === 0) {
    return (
      <Stack gap="lg">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={2}>Workflows</Title>
            <Text c="dimmed" size="sm">
              Create and manage custom OCR processing workflows
            </Text>
          </Stack>
          {onCreate && (
            <Button leftSection={<IconPlus size={16} />} onClick={onCreate}>
              Create Workflow
            </Button>
          )}
        </Group>

        <Card shadow="sm" radius="md" p="xl" withBorder>
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
            {onCreate && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={onCreate}
                mt="md"
              >
                Create Your First Workflow
              </Button>
            )}
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Workflows</Title>
          <Text c="dimmed" size="sm">
            Create and manage custom OCR processing workflows
          </Text>
        </Stack>
        {onCreate && (
          <Button leftSection={<IconPlus size={16} />} onClick={onCreate}>
            Create Workflow
          </Button>
        )}
      </Group>

      <Card shadow="sm" radius="md" p="md" withBorder>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th>Version</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Updated</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {workflows.map((workflow) => (
              <Table.Tr key={workflow.id}>
                <Table.Td>
                  <Text fw={500}>{workflow.name}</Text>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="sm" lineClamp={1}>
                    {workflow.description || "—"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="light" color="blue">
                    v{workflow.version}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(workflow.createdAt).toLocaleDateString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {new Date(workflow.updatedAt).toLocaleDateString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {onEdit && (
                      <Tooltip label="Edit workflow">
                        <ActionIcon
                          variant="light"
                          color="blue"
                          onClick={() => onEdit(workflow.id)}
                        >
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Tooltip label="Delete workflow">
                      <ActionIcon
                        variant="light"
                        color="red"
                        onClick={() =>
                          handleDeleteClick(workflow.id, workflow.name)
                        }
                        loading={deleteWorkflowMutation.isPending}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

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
            <Button variant="subtle" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={handleDeleteConfirm}
              loading={deleteWorkflowMutation.isPending}
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
