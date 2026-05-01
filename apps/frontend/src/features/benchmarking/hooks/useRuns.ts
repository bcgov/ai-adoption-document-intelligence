import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { apiService } from "@/data/services/api.service";

interface RunSummary {
  id: string;
  definitionId: string;
  definitionName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  headlineMetrics: Record<string, unknown> | null;
  hasRegression?: boolean;
  regressedMetricCount?: number;
  isBaseline?: boolean;
  tags?: Record<string, unknown>;
}

interface MetricThreshold {
  metricName: string;
  type: "absolute" | "relative";
  value: number;
}

interface MetricComparison {
  metricName: string;
  currentValue: number;
  baselineValue: number;
  delta: number;
  deltaPercent: number;
  passed: boolean;
  threshold?: MetricThreshold;
}

interface BaselineComparison {
  baselineRunId: string;
  overallPassed: boolean;
  metricComparisons: MetricComparison[];
  regressedMetrics: string[];
}

interface RunDetails {
  id: string;
  definitionId: string;
  definitionName: string;
  projectId: string;
  status: string;
  temporalWorkflowId: string;
  workerImageDigest: string | null;
  workerGitSha: string;
  startedAt: string | null;
  completedAt: string | null;
  metrics: Record<string, unknown>;
  params: Record<string, unknown>;
  tags: Record<string, unknown>;
  error: string | null;
  isBaseline: boolean;
  baselineThresholds: MetricThreshold[] | null;
  baselineComparison: BaselineComparison | null;
  createdAt: string;
}

export interface CreateRunDto {
  tags?: Record<string, string>;
  /** When set, the run uses this workflow version's config (e.g. candidate). Otherwise the definition's pinned workflow is used. */
  candidateWorkflowVersionId?: string;
  /** Persist Azure OCR poll JSON per sample for replay (benchmark OCR cache). Backend defaults to true when omitted. */
  persistOcrCache?: boolean;
  /** Replay OCR from a completed benchmark run's cache (same definition). */
  ocrCacheBaselineRunId?: string;
}

interface GenerateCandidateResult {
  candidateWorkflowVersionId: string;
  candidateLineageId: string;
  recommendationsSummary: {
    applied: number;
    rejected: number;
    toolIds: string[];
  };
  analysis?: string;
  pipelineMessage?: string;
  rejectionDetails?: string[];
  status: "candidate_created" | "no_recommendations" | "error";
  error?: string;
}

/** Single entry in the pipeline debug log */
interface PipelineLogEntry {
  /** Pipeline step identifier */
  step: string;
  /** ISO 8601 timestamp when the step started */
  timestamp: string;
  /** Step duration in milliseconds */
  durationMs?: number;
  /** Step-specific payload */
  data: Record<string, unknown>;
}

interface PipelineDebugLogResult {
  entries: PipelineLogEntry[];
}

