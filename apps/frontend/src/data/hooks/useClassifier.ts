import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { apiService } from "../services/api.service";
import { ClassifierModel } from "@/shared/types/classifier";

export const getClassifiers = (): ReturnType<typeof useQuery<ClassifierModel[], Error>> => {
  return useQuery({
    queryKey: ["getClassifiers"],
    queryFn: async (): Promise<ClassifierModel[]> => {
      const response = await apiService.get<ClassifierModel[]>("/azure/classifier");
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch classifiers");
    },
  });
};

export const getClassifier = (id: string): ReturnType<typeof useQuery<ClassifierModel, Error>> => {
  return useQuery({
    queryKey: ["getClassifier", id],
    queryFn: async (): Promise<ClassifierModel> => {
      const response = await apiService.get<ClassifierModel>(`/azure/classifier/${id}`);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to fetch classifier");
    },
  });
};

export const createClassifier = async (data: Omit<ClassifierModel, "id" | "status" | "source">): Promise<UseQueryResult<ClassifierModel, Error>> => {
  return useQuery({
    queryKey: ["createClassifier", data],
    queryFn: async (): Promise<ClassifierModel> => {
      const response = await apiService.post<ClassifierModel>("/azure/classifier", data);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to create classifier");
    },
  });
};

interface UploadClassifierDocumentsResponse {
  message: string;
  fileCount: number;
  results: string[];
}

export const uploadClassifierDocuments = async (classifierName: string, groupId: string, label: string, files: FileList): Promise<UseQueryResult<UploadClassifierDocumentsResponse>> => {
  return useQuery({
    queryKey: ["uploadDocuments", classifierName, groupId, label, files],
    queryFn: async (): Promise<UploadClassifierDocumentsResponse> => {
      const formData = new FormData();
      Array.from(files).forEach(file => formData.append("files", file));
      formData.append("label", label);
      formData.append("classifierName", classifierName);
      formData.append("groupId", groupId);
      const response = await apiService.post<UploadClassifierDocumentsResponse>(`/azure/classifier/documents`, formData);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.message || "Failed to upload documents");
    },
  });
};