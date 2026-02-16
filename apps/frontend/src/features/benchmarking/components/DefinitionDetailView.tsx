import {
  Badge,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Table,
  Title,
} from "@mantine/core";
import { IconPlayerPlay } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useStartRun } from "../hooks/useRuns";
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

interface DefinitionDetails {
  id: string;
  projectId: string;
  name: string;
  datasetVersion: DatasetVersionInfo;
  split: SplitInfo;
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
              <Table.Tr>
                <Table.Td fw={500}>Split</Table.Td>
                <Table.Td>
                  {definition.split.name} ({definition.split.type})
                </Table.Td>
              </Table.Tr>
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
