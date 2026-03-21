import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGroup } from "@/auth/GroupContext";
import { apiService } from "@/data/services/api.service";

interface FieldSchema {
  id: string;
  [key: string]: unknown;
}

interface OcrField {
  confidence?: number;
  value?: string;
  [key: string]: unknown;
}

interface OcrResult {
  fields?: Record<string, OcrField>;
  [key: string]: unknown;
}

interface BoundingBox {
  polygon: number[];
  pageWidth?: number;
  pageHeight?: number;
  span?: {
    offset?: number;
    length?: number;
  };
  [key: string]: unknown;
}

interface TemplateModel {
  id: string;
  name: string;
  modelId: string;
  description?: string;
  status: string;
  created_by: string;
  group_id: string;
  created_at: string;
  updated_at: string;
  field_schema: FieldSchema[];
  _count?: { documents: number };
}

interface TemplateModelDocument {
  id: string;
  labeling_document_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  labeling_document: {
    id: string;
    title: string;
    original_filename: string;
    file_path?: string;
    file_type: string;
    file_size: number;
    status: string;
    created_at: string;
    updated_at: string;
    model_id?: string;
    file_url?: string | null;
    ocr_result?: OcrResult;
  };
  labels?: Array<{
    id: string;
    field_key: string;
    label_name: string;
    value?: string;
    page_number: number;
    bounding_box: BoundingBox;
    confidence?: number;
  }>;
}

interface CreateTemplateModelDto {
  name: string;
  description?: string;
}

interface CreateTemplateModelPayload extends CreateTemplateModelDto {
  group_id: string;
}

interface UpdateTemplateModelDto {
  name?: string;
  description?: string;
  status?: string;
}

export const useTemplateModels = () => {
  const queryClient = useQueryClient();
  const { activeGroup } = useGroup();

  const templateModelsQuery = useQuery({
    queryKey: ["template-models", activeGroup?.id],
    queryFn: async () => {
      const endpoint = activeGroup?.id
        ? `/template-models?group_id=${activeGroup.id}`
        : "/template-models";
      const response = await apiService.get<TemplateModel[]>(endpoint);
      return response.data || [];
    },
  });

  const createTemplateModelMutation = useMutation({
    mutationFn: async (data: CreateTemplateModelDto) => {
      if (!activeGroup) {
        throw new Error("No active group selected");
      }
      const payload: CreateTemplateModelPayload = {
        ...data,
        group_id: activeGroup.id,
      };
      const response = await apiService.post<TemplateModel>(
        "/template-models",
        payload,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-models"] });
    },
  });

  const updateTemplateModelMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateTemplateModelDto;
    }) => {
      const response = await apiService.put<TemplateModel>(
        `/template-models/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-models"] });
    },
  });

  const deleteTemplateModelMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiService.delete(`/template-models/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-models"] });
    },
  });

  return {
    templateModels: templateModelsQuery.data || [],
    isLoading: templateModelsQuery.isLoading,
    error: templateModelsQuery.error,
    createTemplateModel: createTemplateModelMutation.mutate,
    createTemplateModelAsync: createTemplateModelMutation.mutateAsync,
    updateTemplateModel: updateTemplateModelMutation.mutate,
    deleteTemplateModel: deleteTemplateModelMutation.mutate,
    isCreating: createTemplateModelMutation.isPending,
    isUpdating: updateTemplateModelMutation.isPending,
    isDeleting: deleteTemplateModelMutation.isPending,
  };
};

export const useTemplateModel = (templateModelId: string) => {
  const templateModelQuery = useQuery({
    queryKey: ["template-model", templateModelId],
    queryFn: async () => {
      const response = await apiService.get<TemplateModel>(
        `/template-models/${templateModelId}`,
      );
      return response.data;
    },
    enabled: !!templateModelId,
  });

  return {
    templateModel: templateModelQuery.data,
    isLoading: templateModelQuery.isLoading,
    error: templateModelQuery.error,
  };
};

export const useTemplateModelDocuments = (templateModelId: string) => {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ["template-model-documents", templateModelId],
    queryFn: async () => {
      const response = await apiService.get<TemplateModelDocument[]>(
        `/template-models/${templateModelId}/documents`,
      );
      return response.data || [];
    },
    enabled: Boolean(templateModelId),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
  });

  const addDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.post<TemplateModelDocument>(
        `/template-models/${templateModelId}/documents`,
        { labelingDocumentId: documentId },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["template-model-documents", templateModelId],
      });
      queryClient.invalidateQueries({
        queryKey: ["template-model", templateModelId],
      });
    },
  });

  const removeDocumentMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await apiService.delete(
        `/template-models/${templateModelId}/documents/${documentId}`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["template-model-documents", templateModelId],
      });
      queryClient.invalidateQueries({
        queryKey: ["template-model", templateModelId],
      });
    },
  });

  return {
    documents: documentsQuery.data || [],
    isLoading: documentsQuery.isLoading,
    error: documentsQuery.error,
    addDocument: addDocumentMutation.mutate,
    addDocumentAsync: addDocumentMutation.mutateAsync,
    removeDocument: removeDocumentMutation.mutate,
    isAdding: addDocumentMutation.isPending,
    isRemoving: removeDocumentMutation.isPending,
  };
};

export const useTemplateModelDocument = (
  templateModelId: string,
  documentId?: string,
) => {
  const documentQuery = useQuery({
    queryKey: ["template-model-document", templateModelId, documentId],
    queryFn: async () => {
      const response = await apiService.get<TemplateModelDocument>(
        `/template-models/${templateModelId}/documents/${documentId}`,
      );
      return response.data;
    },
    enabled: Boolean(templateModelId && documentId),
  });

  return {
    document: documentQuery.data,
    isLoading: documentQuery.isLoading,
    error: documentQuery.error,
  };
};
