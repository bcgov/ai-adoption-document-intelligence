import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

interface UploadResponse {
  datasetId: string;
  uploadedFiles: Array<{
    filename: string;
    path: string;
    size: number;
    mimeType: string;
  }>;
  manifestUpdated: boolean;
  totalFiles: number;
  version: {
    id: string;
    version: string;
    storagePrefix: string | null;
    status: string;
    documentCount: number;
  };
}

/**
 * Hook for uploading files to a specific dataset version.
 *
 * @param datasetId - The dataset ID
 * @param versionId - The version ID to upload files to
 */
export const useDatasetUpload = (datasetId: string, versionId: string) => {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await apiService.post<UploadResponse>(
        `/benchmark/datasets/${datasetId}/versions/${versionId}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (!response.success) {
        throw new Error(response.message || "Upload failed");
      }

      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-versions", datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset", datasetId],
      });
      queryClient.invalidateQueries({
        queryKey: ["benchmark-dataset-samples", datasetId, versionId],
      });
    },
  });

  return {
    upload: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    error: uploadMutation.error,
    isSuccess: uploadMutation.isSuccess,
    reset: uploadMutation.reset,
  };
};
