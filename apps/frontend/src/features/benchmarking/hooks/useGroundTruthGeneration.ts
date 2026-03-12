import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export type GroundTruthJobStatus =
  | "pending"
  | "processing"
  | "awaiting_review"
  | "completed"
  | "failed";

export interface GroundTruthJob {
  id: string;
  datasetVersionId: string;
  sampleId: string;
  documentId: string | null;
  workflowConfigId: string;
  temporalWorkflowId: string | null;
  status: GroundTruthJobStatus;
  groundTruthPath: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GroundTruthJobsResponse {
  jobs: GroundTruthJob[];
  total: number;
  page: number;
  limit: number;
}

interface StartGenerationResponse {
  jobCount: number;
  message: string;
}

export const useGroundTruthGeneration = (
  datasetId: string,
  versionId: string,
  page: number = 1,
  limit: number = 50,
) => {
  const queryClient = useQueryClient();
  const basePath = `/benchmark/datasets/${datasetId}/versions/${versionId}/ground-truth-generation`;

  const jobsQuery = useQuery({
    queryKey: ["ground-truth-jobs", datasetId, versionId, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      const response = await apiService.get<GroundTruthJobsResponse>(
        `${basePath}/jobs?${params.toString()}`,
      );
      return response.data || { jobs: [], total: 0, page: 1, limit: 50 };
    },
    enabled: !!datasetId && !!versionId,
    refetchInterval: 5000, // Poll every 5s while jobs are processing
  });

  const startGenerationMutation = useMutation({
    mutationFn: async (workflowConfigId: string) => {
      const response = await apiService.post<StartGenerationResponse>(
        basePath,
        { workflowConfigId },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["ground-truth-jobs", datasetId, versionId],
      });
    },
  });

  const hasActiveJobs = jobsQuery.data?.jobs.some(
    (j) => j.status === "pending" || j.status === "processing",
  );

  return {
    jobs: jobsQuery.data?.jobs || [],
    total: jobsQuery.data?.total || 0,
    isLoading: jobsQuery.isLoading,
    error: jobsQuery.error,
    hasActiveJobs: !!hasActiveJobs,
    startGeneration: startGenerationMutation.mutateAsync,
    isStarting: startGenerationMutation.isPending,
    startError: startGenerationMutation.error,
  };
};
