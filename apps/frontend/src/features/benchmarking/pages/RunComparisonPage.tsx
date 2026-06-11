import { IconDownload } from "@tabler/icons-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  Center,
  Code,
  DataTable,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "../../../ui";
import { useMultipleRuns } from "../hooks/useRuns";
import { getStatusColor } from "../utils";

interface ComparisonData {
  runs: Array<{
    id: string;
    definitionName: string;
    status: string;
    startedAt: string | null;
    metrics: Record<string, unknown>;
    params: Record<string, unknown>;
    tags: Record<string, unknown>;
    isBaseline: boolean;
  }>;
  metricNames: string[];
  paramNames: string[];
  tagNames: string[];
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
  const { runs, isLoading } = useMultipleRuns(projectId, runIds);

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
      isBaseline: run.isBaseline,
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
      const values = comparisonData.runs.map((r) => r.metrics[metricName]);
      row.push(
        ...values.map((v) => {
          if (v === undefined || v === null) return "-";
          if (typeof v === "number") return v.toFixed(4);
          return JSON.stringify(v);
        }),
      );

      if (
        values.length >= 2 &&
        typeof values[0] === "number" &&
        typeof values[1] === "number"
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
    <Stack gap="lg" data-testid="run-comparison-page">
      <Group justify="space-between">
        <div>
          <Title order={2} data-testid="comparison-title">
            Run Comparison
          </Title>
          <Text c="dimmed" size="sm">
            Comparing {runs.length} run{runs.length !== 1 ? "s" : ""}
          </Text>
        </div>
        <Group>
          <Button
            data-testid="export-csv-btn"
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportCSV}
          >
            Export CSV
          </Button>
          <Button
            data-testid="export-json-btn"
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportJSON}
          >
            Export JSON
          </Button>
          <Button
            data-testid="back-to-project-btn"
            onClick={() => navigate(`/benchmarking/projects/${projectId}`)}
          >
            Back to Project
          </Button>
        </Group>
      </Group>

      <Card data-testid="run-info-card">
        <Stack gap="md">
          <Title order={3}>Run Information</Title>
          <DataTable data-testid="run-info-table" striped highlightOnHover>
            <DataTable.Thead>
              <DataTable.Tr>
                <DataTable.Th>Property</DataTable.Th>
                {comparisonData.runs.map((run) => (
                  <DataTable.Th key={run.id}>
                    <Group gap="xs">
                      <Text
                        component="a"
                        href={`/benchmarking/projects/${projectId}/runs/${run.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        c="blue"
                        td="underline"
                        style={{ cursor: "pointer" }}
                        data-testid={`run-header-link-${run.id}`}
                      >
                        Run {run.id.slice(0, 8)}...
                      </Text>
                      {run.isBaseline && (
                        <Badge
                          size="xs"
                          color="cyan"
                          data-testid={`baseline-badge-${run.id}`}
                        >
                          Baseline
                        </Badge>
                      )}
                    </Group>
                  </DataTable.Th>
                ))}
              </DataTable.Tr>
            </DataTable.Thead>
            <DataTable.Tbody>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Status</DataTable.Td>
                {comparisonData.runs.map((run) => (
                  <DataTable.Td key={run.id}>
                    <Badge color={getStatusColor(run.status)}>
                      {run.status}
                    </Badge>
                  </DataTable.Td>
                ))}
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Definition</DataTable.Td>
                {comparisonData.runs.map((run) => (
                  <DataTable.Td key={run.id}>{run.definitionName}</DataTable.Td>
                ))}
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Started At</DataTable.Td>
                {comparisonData.runs.map((run) => (
                  <DataTable.Td key={run.id}>
                    {run.startedAt
                      ? new Date(run.startedAt).toLocaleString()
                      : "-"}
                  </DataTable.Td>
                ))}
              </DataTable.Tr>
            </DataTable.Tbody>
          </DataTable>
        </Stack>
      </Card>

      {comparisonData.metricNames.length > 0 && (
        <Card data-testid="metrics-comparison-card">
          <Stack gap="md">
            <Title order={3}>Metrics Comparison</Title>
            <DataTable
              data-testid="metrics-comparison-table"
              striped
              highlightOnHover
            >
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Metric Name</DataTable.Th>
                  {comparisonData.runs.map((run, idx) => (
                    <DataTable.Th key={run.id}>
                      <Group gap="xs">
                        <Text
                          component="a"
                          href={`/benchmarking/projects/${projectId}/runs/${run.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          c="blue"
                          td="underline"
                          style={{ cursor: "pointer" }}
                          data-testid={`metrics-run-header-link-${run.id}`}
                        >
                          {idx === 0 ? "Baseline" : `Run ${idx + 1}`}
                        </Text>
                        {run.isBaseline && (
                          <Badge
                            size="xs"
                            color="cyan"
                            data-testid={`metrics-baseline-badge-${run.id}`}
                          >
                            Baseline
                          </Badge>
                        )}
                      </Group>
                    </DataTable.Th>
                  ))}
                  {comparisonData.runs.length >= 2 && (
                    <>
                      <DataTable.Th>Delta</DataTable.Th>
                      <DataTable.Th>Delta %</DataTable.Th>
                    </>
                  )}
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {comparisonData.metricNames.map((metricName) => {
                  const baselineValue =
                    comparisonData.runs[0].metrics[metricName];
                  const compareValue =
                    comparisonData.runs.length >= 2
                      ? comparisonData.runs[1].metrics[metricName]
                      : undefined;

                  const delta =
                    typeof baselineValue === "number" &&
                    typeof compareValue === "number"
                      ? computeDelta(compareValue, baselineValue)
                      : null;
                  const deltaPercent =
                    typeof baselineValue === "number" &&
                    typeof compareValue === "number"
                      ? computeDeltaPercent(compareValue, baselineValue)
                      : null;

                  return (
                    <DataTable.Tr key={metricName}>
                      <DataTable.Td fw={500}>{metricName}</DataTable.Td>
                      {comparisonData.runs.map((run) => {
                        const value = run.metrics[metricName];
                        return (
                          <DataTable.Td key={run.id}>
                            <Code>
                              {value === undefined || value === null
                                ? "-"
                                : typeof value === "number"
                                  ? value.toFixed(4)
                                  : JSON.stringify(value)}
                            </Code>
                          </DataTable.Td>
                        );
                      })}
                      {comparisonData.runs.length >= 2 && (
                        <>
                          <DataTable.Td>
                            {delta !== null ? (
                              <Code c={getChangeColor(delta)}>
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(4)}
                              </Code>
                            ) : (
                              "-"
                            )}
                          </DataTable.Td>
                          <DataTable.Td>
                            {deltaPercent !== null ? (
                              <Code c={getChangeColor(deltaPercent)}>
                                {deltaPercent > 0 ? "+" : ""}
                                {deltaPercent.toFixed(2)}%
                              </Code>
                            ) : (
                              "-"
                            )}
                          </DataTable.Td>
                        </>
                      )}
                    </DataTable.Tr>
                  );
                })}
              </DataTable.Tbody>
            </DataTable>
          </Stack>
        </Card>
      )}

      {comparisonData.paramNames.length > 0 && (
        <Card data-testid="parameters-comparison-card">
          <Stack gap="md">
            <Title order={3}>Parameters Comparison</Title>
            <DataTable data-testid="parameters-comparison-table" striped>
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Parameter</DataTable.Th>
                  {comparisonData.runs.map((run) => (
                    <DataTable.Th key={run.id}>
                      Run {run.id.slice(0, 8)}...
                    </DataTable.Th>
                  ))}
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {comparisonData.paramNames.map((paramName) => {
                  const values = comparisonData.runs.map(
                    (r) => r.params[paramName],
                  );
                  const hasChanges =
                    new Set(values.map((v) => JSON.stringify(v))).size > 1;

                  return (
                    <DataTable.Tr key={paramName}>
                      <DataTable.Td fw={500}>
                        {paramName}
                        {hasChanges && (
                          <Badge size="xs" ml={8} color="orange">
                            Changed
                          </Badge>
                        )}
                      </DataTable.Td>
                      {comparisonData.runs.map((run) => {
                        const value = run.params[paramName];
                        return (
                          <DataTable.Td key={run.id}>
                            <Code>{JSON.stringify(value)}</Code>
                          </DataTable.Td>
                        );
                      })}
                    </DataTable.Tr>
                  );
                })}
              </DataTable.Tbody>
            </DataTable>
          </Stack>
        </Card>
      )}

      {comparisonData.tagNames.length > 0 && (
        <Card data-testid="tags-comparison-card">
          <Stack gap="md">
            <Title order={3}>Tags Comparison</Title>
            <DataTable data-testid="tags-comparison-table" striped>
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Tag</DataTable.Th>
                  {comparisonData.runs.map((run) => (
                    <DataTable.Th key={run.id}>
                      Run {run.id.slice(0, 8)}...
                    </DataTable.Th>
                  ))}
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {comparisonData.tagNames.map((tagName) => {
                  const values = comparisonData.runs.map(
                    (r) => r.tags[tagName],
                  );
                  const hasChanges =
                    new Set(values.map((v) => JSON.stringify(v))).size > 1;

                  return (
                    <DataTable.Tr key={tagName}>
                      <DataTable.Td fw={500}>
                        {tagName}
                        {hasChanges && (
                          <Badge size="xs" ml={8} color="orange">
                            Changed
                          </Badge>
                        )}
                      </DataTable.Td>
                      {comparisonData.runs.map((run) => {
                        const value = run.tags[tagName];
                        return (
                          <DataTable.Td key={run.id}>
                            <Code>{JSON.stringify(value)}</Code>
                          </DataTable.Td>
                        );
                      })}
                    </DataTable.Tr>
                  );
                })}
              </DataTable.Tbody>
            </DataTable>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
