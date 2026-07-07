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
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Code,
  DataTable,
  Group,
  Loader,
  notifications,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "../../../ui";
import { useBaselineHistory, useDefinition } from "../hooks/useDefinitions";
import {
  type CreateRunDto,
  useGenerateCandidate,
  useOcrCacheSources,
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
  const [ocrCacheBaselineRunId, setOcrCacheBaselineRunId] = useState<
    string | null
  >(null);
  const { cacheSources } = useOcrCacheSources(
    definition.projectId,
    definition.datasetVersion.id,
  );

  // Pipeline debug log: only fetches when the user expands the section
  const [showDebugLog, setShowDebugLog] = useState(false);
  const { entries: debugLogEntries, isLoading: isLoadingDebugLog } =
    usePipelineDebugLog(definition.projectId, definition.id, showDebugLog);

  /** Backend rejects both `persistOcrCache: true` and `ocrCacheBaselineRunId` in one request. */
  const ocrCacheRunOptions = (): Pick<
    CreateRunDto,
    "persistOcrCache" | "ocrCacheBaselineRunId"
  > => {
    if (ocrCacheBaselineRunId) {
      return { ocrCacheBaselineRunId: ocrCacheBaselineRunId };
    }
    if (persistOcrCache) {
      return { persistOcrCache: true };
    }
    return {};
  };

  const handleStartRun = async () => {
    const run = await startRun(ocrCacheRunOptions());
    navigate(`/benchmarking/projects/${definition.projectId}/runs/${run.id}`);
  };

  const handleStartRunWithCandidate = async () => {
    const candidateId = generateResult?.candidateWorkflowVersionId;
    if (!candidateId) return;
    try {
      const run = await startRun({
        candidateWorkflowVersionId: candidateId,
        ...ocrCacheRunOptions(),
      });
      navigate(`/benchmarking/projects/${definition.projectId}/runs/${run.id}`);
      notifications.show({
        title: "Benchmark started",
        message: "Run is using the generated candidate workflow.",
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: "Failed to start run",
        message:
          error instanceof Error ? error.message : "Could not start benchmark",
        color: "red",
      });
    }
  };

  const handleGenerateCandidate = async () => {
    try {
      const result = await generateCandidate({});
      if (result?.status === "candidate_created") {
        notifications.show({
          title: "Candidate workflow created",
          message:
            "Review it in the workflow editor if you want, then use “start benchmark with this candidate” below.",
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
      baseline_mismatch_extraction: "Baseline mismatch extraction",
      tool_manifest: "Tool manifest",
      workflow_load: "Workflow load",
      prompt_build: "LLM prompt",
      llm_request: "LLM request metadata",
      llm_response: "LLM response",
      recommendation_parse: "Recommendation parsing",
      apply_recommendations: "Apply recommendations",
      candidate_creation: "Candidate creation",
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
                description="Store azure OCR per sample for replay (recommended for improvement pipeline)"
                size="sm"
                data-testid="persist-ocr-cache-switch"
              />
              {cacheSources.length > 0 && (
                <Select
                  label="Use cached OCR from"
                  placeholder="None (fresh OCR)"
                  clearable
                  data={cacheSources.map((s) => ({
                    value: s.id,
                    label: `${s.definitionName} — ${new Date(s.completedAt).toLocaleDateString()} (${s.sampleCount} samples)`,
                  }))}
                  value={ocrCacheBaselineRunId}
                  onChange={setOcrCacheBaselineRunId}
                  size="sm"
                  styles={{ root: { minWidth: 300 } }}
                  data-testid="ocr-cache-source-select"
                />
              )}
              <Button
                leftSection={<IconPlayerPlay size={16} />}
                onClick={handleStartRun}
                loading={isStarting}
                data-testid="start-run-btn"
              >
                Start run
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

          <DataTable data-testid="definition-info-table">
            <DataTable.Tbody>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Dataset version</DataTable.Td>
                <DataTable.Td>
                  {definition.datasetVersion.datasetName}{" "}
                  {definition.datasetVersion.version}
                </DataTable.Td>
              </DataTable.Tr>
              {definition.split && (
                <DataTable.Tr>
                  <DataTable.Td fw={500}>Split</DataTable.Td>
                  <DataTable.Td>
                    {definition.split.name} ({definition.split.type})
                  </DataTable.Td>
                </DataTable.Tr>
              )}
              <DataTable.Tr>
                <DataTable.Td fw={500}>Workflow</DataTable.Td>
                <DataTable.Td>
                  {definition.workflow.name} v{definition.workflow.version}
                  <Text size="xs" c="dimmed" mt={4}>
                    Lineage <Code>{definition.workflow.id}</Code> · Pinned
                    version <Code>{definition.workflow.workflowVersionId}</Code>
                  </Text>
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Workflow config hash</DataTable.Td>
                <DataTable.Td>
                  <Code>{definition.workflowConfigHash.substring(0, 12)}</Code>
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Evaluator type</DataTable.Td>
                <DataTable.Td>{definition.evaluatorType}</DataTable.Td>
              </DataTable.Tr>
            </DataTable.Tbody>
          </DataTable>

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
            Extract field mismatches from the baseline run and get AI tool
            recommendations to generate a candidate workflow. Requires a
            promoted baseline run. Optionally review the candidate in the
            workflow editor, then start a benchmark with this candidate (uses
            the OCR cache options above). When the run completes, you can apply
            the candidate to the base lineage from the run page.
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
                <Stack gap="sm">
                  <Group gap="lg" align="flex-start" wrap="wrap">
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
                  <Button
                    leftSection={<IconPlayerPlay size={16} />}
                    onClick={handleStartRunWithCandidate}
                    loading={isStarting}
                    data-testid="start-run-with-candidate-btn"
                  >
                    Start benchmark with this candidate
                  </Button>
                </Stack>
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
              {showDebugLog ? "hide debug log" : "view debug log"}
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
                                    System message
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
                                    User message
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
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {JSON.stringify(
                              entry.data,
                              (_key, value) => {
                                if (
                                  typeof value === "string" &&
                                  value.startsWith("{")
                                ) {
                                  try {
                                    return JSON.parse(value);
                                  } catch {
                                    return value;
                                  }
                                }
                                return value;
                              },
                              2,
                            )}
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
                  Workflow config overrides
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
                  Current baseline
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
                  View baseline run
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

            <DataTable data-testid="baseline-info-table">
              <DataTable.Tbody>
                <DataTable.Tr>
                  <DataTable.Td fw={500}>Run ID</DataTable.Td>
                  <DataTable.Td>
                    <Code data-testid="baseline-run-id">
                      {definition.baselineRun.id.substring(0, 12)}...
                    </Code>
                  </DataTable.Td>
                </DataTable.Tr>
                <DataTable.Tr>
                  <DataTable.Td fw={500}>Status</DataTable.Td>
                  <DataTable.Td>
                    <Badge
                      color={getStatusBadgeColor(definition.baselineRun.status)}
                      data-testid="baseline-status-badge"
                    >
                      {definition.baselineRun.status}
                    </Badge>
                  </DataTable.Td>
                </DataTable.Tr>
                <DataTable.Tr>
                  <DataTable.Td fw={500}>Completed at</DataTable.Td>
                  <DataTable.Td data-testid="baseline-completed-at">
                    {definition.baselineRun.completedAt
                      ? new Date(
                          definition.baselineRun.completedAt,
                        ).toLocaleString()
                      : "—"}
                  </DataTable.Td>
                </DataTable.Tr>
              </DataTable.Tbody>
            </DataTable>

            <Stack gap="xs">
              <Title order={5} data-testid="baseline-metrics-heading">
                Key metrics
              </Title>
              <DataTable striped data-testid="baseline-metrics-table">
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Metric</DataTable.Th>
                    <DataTable.Th>Value</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {Object.entries(definition.baselineRun.metrics).map(
                    ([key, value]) => {
                      // Skip non-numeric metrics (like perSampleResults, fieldErrorBreakdown, etc.)
                      if (typeof value !== "number") return null;

                      return (
                        <DataTable.Tr key={key}>
                          <DataTable.Td>{key}</DataTable.Td>
                          <DataTable.Td>
                            <Code>{value.toFixed(4)}</Code>
                          </DataTable.Td>
                        </DataTable.Tr>
                      );
                    },
                  )}
                </DataTable.Tbody>
              </DataTable>
            </Stack>

            <Stack gap="xs">
              <Title order={5} data-testid="baseline-thresholds-heading">
                Regression thresholds
              </Title>
              <DataTable striped data-testid="baseline-thresholds-table">
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Metric</DataTable.Th>
                    <DataTable.Th>Type</DataTable.Th>
                    <DataTable.Th>Threshold</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {definition.baselineRun.baselineThresholds.map(
                    (threshold) => (
                      <DataTable.Tr key={threshold.metricName}>
                        <DataTable.Td>{threshold.metricName}</DataTable.Td>
                        <DataTable.Td>
                          <Badge
                            variant="light"
                            data-testid={`threshold-type-${threshold.metricName}`}
                          >
                            {threshold.type === "relative"
                              ? "Relative (%)"
                              : "Absolute"}
                          </Badge>
                        </DataTable.Td>
                        <DataTable.Td>
                          <Code
                            data-testid={`threshold-value-${threshold.metricName}`}
                          >
                            {threshold.type === "relative"
                              ? `${(threshold.value * 100).toFixed(0)}%`
                              : threshold.value.toFixed(4)}
                          </Code>
                        </DataTable.Td>
                      </DataTable.Tr>
                    ),
                  )}
                </DataTable.Tbody>
              </DataTable>
            </Stack>

            <Stack gap="xs">
              <Group gap="xs">
                <IconHistory size={16} />
                <Title order={5} data-testid="baseline-history-heading">
                  Baseline change history
                </Title>
              </Group>
              {isLoadingHistory ? (
                <Loader size="sm" />
              ) : baselineHistory.length === 0 ? (
                <Text size="sm" c="dimmed" data-testid="no-baseline-history">
                  No baseline changes recorded yet.
                </Text>
              ) : (
                <DataTable striped data-testid="baseline-history-table">
                  <DataTable.Thead>
                    <DataTable.Tr>
                      <DataTable.Th>Promoted at</DataTable.Th>
                      <DataTable.Th>Run ID</DataTable.Th>
                      <DataTable.Th>User</DataTable.Th>
                    </DataTable.Tr>
                  </DataTable.Thead>
                  <DataTable.Tbody>
                    {baselineHistory.map((entry, index) => (
                      <DataTable.Tr
                        key={index}
                        data-testid={`baseline-history-row-${index}`}
                      >
                        <DataTable.Td
                          data-testid={`baseline-history-date-${index}`}
                        >
                          {new Date(entry.promotedAt).toLocaleString()}
                        </DataTable.Td>
                        <DataTable.Td>
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
                        </DataTable.Td>
                        <DataTable.Td
                          data-testid={`baseline-history-user-${index}`}
                        >
                          {entry.actorId}
                        </DataTable.Td>
                      </DataTable.Tr>
                    ))}
                  </DataTable.Tbody>
                </DataTable>
              )}
            </Stack>
          </Stack>
        </Card>
      )}

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="evaluator-config-heading">
            Evaluator configuration
          </Title>
          <Code block data-testid="evaluator-config-json">
            {JSON.stringify(definition.evaluatorConfig, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="runtime-settings-heading">
            Runtime settings
          </Title>
          <Code block data-testid="runtime-settings-json">
            {JSON.stringify(definition.runtimeSettings, null, 2)}
          </Code>
        </Stack>
      </Card>

      <Card>
        <Stack gap="md">
          <Title order={4} data-testid="schedule-config-heading">
            Schedule configuration
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
              Run history
            </Title>
            <DataTable striped highlightOnHover data-testid="run-history-table">
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Run ID</DataTable.Th>
                  <DataTable.Th>Status</DataTable.Th>
                  <DataTable.Th>Started</DataTable.Th>
                  <DataTable.Th>Completed</DataTable.Th>
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {definition.runHistory.map((run) => (
                  <DataTable.Tr
                    key={run.id}
                    data-testid={`run-history-row-${run.id}`}
                  >
                    <DataTable.Td>
                      <Code>{run.id.substring(0, 8)}</Code>
                    </DataTable.Td>
                    <DataTable.Td>
                      <Badge
                        color={getStatusBadgeColor(run.status)}
                        data-testid={`run-status-badge-${run.id}`}
                      >
                        {run.status}
                      </Badge>
                    </DataTable.Td>
                    <DataTable.Td>
                      {run.startedAt
                        ? new Date(run.startedAt).toLocaleString()
                        : "—"}
                    </DataTable.Td>
                    <DataTable.Td>
                      {run.completedAt
                        ? new Date(run.completedAt).toLocaleString()
                        : "—"}
                    </DataTable.Td>
                  </DataTable.Tr>
                ))}
              </DataTable.Tbody>
            </DataTable>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