export const useRuns = (projectId: string) => {
  const queryClient = useQueryClient();

  const runsQuery = useQuery({
    queryKey: ["benchmark-runs", projectId],
    queryFn: async () => {
      const response = await apiService.get<RunSummary[]>(
        `/benchmark/projects/${projectId}/runs`,
      );
      return response.data || [];
    },
    enabled: !!projectId,
    refetchInterval: (query) => {
      const runs = query.state.data;
      if (!runs) return false;
      const hasNonTerminal = runs.some(
        (run) =>
          run.status !== "completed" &&
          run.status !== "failed" &&
          run.status !== "cancelled",
      );
      return hasNonTerminal ? 5000 : false;
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      await apiService.delete(`/benchmark/projects/${projectId}/runs/${runId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
    },
  });

  return {
    runs: runsQuery.data || [],
    isLoading: runsQuery.isLoading,
    error: runsQuery.error,
    deleteRun: deleteRunMutation.mutate,
    isDeletingRun: deleteRunMutation.isPending,
  };
};

export const useRun = (projectId: string, runId: string, polling = false) => {
  const queryClient = useQueryClient();

  const runQuery = useQuery({
    queryKey: ["benchmark-run", projectId, runId],
    queryFn: async () => {
      const response = await apiService.get<RunDetails>(
        `/benchmark/projects/${projectId}/runs/${runId}`,
      );
      return response.data;
    },
    enabled: !!projectId && !!runId,
    refetchInterval: (query) => {
      // Poll every 5 seconds if enabled and run is not in terminal state
      if (!polling || !query.state.data) return false;
      const status = query.state.data.status;
      const isTerminal =
        status === "completed" || status === "failed" || status === "cancelled";
      return isTerminal ? false : 5000;
    },
  });

  // When a run transitions to a terminal state, invalidate related queries
  const previousStatusRef = useRef<string | undefined>(undefined);
  const currentStatus = runQuery.data?.status;
  useEffect(() => {
    const prevStatus = previousStatusRef.current;
    previousStatusRef.current = currentStatus;
    if (!prevStatus || !currentStatus) return;
    const wasRunning = prevStatus === "pending" || prevStatus === "running";
    const isTerminal =
      currentStatus === "completed" ||
      currentStatus === "failed" ||
      currentStatus === "cancelled";
    if (wasRunning && isTerminal) {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-drill-down", projectId, runId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-artifacts", projectId, runId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
    }
  }, [currentStatus, projectId, runId, queryClient]);

  const cancelRunMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post<RunDetails>(
        `/benchmark/projects/${projectId}/runs/${runId}/cancel`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-run", projectId, runId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
    },
  });

  return {
    run: runQuery.data,
    isLoading: runQuery.isLoading,
    error: runQuery.error,
    cancelRun: cancelRunMutation.mutate,
    isCancelling: cancelRunMutation.isPending,
  };
};

export const useMultipleRuns = (projectId: string, runIds: string[]) => {
  const runsQuery = useQuery({
    queryKey: ["benchmark-multiple-runs", projectId, ...runIds.sort()],
    queryFn: async () => {
      // Fetch all runs in parallel
      const promises = runIds.map((runId) =>
        apiService.get<RunDetails>(
          `/benchmark/projects/${projectId}/runs/${runId}`,
        ),
      );
      const responses = await Promise.all(promises);
      return responses.map((r) => r.data);
    },
    enabled: !!projectId && runIds.length > 0,
  });

  return {
    runs: runsQuery.data || [],
    isLoading: runsQuery.isLoading,
    error: runsQuery.error,
  };
};

export const useStartRun = (projectId: string, definitionId: string) => {
  const queryClient = useQueryClient();

  const startRunMutation = useMutation({
    mutationFn: async (data: CreateRunDto = {}) => {
      const response = await apiService.post<RunDetails>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/runs`,
        data,
      );
      if (!response.success || response.data == null || !response.data.id) {
        throw new Error(response.message ?? "Failed to start benchmark run");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definition", projectId, definitionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
      // Starting a run freezes the dataset version — invalidate all dataset version queries
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions"],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-all-dataset-versions"],
      });
    },
  });

  return {
    startRun: startRunMutation.mutateAsync,
    isStarting: startRunMutation.isPending,
    startedRun: startRunMutation.data,
  };
};

export const useGenerateCandidate = (
  projectId: string,
  definitionId: string,
) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (
      body: {
        hitlFilters?: Record<string, unknown>;
        normalizeFieldsEmptyValueCoercion?: "none" | "blank" | "null";
      } = {},
    ) => {
      const response = await apiService.post<GenerateCandidateResult>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/generate`,
        body,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definition", projectId, definitionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
    },
  });

  return {
    generateCandidate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    result: mutation.data,
    error: mutation.error,
  };
};

/**
 * Fetch the pipeline debug log for a definition.
 * Only fetches when `enabled` is true (i.e., user opened the debug log section).
 */
export const usePipelineDebugLog = (
  projectId: string,
  definitionId: string,
  enabled: boolean,
) => {
  const query = useQuery({
    queryKey: ["pipeline-debug-log", projectId, definitionId],
    queryFn: async () => {
      const response = await apiService.get<PipelineDebugLogResult>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/ocr-improvement/debug-log`,
      );
      return response.data;
    },
    enabled: !!projectId && !!definitionId && enabled,
  });

  return {
    entries: query.data?.entries ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
};

