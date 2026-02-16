/**
 * Splits Management Hooks
 *
 * React Query hooks for managing dataset splits (train/val/test/golden).
 * See US-033: Split Management UI
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export type SplitType = "train" | "val" | "test" | "golden";

export interface Split {
  id: string;
  datasetVersionId: string;
  name: string;
  type: SplitType;
  sampleCount: number;
  frozen: boolean;
  stratificationRules?: Record<string, unknown>;
  createdAt: Date;
}

export interface SplitDetail extends Split {
  sampleIds: string[];
}

export interface CreateSplitRequest {
  name: string;
  type: SplitType;
  sampleIds: string[];
  stratificationRules?: Record<string, unknown>;
}

export interface UpdateSplitRequest {
  sampleIds: string[];
}

/**
 * Hook to list all splits for a dataset version
 */
export function useSplits(
  datasetId: string | undefined,
  versionId: string | undefined,
) {
  return useQuery({
    queryKey: ["datasets", datasetId, "versions", versionId, "splits"],
    queryFn: async () => {
      if (!datasetId || !versionId) {
        throw new Error("Dataset ID and Version ID are required");
      }
      const response = await apiService.get<{ splits: Split[] }>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/splits`,
      );
      return response.data?.splits || [];
    },
    enabled: !!datasetId && !!versionId,
  });
}

/**
 * Hook to get a single split with full details
 */
export function useSplit(
  datasetId: string | undefined,
  versionId: string | undefined,
  splitId: string | undefined,
) {
  return useQuery({
    queryKey: ["datasets", datasetId, "versions", versionId, "splits", splitId],
    queryFn: async () => {
      if (!datasetId || !versionId || !splitId) {
        throw new Error("Dataset ID, Version ID, and Split ID are required");
      }
      return apiService.get<SplitDetail>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/splits/${splitId}`,
      );
    },
    enabled: !!datasetId && !!versionId && !!splitId,
  });
}

/**
 * Hook to create a new split
 */
export function useCreateSplit(datasetId: string, versionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateSplitRequest) => {
      return apiService.post<Split>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/splits`,
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["datasets", datasetId, "versions", versionId, "splits"],
      });
    },
  });
}

/**
 * Hook to update an existing split
 */
export function useUpdateSplit(
  datasetId: string,
  versionId: string,
  splitId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateSplitRequest) => {
      return apiService.patch<Split>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/splits/${splitId}`,
        data,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["datasets", datasetId, "versions", versionId, "splits"],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "datasets",
          datasetId,
          "versions",
          versionId,
          "splits",
          splitId,
        ],
      });
    },
  });
}

/**
 * Hook to freeze a split (make it immutable)
 */
export function useFreezeSplit(
  datasetId: string,
  versionId: string,
  splitId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      return apiService.post<Split>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/splits/${splitId}/freeze`,
        {},
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["datasets", datasetId, "versions", versionId, "splits"],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "datasets",
          datasetId,
          "versions",
          versionId,
          "splits",
          splitId,
        ],
      });
    },
  });
}
