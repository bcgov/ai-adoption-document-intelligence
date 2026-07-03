import {
  IconAlertCircle,
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconDownload,
  IconExternalLink,
  IconSparkles,
  IconTrophy,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTemplateModels } from "@/features/annotation/template-models/hooks/useTemplateModels";
import { TEMPORAL_UI_URL } from "@/shared/constants";
import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Code,
  DataTable,
  Drawer,
  Group,
  Loader,
  Modal,
  notifications,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "../../../ui";
import { ArtifactViewer } from "../components/ArtifactViewer";
import { BaselineThresholdDialog } from "../components/BaselineThresholdDialog";
import { ErrorDetectionAnalysis } from "../components/ErrorDetectionAnalysis";
import { useDeriveProfile } from "../hooks/useConfusionProfiles";
import { useApplyToBaseWorkflow, useDefinition } from "../hooks/useDefinitions";
import { useProject } from "../hooks/useProjects";
import {
  useArtifacts,
  useDownloadRun,
  useDrillDown,
  useOcrCacheSources,
  usePerSampleResults,
  usePromoteBaseline,
  useRun,
  useStartRun,
} from "../hooks/useRuns";
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

/**
 * Renders a string with invisible characters shown as visible symbols.
 * Trailing/leading whitespace and control characters are highlighted.
 */
