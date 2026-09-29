import { useMutation } from "@tanstack/react-query";
import { apiService } from "@/data/services/api.service";

export interface LabelSuggestionDto {
  field_key: string;
  label_name: string;
  value?: string;
  page_number: number;
  element_ids: string[];
  bounding_box: {
    polygon: number[];
    span?: {
      offset?: number;
      length?: number;
    };
    [key: string]: unknown;
  };
  source_type: "llm";
  confidence?: number;
  explanation?: string;
}

export const useSuggestions = (
  templateModelId?: string,
  documentId?: string,
) => {
  const loadSuggestionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiService.post<LabelSuggestionDto[]>(
        `/template-models/${templateModelId}/documents/${documentId}/suggestions`,
        {},
      );
      if (!response.success) {
        throw new Error(response.message ?? "Loading suggestions failed");
      }
      return response.data ?? [];
    },
  });

  return {
    loadSuggestions: loadSuggestionsMutation.mutate,
    loadSuggestionsAsync: loadSuggestionsMutation.mutateAsync,
    isLoadingSuggestions: loadSuggestionsMutation.isPending,
    suggestionError: loadSuggestionsMutation.error,
  };
};
