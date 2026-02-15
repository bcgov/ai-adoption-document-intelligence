import { Badge, Card, Code, Group, Stack, Table, Title } from "@mantine/core";

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
            <Title order={3}>{definition.name}</Title>
            <Group gap="xs">
              {definition.immutable && <Badge color="gray">Immutable</Badge>}
              <Badge>Revision {definition.revision}</Badge>
            </Group>
          </Group>

          <Table>
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
          <Title order={4}>Evaluator Configuration</Title>
          <Code block>
            {JSON.stringify(definition.evaluatorConfig, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4}>Runtime Settings</Title>
          <Code block>
            {JSON.stringify(definition.runtimeSettings, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4}>Artifact Policy</Title>
          <Code block>
            {JSON.stringify(definition.artifactPolicy, null, 2)}
          </Code>
        </Stack>
      </Card>

      {definition.runHistory.length > 0 && (
        <Card>
          <Stack gap="md">
            <Title order={4}>Run History</Title>
            <Table striped highlightOnHover>
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
                  <Table.Tr key={run.id}>
                    <Table.Td>
                      <Code>{run.mlflowRunId.substring(0, 8)}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={getStatusBadgeColor(run.status)}>
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
