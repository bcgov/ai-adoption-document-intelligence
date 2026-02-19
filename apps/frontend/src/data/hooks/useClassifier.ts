// Classification result response type
export interface ClassificationResult {
  status: "succeeded" | "failed" | "running" | string;
  createdDateTime: string;
  lastUpdatedDateTime: string;
  analyzeResult: {
    apiVersion: string;
    modelId: string;
    stringIndexType: string;
    content: string;
    pages: Array<{
      pageNumber: number;
      angle: number;
      width: number;
      height: number;
      unit: string;
      words: Array<any>;
      lines: Array<any>;
      spans: Array<any>;
    }>;
    documents: Array<{
      docType: string;
      boundingRegions: Array<{
        pageNumber: number;
        polygon: number[];
      }>;
      confidence: number;
      spans: Array<any>;
    }>;
    contentFormat: string;
  };
}
// Classification request response type
export interface ClassificationRequestResponse {
  status: "success" | "pending" | "failure";
  content: string;
  error: Record<string, unknown>;
}
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

  const updateClassifier = useMutation({
    mutationFn: async (data: { name: string; group_id: string; description: string; source: string }) => {
      const response = await apiService.patch<ClassifierModel>(`/azure/classifier`, data);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to update classifier");
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

  const requestTraining = useMutation({
    mutationFn: async (params: { name: string; group_id: string }) => {
      const response = await apiService.post<any>(`/azure/classifier/train`, params);
      if (response.success) return response.data;
      throw new Error(response.message || "Failed to start training");
    },
  });

  // Classify a document (multipart form POST)
  const requestClassification = useMutation<
    ClassificationRequestResponse,
    Error,
    { file: File; name: string; group_id: string }
  >({
    mutationFn: async (params) => {
      const { file, name, group_id } = params;
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      formData.append("group_id", group_id);
      const response = await apiService.post<ClassificationRequestResponse>(`/azure/classifier/classify`, formData);
      if (response.success && response.data) return response.data;
      throw new Error(response.message || "Failed to classify document");
    },
  });
  
  // General async function to get classification result (not a hook)
  const fetchClassificationResult = async (operationLocation: string) => {
    const response = await apiService.get<ClassificationResult>(
      `/azure/classifier/classify?operationLocation=${encodeURIComponent(operationLocation)}`
    );
    if (response.success && response.data) return response.data;
    throw new Error(response.message || "Failed to get classification result");
  };

  return {
    getClassifiers,
    getClassifier,
    createClassifier,
    updateClassifier,
    uploadClassifierDocuments,
    getClassifierDocuments,
    deleteClassifierDocuments,
    requestTraining,
    requestClassification,
    fetchClassificationResult,
  };
}