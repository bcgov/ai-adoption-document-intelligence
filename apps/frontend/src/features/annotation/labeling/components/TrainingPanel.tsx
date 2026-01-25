import { useState } from 'react';
import {
  Stack,
  Title,
  Text,
  Alert,
  TextInput,
  Textarea,
  Button,
  Table,
  Badge,
  Group,
  ActionIcon,
  Tooltip,
  Loader,
  Paper,
  Code,
  CopyButton,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCheck,
  IconX,
  IconCopy,
  IconPlayerStop,
} from '@tabler/icons-react';
import { useTraining } from '../hooks/useTraining';
import { TrainingStatus } from '../types/training.types';
import { notifications } from '@mantine/notifications';

interface TrainingPanelProps {
  projectId: string;
}

export function TrainingPanel({ projectId }: TrainingPanelProps) {
  const {
    validation,
    isValidating,
    jobs,
    isLoadingJobs,
    models,
    isLoadingModels,
    startTraining,
    isStarting,
    cancelJob,
    isCancelling,
  } = useTraining(projectId);

  const [modelId, setModelId] = useState('');
  const [description, setDescription] = useState('');
  const [modelIdError, setModelIdError] = useState('');

  // Validate model ID format (Azure Document Intelligence modelId)
  const validateModelId = (value: string): boolean => {
    const modelIdRegex = /^[a-zA-Z0-9][a-zA-Z0-9._~-]{1,63}$/;
    if (!value) {
      setModelIdError('Model ID is required');
      return false;
    }
    if (!modelIdRegex.test(value)) {
      setModelIdError(
        'Model ID must be 2-64 chars, start with a letter/number, and only include letters, numbers, ".", "_", "~", or "-"',
      );
      return false;
    }
    setModelIdError('');
    return true;
  };

  const handleStartTraining = async () => {
    if (!validateModelId(modelId)) {
      return;
    }

    try {
      await startTraining({ modelId, description: description || undefined });
      notifications.show({
        title: 'Training Started',
        message: `Training initiated for model: ${modelId}`,
        color: 'green',
        icon: <IconCheck />,
      });
      setModelId('');
      setDescription('');
    } catch (error: any) {
      notifications.show({
        title: 'Training Failed',
        message: error.message || 'Failed to start training',
        color: 'red',
        icon: <IconX />,
      });
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      notifications.show({
        title: 'Job Cancelled',
        message: 'Training job has been cancelled',
        color: 'blue',
      });
    } catch (error: any) {
      notifications.show({
        title: 'Cancel Failed',
        message: error.message || 'Failed to cancel job',
        color: 'red',
        icon: <IconX />,
      });
    }
  };

  const getStatusBadge = (status: TrainingStatus) => {
    const statusConfig: Record<
      TrainingStatus,
      { color: string; label: string }
    > = {
      [TrainingStatus.PENDING]: { color: 'gray', label: 'Pending' },
      [TrainingStatus.UPLOADING]: { color: 'blue', label: 'Uploading' },
      [TrainingStatus.UPLOADED]: { color: 'cyan', label: 'Uploaded' },
      [TrainingStatus.TRAINING]: { color: 'yellow', label: 'Training' },
      [TrainingStatus.SUCCEEDED]: { color: 'green', label: 'Succeeded' },
      [TrainingStatus.FAILED]: { color: 'red', label: 'Failed' },
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
                Project has {validation.labeledDocumentsCount} labeled
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
                    Labeled documents: {validation.labeledDocumentsCount} /{' '}
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
          Start New Training
        </Title>
        <Stack gap="md">
          <TextInput
            label="Model ID"
            description='Unique identifier (2-64 chars; letters, numbers, ".", "_", "~", "-")'
            placeholder="my-custom-model-v1"
            value={modelId}
            onChange={(e) => {
              setModelId(e.target.value);
              if (modelIdError) validateModelId(e.target.value);
            }}
            onBlur={() => validateModelId(modelId)}
            error={modelIdError}
            required
          />
          <Textarea
            label="Description"
            description="Optional description of your model"
            placeholder="Model for extracting invoice data..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minRows={2}
          />
          <Button
            onClick={handleStartTraining}
            disabled={
              !validation?.valid || isStarting || !modelId || !!modelIdError
            }
            loading={isStarting}
            leftSection={isStarting ? <Loader size="xs" /> : null}
          >
            {isStarting ? 'Starting Training...' : 'Start Training'}
          </Button>
        </Stack>
      </Paper>

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
                <Table.Th>Model ID</Table.Th>
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
                    <Code>{job.modelId || 'N/A'}</Code>
                  </Table.Td>
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
                      <Tooltip label={job.errorMessage || 'Training failed'}>
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

      {/* Trained Models Section */}
      <Paper p="md" withBorder>
        <Title order={4} mb="md">
          Trained Models
        </Title>
        {isLoadingModels ? (
          <Loader size="sm" />
        ) : models.length === 0 ? (
          <Text c="dimmed" size="sm">
            No trained models yet. Complete a training job to see models here.
          </Text>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Model ID</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Fields</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {models.map((model) => (
                <Table.Tr key={model.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Code>{model.modelId}</Code>
                      <CopyButton value={model.modelId}>
                        {({ copied, copy }) => (
                          <Tooltip
                            label={copied ? 'Copied!' : 'Copy model ID'}
                          >
                            <ActionIcon
                              color={copied ? 'green' : 'blue'}
                              variant="subtle"
                              onClick={copy}
                            >
                              {copied ? (
                                <IconCheck size={18} />
                              ) : (
                                <IconCopy size={18} />
                              )}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(model.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{model.fieldCount} fields</Text>
                  </Table.Td>
                  <Table.Td>
                    {model.description && (
                      <Tooltip label={model.description}>
                        <Text size="sm" c="dimmed">
                          View details
                        </Text>
                      </Tooltip>
                    )}
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
