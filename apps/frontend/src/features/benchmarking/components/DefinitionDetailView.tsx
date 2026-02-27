import {
  Badge,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { IconPlayerPlay, IconHistory } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useStartRun } from "../hooks/useRuns";
import { useBaselineHistory } from "../hooks/useDefinitions";
import { ScheduleConfig } from "./ScheduleConfig";

interface DatasetVersionInfo {
  id: string;
  datasetName: string;
  version: string;
}

interface WorkflowInfo {
  id: string;
  name: string;
  version: number;
}

interface SplitInfo {
  id: string;
  name: string;
  type: string;
}

interface RunHistorySummary {
  id: string;
  status: string;
  mlflowRunId: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface MetricThreshold {
  metricName: string;
  type: "absolute" | "relative";
  value: number;
}

interface BaselineRunSummary {
  id: string;
  status: string;
  mlflowRunId: string;
  metrics: Record<string, number>;
  baselineThresholds: MetricThreshold[];
  completedAt: string | null;
}

interface DefinitionDetails {
  id: string;
  projectId: string;
  name: string;
  datasetVersion: DatasetVersionInfo;
  split?: SplitInfo;
  workflow: WorkflowInfo;
  workflowConfigHash: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  artifactPolicy: Record<string, unknown>;
  immutable: boolean;
  revision: number;
  scheduleEnabled: boolean;
  scheduleCron?: string;
  scheduleId?: string;
  runHistory: RunHistorySummary[];
  baselineRun?: BaselineRunSummary;
  createdAt: string;
  updatedAt: string;
}

interface DefinitionDetailViewProps {
  definition: DefinitionDetails;
}

export function DefinitionDetailView({
  definition,
}: DefinitionDetailViewProps) {
  const navigate = useNavigate();
  const { startRun, isStarting } = useStartRun(
    definition.projectId,
    definition.id,
  );

  const { history: baselineHistory, isLoading: isLoadingHistory } =
    useBaselineHistory(definition.projectId, definition.id);

  const handleStartRun = async () => {
    const run = await startRun({});
    navigate(`/benchmarking/projects/${definition.projectId}/runs/${run.id}`);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return "green";
      case "running":
        return "blue";
      case "failed":
        return "red";
      case "cancelled":
        return "gray";
      default:
        return "yellow";
    }
  };

