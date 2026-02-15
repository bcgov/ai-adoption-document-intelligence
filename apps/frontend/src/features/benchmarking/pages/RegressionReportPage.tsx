import {
  Alert,
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
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconExternalLink,
} from "@tabler/icons-react";
import { useNavigate, useParams } from "react-router-dom";
import { useProject } from "../hooks/useProjects";
import { useRun } from "../hooks/useRuns";

function getSeverityColor(
  deltaPercent: number,
  threshold: { type: string; value: number } | undefined,
): string {
  if (!threshold || deltaPercent >= 0) return "gray";

  const absDelta = Math.abs(deltaPercent);
  // Critical: regression > 10% or > 2x threshold
  if (
    absDelta > 10 ||
    (threshold.type === "relative" && absDelta > threshold.value * 2)
  ) {
    return "red";
  }
  // Warning: regression between threshold and 10%
  return "orange";
}

export function RegressionReportPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const projectId = id || "";
  const navigate = useNavigate();

  const { run, isLoading } = useRun(projectId, runId || "", false);
  const { project } = useProject(projectId);

  const handleExportJSON = () => {
    if (!run?.baselineComparison) return;

    const reportData = {
      runId: run.id,
      definitionName: run.definitionName,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      baselineComparison: run.baselineComparison,
      generatedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(reportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `regression-report-${run.id}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHTML = () => {
    if (!run?.baselineComparison) return;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Regression Report - ${run.definitionName}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #228be6; }
    h2 { color: #495057; margin-top: 30px; }
    .status { padding: 8px 16px; border-radius: 4px; display: inline-block; font-weight: 600; }
    .passed { background: #51cf66; color: white; }
    .failed { background: #ff6b6b; color: white; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
    th { background: #f1f3f5; font-weight: 600; }
    .regression { color: #ff6b6b; }
    .improvement { color: #51cf66; }
    .summary { background: #f8f9fa; padding: 16px; border-left: 4px solid #228be6; margin: 20px 0; }
    code { background: #f1f3f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
  </style>
</head>
<body>
  <h1>Regression Report</h1>

  <div class="summary">
    <strong>Run:</strong> ${run.definitionName}<br>
    <strong>Run ID:</strong> <code>${run.id}</code><br>
    <strong>Baseline Run ID:</strong> <code>${run.baselineComparison.baselineRunId}</code><br>
    <strong>Completed At:</strong> ${run.completedAt ? new Date(run.completedAt).toLocaleString() : "-"}<br>
    <strong>Overall Status:</strong> <span class="status ${run.baselineComparison.overallPassed ? "passed" : "failed"}">
      ${run.baselineComparison.overallPassed ? "PASSED" : "REGRESSION DETECTED"}
    </span>
  </div>

  ${
    run.baselineComparison.regressedMetrics.length > 0
      ? `
  <h2>Regressed Metrics</h2>
  <p style="color: #ff6b6b;">The following metrics regressed below their baseline thresholds:</p>
  <ul>
    ${run.baselineComparison.regressedMetrics.map((m) => `<li><code>${m}</code></li>`).join("")}
  </ul>
  `
      : ""
  }

  <h2>Detailed Metric Comparison</h2>
  <table>
    <thead>
      <tr>
        <th>Metric</th>
        <th>Current</th>
        <th>Baseline</th>
        <th>Delta</th>
        <th>Delta %</th>
        <th>Threshold</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${run.baselineComparison.metricComparisons
        .map(
          (comparison) => `
        <tr>
          <td><strong>${comparison.metricName}</strong></td>
          <td><code>${comparison.currentValue.toFixed(4)}</code></td>
          <td><code>${comparison.baselineValue.toFixed(4)}</code></td>
          <td class="${comparison.delta > 0 ? "improvement" : comparison.delta < 0 ? "regression" : ""}">
            ${comparison.delta > 0 ? "+" : ""}${comparison.delta.toFixed(4)}
          </td>
          <td class="${comparison.deltaPercent > 0 ? "improvement" : comparison.deltaPercent < 0 ? "regression" : ""}">
            ${comparison.deltaPercent > 0 ? "+" : ""}${comparison.deltaPercent.toFixed(2)}%
          </td>
          <td>${comparison.threshold ? `${comparison.threshold.type}: ${comparison.threshold.value}` : "-"}</td>
          <td>
            <span class="status ${comparison.passed ? "passed" : "failed"}">
              ${comparison.passed ? "PASS" : "FAIL"}
            </span>
          </td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>

  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #dee2e6; color: #868e96; font-size: 14px;">
    Generated at: ${new Date().toLocaleString()}
  </div>
</body>
</html>
`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `regression-report-${run.id}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
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

  if (!run.baselineComparison) {
    return (
      <Center h={400}>
        <Stack align="center" gap="xs">
          <Text c="dimmed">
            No baseline comparison data available for this run
          </Text>
          <Button
            onClick={() =>
              navigate(`/benchmarking/projects/${projectId}/runs/${runId}`)
            }
          >
            Back to Run Details
          </Button>
        </Stack>
      </Center>
    );
  }

  const mlflowUrl = project?.mlflowExperimentId
    ? `http://localhost:5000/#/experiments/${project.mlflowExperimentId}/runs/${run.mlflowRunId}`
    : null;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2}>Regression Report</Title>
          <Text c="dimmed" size="sm">
            {run.definitionName}
          </Text>
        </div>
        <Group>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportJSON}
          >
            Export JSON
          </Button>
          <Button
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportHTML}
          >
            Export HTML
          </Button>
          <Button
            onClick={() =>
              navigate(`/benchmarking/projects/${projectId}/runs/${runId}`)
            }
          >
            Back to Run
          </Button>
        </Group>
      </Group>

      <Alert
        icon={
          run.baselineComparison.overallPassed ? (
            <IconCheck size={16} />
          ) : (
            <IconAlertCircle size={16} />
          )
        }
        color={run.baselineComparison.overallPassed ? "green" : "red"}
        title={
          run.baselineComparison.overallPassed
            ? "✓ All Metrics Passed"
            : "⚠ Regression Detected"
        }
      >
        {run.baselineComparison.overallPassed ? (
          <Text>
            All metrics meet or exceed the baseline thresholds. This run
            performs as well or better than the baseline.
          </Text>
        ) : (
          <Stack gap="xs">
            <Text>
              <strong>{run.baselineComparison.regressedMetrics.length}</strong>{" "}
              metric
              {run.baselineComparison.regressedMetrics.length !== 1
                ? "s have"
                : " has"}{" "}
              regressed below baseline thresholds.
            </Text>
            <Group gap="xs">
              {run.baselineComparison.regressedMetrics.map((metric) => (
                <Badge key={metric} color="red" size="lg">
                  {metric}
                </Badge>
              ))}
            </Group>
          </Stack>
        )}
      </Alert>

      <Card>
        <Stack gap="md">
          <Title order={3}>Run Information</Title>
          <Table>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={500}>Run ID</Table.Td>
                <Table.Td>
                  <Code>{run.id}</Code>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Baseline Run ID</Table.Td>
                <Table.Td>
                  <Code>{run.baselineComparison.baselineRunId}</Code>
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
              {mlflowUrl && (
                <Table.Tr>
                  <Table.Td fw={500}>MLflow Run</Table.Td>
                  <Table.Td>
                    <Button
                      component="a"
                      href={mlflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="subtle"
                      size="xs"
                      rightSection={<IconExternalLink size={14} />}
                    >
                      View in MLflow
                    </Button>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={3}>Metric-by-Metric Analysis</Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Metric</Table.Th>
                <Table.Th>Current</Table.Th>
                <Table.Th>Baseline</Table.Th>
                <Table.Th>Delta</Table.Th>
                <Table.Th>Delta %</Table.Th>
                <Table.Th>Threshold</Table.Th>
                <Table.Th>Severity</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {run.baselineComparison.metricComparisons.map((comparison) => {
                const severityColor = getSeverityColor(
                  comparison.deltaPercent,
                  comparison.threshold,
                );

                return (
                  <Table.Tr key={comparison.metricName}>
                    <Table.Td fw={500}>{comparison.metricName}</Table.Td>
                    <Table.Td>
                      <Code>{comparison.currentValue.toFixed(4)}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Code>{comparison.baselineValue.toFixed(4)}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Code
                        c={
                          comparison.delta > 0
                            ? "green"
                            : comparison.delta < 0
                              ? "red"
                              : undefined
                        }
                      >
                        {comparison.delta > 0 ? "+" : ""}
                        {comparison.delta.toFixed(4)}
                      </Code>
                    </Table.Td>
                    <Table.Td>
                      <Code
                        c={
                          comparison.deltaPercent > 0
                            ? "green"
                            : comparison.deltaPercent < 0
                              ? "red"
                              : undefined
                        }
                      >
                        {comparison.deltaPercent > 0 ? "+" : ""}
                        {comparison.deltaPercent.toFixed(2)}%
                      </Code>
                    </Table.Td>
                    <Table.Td>
                      {comparison.threshold ? (
                        <Text size="sm">
                          {comparison.threshold.type}:{" "}
                          {comparison.threshold.value}
                        </Text>
                      ) : (
                        "-"
                      )}
                    </Table.Td>
                    <Table.Td>
                      {!comparison.passed && (
                        <Badge color={severityColor}>
                          {severityColor === "red" ? "Critical" : "Warning"}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={comparison.passed ? "green" : "red"}>
                        {comparison.passed ? "PASS" : "FAIL"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={3}>Historical Trend</Title>
          <Alert icon={<IconAlertCircle size={16} />} color="blue">
            <Text>
              Historical trend visualization requires installing Recharts
              library. To enable this feature, run:
            </Text>
            <Code block mt="xs">
              npm install recharts
            </Code>
            <Text mt="xs" size="sm" c="dimmed">
              Once installed, this section will display metric trends across
              recent runs.
            </Text>
          </Alert>
        </Stack>
      </Card>
    </Stack>
  );
}
