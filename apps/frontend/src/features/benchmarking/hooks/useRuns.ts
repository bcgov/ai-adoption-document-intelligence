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
