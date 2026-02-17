import { useMutation, useQuery } from "@tanstack/react-query";
import { apiService } from "../services/api.service";
import { ClassifierModel } from "@/shared/types/classifier";

interface UploadClassifierDocumentsResponse {
  message: string;
  fileCount: number;
  results: string[];
}

export function useClassifier() {
  // Queries
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

  // Mutations
  const createClassifier = useMutation({
    mutationFn: async (data: Omit<ClassifierModel, "id" | "status">) => {
      const response = await apiService.post<ClassifierModel>("/azure/classifier", data);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to create classifier");
    },
  });

  const uploadClassifierDocuments = useMutation({
    mutationFn: async (params: { classifierName: string; groupId: string; label: string; files: FileList }) => {
      const { classifierName, groupId, label, files } = params;
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append("files", file));
      formData.append("label", label);
      formData.append("classifierName", classifierName);
      formData.append("groupId", groupId);
      const response = await apiService.post<UploadClassifierDocumentsResponse>(`/azure/classifier/documents`, formData);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to upload documents");
    },
  });

  return {
    getClassifiers,
    getClassifier,
    createClassifier,
    uploadClassifierDocuments,
  };
}