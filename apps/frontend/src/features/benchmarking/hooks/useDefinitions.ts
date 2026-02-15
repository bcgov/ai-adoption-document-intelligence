import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface DatasetVersionInfo {
  id: string;
  datasetName: string;
  version: string;
}

interface WorkflowInfo {
  id: string;
  name: string;
  version: number;
}

interface SplitInfo {
  id: string;
  name: string;
  type: string;
}

interface RunHistorySummary {
  id: string;
  status: string;
  mlflowRunId: string;
  startedAt: string | null;
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
  split: SplitInfo;
  workflow: WorkflowInfo;
  workflowConfigHash: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  artifactPolicy: Record<string, unknown>;
  immutable: boolean;
  revision: number;
  runHistory: RunHistorySummary[];
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
  workflowId: string;
  evaluatorType: string;
  evaluatorConfig: Record<string, unknown>;
  runtimeSettings: Record<string, unknown>;
  artifactPolicy: Record<string, unknown>;
}

interface UpdateDefinitionDto {
  name?: string;
  datasetVersionId?: string;
  splitId?: string;
  workflowId?: string;
  evaluatorType?: string;
  evaluatorConfig?: Record<string, unknown>;
  runtimeSettings?: Record<string, unknown>;
  artifactPolicy?: Record<string, unknown>;
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

  return {
    definitions: definitionsQuery.data || [],
    isLoading: definitionsQuery.isLoading,
    error: definitionsQuery.error,
    createDefinition: createDefinitionMutation.mutate,
    isCreating: createDefinitionMutation.isPending,
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
