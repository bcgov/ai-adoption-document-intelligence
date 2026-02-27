import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  repositoryUrl: string;
  dvcRemote: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  versionCount?: number;
  recentVersions?: Array<{
    id: string;
    version: string;
    status: string;
    documentCount: number;
    createdAt: string;
  }>;
}

interface PaginatedDatasets {
  data: Dataset[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CreateDatasetDto {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
  repositoryUrl: string;
}

export const useDatasets = (page = 1, limit = 20) => {
  const queryClient = useQueryClient();

  const datasetsQuery = useQuery({
    queryKey: ["benchmark-datasets", page, limit],
    queryFn: async () => {
      const response = await apiService.get<PaginatedDatasets>(
        `/benchmark/datasets?page=${page}&limit=${limit}`,
      );
      return (
        response.data || {
          data: [],
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        }
      );
    },
  });

  const createDatasetMutation = useMutation({
    mutationFn: async (data: CreateDatasetDto) => {
      const response = await apiService.post<Dataset>(
        "/benchmark/datasets",
        data,
      );
      if (!response.success) {
        throw new Error(response.message || "Failed to create dataset");
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-datasets"] });
    },
  });

  return {
    datasets: datasetsQuery.data?.data || [],
    total: datasetsQuery.data?.total || 0,
    page: datasetsQuery.data?.page || 1,
    limit: datasetsQuery.data?.limit || 20,
    totalPages: datasetsQuery.data?.totalPages || 0,
    isLoading: datasetsQuery.isLoading,
    error: datasetsQuery.error,
    createDataset: createDatasetMutation.mutate,
    isCreating: createDatasetMutation.isPending,
    createError: createDatasetMutation.error,
    resetCreateError: createDatasetMutation.reset,
  };
};

export const useDataset = (datasetId: string) => {
  const datasetQuery = useQuery({
    queryKey: ["benchmark-dataset", datasetId],
    queryFn: async () => {
      const response = await apiService.get<Dataset>(
        `/benchmark/datasets/${datasetId}`,
      );
      return response.data;
    },
    enabled: !!datasetId,
  });

  return {
    dataset: datasetQuery.data,
    isLoading: datasetQuery.isLoading,
    error: datasetQuery.error,
  };
};
