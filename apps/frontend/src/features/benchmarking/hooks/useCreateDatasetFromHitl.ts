import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface CreateDatasetFromHitlParams {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  documentIds: string[];
}

interface AddVersionFromHitlParams {
  datasetId: string;
  version?: string;
  name?: string;
  documentIds: string[];
}

interface SkippedDocument {
  documentId: string;
  reason: string;
}

interface CreateDatasetFromHitlResponse {
  dataset: {
    id: string;
    name: string;
  };
  version: {
    id: string;
    version: string;
    documentCount: number;
  };
  skipped: SkippedDocument[];
}

interface AddVersionFromHitlResponse {
  version: {
    id: string;
    version: string;
    documentCount: number;
  };
  skipped: SkippedDocument[];
}

export const useCreateDatasetFromHitl = () => {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  const createDatasetMutation = useMutation({
    mutationFn: async (params: CreateDatasetFromHitlParams) => {
      if (!activeGroup) {
        throw new Error("No active group selected");
      }
      const response = await apiService.post<CreateDatasetFromHitlResponse>(
        "/benchmark/datasets/from-hitl",
        { ...params, groupId: activeGroup.id },
      );
      if (!response.success) {
        throw new Error(
          response.message || "Failed to create dataset from verified documents",
        );
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-datasets"] });
    },
  });

  const addVersionMutation = useMutation({
    mutationFn: async (params: AddVersionFromHitlParams) => {
      const { datasetId, ...body } = params;
      const response = await apiService.post<AddVersionFromHitlResponse>(
        `/benchmark/datasets/${datasetId}/versions/from-hitl`,
        body,
      );
      if (!response.success) {
        throw new Error(
          response.message || "Failed to add version from verified documents",
        );
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-datasets"] });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset", variables.datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", variables.datasetId],
      });
    },
  });

  return {
    createDataset: createDatasetMutation.mutateAsync,
    isCreating: createDatasetMutation.isPending,
    createError: createDatasetMutation.error,
    resetCreateError: createDatasetMutation.reset,
    addVersion: addVersionMutation.mutateAsync,
    isAddingVersion: addVersionMutation.isPending,
    addVersionError: addVersionMutation.error,
    resetAddVersionError: addVersionMutation.reset,
  };
};
