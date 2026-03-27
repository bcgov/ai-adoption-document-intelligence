import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Loader,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconCheck,
  IconCopy,
  IconPlayerStop,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useTraining } from "../hooks/useTraining";
import { TrainingStatus } from "../types/training.types";

interface TrainingPanelProps {
  templateModelId: string;
  templateModelModelId?: string;
}

export function TrainingPanel({
  templateModelId,
  templateModelModelId,
}: TrainingPanelProps) {
  const {
    validation,
    isValidating,
    jobs,
    isLoadingJobs,
    startTraining,
    isStarting,
    cancelJob,
    isCancelling,
  } = useTraining(templateModelId);

  const [description, setDescription] = useState("");

  const handleStartTraining = async () => {
    try {
      await startTraining({ description: description || undefined });
      notifications.show({
        title: "Training Started",
        message: "Training has been initiated.",
        color: "green",
        icon: <IconCheck />,
      });
      setDescription("");
    } catch (error: unknown) {
      notifications.show({
        title: "Training Failed",
        message:
          error instanceof Error ? error.message : "Failed to start training",
        color: "red",
        icon: <IconX />,
      });
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      notifications.show({
        title: "Job Cancelled",
        message: "Training job has been cancelled",
        color: "blue",
      });
    } catch (error: unknown) {
      notifications.show({
        title: "Cancel Failed",
        message:
          error instanceof Error ? error.message : "Failed to cancel job",
        color: "red",
        icon: <IconX />,
      });
    }
  };

  const getStatusBadge = (status: TrainingStatus) => {
    const statusConfig: Record<
      TrainingStatus,
      { color: string; label: string }
    > = {
      [TrainingStatus.PENDING]: { color: "gray", label: "Pending" },
      [TrainingStatus.UPLOADING]: { color: "blue", label: "Uploading" },
      [TrainingStatus.UPLOADED]: { color: "cyan", label: "Uploaded" },
      [TrainingStatus.TRAINING]: { color: "yellow", label: "Training" },
      [TrainingStatus.SUCCEEDED]: { color: "green", label: "Succeeded" },
      [TrainingStatus.FAILED]: { color: "red", label: "Failed" },
    };

    const config = statusConfig[status];
    return (
      <Badge color={config.color} variant="filled">
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getDuration = (startedAt: string, completedAt?: string) => {
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const latestSucceededJob = jobs.find(
    (job) => job.status === TrainingStatus.SUCCEEDED,
  );

  return (
    <Stack gap="xl">
      {/* Validation Section */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">
          Training Readiness
        </Title>
        {isValidating ? (
          <Loader size="sm" />
        ) : validation ? (
          <>
            {validation.valid ? (
              <Alert
                color="green"
                title="Ready for Training"
                icon={<IconCheck />}
              >
                Template model has {validation.labeledDocumentsCount} labeled
                documents (minimum required: {validation.minimumRequired})
              </Alert>
            ) : (
              <Alert
                color="red"
                title="Not Ready for Training"
                icon={<IconAlertCircle />}
              >
                <Stack gap="xs">
                  <Text size="sm">
                    Labeled documents: {validation.labeledDocumentsCount} /{" "}
                    {validation.minimumRequired}
                  </Text>
                  <Text size="sm" fw={500}>
                    Issues:
                  </Text>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {validation.issues.map((issue, index) => (
                      <li key={index}>
                        <Text size="sm">{issue}</Text>
                      </li>
                    ))}
                  </ul>
                </Stack>
              </Alert>
            )}
          </>
        ) : null}
      </Paper>

      {/* Start Training Section */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">
          Start Training
        </Title>
        <Stack gap="md">
          {templateModelModelId && (
            <Group gap="xs">
              <Text size="sm" fw={500}>
                Azure Model ID:
              </Text>
              <Code>{templateModelModelId}</Code>
              <CopyButton value={templateModelModelId}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? "Copied!" : "Copy model ID"}>
                    <ActionIcon
                      color={copied ? "green" : "blue"}
                      variant="subtle"
                      size="sm"
                      onClick={copy}
                    >
                      {copied ? (
                        <IconCheck size={14} />
                      ) : (
                        <IconCopy size={14} />
                      )}
                    </ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          )}
          <Textarea
            label="Description"
            description="Optional description for this training run"
            placeholder="Training run description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minRows={2}
          />
          <Button
            onClick={handleStartTraining}
            disabled={!validation?.valid || isStarting}
            loading={isStarting}
            leftSection={isStarting ? <Loader size="xs" /> : null}
          >
            {isStarting ? "Starting Training..." : "Train"}
          </Button>
        </Stack>
      </Paper>

      {/* Training Status */}
      {latestSucceededJob && (
        <Paper p="md" withBorder>
          <Title order={4} mb="md">
            Model Status
          </Title>
          <Alert color="green" title="Model Trained" icon={<IconCheck />}>
            <Text size="sm">
              Last successful training completed on{" "}
              {formatDate(
                latestSucceededJob.completedAt || latestSucceededJob.startedAt,
              )}
            </Text>
          </Alert>
        </Paper>
      )}

      {/* Training Jobs Section */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">
          Training Jobs
        </Title>
        {isLoadingJobs ? (
          <Loader size="sm" />
        ) : jobs.length === 0 ? (
          <Text c="dimmed" size="sm">
            No training jobs yet. Start your first training above.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Status</Table.Th>
                <Table.Th>Started</Table.Th>
                <Table.Th>Duration</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {jobs.map((job) => (
                <Table.Tr key={job.id}>
                  <Table.Td>{getStatusBadge(job.status)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(job.startedAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {getDuration(job.startedAt, job.completedAt)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {job.status === TrainingStatus.TRAINING ||
                    job.status === TrainingStatus.UPLOADING ||
                    job.status === TrainingStatus.UPLOADED ? (
                      <Tooltip label="Cancel training">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => handleCancelJob(job.id)}
                          loading={isCancelling}
                        >
                          <IconPlayerStop size={18} />
                        </ActionIcon>
                      </Tooltip>
                    ) : job.status === TrainingStatus.FAILED ? (
                      <Tooltip label={job.errorMessage || "Training failed"}>
                        <ActionIcon color="red" variant="subtle">
                          <IconAlertCircle size={18} />
                        </ActionIcon>
                      </Tooltip>
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
