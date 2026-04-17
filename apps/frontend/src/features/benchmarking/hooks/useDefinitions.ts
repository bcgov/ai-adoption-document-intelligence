import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

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

interface DefinitionSummary {
  id: string;
  name: string;
  datasetVersion: DatasetVersionInfo;
  workflow: WorkflowInfo;
  evaluatorType: string;
  immutable: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
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
  runHistory: RunHistorySummary[];
  baselineRun?: BaselineRunSummary;
  scheduleEnabled: boolean;
  scheduleCron?: string;
  scheduleTimezone?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateDefinitionDto {
  name: string;
  datasetVersionId: string;
  splitId: string;
  workflowVersionId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;
}

interface UpdateDefinitionDto {
  name?: string;
  datasetVersionId?: string;
  splitId?: string;
  workflowVersionId?: string;
  evaluatorType?: string;
  evaluatorConfig?: Record<string, unknown>;
  runtimeSettings?: Record<string, unknown>;
  workflowConfigOverrides?: Record<string, unknown>;
}

interface ApplyToBaseResult {
  newBaseWorkflowVersionId: string;
  baseLineageId: string;
  newVersionNumber: number;
  cleanedUp: boolean;
}

export const useDefinitions = (projectId: string) => {
  const queryClient = useQueryClient();

  const definitionsQuery = useQuery({
    queryKey: ["benchmark-definitions", projectId],
    queryFn: async () => {
      const response = await apiService.get<DefinitionSummary[]>(
        `/benchmark/projects/${projectId}/definitions`,
      );
      return response.data || [];
    },
    enabled: !!projectId,
  });

  const createDefinitionMutation = useMutation({
    mutationFn: async (data: CreateDefinitionDto) => {
      const response = await apiService.post<DefinitionDetails>(
        `/benchmark/projects/${projectId}/definitions`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-project", projectId],
      });
    },
  });

  const deleteDefinitionMutation = useMutation({
    mutationFn: async (definitionId: string) => {
      await apiService.delete(
        `/benchmark/projects/${projectId}/definitions/${definitionId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-project", projectId],
      });
    },
  });

  return {
    definitions: definitionsQuery.data || [],
    isLoading: definitionsQuery.isLoading,
    error: definitionsQuery.error,
    createDefinition: createDefinitionMutation.mutate,
    isCreating: createDefinitionMutation.isPending,
    deleteDefinition: deleteDefinitionMutation.mutate,
    isDeletingDefinition: deleteDefinitionMutation.isPending,
  };
};

export const useDefinition = (projectId: string, definitionId: string) => {
  const queryClient = useQueryClient();

  const definitionQuery = useQuery({
    queryKey: ["benchmark-definition", projectId, definitionId],
    queryFn: async () => {
      const response = await apiService.get<DefinitionDetails>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}`,
      );
      return response.data;
    },
    enabled: !!projectId && !!definitionId,
  });

  const updateDefinitionMutation = useMutation({
    mutationFn: async (data: UpdateDefinitionDto) => {
      const response = await apiService.put<DefinitionDetails>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}`,
        data,
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
      queryClient.invalidateQueries({
        queryKey: ["benchmark-project", projectId],
      });
    },
  });

  return {
    definition: definitionQuery.data,
    isLoading: definitionQuery.isLoading,
    error: definitionQuery.error,
    updateDefinition: updateDefinitionMutation.mutate,
    isUpdating: updateDefinitionMutation.isPending,
  };
};

export const useApplyToBaseWorkflow = (projectId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: {
      candidateWorkflowVersionId: string;
      cleanupCandidateArtifacts?: boolean;
    }) => {
      const response = await apiService.post<ApplyToBaseResult>(
        `/benchmark/projects/${projectId}/apply-candidate-to-base`,
        dto,
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.message || "Failed to apply candidate to base",
        );
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-definitions", projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-runs", projectId],
      });
    },
  });
};

export interface BaselinePromotionHistory {
  promotedAt: string;
  runId: string;
  actorId: string;
  definitionId?: string;
  projectId?: string;
}

export function useBaselineHistory(projectId: string, definitionId: string) {
  const historyQuery = useQuery({
    queryKey: ["baseline-history", projectId, definitionId],
    queryFn: async () => {
      const response = await apiService.get<BaselinePromotionHistory[]>(
        `/benchmark/projects/${projectId}/definitions/${definitionId}/baseline-history`,
      );
      return response.data;
    },
    enabled: !!projectId && !!definitionId,
  });

  return {
    history: historyQuery.data || [],
    isLoading: historyQuery.isLoading,
    error: historyQuery.error,
  };
}
