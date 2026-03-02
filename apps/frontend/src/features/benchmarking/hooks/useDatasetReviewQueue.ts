import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export interface DatasetReviewQueueDocument {
  id: string;
  original_filename: string;
  status: string;
  model_id?: string;
  created_at: string;
  updated_at: string;
  ocr_result?: { fields: Record<string, unknown> };
  lastSession?: {
    id: string;
    reviewer_id: string;
    status: string;
    completed_at: string | null;
    corrections_count: number;
  };
  sampleId: string;
  jobId: string;
}

interface ReviewQueueResponse {
  documents: DatasetReviewQueueDocument[];
  total: number;
}

interface ReviewStatsResponse {
  totalDocuments: number;
  awaitingReview: number;
  completed: number;
  failed: number;
}

interface QueueFilters {
  limit?: number;
  offset?: number;
  reviewStatus?: "pending" | "reviewed" | "all";
}

export const useDatasetReviewQueue = (
  datasetId: string,
  versionId: string,
  filters?: QueueFilters,
) => {
  const queryClient = useQueryClient();
  const basePath = `/benchmark/datasets/${datasetId}/versions/${versionId}/ground-truth-generation`;

  const queueQuery = useQuery({
    queryKey: ["dataset-review-queue", datasetId, versionId, filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.limit) params.append("limit", String(filters.limit));
      if (filters?.offset) params.append("offset", String(filters.offset));
      if (filters?.reviewStatus)
        params.append("reviewStatus", filters.reviewStatus);

      const endpoint = `${basePath}/review/queue${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await apiService.get<ReviewQueueResponse>(endpoint);
      return response.data || { documents: [], total: 0 };
    },
    enabled: !!datasetId && !!versionId,
  });

  const statsQuery = useQuery({
    queryKey: ["dataset-review-stats", datasetId, versionId],
    queryFn: async () => {
      const response = await apiService.get<ReviewStatsResponse>(
        `${basePath}/review/stats`,
      );
      return response.data;
    },
    enabled: !!datasetId && !!versionId,
  });

  const startSessionMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.post<{
        id: string;
        documentId: string;
        reviewerId: string;
        status: string;
        startedAt: string;
      }>("/hitl/sessions", { documentId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dataset-review-queue", datasetId, versionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["dataset-review-stats", datasetId, versionId],
      });
    },
  });

  return {
    queue: queueQuery.data?.documents || [],
    total: queueQuery.data?.total || 0,
    stats: statsQuery.data,
    isLoading: queueQuery.isLoading,
    error: queueQuery.error,
    startSession: startSessionMutation.mutate,
    startSessionAsync: startSessionMutation.mutateAsync,
    isStartingSession: startSessionMutation.isPending,
  };
};