interface SampleFailure {
  sampleId: string;
  metricValue: number;
  metricName: string;
  metadata?: Record<string, unknown>;
}

interface FieldErrorBreakdown {
  fieldName: string;
  errorCount: number;
  errorRate: number;
}

interface DrillDownData {
  runId: string;
  aggregatedMetrics: Record<string, unknown>;
  worstSamples: SampleFailure[];
  fieldErrorBreakdown: FieldErrorBreakdown[] | null;
}

export const useDrillDown = (projectId: string, runId: string) => {
  const drillDownQuery = useQuery({
    queryKey: ["benchmark-drill-down", projectId, runId],
    queryFn: async () => {
      const response = await apiService.get<DrillDownData>(
        `/benchmark/projects/${projectId}/runs/${runId}/drill-down`,
      );
      return response.data;
    },
    enabled: !!projectId && !!runId,
  });

  return {
    drillDown: drillDownQuery.data,
    isLoading: drillDownQuery.isLoading,
    error: drillDownQuery.error,
  };
};

interface Artifact {
  id: string;
  runId: string;
  type: string;
  path: string;
  sampleId: string | null;
  nodeId: string | null;
  sizeBytes: string; // BigInt as string from backend
  mimeType: string;
  createdAt: string;
}

interface ArtifactsData {
  artifacts: Artifact[];
  total: number;
}

export const useArtifacts = (
  projectId: string,
  runId: string,
  type?: string,
) => {
  const artifactsQuery = useQuery({
    queryKey: ["benchmark-artifacts", projectId, runId, type],
    queryFn: async () => {
      const url = type
        ? `/benchmark/projects/${projectId}/runs/${runId}/artifacts?type=${type}`
        : `/benchmark/projects/${projectId}/runs/${runId}/artifacts`;
      const response = await apiService.get<ArtifactsData>(url);
      return response.data;
    },
    enabled: !!projectId && !!runId,
  });

  return {
    artifacts: artifactsQuery.data?.artifacts || [],
    total: artifactsQuery.data?.total || 0,
    isLoading: artifactsQuery.isLoading,
    error: artifactsQuery.error,
  };
};

// Baseline management

interface PromoteBaselineDto {
  thresholds?: MetricThreshold[];
}

interface PromoteBaselineResponse {
  runId: string;
  isBaseline: boolean;
  previousBaselineId: string | null;
  thresholds: MetricThreshold[] | null;
}

