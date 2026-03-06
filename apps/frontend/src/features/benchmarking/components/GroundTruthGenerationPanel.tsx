import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Progress,
  Select,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { IconAlertCircle, IconEye, IconPlayerPlay } from "@tabler/icons-react";
import { FC, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type GroundTruthJobStatus,
  useGroundTruthGeneration,
} from "../hooks/useGroundTruthGeneration";
import { useWorkflows } from "../hooks/useWorkflows";

interface GroundTruthGenerationPanelProps {
  datasetId: string;
  versionId: string;
}

const statusColors: Record<GroundTruthJobStatus, string> = {
  pending: "gray",
  processing: "blue",
  awaiting_review: "orange",
  completed: "green",
  failed: "red",
};

const statusLabels: Record<GroundTruthJobStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  awaiting_review: "Awaiting Review",
  completed: "Completed",
  failed: "Failed",
};

export const GroundTruthGenerationPanel: FC<
  GroundTruthGenerationPanelProps
> = ({ datasetId, versionId }) => {
  const navigate = useNavigate();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  );

  const { workflows, isLoading: isLoadingWorkflows } = useWorkflows();
  const {
    jobs,
    total,
    isLoading,
    hasActiveJobs,
    startGeneration,
    isStarting,
    startError,
  } = useGroundTruthGeneration(datasetId, versionId);

  const completedCount = jobs.filter((j) => j.status === "completed").length;
  const failedCount = jobs.filter((j) => j.status === "failed").length;
  const awaitingCount = jobs.filter(
    (j) => j.status === "awaiting_review",
  ).length;
  const progressPercent = total > 0 ? (completedCount / total) * 100 : 0;

  const handleStartGeneration = async () => {
    if (!selectedWorkflowId) return;
    try {
      await startGeneration(selectedWorkflowId);
    } catch {
      // Error handled by mutation state
    }
  };

  const workflowOptions = workflows.map((w) => ({
    value: w.id,
    label: `${w.name} (v${w.version})`,
  }));

  if (isLoading) {
    return (
      <Center h={200}>
        <Loader />
      </Center>
    );
  }

  return (
    <Stack gap="md">
      <Card withBorder>
        <Stack gap="sm">
          <Text fw={600}>Generate Ground Truth</Text>
          <Text size="sm" c="dimmed">
            Run samples without ground truth through an OCR workflow, then
            review the results to generate ground truth data.
          </Text>

          <Group align="end">
            <Select
              label="Workflow Template"
              placeholder="Select a workflow"
              data={workflowOptions}
              value={selectedWorkflowId}
              onChange={setSelectedWorkflowId}
              disabled={isLoadingWorkflows || isStarting}
              style={{ flex: 1 }}
              searchable
            />
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={handleStartGeneration}
              loading={isStarting}
              disabled={!selectedWorkflowId || hasActiveJobs}
            >
              Start Generation
            </Button>
          </Group>

          {hasActiveJobs && (
            <Text size="xs" c="dimmed">
              Jobs are currently running. Wait for them to complete before
              starting a new batch.
            </Text>
          )}

          {startError && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Error"
              color="red"
              variant="light"
            >
              {startError instanceof Error
                ? startError.message
                : "Failed to start generation"}
            </Alert>
          )}
        </Stack>
      </Card>

      {total > 0 && (
        <>
          <Card withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={600}>Progress</Text>
                <Group gap="xs">
                  <Badge color="green" variant="light" size="sm">
                    {completedCount} completed
                  </Badge>
                  <Badge color="orange" variant="light" size="sm">
                    {awaitingCount} awaiting review
                  </Badge>
                  {failedCount > 0 && (
                    <Badge color="red" variant="light" size="sm">
                      {failedCount} failed
                    </Badge>
                  )}
                </Group>
              </Group>
              <Progress value={progressPercent} size="lg" color="green" />
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  {completedCount} of {total} samples completed
                </Text>
                {awaitingCount > 0 && (
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconEye size={14} />}
                    onClick={() =>
                      navigate(
                        `/benchmarking/datasets/${datasetId}/versions/${versionId}/review`,
                      )
                    }
                  >
                    Open Review Queue ({awaitingCount})
                  </Button>
                )}
              </Group>
            </Stack>
          </Card>

          <Card withBorder padding={0}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sample ID</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {jobs.map((job) => (
                  <Table.Tr key={job.id}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {job.sampleId}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        variant="light"
                        color={statusColors[job.status]}
                        size="sm"
                      >
                        {statusLabels[job.status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" c="dimmed">
                        {new Date(job.createdAt).toLocaleDateString()}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {job.error && (
                        <Text size="xs" c="red" lineClamp={1}>
                          {job.error}
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </>
      )}

      {total === 0 && (
        <Card withBorder p="xl">
          <Center>
            <Stack align="center" gap="md">
              <Text fw={600}>No ground truth generation jobs</Text>
              <Text size="sm" c="dimmed">
                Select a workflow template and click &quot;Start
                Generation&quot; to begin generating ground truth for samples
                without it.
              </Text>
            </Stack>
          </Center>
        </Card>
      )}
    </Stack>
  );
};