  return (
    <Stack gap="lg">
      <Card>
        <Stack gap="md">
          <Group justify="space-between">
            <Title order={3} data-testid="definition-name-title">
              {definition.name}
            </Title>
            <Group gap="xs">
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                onClick={handleStartRun}
                loading={isStarting}
                data-testid="start-run-btn"
              >
                Start Run
              </Button>
              {definition.immutable && (
                <Badge color="gray" data-testid="immutable-badge">
                  Immutable
                </Badge>
              )}
              <Badge data-testid="revision-badge">
                Revision {definition.revision}
              </Badge>
            </Group>
          </Group>

          <Table data-testid="definition-info-table">
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={500}>Dataset Version</Table.Td>
                <Table.Td>
                  {definition.datasetVersion.datasetName} v
                  {definition.datasetVersion.version}
                </Table.Td>
              </Table.Tr>
              {definition.split && (
                <Table.Tr>
                  <Table.Td fw={500}>Split</Table.Td>
                  <Table.Td>
                    {definition.split.name} ({definition.split.type})
                  </Table.Td>
                </Table.Tr>
              )}
              <Table.Tr>
                <Table.Td fw={500}>Workflow</Table.Td>
                <Table.Td>
                  {definition.workflow.name} v{definition.workflow.version}
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Workflow Config Hash</Table.Td>
                <Table.Td>
                  <Code>{definition.workflowConfigHash.substring(0, 12)}</Code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Evaluator Type</Table.Td>
                <Table.Td>{definition.evaluatorType}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      {definition.baselineRun && (
        <Card data-testid="baseline-info-card">
          <Stack gap="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Title order={4} data-testid="baseline-info-heading">
                  Current Baseline
                </Title>
                <Button
                  variant="light"
                  size="sm"
                  onClick={() =>
                    navigate(
                      `/benchmarking/projects/${definition.projectId}/runs/${definition.baselineRun!.id}`,
                    )
                  }
                  data-testid="view-baseline-run-btn"
                >
                  View Baseline Run
                </Button>
              </Group>
              <Text size="sm" c="dimmed" data-testid="baseline-promoted-info">
                Promoted on{" "}
                {definition.baselineRun.completedAt
                  ? new Date(definition.baselineRun.completedAt).toLocaleString()
                  : "unknown date"}
                . For complete baseline change history, check audit logs for <Code>baseline_promoted</Code> events.
              </Text>
            </Stack>

            <Table data-testid="baseline-info-table">
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td fw={500}>Run ID</Table.Td>
                  <Table.Td>
                    <Code data-testid="baseline-run-id">
                      {definition.baselineRun.id.substring(0, 12)}...
                    </Code>
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td fw={500}>Status</Table.Td>
                  <Table.Td>
                    <Badge
                      color={getStatusBadgeColor(definition.baselineRun.status)}
                      data-testid="baseline-status-badge"
                    >
                      {definition.baselineRun.status}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Td fw={500}>Completed At</Table.Td>
                  <Table.Td data-testid="baseline-completed-at">
                    {definition.baselineRun.completedAt
                      ? new Date(definition.baselineRun.completedAt).toLocaleString()
                      : "—"}
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>

            <Stack gap="xs">
              <Title order={5} data-testid="baseline-metrics-heading">
                Key Metrics
              </Title>
              <Table striped data-testid="baseline-metrics-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Metric</Table.Th>
                    <Table.Th>Value</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {Object.entries(definition.baselineRun.metrics).map(([key, value]) => {
                    // Skip non-numeric metrics (like perSampleResults, fieldErrorBreakdown, etc.)
                    if (typeof value !== 'number') return null;

                    return (
                      <Table.Tr key={key}>
                        <Table.Td>{key}</Table.Td>
                        <Table.Td>
                          <Code>{value.toFixed(4)}</Code>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Stack>

            <Stack gap="xs">
              <Title order={5} data-testid="baseline-thresholds-heading">
                Regression Thresholds
              </Title>
              <Table striped data-testid="baseline-thresholds-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Metric</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Threshold</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {definition.baselineRun.baselineThresholds.map((threshold) => (
                    <Table.Tr key={threshold.metricName}>
                      <Table.Td>{threshold.metricName}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" data-testid={`threshold-type-${threshold.metricName}`}>
                          {threshold.type === "relative" ? "Relative (%)" : "Absolute"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Code data-testid={`threshold-value-${threshold.metricName}`}>
                          {threshold.type === "relative"
                            ? `${(threshold.value * 100).toFixed(0)}%`
                            : threshold.value.toFixed(4)}
                        </Code>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Stack>

            <Stack gap="xs">
              <Group gap="xs">
                <IconHistory size={16} />
                <Title order={5} data-testid="baseline-history-heading">
                  Baseline Change History
                </Title>
              </Group>
              {isLoadingHistory ? (
                <Loader size="sm" />
              ) : baselineHistory.length === 0 ? (
                <Text size="sm" c="dimmed" data-testid="no-baseline-history">
                  No baseline changes recorded yet.
                </Text>
              ) : (
                <Table striped data-testid="baseline-history-table">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Promoted At</Table.Th>
                      <Table.Th>Run ID</Table.Th>
                      <Table.Th>User</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {baselineHistory.map((entry, index) => (
                      <Table.Tr key={index} data-testid={`baseline-history-row-${index}`}>
                        <Table.Td data-testid={`baseline-history-date-${index}`}>
                          {new Date(entry.promotedAt).toLocaleString()}
                        </Table.Td>
                        <Table.Td>
                          <Button
                            variant="subtle"
                            size="compact-sm"
                            onClick={() =>
                              navigate(
                                `/benchmarking/projects/${definition.projectId}/runs/${entry.runId}`,
                              )
                            }
                            data-testid={`baseline-history-run-link-${index}`}
                          >
                            <Code>{entry.runId.substring(0, 12)}...</Code>
                          </Button>
                        </Table.Td>
                        <Table.Td data-testid={`baseline-history-user-${index}`}>
                          {entry.userId}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Stack>
        </Card>
      )}

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="evaluator-config-heading">
            Evaluator Configuration
          </Title>
          <Code block data-testid="evaluator-config-json">
            {JSON.stringify(definition.evaluatorConfig, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="runtime-settings-heading">
            Runtime Settings
          </Title>
          <Code block data-testid="runtime-settings-json">
            {JSON.stringify(definition.runtimeSettings, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="artifact-policy-heading">
            Artifact Policy
          </Title>
          <Code block data-testid="artifact-policy-json">
            {JSON.stringify(definition.artifactPolicy, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="schedule-config-heading">
            Schedule Configuration
          </Title>
          <ScheduleConfig
            projectId={definition.projectId}
            definitionId={definition.id}
            initialEnabled={definition.scheduleEnabled}
            initialCron={definition.scheduleCron}
          />
        </Stack>
      </Card>

      {definition.runHistory.length > 0 && (
        <Card>
          <Stack gap="md">
            <Title order={4} data-testid="run-history-heading">
              Run History
            </Title>
            <Table striped highlightOnHover data-testid="run-history-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>MLflow Run ID</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Started</Table.Th>
                  <Table.Th>Completed</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {definition.runHistory.map((run) => (
                  <Table.Tr key={run.id} data-testid={`run-history-row-${run.id}`}>
                    <Table.Td>
                      <Code>{run.mlflowRunId.substring(0, 8)}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={getStatusBadgeColor(run.status)}
                        data-testid={`run-status-badge-${run.id}`}
                      >
                        {run.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleString()
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