export const usePromoteBaseline = (projectId: string, runId: string) => {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (dto: PromoteBaselineDto) => {
      const response = await apiService.post<PromoteBaselineResponse>(
        `/benchmark/projects/${projectId}/runs/${runId}/baseline`,
        dto,
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate queries to refresh run details
      queryClient.invalidateQueries({
        queryKey: ["benchmark-run", projectId, runId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
    },
  });

  return {
    promoteToBaseline: mutation.mutate,
    isPromoting: mutation.isPending,
    error: mutation.error,
  };
};

// Per-sample results for slicing and filtering

interface PerSampleResult {
  sampleId: string;
  metadata: Record<string, unknown>;
  metrics: Record<string, number>;
  pass: boolean;
  diagnostics?: Record<string, unknown>;
  groundTruth?: unknown;
  prediction?: unknown;
  evaluationDetails?: unknown;
}

interface PerSampleResultsData {
  runId: string;
  results: PerSampleResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  availableDimensions: string[];
  dimensionValues: Record<string, Array<string | number>>;
}

export const usePerSampleResults = (
  projectId: string,
  runId: string,
  filters: Record<string, string | number> = {},
  page = 1,
  limit = 20,
) => {
  const queryKey = [
    "benchmark-per-sample-results",
    projectId,
    runId,
    filters,
    page,
    limit,
  ];

  const resultsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));

      // Add filters
      for (const [key, value] of Object.entries(filters)) {
        params.set(key, String(value));
      }

      const response = await apiService.get<PerSampleResultsData>(
        `/benchmark/projects/${projectId}/runs/${runId}/samples?${params.toString()}`,
      );
      return response.data;
    },
    enabled: !!projectId && !!runId,
  });

  return {
    results: resultsQuery.data?.results || [],
    total: resultsQuery.data?.total || 0,
    page: resultsQuery.data?.page || 1,
    limit: resultsQuery.data?.limit || 20,
    totalPages: resultsQuery.data?.totalPages || 0,
    availableDimensions: resultsQuery.data?.availableDimensions || [],
    dimensionValues: resultsQuery.data?.dimensionValues || {},
    isLoading: resultsQuery.isLoading,
    error: resultsQuery.error,
  };
};

// Historical runs for trend charts
interface HistoricalRunData {
  id: string;
  definitionId: string;
  definitionName: string;
  status: string;
  completedAt: string | null;
  metrics: Record<string, number>;
  isBaseline: boolean;
}

export const useHistoricalRuns = (projectId: string, definitionId: string) => {
  const historicalQuery = useQuery({
    queryKey: ["benchmark-historical-runs", projectId, definitionId],
    queryFn: async () => {
      // First, get all runs for the project
      const runsResponse = await apiService.get<RunSummary[]>(
        `/benchmark/projects/${projectId}/runs`,
      );
      const allRuns = runsResponse.data || [];

      // Filter runs by definition ID and status
      const definitionRuns = allRuns.filter(
        (run) =>
          run.definitionId === definitionId && run.status === "completed",
      );

      // Fetch detailed run data for each run (to get metrics)
      // Limit to the last 50 runs to avoid fetching too much data
      const recentRuns = definitionRuns.slice(-50);
      const detailPromises = recentRuns.map((run) =>
        apiService.get<RunDetails>(
          `/benchmark/projects/${projectId}/runs/${run.id}`,
        ),
      );

      const detailResponses = await Promise.all(detailPromises);
      const historicalRuns: HistoricalRunData[] = detailResponses.map(
        (response) => {
          const run = response.data;
          return {
            id: run.id,
            definitionId: run.definitionId,
            definitionName: run.definitionName,
            status: run.status,
            completedAt: run.completedAt,
            metrics: run.metrics as Record<string, number>,
            isBaseline: run.isBaseline,
          };
        },
      );

      return historicalRuns;
    },
    enabled: !!projectId && !!definitionId,
  });

  return {
    historicalRuns: historicalQuery.data || [],
    isLoading: historicalQuery.isLoading,
    error: historicalQuery.error,
  };
};

interface OcrCacheSource {
  id: string;
  definitionId: string;
  definitionName: string;
  completedAt: string;
  sampleCount: number;
}

export const useOcrCacheSources = (
  projectId: string,
  datasetVersionId: string,
) => {
  const query = useQuery({
    queryKey: ["ocr-cache-sources", projectId, datasetVersionId],
    queryFn: async () => {
      const response = await apiService.get<OcrCacheSource[]>(
        `/benchmark/projects/${projectId}/ocr-cache-sources?datasetVersionId=${datasetVersionId}`,
      );
      return response.data || [];
    },
    enabled: !!projectId && !!datasetVersionId,
  });

  return {
    cacheSources: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  };
};

export type {
  BaselineComparison,
  HistoricalRunData,
  MetricComparison,
  MetricThreshold,
  OcrCacheSource,
  PerSampleResult,
  PerSampleResultsData,
  PipelineLogEntry,
};
