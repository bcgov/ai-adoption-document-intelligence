import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "../../../../data/services/api.service";
import {
  TrainedModelSnapshot,
  TrainedModelVersion,
} from "../types/training.types";

export function useTrainedVersions(
  templateModelId: string,
  opts: { pollWhileTraining?: boolean } = {},
) {
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
    // Poll while a training job is active so the new version appears as soon
    // as the poller writes it, no manual refresh needed.
    refetchInterval: opts.pollWhileTraining ? 5000 : false,
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
      // Header on the detail/list page reads active_trained_model from the
      // template-model query — keep it in sync.
      queryClient.invalidateQueries({
        queryKey: ["template-model", templateModelId],
      });
      queryClient.invalidateQueries({ queryKey: ["template-models"] });
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
      // Header on the detail/list page reads active_trained_model from the
      // template-model query — keep it in sync.
      queryClient.invalidateQueries({
        queryKey: ["template-model", templateModelId],
      });
      queryClient.invalidateQueries({ queryKey: ["template-models"] });
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
