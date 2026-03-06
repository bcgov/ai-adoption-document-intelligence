import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconExternalLink,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArtifactViewer } from "../components/ArtifactViewer";
import { BaselineThresholdDialog } from "../components/BaselineThresholdDialog";
import { useDefinition } from "../hooks/useDefinitions";
import {
  useArtifacts,
  useDrillDown,
  usePerSampleResults,
  usePromoteBaseline,
  useRun,
  useStartRun,
} from "../hooks/useRuns";
import { TEMPORAL_UI_URL } from "@/shared/constants";
import { formatDurationFromDates, getStatusColor } from "../utils";

interface FieldComparisonResult {
  field: string;
  matched: boolean;
  predicted?: unknown;
  expected?: unknown;
  similarity?: number;
}

interface SampleResult {
  sampleId: string;
  metadata: Record<string, unknown>;
  metrics: Record<string, number>;
  pass: boolean;
  diagnostics?: Record<string, unknown>;
  groundTruth?: unknown;
  prediction?: unknown;
  evaluationDetails?: unknown;
}

function FieldErrorDetails({
  fieldName,
  samples,
}: {
  fieldName: string;
  samples: SampleResult[];
}) {
  // Find samples where this field has errors in evaluationDetails
  const affectedSamples: Array<{
    sampleId: string;
    expected: unknown;
    predicted: unknown;
    similarity?: number;
    errorType: string;
  }> = [];

  for (const sample of samples) {
    const details = sample.evaluationDetails;
    if (!Array.isArray(details)) continue;

    const fieldResult = (details as FieldComparisonResult[]).find(
      (d) => d.field === fieldName && !d.matched,
    );
    if (fieldResult) {
      // Determine error type
      let errorType = "mismatch";
      if (fieldResult.expected !== undefined && fieldResult.predicted === undefined) {
        errorType = "missing";
      } else if (fieldResult.expected === undefined && fieldResult.predicted !== undefined) {
        errorType = "extra";
      }

      affectedSamples.push({
        sampleId: sample.sampleId,
        expected: fieldResult.expected,
        predicted: fieldResult.predicted,
        similarity: fieldResult.similarity,
        errorType,
      });
    }
  }

  if (affectedSamples.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No error details available for this field.
      </Text>
    );
  }

  return (
    <>
      <Text size="sm" c="dimmed">
        {affectedSamples.length} sample{affectedSamples.length !== 1 ? "s" : ""} with errors on this field
      </Text>
      <Table striped highlightOnHover data-testid="field-error-detail-table">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Sample ID</Table.Th>
            <Table.Th>Type</Table.Th>
            <Table.Th>Expected</Table.Th>
            <Table.Th>Predicted</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {affectedSamples.map((s) => (
            <Table.Tr key={s.sampleId}>
              <Table.Td>
                <Code>{s.sampleId}</Code>
              </Table.Td>
              <Table.Td>
                <Badge
                  size="sm"
                  color={
                    s.errorType === "missing"
                      ? "orange"
                      : s.errorType === "extra"
                        ? "blue"
                        : "red"
                  }
                >
                  {s.errorType}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Code>
                  {s.expected !== undefined
                    ? typeof s.expected === "string"
                      ? s.expected
                      : JSON.stringify(s.expected)
                    : "-"}
                </Code>
              </Table.Td>
              <Table.Td>
                <Code>
                  {s.predicted !== undefined
                    ? typeof s.predicted === "string"
                      ? s.predicted
                      : JSON.stringify(s.predicted)
                    : "-"}
                </Code>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

export function RunDetailPage() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const projectId = id || "";
  const navigate = useNavigate();
  const [artifactTypeFilter, setArtifactTypeFilter] = useState<string | null>(
    null,
  );
  const [selectedArtifact, setSelectedArtifact] = useState<{
    id: string;
    runId: string;
    type: string;
    path: string;
    sampleId: string | null;
    nodeId: string | null;
    sizeBytes: string;
    mimeType: string;
    createdAt: string;
  } | null>(null);
  const [thresholdDialogOpened, setThresholdDialogOpened] = useState(false);
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);
  const [drawerField, setDrawerField] = useState<string | null>(null);

  // Enable polling for non-terminal states
  const { run, isLoading, cancelRun, isCancelling } = useRun(
    projectId,
    runId || "",
    true, // Enable polling
  );

  const { definition } = useDefinition(projectId, run?.definitionId || "");
  const { drillDown } = useDrillDown(projectId, runId || "");
  const { artifacts, total: totalArtifacts } = useArtifacts(
    projectId,
    runId || "",
    artifactTypeFilter || undefined,
  );

  // Fetch all per-sample results when field drawer is open
  const { results: allSampleResults } = usePerSampleResults(
    drawerField !== null ? projectId : "",
    drawerField !== null ? (runId || "") : "",
    {},
    1,
    10000,
  );

  const { startRun, isStarting } = useStartRun(
    projectId,
    run?.definitionId || "",
  );

  const { promoteToBaseline, isPromoting } = usePromoteBaseline(
    projectId,
    runId || "",
  );

  const handleRerun = async () => {
    if (!run) return;
    const newRun = await startRun({});
    navigate(`/benchmarking/projects/${projectId}/runs/${newRun.id}`);
  };

  const handlePromoteBaseline = () => {
    setIsEditingThresholds(false);
    setThresholdDialogOpened(true);
  };

  const handleEditThresholds = () => {
    setIsEditingThresholds(true);
    setThresholdDialogOpened(true);
  };

  const handleThresholdSubmit = (
    thresholds: Array<{ metricName: string; type: "absolute" | "relative"; value: number }>
  ) => {
    promoteToBaseline(
      { thresholds },
      {
        onSuccess: () => {
          setThresholdDialogOpened(false);
          setIsEditingThresholds(false);
          notifications.show({
            title: "Success",
            message: isEditingThresholds
              ? "Baseline thresholds updated successfully"
              : "Run promoted to baseline successfully",
            color: "green",
          });
        },
        onError: (error) => {
          notifications.show({
            title: "Error",
            message: error instanceof Error ? error.message : "Failed to promote run to baseline",
            color: "red",
          });
        },
      }
    );
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
  const canEditThresholds = run.isBaseline && run.baselineThresholds && run.baselineThresholds.length > 0;
  const temporalUrl = `${TEMPORAL_UI_URL}/namespaces/default/workflows/${run.temporalWorkflowId}`;

  // All possible artifact types (from schema) - should always be available in filter dropdown
  const allArtifactTypes = [
    "per_doc_output",
    "intermediate_node_output",
    "diff_report",
    "evaluation_report",
    "error_log",
  ];

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
            <Group gap="sm" align="center">
              <Button
                variant="subtle"
                leftSection={<IconArrowLeft size={16} />}
                onClick={() => navigate(`/benchmarking/projects/${projectId}`)}
                data-testid="back-to-project-btn"
              >
                Back
              </Button>
              <Title order={2} data-testid="run-definition-name">
                {run.definitionName}
              </Title>
              {run.isBaseline && (
                <Tooltip label="This run is the baseline for comparison">
                  <Badge
                    size="lg"
                    color="yellow"
                    variant="filled"
                    leftSection={<IconTrophy size={14} />}
                    data-testid="baseline-badge"
                  >
                    BASELINE
                  </Badge>
                </Tooltip>
              )}
            </Group>
            <Text c="dimmed" size="sm" data-testid="run-id-text">
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
                data-testid="cancel-run-btn"
              >
                Cancel
              </Button>
            )}
            {!run.isBaseline && (
              <Tooltip
                label={
                  run.status !== "completed"
                    ? `Only completed runs can be promoted to baseline. Current status: ${run.status}`
                    : ""
                }
                disabled={run.status === "completed"}
                data-testid="promote-baseline-tooltip"
              >
                <Button
                  color="yellow"
                  leftSection={<IconTrophy size={16} />}
                  onClick={handlePromoteBaseline}
                  loading={isPromoting}
                  disabled={run.status !== "completed"}
                  data-testid="promote-baseline-btn"
                >
                  Promote to Baseline
                </Button>
              </Tooltip>
            )}
            {canEditThresholds && (
              <Button
                variant="light"
                color="yellow"
                leftSection={<IconTrophy size={16} />}
                onClick={handleEditThresholds}
                loading={isPromoting}
                data-testid="edit-thresholds-btn"
              >
                Edit Thresholds
              </Button>
            )}
            {canRerun && (
              <Button
                onClick={handleRerun}
                loading={isStarting}
                data-testid="rerun-btn"
              >
                Re-run
              </Button>
            )}
            {run.baselineComparison && (
              <Button
                variant="light"
                onClick={() =>
                  navigate(
                    `/benchmarking/projects/${projectId}/runs/${runId}/regression`,
                  )
                }
                data-testid="view-regression-report-btn"
              >
                View Regression Report
              </Button>
            )}
            {run.status === "completed" && (
              <Button
                variant="light"
                onClick={() =>
                  navigate(
                    `/benchmarking/projects/${projectId}/runs/${runId}/drill-down`,
                  )
                }
                data-testid="view-all-samples-btn"
              >
                View All Samples
              </Button>
            )}
          </Group>
        </Group>
      </Stack>

      {run.error && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color="red"
          title="Error"
          data-testid="run-error-alert"
        >
          {run.error}
        </Alert>
      )}

      {run.baselineComparison && (
        <Alert
          icon={
            run.baselineComparison.overallPassed ? (
              <IconCheck size={16} />
            ) : (
              <IconAlertCircle size={16} />
            )
          }
          color={run.baselineComparison.overallPassed ? "green" : "orange"}
          title={
            run.baselineComparison.overallPassed
              ? "Baseline Comparison: PASSED"
              : "Baseline Comparison: REGRESSION DETECTED"
          }
          data-testid="baseline-comparison-alert"
        >
          {run.baselineComparison.overallPassed ? (
            <Text>
              All metrics meet or exceed the baseline thresholds. This run
              performs as well or better than the baseline run{" "}
              <Code>{run.baselineComparison.baselineRunId}</Code>.
            </Text>
          ) : (
            <Stack gap="xs">
              <Text>
                Some metrics have regressed below baseline thresholds. Baseline
                run: <Code>{run.baselineComparison.baselineRunId}</Code>
              </Text>
              <Text fw={500}>Regressed metrics:</Text>
              <Group gap="xs">
                {run.baselineComparison.regressedMetrics.map((metric) => (
                  <Badge key={metric} color="red">
                    {metric}
                  </Badge>
                ))}
              </Group>
            </Stack>
          )}
        </Alert>
      )}

      {run.status === "completed" && !run.baselineComparison && !run.isBaseline && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color="blue"
          title="No Baseline Set"
          data-testid="no-baseline-alert"
        >
          <Stack gap="sm">
            <Text>
              No baseline has been set for this definition. Promote this run to baseline to enable performance comparisons for future runs.
            </Text>
            <Button
              leftSection={<IconTrophy size={16} />}
              onClick={handlePromoteBaseline}
              loading={isPromoting}
              data-testid="promote-to-baseline-suggestion-btn"
            >
              Promote this run to Baseline
            </Button>
          </Stack>
        </Alert>
      )}

      <Card>
        <Stack gap="md">
          <Title order={3} data-testid="run-info-heading">
            Run Information
          </Title>
          <Table data-testid="run-info-table">
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
                  {formatDurationFromDates(run.startedAt, run.completedAt)}
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
              {run.isBaseline && (
                <Table.Tr>
                  <Table.Td fw={500}>Retention Policy</Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      Protected from retention - baseline runs are exempt from cleanup
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>

      {run.status === "completed" && run.baselineComparison && (
        <Card>
          <Stack gap="md">
            <Title order={3} data-testid="baseline-comparison-heading">
              Baseline Comparison
            </Title>
            <Text c="dimmed" size="sm">
              Comparing against baseline run:{" "}
              <Code>{run.baselineComparison.baselineRunId}</Code>
            </Text>
            <Table striped highlightOnHover data-testid="baseline-comparison-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Metric</Table.Th>
                  <Table.Th>Current</Table.Th>
                  <Table.Th>Baseline</Table.Th>
                  <Table.Th>Delta</Table.Th>
                  <Table.Th>Delta %</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {run.baselineComparison.metricComparisons.map((comparison) => (
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
                      <Badge color={comparison.passed ? "green" : "red"}>
                        {comparison.passed ? "PASS" : "FAIL"}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      )}

      {run.status === "completed" && run.metrics && (
        <Accordion variant="contained" data-testid="aggregated-metrics-accordion">
          <Accordion.Item value="metrics">
            <Accordion.Control>
              <Title order={3} data-testid="aggregated-metrics-heading">
                Aggregated Metrics
              </Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Table striped highlightOnHover data-testid="aggregated-metrics-table">
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
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {run.status === "completed" && (run.params || run.tags) && (
        <Card>
          <Stack gap="md">
            <Title order={3} data-testid="params-tags-heading">
              Run Parameters & Tags
            </Title>
            {run.params && Object.keys(run.params).length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Parameters</Text>
                <Table striped data-testid="params-table">
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
                <Table striped data-testid="tags-table">
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
              <Title order={3} data-testid="artifacts-heading">
                Artifacts ({totalArtifacts} total
                {artifactTypeFilter
                  ? `, filtered by ${artifactTypeFilter}`
                  : ""}
                )
              </Title>
              <Select
                placeholder="Filter by type"
                data={[
                  { value: "", label: "All" },
                  ...allArtifactTypes.map((type) => ({
                    value: type,
                    label: type,
                  })),
                ]}
                value={artifactTypeFilter || ""}
                onChange={(value) => setArtifactTypeFilter(value || null)}
                clearable
                style={{ width: 200 }}
                data-testid="artifact-type-filter"
              />
            </Group>
            <Table striped highlightOnHover data-testid="artifacts-table">
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
                  <Table.Tr
                    key={artifact.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedArtifact(artifact)}
                    data-testid={`artifact-row-${artifact.id}`}
                  >
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
            <Title order={3} data-testid="drill-down-heading">
              Drill-Down Summary
            </Title>

            {drillDown.fieldErrorBreakdown &&
              drillDown.fieldErrorBreakdown.length > 0 && (
                <Stack gap="xs">
                  <Text fw={500}>Per-Field Error Breakdown</Text>
                  <Table striped highlightOnHover data-testid="field-error-breakdown-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Field Name</Table.Th>
                        <Table.Th>Error Count</Table.Th>
                        <Table.Th>Error Rate</Table.Th>
                        <Table.Th />
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {drillDown.fieldErrorBreakdown.map((field) => (
                        <Table.Tr
                          key={field.fieldName}
                          style={{ cursor: "pointer" }}
                          onClick={() => setDrawerField(field.fieldName)}
                          data-testid={`field-error-row-${field.fieldName}`}
                        >
                          <Table.Td>
                            <Code>{field.fieldName}</Code>
                          </Table.Td>
                          <Table.Td>{field.errorCount}</Table.Td>
                          <Table.Td>
                            <Code>{(field.errorRate * 100).toFixed(2)}%</Code>
                          </Table.Td>
                          <Table.Td>
                            <IconChevronRight size={16} color="gray" />
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

      {/* Artifact Viewer */}
      <ArtifactViewer
        artifact={selectedArtifact}
        projectId={projectId}
        onClose={() => setSelectedArtifact(null)}
      />

      {/* Baseline Threshold Dialog */}
      {run.metrics && (
        <BaselineThresholdDialog
          opened={thresholdDialogOpened}
          onClose={() => {
            setThresholdDialogOpened(false);
            setIsEditingThresholds(false);
          }}
          metrics={(run.metrics as Record<string, number>)}
          onSubmit={handleThresholdSubmit}
          isPromoting={isPromoting}
          existingBaseline={
            !isEditingThresholds && definition?.baselineRun
              ? {
                  runId: definition.baselineRun.id,
                  definitionName: run.definitionName,
                }
              : undefined
          }
          existingThresholds={isEditingThresholds ? run.baselineThresholds || undefined : undefined}
          isEditing={isEditingThresholds}
        />
      )}

      {/* Field Error Detail Drawer */}
      <Drawer
        opened={drawerField !== null}
        onClose={() => setDrawerField(null)}
        position="right"
        size="xl"
        title={
          <Text fw={600}>
            Field Errors: <Code>{drawerField}</Code>
          </Text>
        }
        data-testid="field-error-drawer"
      >
        {drawerField && (
          <ScrollArea h="calc(100vh - 80px)">
            <Stack gap="md">
              <FieldErrorDetails
                fieldName={drawerField}
                samples={allSampleResults}
              />
            </Stack>
          </ScrollArea>
        )}
      </Drawer>

    </Stack>
  );
}
