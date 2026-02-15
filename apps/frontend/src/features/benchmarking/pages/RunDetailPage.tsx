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
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconAlertCircle, IconExternalLink, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useProject } from "../hooks/useProjects";
import {
  useArtifacts,
  useDrillDown,
  useRun,
  useStartRun,
} from "../hooks/useRuns";

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
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<string | null>(
    null,
  );

  // Enable polling for non-terminal states
  const { run, isLoading, cancelRun, isCancelling } = useRun(
    projectId,
    runId || "",
    true, // Enable polling
  );

  const { project } = useProject(projectId);
  const { drillDown } = useDrillDown(projectId, runId || "");
  const { artifacts, total: totalArtifacts } = useArtifacts(
    projectId,
    runId || "",
    artifactTypeFilter || undefined,
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
  const mlflowUrl = project?.mlflowExperimentId
    ? `http://localhost:5000/#/experiments/${project.mlflowExperimentId}/runs/${run.mlflowRunId}`
    : null;

  // Get unique artifact types for filter dropdown
  const artifactTypes = Array.from(
    new Set(artifacts.map((a) => a.type)),
  ).sort();

  const formatBytes = (bytes: string): string => {
    const num = Number.parseInt(bytes, 10);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

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
                <Table.Td fw={500}>MLflow Run</Table.Td>
                <Table.Td>
                  {mlflowUrl ? (
                    <Anchor
                      href={mlflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {run.mlflowRunId}{" "}
                      <IconExternalLink
                        size={14}
                        style={{ verticalAlign: "middle" }}
                      />
                    </Anchor>
                  ) : (
                    <Code>{run.mlflowRunId}</Code>
                  )}
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

      {run.status === "completed" && run.metrics && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Aggregated Metrics</Title>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Metric Name</Table.Th>
                  <Table.Th>Value</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Object.entries(run.metrics).map(([key, value]) => (
                  <Table.Tr key={key}>
                    <Table.Td>{key}</Table.Td>
                    <Table.Td>
                      <Code>
                        {typeof value === "number"
                          ? value.toFixed(4)
                          : JSON.stringify(value)}
                      </Code>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}

      {run.status === "completed" && (run.params || run.tags) && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Run Parameters & Tags</Title>
            {run.params && Object.keys(run.params).length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Parameters</Text>
                <Table striped>
                  <Table.Tbody>
                    {Object.entries(run.params).map(([key, value]) => (
                      <Table.Tr key={key}>
                        <Table.Td fw={500}>{key}</Table.Td>
                        <Table.Td>
                          <Code>{JSON.stringify(value)}</Code>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}
            {run.tags && Object.keys(run.tags).length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Tags</Text>
                <Table striped>
                  <Table.Tbody>
                    {Object.entries(run.tags).map(([key, value]) => (
                      <Table.Tr key={key}>
                        <Table.Td fw={500}>{key}</Table.Td>
                        <Table.Td>
                          <Code>{JSON.stringify(value)}</Code>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      {run.status === "completed" && artifacts.length > 0 && (
        <Card>
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={3}>
                Artifacts ({totalArtifacts} total
                {artifactTypeFilter
                  ? `, filtered by ${artifactTypeFilter}`
                  : ""}
                )
              </Title>
              <Select
                placeholder="Filter by type"
                data={[
                  { value: "", label: "All types" },
                  ...artifactTypes.map((type) => ({
                    value: type,
                    label: type,
                  })),
                ]}
                value={artifactTypeFilter || ""}
                onChange={(value) => setArtifactTypeFilter(value || null)}
                clearable
                style={{ width: 200 }}
              />
            </Group>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Sample ID</Table.Th>
                  <Table.Th>Node ID</Table.Th>
                  <Table.Th>Size</Table.Th>
                  <Table.Th>MIME Type</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {artifacts.map((artifact) => (
                  <Table.Tr key={artifact.id}>
                    <Table.Td>
                      <Badge>{artifact.type}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Code>{artifact.sampleId || "-"}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Code>{artifact.nodeId || "-"}</Code>
                    </Table.Td>
                    <Table.Td>{formatBytes(artifact.sizeBytes)}</Table.Td>
                    <Table.Td>
                      <Code>{artifact.mimeType}</Code>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}

      {run.status === "completed" && drillDown && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Drill-Down Summary</Title>

            {drillDown.worstSamples.length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>
                  Top {drillDown.worstSamples.length} Worst-Performing Samples
                </Text>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Sample ID</Table.Th>
                      <Table.Th>Metric</Table.Th>
                      <Table.Th>Value</Table.Th>
                      <Table.Th>Metadata</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {drillDown.worstSamples.map((sample) => (
                      <Table.Tr key={sample.sampleId}>
                        <Table.Td>
                          <Code>{sample.sampleId}</Code>
                        </Table.Td>
                        <Table.Td>{sample.metricName}</Table.Td>
                        <Table.Td>
                          <Code>{sample.metricValue.toFixed(4)}</Code>
                        </Table.Td>
                        <Table.Td>
                          {sample.metadata ? (
                            <Code>{JSON.stringify(sample.metadata)}</Code>
                          ) : (
                            "-"
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}

            {drillDown.fieldErrorBreakdown &&
              drillDown.fieldErrorBreakdown.length > 0 && (
                <Stack gap="xs">
                  <Text fw={500}>Per-Field Error Breakdown</Text>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Field Name</Table.Th>
                        <Table.Th>Error Count</Table.Th>
                        <Table.Th>Error Rate</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {drillDown.fieldErrorBreakdown.map((field) => (
                        <Table.Tr key={field.fieldName}>
                          <Table.Td>
                            <Code>{field.fieldName}</Code>
                          </Table.Td>
                          <Table.Td>{field.errorCount}</Table.Td>
                          <Table.Td>
                            <Code>{(field.errorRate * 100).toFixed(2)}%</Code>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Stack>
              )}

            {Object.keys(drillDown.errorClusters).length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Error Cluster Tags</Text>
                <Table striped>
                  <Table.Tbody>
                    {Object.entries(drillDown.errorClusters).map(
                      ([tag, count]) => (
                        <Table.Tr key={tag}>
                          <Table.Td fw={500}>{tag}</Table.Td>
                          <Table.Td>
                            <Badge>{count}</Badge>
                          </Table.Td>
                        </Table.Tr>
                      ),
                    )}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
