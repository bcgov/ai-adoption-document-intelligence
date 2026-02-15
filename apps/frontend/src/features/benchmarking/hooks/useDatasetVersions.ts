import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface DatasetVersion {
  id: string;
  datasetId: string;
  version: string;
  gitRevision: string;
  manifestPath: string;
  documentCount: number;
  groundTruthSchema: Record<string, unknown> | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  splits?: Array<{
    id: string;
    name: string;
    type: string;
    sampleCount: number;
  }>;
}

interface VersionListResponse {
  versions: DatasetVersion[];
  total: number;
}

interface ManifestSample {
  id: string;
  inputs: Array<{
    path: string;
    mimeType: string;
  }>;
  groundTruth: Array<{
    path: string;
    format: string;
  }>;
  metadata?: Record<string, unknown>;
}

interface SampleListResponse {
  samples: ManifestSample[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const useDatasetVersions = (datasetId: string) => {
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: ["benchmark-dataset-versions", datasetId],
    queryFn: async () => {
      const response = await apiService.get<VersionListResponse>(
        `/benchmark/datasets/${datasetId}/versions`,
      );
      return response.data;
    },
    enabled: !!datasetId,
  });

  const publishVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiService.patch<DatasetVersion>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/publish`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-version"],
      });
    },
  });

  const archiveVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiService.patch<DatasetVersion>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/archive`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-version"],
      });
    },
  });

  return {
    versions: versionsQuery.data?.versions || [],
    total: versionsQuery.data?.total || 0,
    isLoading: versionsQuery.isLoading,
    error: versionsQuery.error,
    publishVersion: publishVersionMutation.mutate,
    isPublishing: publishVersionMutation.isPending,
    archiveVersion: archiveVersionMutation.mutate,
    isArchiving: archiveVersionMutation.isPending,
  };
};

export const useDatasetVersion = (datasetId: string, versionId: string) => {
  const versionQuery = useQuery({
    queryKey: ["benchmark-dataset-version", datasetId, versionId],
    queryFn: async () => {
      const response = await apiService.get<DatasetVersion>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}`,
      );
      return response.data;
    },
    enabled: !!datasetId && !!versionId,
  });

  return {
    version: versionQuery.data,
    isLoading: versionQuery.isLoading,
    error: versionQuery.error,
  };
};

export const useDatasetSamples = (
  datasetId: string,
  versionId: string,
  page = 1,
  limit = 20,
) => {
  const samplesQuery = useQuery({
    queryKey: ["benchmark-dataset-samples", datasetId, versionId, page, limit],
    queryFn: async () => {
      const response = await apiService.get<SampleListResponse>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/samples?page=${page}&limit=${limit}`,
      );
      return response.data;
    },
    enabled: !!datasetId && !!versionId,
  });

  return {
    samples: samplesQuery.data?.samples || [],
    total: samplesQuery.data?.total || 0,
    page: samplesQuery.data?.page || 1,
    limit: samplesQuery.data?.limit || 20,
    totalPages: samplesQuery.data?.totalPages || 0,
    isLoading: samplesQuery.isLoading,
    error: samplesQuery.error,
  };
};

export const useAllDatasetVersions = () => {
  const versionsQuery = useQuery({
    queryKey: ["benchmark-all-dataset-versions"],
    queryFn: async () => {
      const datasetsResponse = await apiService.get<{
        data: Array<{ id: string }>;
      }>("/benchmark/datasets?limit=1000");
      const datasets = datasetsResponse.data?.data || [];

      const allVersions: DatasetVersion[] = [];
      for (const dataset of datasets) {
        const versionsResponse = await apiService.get<VersionListResponse>(
          `/benchmark/datasets/${dataset.id}/versions`,
        );
        if (versionsResponse.data?.versions) {
          allVersions.push(...versionsResponse.data.versions);
        }
      }
      return allVersions;
    },
  });

  return {
    versions: versionsQuery.data || [],
    isLoading: versionsQuery.isLoading,
    error: versionsQuery.error,
  };
};
