import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../../../../data/services/api.service";
import {
  TrainedModelSnapshot,
  TrainedModelVersion,
} from "../types/training.types";

export function useTrainedVersions(templateModelId: string) {
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ["trained-versions", templateModelId],
    queryFn: async () => {
      const response = await apiService.get<TrainedModelVersion[]>(
        `/template-models/${templateModelId}/training/versions`,
      );
      return response.data || [];
    },
    enabled: !!templateModelId,
  });

  const activateMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiService.post<TrainedModelVersion>(
        `/template-models/${templateModelId}/training/versions/${versionId}/activate`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["trained-versions", templateModelId],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiService.delete<TrainedModelVersion>(
        `/template-models/${templateModelId}/training/versions/${versionId}`,
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to delete version");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["trained-versions", templateModelId],
      });
    },
  });

  return {
    versions: versionsQuery.data || [],
    isLoading: versionsQuery.isLoading,
    error: versionsQuery.error,
    refetch: versionsQuery.refetch,

    activateVersion: activateMutation.mutateAsync,
    isActivating: activateMutation.isPending,

    deleteVersion: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

/**
 * Fetches the dataset snapshot for a single trained version (the labeled
 * documents + labels at training time). Returns null when the version
 * pre-dates snapshot capture.
 */
export function useTrainedVersionSnapshot(
  templateModelId: string,
  versionId: string | null,
) {
  return useQuery({
    queryKey: ["trained-version-snapshot", templateModelId, versionId],
    queryFn: async () => {
      if (!versionId) return null;
      const response = await apiService.get<TrainedModelSnapshot>(
        `/template-models/${templateModelId}/training/versions/${versionId}/snapshot`,
      );
      return response.data ?? null;
    },
    enabled: !!templateModelId && !!versionId,
  });
}
