import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface QueueDocument {
  id: string;
  original_filename: string;
  status: string;
  model_id?: string;
  created_at: string;
  updated_at: string;
  ocr_result?: any;
}

interface QueueResponse {
  documents: QueueDocument[];
  total: number;
}

interface QueueFilters {
  status?: string;
  modelId?: string;
  maxConfidence?: number;
  limit?: number;
  offset?: number;
}

export const useReviewQueue = (filters?: QueueFilters) => {
  const queryClient = useQueryClient();

  const queueQuery = useQuery({
    queryKey: ["hitl-queue", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.modelId) params.append("modelId", filters.modelId);
      if (filters?.maxConfidence !== undefined)
        params.append("maxConfidence", filters.maxConfidence.toString());
      if (filters?.limit) params.append("limit", filters.limit.toString());
      if (filters?.offset) params.append("offset", filters.offset.toString());

      const endpoint = `/hitl/queue${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await apiService.get<QueueResponse>(endpoint);
      return response.data || { documents: [], total: 0 };
    },
  });

  const statsQuery = useQuery({
    queryKey: ["hitl-queue-stats"],
    queryFn: async () => {
      const response = await apiService.get<{
        totalDocuments: number;
        requiresReview: number;
        averageConfidence: number;
        reviewedToday: number;
      }>("/hitl/queue/stats");
      return response.data;
    },
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
      queryClient.invalidateQueries({ queryKey: ["hitl-queue"] });
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
