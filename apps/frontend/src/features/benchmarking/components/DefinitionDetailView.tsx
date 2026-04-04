import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBug,
  IconEdit,
  IconHistory,
  IconPlayerPlay,
  IconSparkles,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useRevertWorkflowHead,
  useWorkflowVersions,
} from "@/data/hooks/useWorkflows";
import { useBaselineHistory, useDefinition } from "../hooks/useDefinitions";
import {
  useGenerateCandidate,
  usePipelineDebugLog,
  useStartRun,
} from "../hooks/useRuns";
import { ScheduleConfig } from "./ScheduleConfig";

interface DatasetVersionInfo {
  id: string;
  datasetName: string;
  version: string;
}

interface WorkflowInfo {
  id: string;
  workflowVersionId: string;
  name: string;
  version: number;
  workflowKind?: string;
  sourceWorkflowId?: string | null;
}

interface SplitInfo {
  id: string;
  name: string;
  type: string;
}

interface RunHistorySummary {
  id: string;
  status: string;
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
  workflowConfigOverrides?: Record<string, unknown>;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
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
  onEdit?: () => void;
}

export function DefinitionDetailView({
  definition,
  onEdit,
}: DefinitionDetailViewProps) {
  const navigate = useNavigate();
  const { updateDefinition, isUpdating } = useDefinition(
    definition.projectId,
    definition.id,
  );
  const { data: workflowVersions = [], isLoading: versionsLoading } =
    useWorkflowVersions(definition.workflow.id);
  const revertHead = useRevertWorkflowHead();
  const [pinVersionId, setPinVersionId] = useState(
    definition.workflow.workflowVersionId,
  );
  useEffect(() => {
    setPinVersionId(definition.workflow.workflowVersionId);
  }, [definition.workflow.workflowVersionId]);

  const { startRun, isStarting } = useStartRun(
    definition.projectId,
    definition.id,
  );
  const {
    generateCandidate,
    isGenerating: isOcrImprovementRunning,
    result: generateResult,
  } = useGenerateCandidate(definition.projectId, definition.id);

  const { history: baselineHistory, isLoading: isLoadingHistory } =
    useBaselineHistory(definition.projectId, definition.id);

  const [persistOcrCache, setPersistOcrCache] = useState(true);

  // Pipeline debug log: only fetches when the user expands the section
  const [showDebugLog, setShowDebugLog] = useState(false);
  const { entries: debugLogEntries, isLoading: isLoadingDebugLog } =
    usePipelineDebugLog(definition.projectId, definition.id, showDebugLog);

  const handleStartRun = async () => {
    const run = await startRun({ persistOcrCache });
    navigate(`/benchmarking/projects/${definition.projectId}/runs/${run.id}`);
  };

  const handleGenerateCandidate = async () => {
    try {
      const result = await generateCandidate({});
      if (result?.status === "candidate_created") {
        notifications.show({
          title: "Candidate workflow created",
          message:
            "Candidate created. Review it in the workflow editor, then create a definition and benchmark it.",
          color: "green",
          autoClose: 8000,
        });
      } else if (result?.status === "no_recommendations") {
        notifications.show({
          title: "No recommendations",
          message: result.pipelineMessage || "No tools recommended",
          color: "yellow",
        });
      } else {
        notifications.show({
          title: "Error",
          message: result?.error || "Pipeline failed",
          color: "red",
        });
      }
    } catch (error) {
      notifications.show({
        title: "Error",
        message:
          error instanceof Error
            ? error.message
            : "Failed to generate candidate",
        color: "red",
      });
    }
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

  /** Map step identifiers to human-readable labels for the accordion headers */
  const stepLabel = (step: string): string => {
    const labels: Record<string, string> = {
      hitl_aggregation: "HITL Correction Aggregation",
      tool_manifest: "Tool Manifest",
      workflow_load: "Workflow Load",
      prompt_build: "LLM Prompt",
      llm_request: "LLM Request Metadata",
      llm_response: "LLM Response",
      recommendation_parse: "Recommendation Parsing",
      apply_recommendations: "Apply Recommendations",
      candidate_creation: "Candidate Creation",
      error: "Error",
    };
    return labels[step] ?? step;
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
              {!definition.immutable && onEdit && (
                <Button
                  variant="light"
                  leftSection={<IconEdit size={16} />}
                  onClick={onEdit}
                  data-testid="edit-definition-btn"
                >
                  Edit
                </Button>
              )}
              <Switch
                checked={persistOcrCache}
                onChange={(e) => setPersistOcrCache(e.currentTarget.checked)}
                label="Persist OCR cache"
                description="Store Azure OCR per sample for replay (recommended for improvement pipeline)"
                size="sm"
                data-testid="persist-ocr-cache-switch"
              />
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
                  {definition.datasetVersion.datasetName}{" "}
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
                  <Text size="xs" c="dimmed" mt={4}>
                    Lineage <Code>{definition.workflow.id}</Code> · Pinned
                    version <Code>{definition.workflow.workflowVersionId}</Code>
                  </Text>
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

          {!definition.immutable && (
            <Stack gap="sm" mt="md">
              <Select
                label="Pinned workflow version"
                description="Which graph revision this definition uses for benchmark runs."
                placeholder="Select version"
                data={workflowVersions.map((v) => ({
                  value: v.id,
                  label: `v${v.versionNumber} · ${new Date(v.createdAt).toLocaleString()}`,
                }))}
                value={pinVersionId}
                onChange={(v) => setPinVersionId(v || pinVersionId)}
                disabled={versionsLoading}
                searchable
              />
              <Group>
                <Button
                  size="xs"
                  variant="light"
                  loading={isUpdating}
                  disabled={
                    pinVersionId === definition.workflow.workflowVersionId
                  }
                  onClick={() =>
                    updateDefinition({ workflowVersionId: pinVersionId })
                  }
                >
                  Apply pin
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  loading={revertHead.isPending}
                  onClick={() =>
                    revertHead.mutate({
                      lineageId: definition.workflow.id,
                      workflowVersionId: pinVersionId,
                    })
                  }
                >
                  Set as default head (new uploads / editor)
                </Button>
              </Group>
            </Stack>
          )}
        </Stack>
      </Card>

      <Card data-testid="ocr-improvement-card">
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <IconSparkles size={20} />
              <Title order={4} data-testid="ocr-improvement-heading">
                OCR improvement pipeline
              </Title>
            </Group>
            <Button
              variant="light"
              leftSection={<IconSparkles size={16} />}
              onClick={handleGenerateCandidate}
              loading={isOcrImprovementRunning}
              data-testid="run-ocr-improvement-btn"
            >
              Generate candidate workflow
            </Button>
          </Group>
          <Text size="sm" c="dimmed" data-testid="ocr-improvement-description">
            Aggregate HITL corrections and get AI tool recommendations to
            generate a candidate workflow. Review the candidate in the workflow
            editor, then create a definition and benchmark it. When the
            benchmark run completes, apply the candidate workflow to the base
            lineage from the run page.
          </Text>
          {generateResult && (
            <Stack gap="xs">
              <Badge
                color={
                  generateResult.status === "candidate_created"
                    ? "green"
                    : generateResult.status === "no_recommendations"
                      ? "blue"
                      : "red"
                }
                data-testid="ocr-improvement-status-badge"
              >
                {generateResult.status}
              </Badge>
              {generateResult.status === "candidate_created" && (
                <>
                  <Group gap="lg">
                    <Text size="sm">
                      <Text span fw={500}>
                        Candidate workflow:
                      </Text>{" "}
                      <Code>{generateResult.candidateWorkflowVersionId}</Code>
                    </Text>
                    <Text size="sm">
                      Applied {generateResult.recommendationsSummary.applied}{" "}
                      tools
                      {generateResult.recommendationsSummary.rejected > 0 &&
                        `, rejected ${generateResult.recommendationsSummary.rejected}`}
                      :{" "}
                      {generateResult.recommendationsSummary.toolIds.join(
                        ", ",
                      ) || "—"}
                    </Text>
                  </Group>
                </>
              )}
              {generateResult.analysis && (
                <Alert
                  color="blue"
                  title="AI analysis"
                  data-testid="ocr-improvement-analysis"
                >
                  {generateResult.analysis}
                </Alert>
              )}
              {generateResult.status === "no_recommendations" &&
                generateResult.pipelineMessage && (
                  <Alert
                    color="yellow"
                    title="Why no candidate was created"
                    data-testid="ocr-improvement-pipeline-message"
                  >
                    {generateResult.pipelineMessage}
                  </Alert>
                )}
              {generateResult.status === "no_recommendations" &&
                generateResult.rejectionDetails &&
                generateResult.rejectionDetails.length > 0 && (
                  <Alert
                    color="orange"
                    title="Could not apply recommendations to this workflow graph"
                    data-testid="ocr-improvement-rejection-details"
                  >
                    <Stack gap="xs">
                      {generateResult.rejectionDetails.map((line, idx) => (
                        <Text size="sm" key={idx}>
                          {line}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}
              {generateResult.status === "error" && generateResult.error && (
                <Alert
                  color="red"
                  title="Error"
                  data-testid="ocr-improvement-error"
                >
                  {generateResult.error}
                </Alert>
              )}
            </Stack>
          )}

          {/* Pipeline debug log — only shown after pipeline has been run, fetched on demand */}
          {generateResult && (
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconBug size={14} />}
              onClick={() => setShowDebugLog((prev) => !prev)}
              data-testid="toggle-debug-log-btn"
            >
              {showDebugLog ? "Hide debug log" : "View debug log"}
            </Button>
          )}

          {showDebugLog && (
            <Stack gap="xs">
              {isLoadingDebugLog ? (
                <Loader size="sm" />
              ) : debugLogEntries.length === 0 ? (
                <Text size="sm" c="dimmed" data-testid="no-debug-log-message">
                  No debug log available. Run the pipeline to generate one.
                </Text>
              ) : (
                <Accordion
                  variant="separated"
                  multiple
                  data-testid="pipeline-debug-log-accordion"
                >
                  {debugLogEntries.map((entry, idx) => (
                    <Accordion.Item
                      key={`${entry.step}-${idx}`}
                      value={`${entry.step}-${idx}`}
                    >
                      <Accordion.Control>
                        <Group gap="sm">
                          <Text size="sm" fw={500}>
                            {stepLabel(entry.step)}
                          </Text>
                          {entry.durationMs != null && (
                            <Badge size="xs" variant="light" color="gray">
                              {entry.durationMs < 1000
                                ? `${entry.durationMs}ms`
                                : `${(entry.durationMs / 1000).toFixed(1)}s`}
                            </Badge>
                          )}
                          <Text size="xs" c="dimmed">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </Text>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        {entry.step === "prompt_build" ? (
                          <Stack gap="xs">
                            <Accordion variant="contained" multiple>
                              <Accordion.Item value="system">
                                <Accordion.Control>
                                  <Text size="sm" fw={500}>
                                    System Message
                                  </Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                  <Code
                                    block
                                    style={{
                                      fontSize: 12,
                                      maxHeight: 400,
                                      overflow: "auto",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {typeof entry.data.systemMessage ===
                                    "string"
                                      ? entry.data.systemMessage
                                      : JSON.stringify(
                                          entry.data.systemMessage,
                                          null,
                                          2,
                                        )}
                                  </Code>
                                </Accordion.Panel>
                              </Accordion.Item>
                              <Accordion.Item value="user">
                                <Accordion.Control>
                                  <Text size="sm" fw={500}>
                                    User Message
                                  </Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                  <Code
                                    block
                                    style={{
                                      fontSize: 12,
                                      maxHeight: 400,
                                      overflow: "auto",
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {typeof entry.data.userMessage === "string"
                                      ? entry.data.userMessage
                                      : JSON.stringify(
                                          entry.data.userMessage,
                                          null,
                                          2,
                                        )}
                                  </Code>
                                </Accordion.Panel>
                              </Accordion.Item>
                            </Accordion>
                          </Stack>
                        ) : (
                          <Code
                            block
                            style={{
                              fontSize: 12,
                              maxHeight: 400,
                              overflow: "auto",
                            }}
                          >
                            {JSON.stringify(entry.data, null, 2)}
                          </Code>
                        )}
                      </Accordion.Panel>
                    </Accordion.Item>
                  ))}
                </Accordion>
              )}
            </Stack>
          )}

          {definition.workflowConfigOverrides &&
            Object.keys(definition.workflowConfigOverrides).length > 0 && (
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  Workflow Config Overrides
                </Text>
                <Code block style={{ fontSize: 13 }}>
                  {JSON.stringify(definition.workflowConfigOverrides, null, 2)}
                </Code>
              </Stack>
            )}
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
                  ? new Date(
                      definition.baselineRun.completedAt,
                    ).toLocaleString()
                  : "unknown date"}
                . For complete baseline change history, check audit logs for{" "}
                <Code>baseline_promoted</Code> events.
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
                      ? new Date(
                          definition.baselineRun.completedAt,
                        ).toLocaleString()
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
                  {Object.entries(definition.baselineRun.metrics).map(
                    ([key, value]) => {
                      // Skip non-numeric metrics (like perSampleResults, fieldErrorBreakdown, etc.)
                      if (typeof value !== "number") return null;

                      return (
                        <Table.Tr key={key}>
                          <Table.Td>{key}</Table.Td>
                          <Table.Td>
                            <Code>{value.toFixed(4)}</Code>
                          </Table.Td>
                        </Table.Tr>
                      );
                    },
                  )}
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
                  {definition.baselineRun.baselineThresholds.map(
                    (threshold) => (
                      <Table.Tr key={threshold.metricName}>
                        <Table.Td>{threshold.metricName}</Table.Td>
                        <Table.Td>
                          <Badge
                            variant="light"
                            data-testid={`threshold-type-${threshold.metricName}`}
                          >
                            {threshold.type === "relative"
                              ? "Relative (%)"
                              : "Absolute"}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Code
                            data-testid={`threshold-value-${threshold.metricName}`}
                          >
                            {threshold.type === "relative"
                              ? `${(threshold.value * 100).toFixed(0)}%`
                              : threshold.value.toFixed(4)}
                          </Code>
                        </Table.Td>
                      </Table.Tr>
                    ),
                  )}
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
                      <Table.Tr
                        key={index}
                        data-testid={`baseline-history-row-${index}`}
                      >
                        <Table.Td
                          data-testid={`baseline-history-date-${index}`}
                        >
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
                        <Table.Td
                          data-testid={`baseline-history-user-${index}`}
                        >
                          {entry.actorId}
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
                  <Table.Th>Run ID</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Started</Table.Th>
                  <Table.Th>Completed</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {definition.runHistory.map((run) => (
                  <Table.Tr
                    key={run.id}
                    data-testid={`run-history-row-${run.id}`}
                  >
                    <Table.Td>
                      <Code>{run.id.substring(0, 8)}</Code>
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
