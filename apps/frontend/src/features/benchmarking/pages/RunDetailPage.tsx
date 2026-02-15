import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconExternalLink, IconX } from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router-dom";
import { useRun, useStartRun } from "../hooks/useRuns";

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

function formatDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const durationMs = end - start;
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

export function RunDetailPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const projectId = id || "";
  const navigate = useNavigate();

  // Enable polling for non-terminal states
  const { run, isLoading, cancelRun, isCancelling } = useRun(
    projectId,
    runId || "",
    true, // Enable polling
  );

  const { startRun, isStarting } = useStartRun(
    projectId,
    run?.definitionId || "",
  );

  const handleRerun = async () => {
    if (!run) return;
    const newRun = await startRun({});
    navigate(`/benchmarking/projects/${projectId}/runs/${newRun.id}`);
  };

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!run) {
    return (
      <Center h={400}>
        <Text c="dimmed">Run not found</Text>
      </Center>
    );
  }

  const canCancel = run.status === "running" || run.status === "pending";
  const canRerun = run.status === "completed" || run.status === "failed";
  const temporalUrl = `http://localhost:8088/namespaces/default/workflows/${run.temporalWorkflowId}`;

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Group justify="space-between">
          <div>
            <Title order={2}>{run.definitionName}</Title>
            <Text c="dimmed" size="sm">
              Run ID: {run.id}
            </Text>
          </div>
          <Group>
            {canCancel && (
              <Button
                color="red"
                leftSection={<IconX size={16} />}
                onClick={() => cancelRun()}
                loading={isCancelling}
              >
                Cancel
              </Button>
            )}
            {canRerun && (
              <Button onClick={handleRerun} loading={isStarting}>
                Re-run
              </Button>
            )}
          </Group>
        </Group>
      </Stack>

      {run.error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" title="Error">
          {run.error}
        </Alert>
      )}

      <Card>
        <Stack gap="md">
          <Title order={3}>Run Information</Title>
          <Table>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={500}>Status</Table.Td>
                <Table.Td>
                  <Badge color={getStatusColor(run.status)}>{run.status}</Badge>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Started At</Table.Td>
                <Table.Td>
                  {run.startedAt
                    ? new Date(run.startedAt).toLocaleString()
                    : "-"}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Completed At</Table.Td>
                <Table.Td>
                  {run.completedAt
                    ? new Date(run.completedAt).toLocaleString()
                    : "-"}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Duration</Table.Td>
                <Table.Td>
                  {formatDuration(run.startedAt, run.completedAt)}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>MLflow Run ID</Table.Td>
                <Table.Td>
                  <Code>{run.mlflowRunId}</Code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Temporal Workflow</Table.Td>
                <Table.Td>
                  <Anchor
                    href={temporalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {run.temporalWorkflowId}{" "}
                    <IconExternalLink
                      size={14}
                      style={{ verticalAlign: "middle" }}
                    />
                  </Anchor>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Worker Git SHA</Table.Td>
                <Table.Td>
                  <Code>{run.workerGitSha}</Code>
                </Table.Td>
              </Table.Tr>
              {run.workerImageDigest && (
                <Table.Tr>
                  <Table.Td fw={500}>Worker Image Digest</Table.Td>
                  <Table.Td>
                    <Code>{run.workerImageDigest}</Code>
                  </Table.Td>
                </Table.Tr>
              )}
              <Table.Tr>
                <Table.Td fw={500}>Is Baseline</Table.Td>
                <Table.Td>
                  {run.isBaseline ? (
                    <Badge color="green">Yes</Badge>
                  ) : (
                    <Badge color="gray">No</Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      <Text c="dimmed" size="sm">
        Detailed metrics, artifacts, and MLflow deep-links will be implemented
        in US-031
      </Text>
    </Stack>
  );
}
