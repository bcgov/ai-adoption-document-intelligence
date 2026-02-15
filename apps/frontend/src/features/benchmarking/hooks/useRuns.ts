import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface RunSummary {
  id: string;
  definitionId: string;
  definitionName: string;
  status: string;
  mlflowRunId: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  headlineMetrics: Record<string, unknown> | null;
  hasRegression?: boolean;
  regressedMetricCount?: number;
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
  mlflowRunId: string;
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

interface CreateRunDto {
  tags?: Record<string, string>;
}

export const useRuns = (projectId: string) => {
  const runsQuery = useQuery({
    queryKey: ["benchmark-runs", projectId],
    queryFn: async () => {
      const response = await apiService.get<RunSummary[]>(
        `/benchmark/projects/${projectId}/runs`,
      );
      return response.data || [];
    },
    enabled: !!projectId,
  });

  return {
    runs: runsQuery.data || [],
    isLoading: runsQuery.isLoading,
    error: runsQuery.error,
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

export const useStartRun = (projectId: string, definitionId: string) => {
  const queryClient = useQueryClient();

  const startRunMutation = useMutation({
    mutationFn: async (data: CreateRunDto = {}) => {
      const response = await apiService.post<RunDetails>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/runs`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definition", projectId, definitionId],
      });
    },
  });

  return {
    startRun: startRunMutation.mutateAsync,
    isStarting: startRunMutation.isPending,
    startedRun: startRunMutation.data,
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
  errorClusters: Record<string, number>;
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

export type {
  MetricThreshold,
  BaselineComparison,
  MetricComparison,
  PerSampleResult,
  PerSampleResultsData,
};
