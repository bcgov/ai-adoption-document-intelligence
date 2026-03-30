import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export interface LabelDto {
  id?: string;
  field_key: string;
  label_name: string;
  value?: string;
  page_number: number;
  bounding_box: {
    polygon: number[];
    pageWidth?: number;
    pageHeight?: number;
    span?: {
      offset?: number;
      length?: number;
    };
    [key: string]: unknown;
  };
}

export const useLabels = (templateModelId?: string, documentId?: string) => {
  const queryClient = useQueryClient();

  const labelsQuery = useQuery({
    queryKey: ["labeling-labels", templateModelId, documentId],
    queryFn: async () => {
      const response = await apiService.get<LabelDto[]>(
        `/template-models/${templateModelId}/documents/${documentId}/labels`,
      );
      return response.data || [];
    },
    enabled: Boolean(templateModelId && documentId),
  });

  const saveLabelsMutation = useMutation({
    mutationFn: async (labels: LabelDto[]) => {
      const response = await apiService.post(
        `/template-models/${templateModelId}/documents/${documentId}/labels`,
        { labels, replaceAll: true },
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["labeling-labels", templateModelId, documentId],
      });
      queryClient.invalidateQueries({
        queryKey: ["template-model-documents", templateModelId],
      });
      queryClient.invalidateQueries({
        queryKey: ["training-validation", templateModelId],
      });
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: async (labelId: string) => {
      const response = await apiService.delete(
        `/template-models/${templateModelId}/documents/${documentId}/labels/${labelId}`,
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["labeling-labels", templateModelId, documentId],
      });
    },
  });

  return {
    labels: labelsQuery.data || [],
    isLoading: labelsQuery.isLoading,
    error: labelsQuery.error,
    saveLabels: saveLabelsMutation.mutate,
    saveLabelsAsync: saveLabelsMutation.mutateAsync,
    deleteLabel: deleteLabelMutation.mutate,
    isSaving: saveLabelsMutation.isPending,
    isDeleting: deleteLabelMutation.isPending,
  };
};
