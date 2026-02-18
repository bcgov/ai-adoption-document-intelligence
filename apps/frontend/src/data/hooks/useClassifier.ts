import { useMutation, useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api.service";
import { ClassifierModel } from "@/shared/types/classifier";

interface UploadClassifierDocumentsResponse {
  message: string;
  fileCount: number;
  results: string[];
}

export function useClassifier() {
  const getClassifiers = useQuery({
    queryKey: ["getClassifiers"],
    queryFn: async (): Promise<ClassifierModel[]> => {
      const response = await apiService.get<ClassifierModel[]>("/azure/classifier");
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to fetch classifiers");
    },
  });

  const getClassifier = (id: string) =>
    useQuery({
      queryKey: ["getClassifier", id],
      queryFn: async (): Promise<ClassifierModel> => {
        const response = await apiService.get<ClassifierModel>(`/azure/classifier/${id}`);
        if (response.success && response.data) return response.data;
        throw new Error(response.message || "Failed to fetch classifier");
      },
    });

  const createClassifier = useMutation({
    mutationFn: async (data: Omit<ClassifierModel, "id" | "status">) => {
      const response = await apiService.post<ClassifierModel>("/azure/classifier", data);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to create classifier");
    },
  });

  // Query for classifier documents
  const getClassifierDocuments = (groupId: string, name: string) =>
    useQuery({
      queryKey: ["getClassifierDocuments", groupId, name],
      queryFn: async (): Promise<string[]> => {
        const response = await apiService.get<string[]>(`/azure/classifier/documents?group_id=${encodeURIComponent(groupId)}&name=${encodeURIComponent(name)}`);
        if (response.success && response.data) return response.data;
        throw new Error(response.message || "Failed to fetch classifier documents");
      },
    });

  const uploadClassifierDocuments = useMutation({
    mutationFn: async (params: { name: string; group_id: string; label: string; files: FileList }) => {
      const { name, group_id, label, files } = params;
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      formData.append("label", label);
      formData.append("name", name);
      formData.append("group_id", group_id);
      const response = await apiService.post<UploadClassifierDocumentsResponse>(`/azure/classifier/documents`, formData);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to upload documents");
    },
  });

  const deleteClassifierDocuments = useMutation({
  mutationFn: async (params: { name: string; group_id: string; folder?: string }) => {
    const query = [
      `name=${encodeURIComponent(params.name)}`,
      `group_id=${encodeURIComponent(params.group_id)}`,
      ...(params.folder ? [`folder=${encodeURIComponent(params.folder)}`] : [])
    ].join('&');
    const response = await apiService.delete<any>(
      `/azure/classifier/documents?${query}`
    );
    if (response.success) return response.data;
    throw new Error(response.message || "Failed to delete classifier");
  },
});

  return {
    getClassifiers,
    getClassifier,
    createClassifier,
    uploadClassifierDocuments,
    getClassifierDocuments,
    deleteClassifierDocuments,
  };
}