function VisibleWhitespace({ value }: { value: string }) {
  const replacements: Array<{ char: string; label: string }> = [
    { char: "\n", label: "\\n" },
    { char: "\r", label: "\\r" },
    { char: "\t", label: "\\t" },
    { char: "\u00A0", label: "\\u00A0" },
    { char: "\u200B", label: "\\u200B" },
    { char: "\uFEFF", label: "\\uFEFF" },
  ];

  // Check for trailing/leading spaces
  const leadingSpaces = value.length - value.trimStart().length;
  const trailingSpaces = value.length - value.trimEnd().length;
  const hasSpecialChars = replacements.some((r) => value.includes(r.char));

  if (leadingSpaces === 0 && trailingSpaces === 0 && !hasSpecialChars) {
    return <>{value}</>;
  }

  const parts: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    const replacement = replacements.find((r) => r.char === ch);
    const isLeadingSpace = ch === " " && i < leadingSpaces;
    const isTrailingSpace = ch === " " && i >= value.length - trailingSpaces;

    if (replacement) {
      parts.push(
        <Badge
          key={key++}
          size="xs"
          color="red"
          variant="filled"
          style={{ fontFamily: "monospace", verticalAlign: "text-bottom" }}
        >
          {replacement.label}
        </Badge>,
      );
    } else if (isLeadingSpace || isTrailingSpace) {
      parts.push(
        <Badge
          key={key++}
          size="xs"
          color="orange"
          variant="light"
          style={{ fontFamily: "monospace", verticalAlign: "text-bottom" }}
        >
          &#x2423;
        </Badge>,
      );
    } else {
      let end = i + 1;
      while (end < value.length) {
        const nextCh = value[end];
        const nextIsSpecial = replacements.some((r) => r.char === nextCh);
        const nextIsLeading = nextCh === " " && end < leadingSpaces;
        const nextIsTrailing =
          nextCh === " " && end >= value.length - trailingSpaces;
        if (nextIsSpecial || nextIsLeading || nextIsTrailing) break;
        end++;
      }
      parts.push(<span key={key++}>{value.slice(i, end)}</span>);
      i = end - 1;
    }
  }

  return <>{parts}</>;
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
      // Null-like values: null, undefined, empty string, "null" string
      const isNullLike = (v: unknown): boolean =>
        v === null || v === undefined || v === "" || v === "null";

      let errorType = "mismatch";
      if (
        !isNullLike(fieldResult.expected) &&
        isNullLike(fieldResult.predicted)
      ) {
        errorType = "missing";
      } else if (
        isNullLike(fieldResult.expected) &&
        !isNullLike(fieldResult.predicted)
      ) {
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
        {affectedSamples.length} sample{affectedSamples.length !== 1 ? "s" : ""}{" "}
        with errors on this field
      </Text>
      <DataTable
        striped
        highlightOnHover
        data-testid="field-error-detail-table"
      >
        <DataTable.Thead>
          <DataTable.Tr>
            <DataTable.Th>Sample ID</DataTable.Th>
            <DataTable.Th>Type</DataTable.Th>
            <DataTable.Th>Expected</DataTable.Th>
            <DataTable.Th>Predicted</DataTable.Th>
          </DataTable.Tr>
        </DataTable.Thead>
        <DataTable.Tbody>
          {affectedSamples.map((s) => (
            <DataTable.Tr key={s.sampleId}>
              <DataTable.Td>
                <Code>{s.sampleId}</Code>
              </DataTable.Td>
              <DataTable.Td>
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
              </DataTable.Td>
              <DataTable.Td>
                <Code>
                  {s.expected !== undefined ? (
                    typeof s.expected === "string" ? (
                      <VisibleWhitespace value={s.expected} />
                    ) : (
                      JSON.stringify(s.expected)
                    )
                  ) : (
                    "-"
                  )}
                </Code>
              </DataTable.Td>
              <DataTable.Td>
                <Code>
                  {s.predicted !== undefined ? (
                    typeof s.predicted === "string" ? (
                      <VisibleWhitespace value={s.predicted} />
                    ) : (
                      JSON.stringify(s.predicted)
                    )
                  ) : (
                    "-"
                  )}
                </Code>
              </DataTable.Td>
            </DataTable.Tr>
          ))}
        </DataTable.Tbody>
      </DataTable>
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
  const [persistOcrCacheOnRerun, setPersistOcrCacheOnRerun] = useState(true);
  const [ocrCacheBaselineRunId, setOcrCacheBaselineRunId] = useState<
    string | null
  >(null);
  const [applyCandidateModalOpen, setApplyCandidateModalOpen] = useState(false);
  const [cleanupArtifacts, setCleanupArtifacts] = useState(true);
  const [confusionModalOpen, setConfusionModalOpen] = useState(false);
  const [confusionName, setConfusionName] = useState("");
  const [confusionDescription, setConfusionDescription] = useState("");
  const [confusionError, setConfusionError] = useState<string | null>(null);
  const [suggestFormatsModalOpen, setSuggestFormatsModalOpen] = useState(false);
  const [selectedTemplateModelId, setSelectedTemplateModelId] = useState<
    string | null
  >(null);

  // Enable polling for non-terminal states
  const { run, isLoading, cancelRun, isCancelling } = useRun(
    projectId,
    runId || "",
    true, // Enable polling
  );

  const { definition } = useDefinition(projectId, run?.definitionId || "");
  const { cacheSources } = useOcrCacheSources(
    projectId,
    definition?.datasetVersion?.id ?? "",
  );
  const { project } = useProject(projectId);
  const deriveMutation = useDeriveProfile(project?.groupId ?? "");
  const { templateModels } = useTemplateModels();
  const applyToBaseMutation = useApplyToBaseWorkflow(projectId ?? "");
  const isApplyingToBase = applyToBaseMutation.isPending;
  const { drillDown } = useDrillDown(projectId, runId || "");
  const { artifacts, total: totalArtifacts } = useArtifacts(
    projectId,
    runId || "",
    artifactTypeFilter || undefined,
  );

  // Fetch all per-sample results when field drawer is open
  const { results: allSampleResults } = usePerSampleResults(
    drawerField !== null ? projectId : "",
    drawerField !== null ? runId || "" : "",
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

  const downloadRunMutation = useDownloadRun(projectId, runId || "");
  const handleDownloadRun = () => {
    downloadRunMutation.mutate(undefined, {
      onError: (err: Error) => {
        notifications.show({
          title: "Download failed",
          message: err.message ?? "Could not download benchmark run",
          color: "red",
        });
      },
    });
  };

  const handleConfusionOpen = () => {
    setConfusionName("");
    setConfusionDescription("");
    setConfusionError(null);
    setConfusionModalOpen(true);
  };

  const handleConfusionSubmit = () => {
    if (!confusionName.trim()) {
      setConfusionError("Name is required.");
      return;
    }
    setConfusionError(null);
    deriveMutation.mutate(
      {
        name: confusionName.trim(),
        description: confusionDescription.trim() || undefined,
        sources: { benchmarkRunIds: [runId || ""] },
      },
      {
        onSuccess: () => {
          setConfusionModalOpen(false);
          notifications.show({
            title: "Confusion Profile Created",
            message:
              "Confusion profile has been derived from this benchmark run.",
            color: "green",
          });
        },
        onError: (err) => {
          setConfusionError(
            err instanceof Error
              ? err.message
              : "Failed to derive confusion profile.",
          );
        },
      },
    );
  };

  const handleSuggestFormatsOpen = () => {
    setSelectedTemplateModelId(null);
    setSuggestFormatsModalOpen(true);
  };

  const handleSuggestFormatsNavigate = () => {
    if (!selectedTemplateModelId || !runId) return;
    setSuggestFormatsModalOpen(false);
    navigate(
      `/template-models/${selectedTemplateModelId}?suggestFromRun=${runId}`,
    );
  };

  const handleRerun = async () => {
    if (!run) return;
    const newRun = await startRun({
      persistOcrCache: persistOcrCacheOnRerun,
      ...(ocrCacheBaselineRunId ? { ocrCacheBaselineRunId } : {}),
    });
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
    thresholds: Array<{
      metricName: string;
      type: "absolute" | "relative";
      value: number;
    }>,
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
            message:
              error instanceof Error
                ? error.message
                : "Failed to promote run to baseline",
            color: "red",
          });
        },
      },
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
  const canEditThresholds =
    run.isBaseline &&
    run.baselineThresholds &&
    run.baselineThresholds.length > 0;
  const temporalUrl = `${TEMPORAL_UI_URL}/namespaces/default/workflows/${run.temporalWorkflowId}`;

  const canApplyCandidateWorkflow =
    run.status === "completed" &&
    definition?.workflow?.workflowKind === "benchmark_candidate" &&
    !!definition?.workflow?.sourceWorkflowId;

  const candidateWorkflowVersionId = definition?.workflow?.workflowVersionId;

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
      <Stack gap="xs">
        <Group>
          <Button
            variant="subtle"
            leftSection={<IconArrowLeft size={16} />}
            onClick={() => navigate(`/benchmarking/projects/${projectId}`)}
            data-testid="back-to-project-btn"
          >
            Back
          </Button>
        </Group>

        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack
            className="bcds-page-header__title-block"
            style={{ gap: "var(--layout-margin-xsmall)" }}
          >
            <Group gap="sm" align="center" wrap="wrap">
              <Title order={2} data-testid="run-definition-name" mt={0} mb={0}>
                {run.definitionName}
              </Title>
              <Badge
                variant="light"
                color={getStatusColor(run.status)}
                data-testid="run-status-badge"
              >
                {run.status}
              </Badge>
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
          </Stack>

          <Group className="bcds-page-header__meta">
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
            {canApplyCandidateWorkflow && candidateWorkflowVersionId && (
              <>
                <Button
                  variant="light"
                  color="gray"
                  leftSection={<IconSparkles size={16} />}
                  loading={isApplyingToBase}
                  disabled={isApplyingToBase}
                  onClick={() => setApplyCandidateModalOpen(true)}
                  data-testid="apply-candidate-btn"
                >
                  Apply to base workflow
                </Button>
                <Modal
                  opened={applyCandidateModalOpen}
                  onClose={() => setApplyCandidateModalOpen(false)}
                  title="Apply candidate to base workflow"
                  data-testid="apply-candidate-confirm-modal"
                >
                  <Stack gap="md">
                    <Text size="sm">
                      Copy this candidate workflow config as a new version on
                      the base workflow lineage.
                    </Text>
                    <Switch
                      checked={cleanupArtifacts}
                      onChange={(e) =>
                        setCleanupArtifacts(e.currentTarget.checked)
                      }
                      label="Clean up candidate artifacts"
                      description="Delete the candidate lineage, test definitions, and their runs"
                      size="sm"
                      data-testid="cleanup-artifacts-switch"
                    />
                    <Group justify="flex-end" gap="xs">
                      <Button
                        variant="subtle"
                        onClick={() => setApplyCandidateModalOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          try {
                            await applyToBaseMutation.mutateAsync({
                              candidateWorkflowVersionId,
                              cleanupCandidateArtifacts: cleanupArtifacts,
                            });
                            setApplyCandidateModalOpen(false);
                            notifications.show({
                              title: "Success",
                              message: "Candidate applied to base workflow",
                              color: "green",
                            });
                          } catch (error) {
                            notifications.show({
                              title: "Error",
                              message:
                                error instanceof Error
                                  ? error.message
                                  : "Failed to apply candidate",
                              color: "red",
                            });
                          }
                        }}
                        data-testid="apply-candidate-confirm-btn"
                      >
                        Apply
                      </Button>
                    </Group>
                  </Stack>
                </Modal>
              </>
            )}
            {canRerun && (
              <Group gap="sm" wrap="nowrap" align="flex-end">
                <Switch
                  checked={persistOcrCacheOnRerun}
                  onChange={(e) =>
                    setPersistOcrCacheOnRerun(e.currentTarget.checked)
                  }
                  label="Persist OCR cache"
                  description="For replay on later runs"
                  size="sm"
                  data-testid="rerun-persist-ocr-cache-switch"
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
                    data-testid="rerun-ocr-cache-source-select"
                  />
                )}
                <Button
                  onClick={handleRerun}
                  loading={isStarting}
                  data-testid="rerun-btn"
                >
                  Re-run
                </Button>
              </Group>
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
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleDownloadRun}
              loading={downloadRunMutation.isPending}
              data-testid="download-run-btn"
            >
              Download Results
            </Button>
            {run.status === "completed" && project?.groupId && (
              <Button
                variant="light"
                onClick={handleConfusionOpen}
                data-testid="create-confusion-profile-btn"
              >
                Create Confusion Profile
              </Button>
            )}
            {run.status === "completed" && project?.groupId && (
              <Button
                variant="light"
                leftSection={<IconSparkles size={16} />}
                onClick={handleSuggestFormatsOpen}
                data-testid="suggest-formats-btn"
              >
                Suggest Formats
              </Button>
            )}
          </Group>
        </Group>

        <Group gap="xs" wrap="wrap">
          <Text c="dimmed" size="sm" data-testid="run-id-text">
            Run ID: {run.id}
          </Text>
          {Boolean(
            (run.params as Record<string, unknown>)?.ocrCacheBaselineRunId,
          ) && (
            <Badge
              color="cyan"
              variant="light"
              size="lg"
              data-testid="ocr-cache-source-badge"
            >
              OCR cached from run{" "}
              {String(
                (run.params as Record<string, unknown>).ocrCacheBaselineRunId,
              ).slice(0, 8)}
              ...
            </Badge>
          )}
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

      {run.status === "completed" &&
        !run.baselineComparison &&
        !run.isBaseline && (
          <Alert
            icon={<IconAlertCircle size={16} />}
            color="blue"
            title="No Baseline Set"
            data-testid="no-baseline-alert"
          >
            <Stack gap="sm" align="flex-start">
              <Text>
                No baseline has been set for this definition. Promote this run
                to baseline to enable performance comparisons for future runs.
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
          <DataTable data-testid="run-info-table">
            <DataTable.Tbody>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Status</DataTable.Td>
                <DataTable.Td>
                  <Badge color={getStatusColor(run.status)}>{run.status}</Badge>
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Started At</DataTable.Td>
                <DataTable.Td>
                  {run.startedAt
                    ? new Date(run.startedAt).toLocaleString()
                    : "-"}
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Completed At</DataTable.Td>
                <DataTable.Td>
                  {run.completedAt
                    ? new Date(run.completedAt).toLocaleString()
                    : "-"}
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Duration</DataTable.Td>
                <DataTable.Td>
                  {formatDurationFromDates(run.startedAt, run.completedAt)}
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Temporal Workflow</DataTable.Td>
                <DataTable.Td>
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
                </DataTable.Td>
              </DataTable.Tr>
              <DataTable.Tr>
                <DataTable.Td fw={500}>Worker Git SHA</DataTable.Td>
                <DataTable.Td>
                  <Code>{run.workerGitSha}</Code>
                </DataTable.Td>
              </DataTable.Tr>
              {run.workerImageDigest && (
                <DataTable.Tr>
                  <DataTable.Td fw={500}>Worker Image Digest</DataTable.Td>
                  <DataTable.Td>
                    <Code>{run.workerImageDigest}</Code>
                  </DataTable.Td>
                </DataTable.Tr>
              )}
              <DataTable.Tr>
                <DataTable.Td fw={500}>Is Baseline</DataTable.Td>
                <DataTable.Td>
                  {run.isBaseline ? (
                    <Badge color="green">Yes</Badge>
                  ) : (
                    <Badge color="gray">No</Badge>
                  )}
                </DataTable.Td>
              </DataTable.Tr>
              {run.isBaseline && (
                <DataTable.Tr>
                  <DataTable.Td fw={500}>Retention Policy</DataTable.Td>
                  <DataTable.Td>
                    <Text size="sm" c="dimmed">
                      Protected from retention - baseline runs are exempt from
                      cleanup
                    </Text>
                  </DataTable.Td>
                </DataTable.Tr>
              )}
            </DataTable.Tbody>
          </DataTable>
        </Stack>
      </Card>

      {run.status === "completed" && run.baselineComparison && (
        <Accordion
          variant="contained"
          data-testid="baseline-comparison-accordion"
        >
          <Accordion.Item value="baseline-comparison">
            <Accordion.Control>
              <Title order={3} data-testid="baseline-comparison-heading">
                Baseline Comparison
              </Title>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="md">
                <Text c="dimmed" size="sm">
                  Comparing against baseline run:{" "}
                  <Code>{run.baselineComparison.baselineRunId}</Code>
                </Text>
                <DataTable
                  striped
                  highlightOnHover
                  data-testid="baseline-comparison-table"
                >
                  <DataTable.Thead>
                    <DataTable.Tr>
                      <DataTable.Th>Metric</DataTable.Th>
                      <DataTable.Th>Current</DataTable.Th>
                      <DataTable.Th>Baseline</DataTable.Th>
                      <DataTable.Th>Delta</DataTable.Th>
                      <DataTable.Th>Delta %</DataTable.Th>
                      <DataTable.Th>Status</DataTable.Th>
                    </DataTable.Tr>
                  </DataTable.Thead>
                  <DataTable.Tbody>
                    {run.baselineComparison.metricComparisons.map(
                      (comparison) => (
                        <DataTable.Tr key={comparison.metricName}>
                          <DataTable.Td fw={500}>
                            {comparison.metricName}
                          </DataTable.Td>
                          <DataTable.Td>
                            <Code>{comparison.currentValue.toFixed(4)}</Code>
                          </DataTable.Td>
                          <DataTable.Td>
                            <Code>{comparison.baselineValue.toFixed(4)}</Code>
                          </DataTable.Td>
                          <DataTable.Td>
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
                          </DataTable.Td>
                          <DataTable.Td>
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
                          </DataTable.Td>
                          <DataTable.Td>
                            <Badge color={comparison.passed ? "green" : "red"}>
                              {comparison.passed ? "PASS" : "FAIL"}
                            </Badge>
                          </DataTable.Td>
                        </DataTable.Tr>
                      ),
                    )}
                  </DataTable.Tbody>
                </DataTable>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}

      {run.status === "completed" && run.metrics && (
        <Accordion
          variant="contained"
          data-testid="aggregated-metrics-accordion"
        >
          <Accordion.Item value="metrics">
            <Accordion.Control>
              <Title order={3} data-testid="aggregated-metrics-heading">
                Aggregated Metrics
              </Title>
            </Accordion.Control>
            <Accordion.Panel>
              <DataTable
                striped
                highlightOnHover
                data-testid="aggregated-metrics-table"
              >
                <DataTable.Thead>
                  <DataTable.Tr>
                    <DataTable.Th>Metric Name</DataTable.Th>
                    <DataTable.Th>Value</DataTable.Th>
                  </DataTable.Tr>
                </DataTable.Thead>
                <DataTable.Tbody>
                  {Object.entries(run.metrics).map(([key, value]) => (
                    <DataTable.Tr key={key}>
                      <DataTable.Td>{key}</DataTable.Td>
                      <DataTable.Td>
                        <Code>
                          {typeof value === "number"
                            ? value.toFixed(4)
                            : JSON.stringify(value)}
                        </Code>
                      </DataTable.Td>
                    </DataTable.Tr>
                  ))}
                </DataTable.Tbody>
              </DataTable>
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
                <DataTable striped data-testid="params-table">
                  <DataTable.Tbody>
                    {Object.entries(run.params).map(([key, value]) => (
                      <DataTable.Tr key={key}>
                        <DataTable.Td fw={500}>
                          {key === "ocrCacheBaselineRunId"
                            ? "OCR Cache Source Run"
                            : key}
                        </DataTable.Td>
                        <DataTable.Td>
                          {key === "ocrCacheBaselineRunId" ? (
                            <Anchor
                              component="button"
                              onClick={() =>
                                navigate(
                                  `/benchmarking/projects/${projectId}/runs/${String(value)}`,
                                )
                              }
                            >
                              {String(value)}
                            </Anchor>
                          ) : (
                            <Code>{JSON.stringify(value)}</Code>
                          )}
                        </DataTable.Td>
                      </DataTable.Tr>
                    ))}
                  </DataTable.Tbody>
                </DataTable>
              </Stack>
            )}
            {(() => {
              if (!run.params || typeof run.params !== "object") return null;
              const params = run.params as Record<string, unknown>;
              const overrides = params.workflowConfigOverrides;
              if (
                !overrides ||
                typeof overrides !== "object" ||
                Object.keys(overrides as Record<string, unknown>).length === 0
              )
                return null;
              return (
                <Stack gap={4}>
                  <Text size="sm" fw={500}>
                    Workflow Config Overrides
                  </Text>
                  <Code block style={{ fontSize: 13 }}>
                    {JSON.stringify(overrides, null, 2)}
                  </Code>
                </Stack>
              );
            })()}
            {run.tags && Object.keys(run.tags).length > 0 && (
              <Stack gap="xs">
                <Text fw={500}>Tags</Text>
                <DataTable striped data-testid="tags-table">
                  <DataTable.Tbody>
                    {Object.entries(run.tags).map(([key, value]) => (
                      <DataTable.Tr key={key}>
                        <DataTable.Td fw={500}>{key}</DataTable.Td>
                        <DataTable.Td>
                          <Code>{JSON.stringify(value)}</Code>
                        </DataTable.Td>
                      </DataTable.Tr>
                    ))}
                  </DataTable.Tbody>
                </DataTable>
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
            <DataTable striped highlightOnHover data-testid="artifacts-table">
              <DataTable.Thead>
                <DataTable.Tr>
                  <DataTable.Th>Type</DataTable.Th>
                  <DataTable.Th>Sample ID</DataTable.Th>
                  <DataTable.Th>Node ID</DataTable.Th>
                  <DataTable.Th>Size</DataTable.Th>
                  <DataTable.Th>MIME Type</DataTable.Th>
                </DataTable.Tr>
              </DataTable.Thead>
              <DataTable.Tbody>
                {artifacts.map((artifact) => (
                  <DataTable.Tr
                    key={artifact.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedArtifact(artifact)}
                    data-testid={`artifact-row-${artifact.id}`}
                  >
                    <DataTable.Td>
                      <Badge>{artifact.type}</Badge>
                    </DataTable.Td>
                    <DataTable.Td>
                      <Code>{artifact.sampleId || "-"}</Code>
                    </DataTable.Td>
                    <DataTable.Td>
                      <Code>{artifact.nodeId || "-"}</Code>
                    </DataTable.Td>
                    <DataTable.Td>
                      {formatBytes(artifact.sizeBytes)}
                    </DataTable.Td>
                    <DataTable.Td>
                      <Code>{artifact.mimeType}</Code>
                    </DataTable.Td>
                  </DataTable.Tr>
                ))}
              </DataTable.Tbody>
            </DataTable>
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
                  <DataTable
                    striped
                    highlightOnHover
                    data-testid="field-error-breakdown-table"
                  >
                    <DataTable.Thead>
                      <DataTable.Tr>
                        <DataTable.Th>Field Name</DataTable.Th>
                        <DataTable.Th>Error Count</DataTable.Th>
                        <DataTable.Th>Error Rate</DataTable.Th>
                        <DataTable.Th />
                      </DataTable.Tr>
                    </DataTable.Thead>
                    <DataTable.Tbody>
                      {drillDown.fieldErrorBreakdown.map((field) => (
                        <DataTable.Tr
                          key={field.fieldName}
                          style={{ cursor: "pointer" }}
                          onClick={() => setDrawerField(field.fieldName)}
                          data-testid={`field-error-row-${field.fieldName}`}
                        >
                          <DataTable.Td>
                            <Code>{field.fieldName}</Code>
                          </DataTable.Td>
                          <DataTable.Td>{field.errorCount}</DataTable.Td>
                          <DataTable.Td>
                            <Code>{(field.errorRate * 100).toFixed(2)}%</Code>
                          </DataTable.Td>
                          <DataTable.Td>
                            <IconChevronRight size={16} color="gray" />
                          </DataTable.Td>
                        </DataTable.Tr>
                      ))}
                    </DataTable.Tbody>
                  </DataTable>
                </Stack>
              )}
          </Stack>
        </Card>
      )}

      {run.status === "completed" && (
        <ErrorDetectionAnalysis projectId={projectId} runId={runId || ""} />
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
          metrics={run.metrics as Record<string, number>}
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
          existingThresholds={
            isEditingThresholds
              ? run.baselineThresholds || undefined
              : undefined
          }
          isEditing={isEditingThresholds}
        />
      )}

      {/* Create Confusion Profile Modal */}
      <Modal
        opened={confusionModalOpen}
        onClose={() => setConfusionModalOpen(false)}
        title="Create Confusion Profile"
        data-testid="create-confusion-profile-modal"
      >
        <Stack gap="sm">
          <TextInput
            label="Name"
            required
            value={confusionName}
            onChange={(e) => setConfusionName(e.currentTarget.value)}
            data-testid="confusion-profile-name-input"
          />
          <TextInput
            label="Description"
            value={confusionDescription}
            onChange={(e) => setConfusionDescription(e.currentTarget.value)}
            data-testid="confusion-profile-description-input"
          />
          <Text size="sm" c="dimmed">
            Derives a character-level confusion matrix from mismatches in this
            benchmark run.
          </Text>
          {confusionError && (
            <Text c="red" size="sm">
              {confusionError}
            </Text>
          )}
          <Group justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => setConfusionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              loading={deriveMutation.isPending}
              onClick={handleConfusionSubmit}
              data-testid="confusion-profile-submit-btn"
            >
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Suggest Formats Modal */}
      <Modal
        opened={suggestFormatsModalOpen}
        onClose={() => setSuggestFormatsModalOpen(false)}
        title="Suggest Formats"
        data-testid="suggest-formats-modal"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Select a template model to open its field schema page and
            automatically suggest format specifications using data from this
            benchmark run.
          </Text>
          <Select
            label="Template Model"
            placeholder="Select a template model"
            data={templateModels.map((tm) => ({
              value: tm.id,
              label: tm.name,
            }))}
            value={selectedTemplateModelId}
            onChange={setSelectedTemplateModelId}
            data-testid="suggest-formats-template-model-select"
          />
          <Group justify="flex-end" mt="xs">
            <Button
              variant="default"
              onClick={() => setSuggestFormatsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedTemplateModelId}
              leftSection={<IconSparkles size={16} />}
              onClick={handleSuggestFormatsNavigate}
              data-testid="suggest-formats-navigate-btn"
            >
              Open Template Model
            </Button>
          </Group>
        </Stack>
      </Modal>

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
