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
    gitRevision: string;
    status: string;
    documentCount: number;
  };
}

export const useDatasetUpload = (datasetId: string) => {
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await apiService.post<UploadResponse>(
        `/benchmark/datasets/${datasetId}/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
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

  return {
    upload: uploadMutation.mutate,
    isUploading: uploadMutation.isPending,
    error: uploadMutation.error,
    isSuccess: uploadMutation.isSuccess,
    reset: uploadMutation.reset,
  };
};
