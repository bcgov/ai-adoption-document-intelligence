import {
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
import { IconDownload } from "@tabler/icons-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useRun } from "../hooks/useRuns";

interface ComparisonData {
  runs: Array<{
    id: string;
    definitionName: string;
    status: string;
    startedAt: string | null;
    metrics: Record<string, unknown>;
    params: Record<string, unknown>;
    tags: Record<string, unknown>;
  }>;
  metricNames: string[];
  paramNames: string[];
  tagNames: string[];
}

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

function computeDelta(current: number, baseline: number): number {
  return current - baseline;
}

function computeDeltaPercent(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

function getChangeColor(delta: number): string | undefined {
  if (delta > 0) return "green";
  if (delta < 0) return "red";
  return undefined;
}

export function RunComparisonPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = id || "";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Parse run IDs from query string
  const runIds = searchParams.get("runs")?.split(",") || [];

  // Fetch all runs
  const runQueries = runIds.map((runId) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useRun(projectId, runId, false),
  );

  const isLoading = runQueries.some((q) => q.isLoading);
  const runs = runQueries.map((q) => q.run).filter((r) => r !== undefined);

  // Prepare comparison data
  const comparisonData: ComparisonData = {
    runs: runs.map((run) => ({
      id: run.id,
      definitionName: run.definitionName,
      status: run.status,
      startedAt: run.startedAt,
      metrics: run.metrics || {},
      params: run.params || {},
      tags: run.tags || {},
    })),
    metricNames: Array.from(
      new Set(runs.flatMap((r) => Object.keys(r.metrics || {}))),
    ).sort(),
    paramNames: Array.from(
      new Set(runs.flatMap((r) => Object.keys(r.params || {}))),
    ).sort(),
    tagNames: Array.from(
      new Set(runs.flatMap((r) => Object.keys(r.tags || {}))),
    ).sort(),
  };

  const handleExportCSV = () => {
    const rows: string[][] = [];

    // Header
    const header = [
      "Metric",
      ...comparisonData.runs.map((r) => `Run ${r.id.slice(0, 8)}`),
    ];
    if (comparisonData.runs.length >= 2) {
      header.push("Delta", "Delta %");
    }
    rows.push(header);

    // Metrics
    for (const metricName of comparisonData.metricNames) {
      const row = [metricName];
      const values = comparisonData.runs.map(
        (r) => r.metrics[metricName] as number,
      );
      row.push(...values.map((v) => (v !== undefined ? v.toFixed(4) : "-")));

      if (
        values.length >= 2 &&
        values[0] !== undefined &&
        values[1] !== undefined
      ) {
        const delta = computeDelta(values[1], values[0]);
        const deltaPercent = computeDeltaPercent(values[1], values[0]);
        row.push(delta.toFixed(4), deltaPercent.toFixed(2));
      }

      rows.push(row);
    }

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `benchmark-comparison-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(comparisonData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `benchmark-comparison-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (runIds.length === 0) {
    return (
      <Center h={400}>
        <Stack align="center" gap="xs">
          <Text c="dimmed">No runs selected for comparison</Text>
          <Button
            onClick={() => navigate(`/benchmarking/projects/${projectId}`)}
          >
            Back to Project
          </Button>
        </Stack>
      </Center>
    );
  }

  if (isLoading) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (runs.length === 0) {
    return (
      <Center h={400}>
        <Stack align="center" gap="xs">
          <Text c="dimmed">No runs found</Text>
          <Button
            onClick={() => navigate(`/benchmarking/projects/${projectId}`)}
          >
            Back to Project
          </Button>
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Run Comparison</Title>
          <Text c="dimmed" size="sm">
            Comparing {runs.length} run{runs.length !== 1 ? "s" : ""}
          </Text>
        </div>
        <Group>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportJSON}
          >
            Export JSON
          </Button>
          <Button
            onClick={() => navigate(`/benchmarking/projects/${projectId}`)}
          >
            Back to Project
          </Button>
        </Group>
      </Group>

      <Card>
        <Stack gap="md">
          <Title order={3}>Run Information</Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Property</Table.Th>
                {comparisonData.runs.map((run) => (
                  <Table.Th key={run.id}>Run {run.id.slice(0, 8)}...</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={500}>Status</Table.Td>
                {comparisonData.runs.map((run) => (
                  <Table.Td key={run.id}>
                    <Badge color={getStatusColor(run.status)}>
                      {run.status}
                    </Badge>
                  </Table.Td>
                ))}
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Definition</Table.Td>
                {comparisonData.runs.map((run) => (
                  <Table.Td key={run.id}>{run.definitionName}</Table.Td>
                ))}
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Started At</Table.Td>
                {comparisonData.runs.map((run) => (
                  <Table.Td key={run.id}>
                    {run.startedAt
                      ? new Date(run.startedAt).toLocaleString()
                      : "-"}
                  </Table.Td>
                ))}
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      {comparisonData.metricNames.length > 0 && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Metrics Comparison</Title>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Metric Name</Table.Th>
                  {comparisonData.runs.map((run, idx) => (
                    <Table.Th key={run.id}>
                      {idx === 0 ? "Baseline" : `Run ${idx + 1}`}
                    </Table.Th>
                  ))}
                  {comparisonData.runs.length >= 2 && (
                    <>
                      <Table.Th>Delta</Table.Th>
                      <Table.Th>Delta %</Table.Th>
                    </>
                  )}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {comparisonData.metricNames.map((metricName) => {
                  const baselineValue = comparisonData.runs[0].metrics[
                    metricName
                  ] as number | undefined;
                  const compareValue =
                    comparisonData.runs.length >= 2
                      ? (comparisonData.runs[1].metrics[metricName] as
                          | number
                          | undefined)
                      : undefined;

                  const delta =
                    baselineValue !== undefined && compareValue !== undefined
                      ? computeDelta(compareValue, baselineValue)
                      : null;
                  const deltaPercent =
                    baselineValue !== undefined && compareValue !== undefined
                      ? computeDeltaPercent(compareValue, baselineValue)
                      : null;

                  return (
                    <Table.Tr key={metricName}>
                      <Table.Td fw={500}>{metricName}</Table.Td>
                      {comparisonData.runs.map((run) => {
                        const value = run.metrics[metricName] as
                          | number
                          | undefined;
                        return (
                          <Table.Td key={run.id}>
                            <Code>
                              {value !== undefined ? value.toFixed(4) : "-"}
                            </Code>
                          </Table.Td>
                        );
                      })}
                      {comparisonData.runs.length >= 2 && (
                        <>
                          <Table.Td>
                            {delta !== null ? (
                              <Code c={getChangeColor(delta)}>
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(4)}
                              </Code>
                            ) : (
                              "-"
                            )}
                          </Table.Td>
                          <Table.Td>
                            {deltaPercent !== null ? (
                              <Code c={getChangeColor(deltaPercent)}>
                                {deltaPercent > 0 ? "+" : ""}
                                {deltaPercent.toFixed(2)}%
                              </Code>
                            ) : (
                              "-"
                            )}
                          </Table.Td>
                        </>
                      )}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}

      {comparisonData.paramNames.length > 0 && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Parameters Comparison</Title>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Parameter</Table.Th>
                  {comparisonData.runs.map((run) => (
                    <Table.Th key={run.id}>
                      Run {run.id.slice(0, 8)}...
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {comparisonData.paramNames.map((paramName) => {
                  const values = comparisonData.runs.map(
                    (r) => r.params[paramName],
                  );
                  const hasChanges =
                    new Set(values.map((v) => JSON.stringify(v))).size > 1;

                  return (
                    <Table.Tr key={paramName}>
                      <Table.Td fw={500}>
                        {paramName}
                        {hasChanges && (
                          <Badge size="xs" ml={8} color="orange">
                            Changed
                          </Badge>
                        )}
                      </Table.Td>
                      {comparisonData.runs.map((run) => {
                        const value = run.params[paramName];
                        return (
                          <Table.Td key={run.id}>
                            <Code>{JSON.stringify(value)}</Code>
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}

      {comparisonData.tagNames.length > 0 && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Tags Comparison</Title>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tag</Table.Th>
                  {comparisonData.runs.map((run) => (
                    <Table.Th key={run.id}>
                      Run {run.id.slice(0, 8)}...
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {comparisonData.tagNames.map((tagName) => {
                  const values = comparisonData.runs.map(
                    (r) => r.tags[tagName],
                  );
                  const hasChanges =
                    new Set(values.map((v) => JSON.stringify(v))).size > 1;

                  return (
                    <Table.Tr key={tagName}>
                      <Table.Td fw={500}>
                        {tagName}
                        {hasChanges && (
                          <Badge size="xs" ml={8} color="orange">
                            Changed
                          </Badge>
                        )}
                      </Table.Td>
                      {comparisonData.runs.map((run) => {
                        const value = run.tags[tagName];
                        return (
                          <Table.Td key={run.id}>
                            <Code>{JSON.stringify(value)}</Code>
                          </Table.Td>
                        );
                      })}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
