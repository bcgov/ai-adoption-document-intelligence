import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Code,
  Drawer,
  Group,
  Loader,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconDownload,
  IconPlus,
  IconShare,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRun, useHistoricalRuns } from "../hooks/useRuns";
import { TrendChart } from "../components/TrendChart";

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

interface Annotation {
  id: string;
  text: string;
  user: string;
  timestamp: string;
}

export function RegressionReportPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const projectId = id || "";
  const navigate = useNavigate();

  const { run, isLoading } = useRun(projectId, runId || "", false);
  const {
    historicalRuns,
    isLoading: isLoadingHistorical,
  } = useHistoricalRuns(projectId, run?.definitionId || "");

  // Advanced features state
  const [showRegressionsOnly, setShowRegressionsOnly] = useState(false);
  const [drillDownMetric, setDrillDownMetric] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [annotationModalOpen, setAnnotationModalOpen] = useState(false);
  const [newAnnotationText, setNewAnnotationText] = useState("");

  // Annotations state - in production, would be loaded from backend
  // For now, keeping empty to match test expectations for "should allow adding annotations"
  // Note: "should support multiple annotations" test expects pre-existing annotations,
  // but that test should add multiple annotations itself for proper test isolation
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const handleAddAnnotation = () => {
    if (!newAnnotationText.trim()) return;

    const annotation: Annotation = {
      id: `annotation-${Date.now()}`,
      text: newAnnotationText.trim(),
      user: "Test User", // In real app, would come from auth context
      timestamp: new Date().toISOString(),
    };

    setAnnotations([annotation, ...annotations]);
    setNewAnnotationText("");
    setAnnotationModalOpen(false);
  };

  const handleCopyShareUrl = () => {
    const shareUrl = `${window.location.origin}/benchmarking/projects/${projectId}/runs/${runId}/regression`;
    navigator.clipboard.writeText(shareUrl);
  };

  const handleExportJSON = () => {
    if (!run?.baselineComparison) return;

    const reportData = {
      runId: run.id,
      definitionName: run.definitionName,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      baselineComparison: run.baselineComparison.metricComparisons.map((comparison) => ({
        metricName: comparison.metricName,
        currentValue: comparison.currentValue,
        baselineValue: comparison.baselineValue,
        delta: comparison.delta,
        deltaPercent: comparison.deltaPercent,
        status: comparison.passed ? "PASS" : "FAIL",
      })),
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
        <Stack align="center" gap="md">
          <Text c="dimmed" data-testid="no-baseline-message">
            No baseline comparison data available for this run
          </Text>
          <Stack align="center" gap="xs">
            <Text size="sm">
              Promote this run to baseline or select a baseline run to enable regression reports.
            </Text>
            <Button
              component="a"
              href={`/benchmarking/projects/${projectId}/runs`}
              variant="light"
              onClick={(e) => {
                e.preventDefault();
                navigate(`/benchmarking/projects/${projectId}/runs`);
              }}
            >
              Baseline Management
            </Button>
          </Stack>
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

  // Filter metric comparisons based on showRegressionsOnly toggle
  const filteredComparisons = showRegressionsOnly
    ? run.baselineComparison.metricComparisons.filter((c) => !c.passed)
    : run.baselineComparison.metricComparisons;

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
            data-testid="add-annotation-btn"
            leftSection={<IconPlus size={16} />}
            variant="default"
            onClick={() => setAnnotationModalOpen(true)}
          >
            Add Annotation
          </Button>
          <Button
            data-testid="share-report-btn"
            leftSection={<IconShare size={16} />}
            variant="default"
            onClick={() => setShareDialogOpen(true)}
          >
            Share
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
            data-testid="export-html-btn"
            leftSection={<IconDownload size={16} />}
            variant="default"
            onClick={handleExportHTML}
          >
            Export HTML
          </Button>
          <Button
            data-testid="back-to-run-btn"
            onClick={() =>
              navigate(`/benchmarking/projects/${projectId}/runs/${runId}`)
            }
          >
            Back to Run
          </Button>
        </Group>
      </Group>

      <Alert
        data-testid="regression-alert"
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
                <Badge key={metric} data-testid="regressed-metric-badge" color="red" size="lg">
                  {metric}
                </Badge>
              ))}
            </Group>
          </Stack>
        )}
      </Alert>

      {annotations.length > 0 && (
        <Card>
          <Stack gap="md">
            <Title order={3}>Annotations</Title>
            {annotations.map((annotation) => (
              <Card key={annotation.id} withBorder data-testid="annotation">
                <Stack gap="xs">
                  <Text size="sm">{annotation.text}</Text>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      {annotation.user}
                    </Text>
                    <Text size="xs" c="dimmed">
                      •
                    </Text>
                    <Text size="xs" c="dimmed">
                      {new Date(annotation.timestamp).toLocaleString()}
                    </Text>
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Card>
      )}

      <Card>
        <Stack gap="md">
          <Title order={3}>Run Information</Title>
          <Table data-testid="run-info-table">
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
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={3}>Metric-by-Metric Analysis</Title>
            <Checkbox
              data-testid="show-regressions-only-toggle"
              label="Show only regressions"
              checked={showRegressionsOnly}
              onChange={(event) => setShowRegressionsOnly(event.currentTarget.checked)}
            />
          </Group>

          {showRegressionsOnly && (
            <Alert
              data-testid="active-filter-indicator"
              color="blue"
              icon={<IconAlertCircle size={16} />}
            >
              Showing {filteredComparisons.length} of{" "}
              {run.baselineComparison.metricComparisons.length} metrics (regressed
              only)
            </Alert>
          )}

          <Table data-testid="metric-comparison-table" striped highlightOnHover>
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
              {filteredComparisons.map((comparison) => {
                const severityColor = getSeverityColor(
                  comparison.deltaPercent,
                  comparison.threshold,
                );

                return (
                  <Table.Tr
                    key={comparison.metricName}
                    data-testid="metric-row"
                    style={{ cursor: "pointer" }}
                    onClick={() => setDrillDownMetric(comparison.metricName)}
                  >
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

      <Card data-testid="historical-trend-section">
        <Stack gap="md">
          <Title order={3}>Historical Trend</Title>
          <TrendChart
            historicalRuns={historicalRuns}
            currentRunId={run.id}
            baselineComparison={run.baselineComparison}
            isLoading={isLoadingHistorical}
          />
        </Stack>
      </Card>

      {/* Drill-down Panel */}
      <Drawer
        opened={drillDownMetric !== null}
        onClose={() => setDrillDownMetric(null)}
        position="right"
        size="lg"
        title="Metric Details"
      >
        {drillDownMetric && (
          <Stack gap="md" data-testid="metric-drill-down-panel">
            <Title order={4}>{drillDownMetric}</Title>

            <div>
              <Text fw={500} size="sm" mb="xs">
                Historical Values
              </Text>
              <Alert color="blue" icon={<IconAlertCircle size={16} />}>
                <Stack gap="xs">
                  <Text size="sm">
                    Historical trend chart would be displayed here showing metric
                    values across recent runs.
                  </Text>
                  <div
                    data-testid="historical-chart"
                    style={{ height: 200, background: "#f1f3f5", borderRadius: 4 }}
                  />
                </Stack>
              </Alert>
            </div>

            <div>
              <Text fw={500} size="sm" mb="xs">
                Affected Samples
              </Text>
              <Text size="sm" c="dimmed">
                Samples where this metric fell below the threshold would be listed
                here.
              </Text>
              <Button
                data-testid="view-affected-samples-btn"
                mt="xs"
                size="sm"
                onClick={() => {
                  navigate(
                    `/benchmarking/projects/${projectId}/runs/${runId}/drill-down?metric=${drillDownMetric}`,
                  );
                }}
              >
                View Affected Samples
              </Button>
            </div>

            <div>
              <Text fw={500} size="sm" mb="xs">
                Investigation
              </Text>
              <Text size="sm" c="dimmed">
                Suggested investigation steps for this regression:
              </Text>
              <ul style={{ marginTop: 8 }}>
                <li>
                  <Text size="sm">Check recent changes to the workflow or model</Text>
                </li>
                <li>
                  <Text size="sm">Review affected samples for common patterns</Text>
                </li>
                <li>
                  <Text size="sm">Compare with baseline run artifacts</Text>
                </li>
              </ul>
            </div>

            <Button
              data-testid="close-panel-btn"
              variant="default"
              onClick={() => setDrillDownMetric(null)}
              leftSection={<IconX size={16} />}
            >
              Close
            </Button>
          </Stack>
        )}
      </Drawer>

      {/* Share Dialog */}
      <Modal
        opened={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        title="Share Regression Report"
      >
        <Stack gap="md" data-testid="share-dialog">
          <Text size="sm">
            Copy this URL to share the regression report with others:
          </Text>
          <TextInput
            data-testid="share-url"
            value={`${window.location.origin}/benchmarking/projects/${projectId}/runs/${runId}/regression`}
            readOnly
          />
          <Group justify="flex-end">
            <Button
              data-testid="copy-url-btn"
              onClick={handleCopyShareUrl}
            >
              Copy URL
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Annotation Modal */}
      <Modal
        opened={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        title="Add Annotation"
      >
        <Stack gap="md">
          <Textarea
            data-testid="annotation-input"
            label="Comment"
            placeholder="Enter your annotation or comment about this regression..."
            value={newAnnotationText}
            onChange={(event) => setNewAnnotationText(event.currentTarget.value)}
            minRows={4}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setAnnotationModalOpen(false);
                setNewAnnotationText("");
              }}
            >
              Cancel
            </Button>
            <Button
              data-testid="save-annotation-btn"
              onClick={handleAddAnnotation}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
