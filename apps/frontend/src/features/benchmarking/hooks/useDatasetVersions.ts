import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface DatasetVersion {
  id: string;
  datasetId: string;
  version: string;
  name: string | null;
  storagePrefix: string | null;
  manifestPath: string;
  documentCount: number;
  groundTruthSchema: Record<string, unknown> | null;
  frozen: boolean;
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

export interface ManifestSample {
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

  const createVersionMutation = useMutation({
    mutationFn: async (data?: { version?: string; name?: string; groundTruthSchema?: Record<string, unknown> }) => {
      const response = await apiService.post<DatasetVersion>(
        `/benchmark/datasets/${datasetId}/versions`,
        data || {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset", datasetId],
      });
    },
  });

  const deleteVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      await apiService.delete(
        `/benchmark/datasets/${datasetId}/versions/${versionId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset", datasetId],
      });
    },
  });

  const freezeVersionMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const response = await apiService.post<{ id: string; frozen: boolean }>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/freeze`,
        {},
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
    },
  });

  const updateVersionNameMutation = useMutation({
    mutationFn: async ({
      versionId,
      name,
    }: {
      versionId: string;
      name: string;
    }) => {
      const response = await apiService.patch<DatasetVersion>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}`,
        { name },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
    },
  });

  const deleteSampleMutation = useMutation({
    mutationFn: async ({
      versionId,
      sampleId,
    }: {
      versionId: string;
      sampleId: string;
    }) => {
      await apiService.delete(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/samples/${sampleId}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [
          "benchmark-dataset-samples",
          datasetId,
          variables.versionId,
        ],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
    },
  });

  return {
    versions: versionsQuery.data?.versions || [],
    total: versionsQuery.data?.total || 0,
    isLoading: versionsQuery.isLoading,
    error: versionsQuery.error,
    createVersion: createVersionMutation.mutateAsync,
    isCreatingVersion: createVersionMutation.isPending,
    deleteVersion: deleteVersionMutation.mutate,
    isDeletingVersion: deleteVersionMutation.isPending,
    deleteVersionError: deleteVersionMutation.error,
    freezeVersion: freezeVersionMutation.mutateAsync,
    isFreezingVersion: freezeVersionMutation.isPending,
    updateVersionName: updateVersionNameMutation.mutateAsync,
    isUpdatingVersionName: updateVersionNameMutation.isPending,
    deleteSample: deleteSampleMutation.mutate,
    isDeletingSample: deleteSampleMutation.isPending,
    deletingSampleId: deleteSampleMutation.isPending
      ? deleteSampleMutation.variables?.sampleId ?? null
      : null,
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
  const { activeGroup } = useGroup();

  const versionsQuery = useQuery({
    queryKey: ["benchmark-all-dataset-versions", activeGroup?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "1000" });
      if (activeGroup?.id) {
        params.set("groupId", activeGroup.id);
      }
      const datasetsResponse = await apiService.get<{
        data: Array<{ id: string; name: string }>;
      }>(`/benchmark/datasets?${params.toString()}`);
      const datasets = datasetsResponse.data?.data || [];

      const allVersions: (DatasetVersion & { datasetName: string })[] = [];
      for (const dataset of datasets) {
        const versionsResponse = await apiService.get<VersionListResponse>(
          `/benchmark/datasets/${dataset.id}/versions`,
        );
        if (versionsResponse.data?.versions) {
          for (const version of versionsResponse.data.versions) {
            allVersions.push({ ...version, datasetName: dataset.name });
          }
        }
      }
      return allVersions;
    },
  });

  return {
    versions: versionsQuery.data || [],
    isLoading: versionsQuery.isLoading,
    error: versionsQuery.error,
    refetch: versionsQuery.refetch,
  };
};

export const useAllSamples = (
  datasetId: string,
  versionId: string,
) => {
  const samplesQuery = useQuery({
    queryKey: ["benchmark-dataset-all-samples", datasetId, versionId],
    queryFn: async () => {
      // Fetch all samples by requesting a large limit
      const response = await apiService.get<SampleListResponse>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/samples?page=1&limit=10000`,
      );
      return response.data;
    },
    enabled: !!datasetId && !!versionId,
  });

  return {
    samples: samplesQuery.data?.samples || [],
    total: samplesQuery.data?.total || 0,
    isLoading: samplesQuery.isLoading,
    error: samplesQuery.error,
  };
};
